import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { useApp } from '../contexts/AppContext';
import { AiConfig, AiConversation, AiMessage } from '../types';
import { generateId } from '../utils';
import { aiStorage } from '../services/aiStorage';
import { getDeepSeekModelName } from '../services/aiConfig';
import { maybeSummarizeConversation, runAiTurn } from '../services/aiAssistant';
import { coalesceAiViewportReduction, resolveAiKeyboardLayout } from '../services/aiKeyboardLayout';
import { feedback } from '../services/feedback';
import { Icon } from './ui/Icon';
import { clsx } from 'clsx';

const DEEPSEEK_LOGO_SRC = `${import.meta.env.BASE_URL}deepseek-logo.png`;
const ACTIVE_CONVERSATION_STORAGE_KEY = 'personal-ledger-ai-active-conversation';

const readStoredConversationId = () => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const persistConversationId = (conversationId: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, conversationId);
  } catch {
    // The active conversation remains available in memory when storage is unavailable.
  }
};

interface AIViewProps {
  onOpenSettings: () => void;
  onComposerFocusChange?: (focused: boolean) => void;
}

const STARTER_PROMPTS = [
  '近一年最高一次消费是什么？',
  '分析近半年的支出情况',
  '统计最近15天的分类消费',
  '汇总全部账本的收支记录',
];

const createConversation = (ledgerId: string): AiConversation => {
  const now = Date.now();
  return {
    id: generateId(),
    title: '新对话',
    defaultLedgerId: ledgerId,
    createdAt: now,
    updatedAt: now,
  };
};

