import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants';
import { AiConversation, AiMessage, AppState } from '../types';
import {
  buildAiContextMessages,
  buildGroundedFallback,
  shouldUseLedgerTools,
  validateGroundedAnswer,
} from './aiAssistant';

const state: AppState = {
  ledgers: [{ id: 'ledger', name: '日常账本', themeColor: '#007AFF', createdAt: 1 }],
  transactions: [],
  categories: [],
  categoryGroups: [],
  settings: DEFAULT_SETTINGS,
  currentLedgerId: 'ledger',
  currentDate: 1,
  timeRange: 'month',
  operationLogs: [],
  backupLogs: [],
  updateLogs: [],
  syncStatus: 'idle',
  isOnline: true,
  pendingSyncCount: 0,
};

const conversation: AiConversation = {
  id: 'conversation',
  title: '上下文',
  defaultLedgerId: 'ledger',
  contextSummary: '用户关注餐饮支出。',
  createdAt: 1,
  updatedAt: 1,
};

describe('AI conversation context', () => {
  it('keeps the summary and only the most recent 24 completed visible messages', () => {
    const messages: AiMessage[] = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      conversationId: conversation.id,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `消息${index}`,
      status: 'complete',
      createdAt: index,
    }));
    const context = buildAiContextMessages(state, conversation, messages);
    expect(context[0].role).toBe('system');
    expect(context[1].content).toContain('用户关注餐饮支出');
    expect(context).toHaveLength(26);
    expect(context[2].content).toContain('消息6');
    expect(context[25].content).toContain('消息29');
  });

  it('does not send failed or cancelled messages as context', () => {
    const context = buildAiContextMessages(state, conversation, [
      { id: '1', conversationId: conversation.id, role: 'user', content: '有效', status: 'complete', createdAt: 1 },
      { id: '2', conversationId: conversation.id, role: 'assistant', content: '失败', status: 'error', createdAt: 2 },
      { id: '3', conversationId: conversation.id, role: 'assistant', content: '停止', status: 'cancelled', createdAt: 3 },
    ]);
    expect(context.some(message => message.content === '有效')).toBe(true);
    expect(context.some(message => message.content === '失败')).toBe(false);
    expect(context.some(message => message.content === '停止')).toBe(false);
  });

  it('keeps older assistant wording for conversation continuity but marks its data as stale', () => {
    const context = buildAiContextMessages(state, conversation, [
      { id: '1', conversationId: conversation.id, role: 'user', content: '我什么时候买了某商品？', status: 'complete', createdAt: 1 },
      {
        id: '2',
        conversationId: conversation.id,
        role: 'assistant',
        content: '你在不存在的日期买过该商品。',
        status: 'complete',
        queryTraces: [{
          tool: 'find_transactions',
          label: '查询交易明细',
          ledgerNames: ['日常账本'],
          recordCount: 0,
        }],
        createdAt: 2,
      },
    ]);
    expect(context.at(-1)?.content).toContain('不存在的日期');
    expect(context.at(-1)?.content).toContain('必须重新查询');
  });
});

describe('AI ledger intent routing', () => {
  const userMessage = (content: string, createdAt: number): AiMessage => ({
    id: String(createdAt),
    conversationId: conversation.id,
    role: 'user',
    content,
    status: 'complete',
    createdAt,
  });
  const assistantMessage = (
    content: string,
    createdAt: number,
    withQueryTrace = false
  ): AiMessage => ({
    id: String(createdAt),
    conversationId: conversation.id,
    role: 'assistant',
    content,
    status: 'complete',
    queryTraces: withQueryTrace ? [{
      tool: 'aggregate_transactions',
      label: '聚合统计',
      ledgerNames: ['日常账本'],
      recordCount: 9,
    }] : undefined,
    createdAt,
  });

  it('uses local tools for explicit data questions', () => {
    expect(shouldUseLedgerTools([userMessage('分析近半年的支出', 1)])).toBe(true);
    expect(shouldUseLedgerTools([userMessage('收入呢？', 1)])).toBe(true);
  });

  it('uses local tools for short follow-ups to a data question', () => {
    expect(shouldUseLedgerTools([
      userMessage('分析近一年的消费', 1),
      assistantMessage('今年的支出偏高。', 2, true),
      userMessage('为什么这么高？', 2),
    ])).toBe(true);
  });

  it('continues a data query when the user confirms the assistant suggestion', () => {
    expect(shouldUseLedgerTools([
      userMessage('今年我买数码产品花了多少钱？', 1),
      assistantMessage('需要我把这 9 笔明细列出来吗？', 2, true),
      userMessage('要', 3),
    ])).toBe(true);
    expect(shouldUseLedgerTools([
      userMessage('今年我买数码产品花了多少钱？', 1),
      assistantMessage('需要我把这 9 笔明细列出来吗？', 2, true),
      userMessage('继续', 3),
    ])).toBe(true);
  });

  it('does not force ordinary conversation through ledger tools', () => {
    expect(shouldUseLedgerTools([userMessage('你怎么傻乎乎的？', 1)])).toBe(false);
    expect(shouldUseLedgerTools([userMessage('你能做什么？', 1)])).toBe(false);
    expect(shouldUseLedgerTools([
      userMessage('分析近一年的消费', 1),
      assistantMessage('今年支出偏高。', 2, true),
      userMessage('你能做什么？', 3),
      assistantMessage('我可以陪你聊聊，也可以查询账本。', 4),
      userMessage('好', 5),
    ])).toBe(false);
  });
});

