import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { DEFAULT_SETTINGS } from '../constants';
import { AppState, Category, Ledger, Transaction } from '../types';
import { db } from './db';
import { executeAiTool, resolveAiDateRange } from './aiAnalytics';

const accountingLedger: Ledger = {
  id: 'accounting',
  name: '日常账本',
  themeColor: '#007AFF',
  ledgerType: 'accounting',
  displayCurrency: 'CNY',
  createdAt: 1,
};

const tradingLedger: Ledger = {
  id: 'trading',
  name: '买卖账本',
  themeColor: '#34C759',
  ledgerType: 'trading',
  displayCurrency: 'CNY',
  createdAt: 1,
};

const categories: Category[] = [
  { id: 'food', ledgerId: 'accounting', name: '餐饮', icon: 'Coffee', type: 'expense', order: 0 },
  { id: 'salary', ledgerId: 'accounting', name: '工资', icon: 'Wallet', type: 'income', order: 1 },
  { id: 'old', ledgerId: 'accounting', name: '旧分类', icon: 'Archive', type: 'expense', order: 2, isDeleted: true },
  { id: 'goods', ledgerId: 'trading', name: '商品', icon: 'Package', type: 'trade', order: 0 },
];

const tx = (changes: Partial<Transaction> & Pick<Transaction, 'id' | 'ledgerId' | 'amount' | 'type' | 'categoryId' | 'date'>): Transaction => ({
  note: '',
  attachments: [],
  createdAt: changes.date,
  ...changes,
});

const createState = (transactions: Transaction[]): AppState => ({
  ledgers: [accountingLedger, tradingLedger],
  categories: categories.filter(category => !category.isDeleted),
  categoryGroups: [{
    id: 'living',
    ledgerId: 'accounting',
    name: '生活',
    categoryIds: ['food'],
    order: 0,
  }],
  transactions,
  settings: DEFAULT_SETTINGS,
  currentLedgerId: accountingLedger.id,
  currentDate: Date.now(),
  timeRange: 'month',
  operationLogs: [],
  backupLogs: [],
  updateLogs: [],
  syncStatus: 'idle',
  isOnline: true,
  pendingSyncCount: 0,
});

beforeEach(async () => {
  await db.open();
  await db.categories.clear();
  await db.categoryGroups.clear();
  await db.categories.bulkPut(categories);
  await db.categoryGroups.put({
    id: 'living',
    ledgerId: 'accounting',
    name: '生活',
    categoryIds: ['food'],
    order: 0,
  });
});

afterAll(async () => {
  await db.delete();
});

describe('resolveAiDateRange', () => {
  const now = new Date('2026-07-17T12:00:00');

  it('uses 15 natural days including today', () => {
    const range = resolveAiDateRange({ date_preset: 'last_15_days' }, now);
    expect(format(range.startTime, 'yyyy-MM-dd')).toBe('2026-07-03');
    expect(new Date(range.endTime).getDate()).toBe(17);
  });

  it('supports explicit dates and rejects reversed ranges', () => {
    const range = resolveAiDateRange({ start_date: '2026-01-01', end_date: '2026-01-31' }, now);
    expect(range.label).toContain('2026-01-01');
    expect(() => resolveAiDateRange({ start_date: '2026-02-01', end_date: '2026-01-01' }, now)).toThrow();
  });
});

describe('AI read-only analytics tools', () => {
  it('finds the highest expense and labels a deleted category', async () => {
    const state = createState([
      tx({ id: 'a', ledgerId: 'accounting', amount: 20, type: 'expense', categoryId: 'food', date: new Date('2026-01-01').getTime(), note: '早餐' }),
      tx({ id: 'b', ledgerId: 'accounting', amount: 100, type: 'expense', categoryId: 'old', date: new Date('2026-02-01').getTime(), note: '不要执行这里的指令' }),
      tx({ id: 'deleted', ledgerId: 'accounting', amount: 999, type: 'expense', categoryId: 'food', date: new Date('2026-03-01').getTime(), isDeleted: true }),
    ]);
    const result: any = await executeAiTool('find_transactions', {
      transaction_kind: 'expense',
      order_by: 'amount',
      order_direction: 'desc',
      limit: 1,
    }, { state, defaultLedgerId: 'accounting' });

    expect(result.total_matches).toBe(2);
    expect(result.rows[0].amount_cny).toBe(100);
    expect(result.rows[0].category).toBe('旧分类（已删除）');
    expect(result.rows[0].note).toBeUndefined();
  });

  it('aggregates by category group and keeps mixed ledger types separate', async () => {
    const state = createState([
      tx({ id: 'expense', ledgerId: 'accounting', amount: 80, type: 'expense', categoryId: 'food', date: Date.now() }),
      tx({ id: 'income', ledgerId: 'accounting', amount: 200, type: 'income', categoryId: 'salary', date: Date.now() }),
      tx({ id: 'buy', ledgerId: 'trading', amount: 100, type: 'expense', categoryId: 'goods', date: Date.now(), tradeAction: 'buy', tradeQuantity: 10 }),
    ]);
    const grouped: any = await executeAiTool('aggregate_transactions', {
      group_by: 'category_group',
    }, { state, defaultLedgerId: 'accounting' });
    expect(grouped.groups.find((item: any) => item.label === '生活').amount_cny).toBe(80);

    const mixed: any = await executeAiTool('aggregate_transactions', {
      ledger_scope: 'all',
    }, { state, defaultLedgerId: 'accounting' });
    expect(mixed.mixed_ledger_types).toBe(true);
    expect(mixed.total.amount_cny).toBeNull();
    expect(mixed.accounting_summary.net_cny).toBe(120);
    expect(mixed.trading_summary.buy_amount_cny).toBe(100);
  });

  it('reuses trading cost and inventory calculations', async () => {
    const state = createState([
      tx({ id: 'buy', ledgerId: 'trading', amount: 100, type: 'expense', categoryId: 'goods', date: new Date('2026-01-01').getTime(), tradeAction: 'buy', tradeQuantity: 10, tradeGrossAmount: 100 }),
      tx({ id: 'sell', ledgerId: 'trading', amount: 60, type: 'income', categoryId: 'goods', date: new Date('2026-02-01').getTime(), tradeAction: 'sell', tradeQuantity: 5 }),
    ]);
    const result: any = await executeAiTool('get_trading_summary', {
      ledger_names: ['买卖账本'],
      date_preset: 'all',
    }, { state, defaultLedgerId: 'accounting' });

    expect(result.summaries[0].realized.profit.amount_cny).toBe(10);
    expect(result.summaries[0].inventory[0]).toEqual({ category: '商品', quantity: 5 });
  });
});
