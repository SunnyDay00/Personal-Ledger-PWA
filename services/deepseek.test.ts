import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepSeekAdapter } from './deepseek';

const createSseResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeepSeek adapter', () => {
  it('tests the selected model without creating a completion', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
    }), { status: 200 }));
    await deepSeekAdapter.testConnection('secret-key', 'deepseek-v4-pro');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer secret-key' },
      })
    );
  });

  it('parses fragmented content and tool calls from SSE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createSseResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_","function":{"name":"find_","arguments":"{\\"limit\\":"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"1","function":{"name":"transactions","arguments":"1}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]));
    const result = await deepSeekAdapter.streamCompletion({
      apiKey: 'secret-key',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: '最高消费' }],
      tools: [],
    });
    expect(result.toolCalls[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'find_transactions', arguments: '{"limit":1}' },
    });
    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ model: 'deepseek-v4-pro' });
  });

  it('maps authentication errors without echoing the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Authentication Fails, key sk-visible-secret invalid' },
    }), { status: 401 }));
    await expect(deepSeekAdapter.testConnection('sk-visible-secret')).rejects.toThrow('API Key 无效');
    try {
      await deepSeekAdapter.testConnection('sk-visible-secret');
    } catch (error: any) {
      expect(error.message).not.toContain('sk-visible-secret');
    }
  });
});