describe('AI answer grounding', () => {
  const trace = {
    tool: 'aggregate_transactions',
    label: '聚合统计',
    ledger_names: ['日常账本'],
    date_range: '今年（2026-01-01 至 2026-07-17）',
    record_count: 1,
  };

  it('rejects transaction details that were invented from an aggregate result', () => {
    const validation = validateGroundedAnswer(
      '| 日期 | 金额 | 备注 |\n|---|---:|---|\n| 2026-01-01 | ¥100.00 | 不存在的商品 |',
      [{
        tool: 'aggregate_transactions',
        result: {
          trace,
          total: { count: 1, amount_cny: 100, expense_cny: 100, income_cny: 0, net_cny: -100 },
        },
      }]
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('单笔明细');
  });

  it('allows the model to explain a percentage derived from local totals', () => {
    const validation = validateGroundedAnswer(
      '这类支出占比为 50%。',
      [{
        tool: 'aggregate_transactions',
        result: {
          trace,
          total: { count: 2, amount_cny: 100, expense_cny: 100, income_cny: 0, net_cny: -100 },
        },
      }]
    );
    expect(validation.valid).toBe(true);
  });

  it('allows aggregate rows to be presented naturally without a detail query', () => {
    const validation = validateGroundedAnswer(
      '| 日期 | 分类 | 金额 |\n|---|---|---:|\n| 2026-01 | 餐饮 | ¥100.00 |',
      [{
        tool: 'aggregate_transactions',
        result: {
          trace,
          groups: [{ key: '2026-01', label: '2026-01', category: '餐饮', amount_cny: 100 }],
          total: { count: 2, amount_cny: 100, expense_cny: 100, income_cny: 0, net_cny: -100 },
        },
      }]
    );
    expect(validation.valid).toBe(true);
  });

  it('requires a zero-result detail search to be reported as not found', () => {
    const evidence = [{
      tool: 'find_transactions',
      result: {
        trace: { ...trace, tool: 'find_transactions', record_count: 0 },
        total_matches: 0,
        returned: 0,
        rows: [],
      },
    }];
    expect(validateGroundedAnswer('你买过这个商品。', evidence).valid).toBe(false);
    expect(validateGroundedAnswer('本地查询未找到符合条件的记录。', evidence).valid).toBe(true);
    expect(buildGroundedFallback(evidence)).toContain('没有找到');
  });

  it('accepts detail cells that exactly exist in the local tool result', () => {
    const evidence = [{
      tool: 'find_transactions',
      result: {
        trace: { ...trace, tool: 'find_transactions', record_count: 1 },
        total_matches: 1,
        returned: 1,
        rows: [{
          date: '2026-01-01 08:00',
          category: '数码',
          amount_cny: 100,
          display_amount: '¥100.00',
          note: '手机壳',
        }],
      },
    }];
    const validation = validateGroundedAnswer(
      '| 日期 | 分类 | 金额 | 备注 |\n|---|---|---:|---|\n| 2026-01-01 | 数码 | ¥100.00 | 手机壳 |',
      evidence
    );
    expect(validation.valid).toBe(true);
  });
});