const titleFromQuestion = (question: string) => {
  const compact = question.replace(/\s+/g, ' ').trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}…` : compact;
};

const formatConversationTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

interface AiMessageBubbleProps {
  message: AiMessage;
  copied: boolean;
  regenerateDisabled: boolean;
  onCopy: (message: AiMessage) => void;
  onRegenerate: (message: AiMessage) => void;
}

const AiMessageBubble = React.memo<AiMessageBubbleProps>(({
  message,
  copied,
  regenerateDisabled,
  onCopy,
  onRegenerate,
}) => (
  <div className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
    {message.role === 'user' ? (
      <div className="max-w-[86%] whitespace-pre-wrap rounded-[1.25rem] rounded-br-md bg-ios-primary px-4 py-3 text-sm leading-6 text-white shadow-sm">
        {message.content}
      </div>
    ) : (
      <div className="w-full max-w-[94%]">
        <div className={clsx(
          'rounded-[1.25rem] rounded-bl-md border border-ios-border bg-white px-4 py-3 text-sm leading-6 shadow-sm dark:bg-zinc-900',
          message.status === 'error' && 'border-red-200 text-red-600 dark:border-red-900',
          message.status === 'cancelled' && 'text-ios-subtext'
        )}>
          {message.status === 'streaming' && !message.content ? (
            <div className="flex items-center gap-2 py-1 text-ios-subtext">
              <Icon name="Loader2" className="h-4 w-4 animate-spin" />
              正在查询账本…
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto rounded-xl border border-ios-border">
                    <table className="min-w-full text-left text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => <th className="whitespace-nowrap bg-gray-50 px-3 py-2 font-semibold dark:bg-zinc-800">{children}</th>,
                td: ({ children }) => <td className="border-t border-ios-border px-3 py-2 align-top">{children}</td>,
                code: ({ children }) => <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-zinc-800">{children}</code>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {message.queryTraces && message.queryTraces.length > 0 && (
          <details className="mx-2 mt-2 rounded-xl bg-black/[0.025] px-3 py-2 text-[11px] text-ios-subtext dark:bg-white/[0.04]">
            <summary className="cursor-pointer select-none font-medium text-ios-text">查询依据</summary>
            <div className="mt-2 space-y-2">
              {message.queryTraces.map((trace, index) => (
                <div key={`${trace.tool}-${index}`}>
                  <div className="font-medium text-ios-text">{trace.label}</div>
                  <div>{trace.ledgerNames.join('、') || '未指定账本'}{trace.dateRange ? ` · ${trace.dateRange}` : ''}</div>
                  {trace.filters?.length ? <div>{trace.filters.join('；')}</div> : null}
                  {trace.recordCount !== undefined && <div>{trace.recordCount} 条{trace.truncated ? ' · 结果已截断' : ''}</div>}
                </div>
              ))}
            </div>
          </details>
        )}
        {message.status !== 'streaming' && (
          <div className="mt-1.5 flex items-center gap-1 px-2 text-ios-subtext">
            <button type="button" onClick={() => onCopy(message)} className="rounded-lg p-1.5 active:bg-black/5 dark:active:bg-white/5" aria-label="复制回复">
              <Icon name={copied ? 'Check' : 'Copy'} className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onRegenerate(message)} disabled={regenerateDisabled} className="rounded-lg p-1.5 active:bg-black/5 disabled:opacity-40 dark:active:bg-white/5" aria-label="重新生成">
              <Icon name="RefreshCw" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    )}
  </div>
));
AiMessageBubble.displayName = 'AiMessageBubble';

export const AIView: React.FC<AIViewProps> = ({ onOpenSettings, onComposerFocusChange }) => {
  const { state, dispatch } = useApp();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<AiConversation | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [nativeKeyboardHeight, setNativeKeyboardHeight] = useState(0);
  const [visualViewportReduction, setVisualViewportReduction] = useState(0);
  const viewportRootRef = useRef<HTMLDivElement>(null);
  const appliedViewportRef = useRef({
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    offsetTop: 0,
  });
  const viewportFrameRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeConversationRef = useRef<AiConversation | null>(null);
  const positionLoadedConversationRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const fullViewportHeightRef = useRef(typeof window !== 'undefined' ? window.innerHeight : 0);
  const regenerateActionRef = useRef<(message: AiMessage) => Promise<void>>(async () => undefined);
  const handleRegenerateMessage = useCallback((message: AiMessage) => {
    void regenerateActionRef.current(message);
  }, []);
  const keyboardLayout = useMemo(() => resolveAiKeyboardLayout({
    nativeKeyboardHeight,
    visualViewportReduction,
    textareaFocused,
  }), [nativeKeyboardHeight, textareaFocused, visualViewportReduction]);
  const { keyboardVisible, nativeOverlayInset } = keyboardLayout;

  const updateNearBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 72;
    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setIsNearBottom(true);
  }, []);

  const refreshConversations = useCallback(async () => {
    const rows = await aiStorage.listConversations();
    setConversations(rows);
    return rows;
  }, []);

  const loadConversation = useCallback(async (conversation: AiConversation) => {
    if (activeConversationRef.current && activeConversationRef.current.id !== conversation.id) {
      abortRef.current?.abort();
    }
    positionLoadedConversationRef.current = true;
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    activeConversationRef.current = conversation;
    persistConversationId(conversation.id);
    setActiveConversation(conversation);
    setMessages(await aiStorage.listMessages(conversation.id));
    setShowHistory(false);
  }, []);

  const newConversation = useCallback(async () => {
    if (generating) abortRef.current?.abort();
    const conversation = createConversation(state.currentLedgerId);
    await aiStorage.saveConversation(conversation);
    await refreshConversations();
    await loadConversation(conversation);
    setInput('');
    feedback.play('click');
    feedback.vibrate('light');
  }, [generating, loadConversation, refreshConversations, state.currentLedgerId]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const [savedConfig, rows] = await Promise.all([
          state.settings.aiConfig
            ? Promise.resolve(state.settings.aiConfig)
            : aiStorage.getConfig(),
          aiStorage.listConversations(),
        ]);
        if (!active) return;
        setConfig(savedConfig);
        setConversations(rows);
        const storedConversationId = readStoredConversationId();
        const initial = rows.find(conversation => conversation.id === storedConversationId)
          || rows[0]
          || createConversation(state.currentLedgerId);
        if (rows.length === 0) await aiStorage.saveConversation(initial);
        if (!active) return;
        await loadConversation(initial);
        if (rows.length === 0) setConversations([initial]);
      } finally {
        if (active) setLoading(false);
      }
    };
    void init();
    return () => {
      active = false;
      abortRef.current?.abort();
      onComposerFocusChange?.(false);
    };
  }, [loadConversation, onComposerFocusChange, state.currentLedgerId]);

  useEffect(() => {
    if (state.settings.aiConfig) {
      setConfig(state.settings.aiConfig);
    }
  }, [state.settings.aiConfig]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const applyViewport = () => {
      viewportFrameRef.current = null;
      const currentHeight = visualViewport?.height || window.innerHeight;
      const currentOffsetTop = visualViewport?.offsetTop || 0;
      const focused = document.activeElement === textareaRef.current;
      if (focused) {
        fullViewportHeightRef.current = Math.max(
          fullViewportHeightRef.current,
          window.innerHeight,
          currentHeight
        );
      } else {
        fullViewportHeightRef.current = Math.max(window.innerHeight, currentHeight);
      }
      const nextViewportReduction = Math.max(0, fullViewportHeightRef.current - currentHeight);
      const applied = appliedViewportRef.current;
      if (
        Math.abs(applied.height - currentHeight) >= 0.5
        || Math.abs(applied.offsetTop - currentOffsetTop) >= 0.5
      ) {
        appliedViewportRef.current = {
          height: currentHeight,
          offsetTop: currentOffsetTop,
        };
        const root = viewportRootRef.current;
        if (root) {
          root.style.height = `${currentHeight}px`;
          root.style.top = `${currentOffsetTop}px`;
        }
      }
      setVisualViewportReduction(current =>
        coalesceAiViewportReduction(current, nextViewportReduction)
      );
    };
    const scheduleViewportUpdate = () => {
      if (viewportFrameRef.current !== null) return;
      viewportFrameRef.current = window.requestAnimationFrame(applyViewport);
    };
    applyViewport();
    visualViewport?.addEventListener('resize', scheduleViewportUpdate);
    visualViewport?.addEventListener('scroll', scheduleViewportUpdate);
    window.addEventListener('resize', scheduleViewportUpdate);
    return () => {
      visualViewport?.removeEventListener('resize', scheduleViewportUpdate);
      visualViewport?.removeEventListener('scroll', scheduleViewportUpdate);
      window.removeEventListener('resize', scheduleViewportUpdate);
      if (viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
        viewportFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const show = (info: { keyboardHeight: number }) => {
      const nextHeight = Math.max(0, Number(info.keyboardHeight) || 0);
      setNativeKeyboardHeight(current =>
        Math.abs(current - nextHeight) < 0.5 ? current : nextHeight
      );
    };
    const hide = () => setNativeKeyboardHeight(0);
    const register = async () => {
      const registered = await Promise.all([
        Keyboard.addListener('keyboardWillShow', show),
        Keyboard.addListener('keyboardDidShow', show),
        Keyboard.addListener('keyboardDidHide', hide),
      ]);
      if (disposed) {
        await Promise.all(registered.map(handle => handle.remove()));
        return;
      }
      handles.push(...registered);
    };
    void register();
    return () => {
      disposed = true;
      handles.forEach(handle => { void handle.remove(); });
    };
  }, []);

  useEffect(() => {
    onComposerFocusChange?.(keyboardVisible);
  }, [keyboardVisible, onComposerFocusChange]);

  useEffect(() => {
    if (!keyboardVisible || !isNearBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollToBottom('auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [keyboardVisible, nativeOverlayInset, scrollToBottom]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const forcePosition = positionLoadedConversationRef.current;
    if (!forcePosition && !isNearBottomRef.current) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: forcePosition || generating ? 'auto' : messages.length > 2 ? 'smooth' : 'auto',
    });
    positionLoadedConversationRef.current = false;
    isNearBottomRef.current = true;
    setIsNearBottom(true);
  }, [messages, generating]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [input]);

  const activeLedger = useMemo(
    () => state.ledgers.find(ledger => ledger.id === activeConversation?.defaultLedgerId),
    [activeConversation?.defaultLedgerId, state.ledgers]
  );

  const persistAssistantResult = async (
    conversation: AiConversation,
    assistant: AiMessage,
    nextMessages: AiMessage[]
  ) => {
    await aiStorage.saveMessage(assistant);
    const nextConversation = { ...conversation, updatedAt: Date.now() };
    await aiStorage.saveConversation(nextConversation);
    activeConversationRef.current = nextConversation;
    setActiveConversation(nextConversation);
    await refreshConversations();
    try {
      const summaryUpdate = await maybeSummarizeConversation({
        apiKey: config!.apiKey,
        model: config!.model,
        conversation: nextConversation,
        messages: nextMessages,
      });
      if (summaryUpdate && activeConversationRef.current?.id === nextConversation.id) {
        const summarized = { ...nextConversation, ...summaryUpdate };
        await aiStorage.saveConversation(summarized);
        activeConversationRef.current = summarized;
        setActiveConversation(summarized);
      }
    } catch {
      // Context summarization is best-effort and must not fail the visible response.
    }
  };

  const runWithHistory = async (
    conversation: AiConversation,
    history: AiMessage[],
    assistant: AiMessage
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    let currentContent = '';
    try {
      const result = await runAiTurn({
        apiKey: config!.apiKey,
        model: config!.model,
        state,
        conversation,
        history,
        signal: controller.signal,
        onContent: content => {
          currentContent = content;
          setMessages(current => current.map(message =>
            message.id === assistant.id ? { ...message, content } : message
          ));
        },
      });
      const completed: AiMessage = {
        ...assistant,
        content: result.content,
        status: 'complete',
        queryTraces: result.traces,
      };
      setMessages(current => current.map(message => message.id === assistant.id ? completed : message));
      if (await aiStorage.getConversation(conversation.id)) {
        await persistAssistantResult(conversation, completed, [...history, completed]);
      }
      feedback.play('success');
      feedback.vibrate('light');
    } catch (error: any) {
      const aborted = error?.name === 'AbortError' || controller.signal.aborted;
      const failed: AiMessage = {
        ...assistant,
        content: currentContent || (aborted ? '已停止生成' : error?.message || 'AI 查询失败，请重试'),
        status: aborted ? 'cancelled' : 'error',
      };
      setMessages(current => current.map(message => message.id === assistant.id ? failed : message));
      if (await aiStorage.getConversation(conversation.id)) {
        await aiStorage.saveMessage(failed);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setGenerating(false);
    }
  };

  const send = async (question = input) => {
    const normalized = question.trim();
    if (!normalized || generating || !activeConversation || !config?.apiKey.trim() || !state.isOnline) return;
    if (!config.dataConsentAt) {
      const accepted = window.confirm(
        '本次问题及完成查询所需的分类元数据、聚合结果或匹配明细会发送给 DeepSeek；完整数据库和图片不会上传。是否继续？'
      );
      if (!accepted) return;
      const nextConfig = await aiStorage.saveConfig({ dataConsentAt: Date.now() });
      dispatch({ type: 'UPDATE_SETTINGS', payload: { aiConfig: nextConfig } });
      setConfig(nextConfig);
    }

    let conversation = activeConversation;
    if (messages.every(message => message.role !== 'user')) {
      conversation = {
        ...conversation,
        title: titleFromQuestion(normalized),
        updatedAt: Date.now(),
      };
      await aiStorage.saveConversation(conversation);
      activeConversationRef.current = conversation;
      setActiveConversation(conversation);
    }
    const now = Date.now();
    const userMessage: AiMessage = {
      id: generateId(),
      conversationId: conversation.id,
      role: 'user',
      content: normalized,
      status: 'complete',
      createdAt: now,
    };
    const assistant: AiMessage = {
      id: generateId(),
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now + 1,
    };
    await aiStorage.saveMessage(userMessage);
    const history = [...messages, userMessage];
    positionLoadedConversationRef.current = true;
    setMessages([...history, assistant]);
    setInput('');
    await runWithHistory(conversation, history, assistant);
  };

  const regenerate = async (assistantMessage: AiMessage) => {
    if (generating || !activeConversation || !config?.apiKey || !state.isOnline) return;
    const index = messages.findIndex(message => message.id === assistantMessage.id);
    if (index < 0) return;
    await aiStorage.deleteMessage(assistantMessage.id);
    const history = messages.slice(0, index);
    const replacement: AiMessage = {
      ...assistantMessage,
      id: generateId(),
      content: '',
      status: 'streaming',
      queryTraces: undefined,
      createdAt: Date.now(),
    };
    positionLoadedConversationRef.current = true;
    setMessages([...history, replacement]);
    await runWithHistory(activeConversation, history, replacement);
  };
  regenerateActionRef.current = regenerate;

  const stop = () => abortRef.current?.abort();

  const deleteConversation = async (conversation: AiConversation) => {
    if (!window.confirm(`确定删除对话“${conversation.title}”吗？`)) return;
    if (activeConversation?.id === conversation.id) abortRef.current?.abort();
    await aiStorage.deleteConversation(conversation.id);
    const rows = await refreshConversations();
    if (activeConversation?.id === conversation.id) {
      if (rows[0]) await loadConversation(rows[0]);
      else await newConversation();
    }
    feedback.play('delete');
    feedback.vibrate('medium');
  };

  const clearAll = async () => {
    if (conversations.length === 0) return;
    if (!window.confirm('确定清空全部 AI 对话吗？此操作无法恢复，API Key 会保留。')) return;
    abortRef.current?.abort();
    await aiStorage.clearConversations();
    setConversations([]);
    await newConversation();
  };

  const copy = useCallback(async (message: AiMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1200);
      feedback.vibrate('light');
    } catch {
      window.alert('复制失败，请长按文字复制');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-ios-subtext">
        <Icon name="Loader2" className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const keyReady = !!config?.apiKey.trim();

  return (
    <div
      ref={viewportRootRef}
      className="fixed left-0 right-0 z-20 flex flex-col overflow-hidden bg-ios-bg text-ios-text"
      style={{
        height: appliedViewportRef.current.height,
        top: appliedViewportRef.current.offsetTop,
      }}
    >
      <header className="relative z-20 flex h-[calc(env(safe-area-inset-top)+3.75rem)] shrink-0 items-end border-b border-black/5 bg-ios-bg/85 px-4 pb-2.5 backdrop-blur-xl dark:border-white/5">
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-ios-text shadow-sm active:scale-95 dark:bg-zinc-800/80"
          aria-label="打开对话记录"
        >
          <Icon name="PanelLeft" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <div className="truncate text-sm font-semibold">AI 数据助手</div>
          <div className="mt-0.5 truncate text-[10px] text-ios-subtext">
            {activeLedger?.name || '账本已删除'} · {config ? getDeepSeekModelName(config.model) : 'DeepSeek'}
          </div>
        </div>
        <button
          type="button"
          onClick={newConversation}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ios-primary text-white shadow-sm active:scale-95"
          aria-label="新对话"
        >
          <Icon name="SquarePen" className="h-4 w-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={updateNearBottom}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+10.5rem)] pt-4 no-scrollbar"
        style={{
          WebkitOverflowScrolling: 'touch',
          paddingBottom: nativeOverlayInset > 0
            ? `${nativeOverlayInset + 88}px`
            : undefined,
        }}
      >
        {!keyReady ? (
          <div className="mx-auto mt-12 max-w-sm rounded-3xl border border-ios-border bg-white p-6 text-center shadow-sm dark:bg-zinc-900">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ios-primary/10 text-ios-primary">
              <Icon name="KeyRound" className="h-7 w-7" />
            </div>
            <h2 className="mb-2 text-base font-semibold">先配置 DeepSeek</h2>
            <p className="mb-5 text-xs leading-5 text-ios-subtext">
              API 地址已配置好，选择模型并填写你自己的 API Key 即可使用。
            </p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full rounded-xl bg-ios-primary py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              前往 AI 设置
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-lg pt-8">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-blue-50 shadow-lg shadow-blue-500/15 dark:bg-blue-100">
                <img src={DEEPSEEK_LOGO_SRC} alt="DeepSeek" className="h-14 w-14 object-contain" />
              </div>
              <h2 className="text-lg font-semibold">问问你的账本</h2>
              <p className="mt-2 text-xs leading-5 text-ios-subtext">
                只读查询，按需发送聚合结果或匹配明细，不会上传附件。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {STARTER_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="rounded-2xl border border-ios-border bg-white p-4 text-left text-sm leading-5 text-ios-text shadow-sm active:scale-[0.98] dark:bg-zinc-900"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map(message => (
              <AiMessageBubble
                key={message.id}
                message={message}
                copied={copiedId === message.id}
                regenerateDisabled={generating}
                onCopy={copy}
                onRegenerate={handleRegenerateMessage}
              />
            ))}
          </div>
        )}
      </div>

      {!isNearBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className={clsx(
            'absolute right-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-ios-primary shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-[bottom,transform] active:scale-90 dark:border-white/10 dark:bg-zinc-900/90',
            keyboardVisible
              ? 'bottom-[calc(env(safe-area-inset-bottom)+5.25rem)]'
              : 'bottom-[calc(env(safe-area-inset-bottom)+10.25rem)]'
          )}
          style={nativeOverlayInset > 0 ? { bottom: nativeOverlayInset + 88 } : undefined}
          aria-label="回到对话底部"
        >
          <Icon name="ChevronDown" className="h-5 w-5" />
        </button>
      )}

      {keyReady && (
        <div className={clsx(
          'absolute left-0 right-0 z-30 px-3 transition-[bottom] duration-200',
          keyboardVisible
            ? 'bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]'
            : 'bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]'
        )} style={nativeOverlayInset > 0 ? { bottom: nativeOverlayInset + 8 } : undefined}>
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-[1.4rem] border border-white/60 bg-white/85 p-2 shadow-[0_10px_35px_rgba(0,0,0,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/90">
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={event => setInput(event.target.value)}
              onFocus={() => setTextareaFocused(true)}
              onBlur={() => setTextareaFocused(false)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={state.isOnline ? '询问账本数据…' : '当前离线，只能查看历史'}
              disabled={!state.isOnline || generating}
              className="max-h-[120px] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-5 text-ios-text outline-none placeholder:text-ios-subtext disabled:opacity-50"
            />
            <button
              type="button"
              onClick={generating ? stop : () => void send()}
              disabled={!generating && (!input.trim() || !state.isOnline)}
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-90 disabled:opacity-35',
                generating ? 'bg-zinc-700 dark:bg-zinc-600' : 'bg-ios-primary'
              )}
              aria-label={generating ? '停止生成' : '发送'}
            >
              <Icon name={generating ? 'Square' : 'ArrowUp'} className="h-4 w-4" fill={generating ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[70] flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setShowHistory(false)}
            aria-label="关闭对话记录"
          />
          <aside className="relative z-10 flex h-full w-[86%] max-w-sm flex-col bg-ios-bg shadow-2xl animate-history-slide-in motion-reduce:animate-none">
            <div className="flex h-[calc(env(safe-area-inset-top)+4rem)] shrink-0 items-end border-b border-ios-border px-4 pb-3">
              <div className="text-base font-semibold">对话记录</div>
              <button type="button" onClick={newConversation} className="ml-auto text-sm font-semibold text-ios-primary">
                新对话
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
              {conversations.map(conversation => (
                <div
                  key={conversation.id}
                  className={clsx(
                    'mb-2 flex items-center rounded-2xl border p-1',
                    activeConversation?.id === conversation.id
                      ? 'border-ios-primary/30 bg-ios-primary/10'
                      : 'border-transparent bg-white dark:bg-zinc-900'
                  )}
                >
                  <button type="button" onClick={() => void loadConversation(conversation)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                    <div className="truncate text-sm font-medium text-ios-text">{conversation.title}</div>
                    <div className="mt-1 flex gap-2 text-[10px] text-ios-subtext">
                      <span>{state.ledgers.find(ledger => ledger.id === conversation.defaultLedgerId)?.name || '账本已删除'}</span>
                      <span>{formatConversationTime(conversation.updatedAt)}</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => void deleteConversation(conversation)} className="p-3 text-red-500 active:opacity-60" aria-label="删除对话">
                    <Icon name="Trash2" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-ios-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <button type="button" onClick={clearAll} disabled={conversations.length === 0} className="w-full rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-500 disabled:opacity-40 dark:bg-red-950/30">
                清空全部对话
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
