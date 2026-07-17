import { AiModel } from '../types';
import { DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from './aiStorage';

export interface AiProtocolToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AiProtocolMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: AiProtocolToolCall[];
  tool_call_id?: string;
}

export interface AiCompletionResult {
  content: string;
  toolCalls: AiProtocolToolCall[];
  finishReason?: string | null;
}

export interface AiProviderAdapter {
  testConnection(apiKey: string, model?: AiModel, signal?: AbortSignal): Promise<void>;
  streamCompletion(options: {
    apiKey: string;
    model?: AiModel;
    messages: AiProtocolMessage[];
    tools?: readonly unknown[];
    signal?: AbortSignal;
    onText?: (text: string) => void;
  }): Promise<AiCompletionResult>;
  complete(options: {
    apiKey: string;
    model?: AiModel;
    messages: AiProtocolMessage[];
    signal?: AbortSignal;
    maxTokens?: number;
  }): Promise<string>;
}

class AiApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AiApiError';
  }
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, ms);
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });

const mapHttpError = (status: number, rawMessage = '') => {
  if (status === 401) return 'DeepSeek API Key 无效，请在“设置 → AI 助手”中重新填写';
  if (status === 402) return 'DeepSeek 账户余额不足，请充值后重试';
  if (status === 429) return 'DeepSeek 请求过于频繁，请稍后再试';
  if (status >= 500) return 'DeepSeek 服务暂时不可用，请稍后再试';
  const safeMessage = rawMessage.replace(/sk-[A-Za-z0-9_-]+/g, '***').slice(0, 180);
  return safeMessage ? `DeepSeek 请求失败：${safeMessage}` : `DeepSeek 请求失败（${status}）`;
};

const readError = async (response: Response) => {
  let message = '';
  try {
    const body = await response.json();
    message = String(body?.error?.message || body?.message || '');
  } catch {
    message = '';
  }
  return new AiApiError(mapHttpError(response.status, message), response.status);
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  externalSignal?: AbortSignal,
  timeoutMs = 90_000
) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (controller.signal.aborted) throw new AiApiError('DeepSeek 请求超时，请稍后重试');
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    throw new AiApiError(online ? '无法连接 DeepSeek，请检查网络后重试' : '当前处于离线状态，无法使用 AI');
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
  }
};

const authenticatedHeaders = (apiKey: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey.trim()}`,
});

const parseSseStream = async (
  response: Response,
  onPayload: (payload: any) => void,
  signal?: AbortSignal
) => {
  if (!response.body) throw new AiApiError('当前运行环境不支持 DeepSeek 流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const abort = () => { void reader.cancel(); };
  signal?.addEventListener('abort', abort, { once: true });
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        for (const line of block.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            onPayload(JSON.parse(raw));
          } catch {
            // Ignore incomplete provider keep-alive records.
          }
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
  }
};

const doChatFetch = async (
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
) => {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    response = await fetchWithTimeout(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: authenticatedHeaders(apiKey),
        body: JSON.stringify(body),
      },
      signal
    );
    if (response.ok) return response;
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await delay(700, signal);
      continue;
    }
    throw await readError(response);
  }
  throw await readError(response!);
};

export const deepSeekAdapter: AiProviderAdapter = {
  async testConnection(apiKey, model = DEFAULT_DEEPSEEK_MODEL, signal) {
    const response = await fetchWithTimeout(
      `${DEEPSEEK_BASE_URL}/models`,
      { method: 'GET', headers: { Authorization: `Bearer ${apiKey.trim()}` } },
      signal,
      20_000
    );
    if (!response.ok) throw await readError(response);
    const data = await response.json();
    const ids = Array.isArray(data?.data) ? data.data.map((item: any) => item?.id) : [];
    if (!ids.includes(model)) {
      throw new AiApiError(`连接成功，但账户当前不可用模型 ${model}`);
    }
  },

  async streamCompletion({ apiKey, model = DEFAULT_DEEPSEEK_MODEL, messages, tools, signal, onText }) {
    const response = await doChatFetch(apiKey, {
      model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
      stream: true,
    }, signal);

    let content = '';
    let finishReason: string | null | undefined;
    const calls = new Map<number, AiProtocolToolCall>();
    await parseSseStream(response, payload => {
      const choice = payload?.choices?.[0];
      const delta = choice?.delta || {};
      finishReason = choice?.finish_reason ?? finishReason;
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        onText?.(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        delta.tool_calls.forEach((part: any) => {
          const index = Number(part?.index || 0);
          const current = calls.get(index) || {
            id: '',
            type: 'function' as const,
            function: { name: '', arguments: '' },
          };
          if (part.id) current.id += part.id;
          if (part.function?.name) current.function.name += part.function.name;
          if (part.function?.arguments) current.function.arguments += part.function.arguments;
          calls.set(index, current);
        });
      }
    }, signal);

    return { content, toolCalls: Array.from(calls.values()), finishReason };
  },

  async complete({ apiKey, model = DEFAULT_DEEPSEEK_MODEL, messages, signal, maxTokens = 700 }) {
    const response = await doChatFetch(apiKey, {
      model,
      messages,
      stream: false,
      max_tokens: maxTokens,
    }, signal);
    const body = await response.json();
    return String(body?.choices?.[0]?.message?.content || '').trim();
  },
};
