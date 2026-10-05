import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants';
import { Category, Transaction } from '../types';
import { db } from './db';
import { canTransferCategoryTo, transferCategoryData } from './categoryTransfer';

const category = (id: string, extra: Partial<Category> = {}): Category => ({
  id, name: id, ledgerId: 'book', type: 'expense', icon: 'Circle', order: 0, updatedAt: 10, ...extra,
});
const transaction = (id: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, ledgerId: 'book', categoryId: 'old', type: 'expense', amount: 37, currencyCode: 'USD',
  originalAmount: 5, exchangeRateToCny: 7.4, date: 200, createdAt: 100, updatedAt: 300,
  note: '原始备注', attachments: ['original-picture'], ...extra,
});

beforeEach(async () => {
  await db.open();
  for (const table of db.tables) await table.clear();
  await db.ledgers.put({ id: 'book', name: '本账本', ledgerType: 'accounting', themeColor: '#007AFF', createdAt: 1 });
  await db.categories.bulkPut([category('old'), category('new'), category('income', { type: 'income' }),
    category('foreign', { ledgerId: 'other' }), category('removed', { isDeleted: true })]);
  await db.transactions.bulkPut([transaction('used'), transaction('deleted', { isDeleted: true }), transaction('foreign-record', { ledgerId: 'other' })]);
  await db.categoryGroups.bulkPut([
    { id: 'group', ledgerId: 'book', name: '分组', categoryIds: ['old', 'new', 'old'], order: 0 },
    { id: 'foreign-group', ledgerId: 'other', name: '其他分组', categoryIds: ['old'], order: 0 },
  ]);
  await db.settings.put({ key: 'main', value: {
    ...DEFAULT_SETTINGS,
    categoryNotes: { old: ['旧备注', '公共'], new: ['新备注', '公共'] },
    autoRecords: [{ id: 'rule', name: '规则', icon: 'Clock', ledgerId: 'book', categoryId: 'old', type: 'expense',
      enabled: true, amount: 1, schedule: { kind: 'daily', time: '12:00' }, createdAt: 1 }],
  } });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await db.delete(); });

describe('atomic category transfer', () => {
  it('retains the destination group when source and destination have different owners', async () => {
    await db.categoryGroups.put({ id: 'group', ledgerId: 'book', name: '来源组', categoryIds: ['old'], order: 0 });
    await db.categoryGroups.put({ id: 'destination-group', ledgerId: 'book', name: '目标组', categoryIds: ['new'], order: 1 });
    await transferCategoryData('book', 'old', 'new', 1000);
    expect((await db.categoryGroups.get('group'))?.categoryIds).toEqual([]);
    expect((await db.categoryGroups.get('destination-group'))?.categoryIds).toEqual(['new']);
    expect((await db.transactions.get('used'))?.categoryId).toBe('new');
  });
  it('moves records and references without changing money, dates, attachments or deleted state', async () => {
    const original = await db.transactions.get('used');
    const result = await transferCategoryData('book', 'old', 'new', 1000);
    expect(result.movedCount).toBe(1);
    expect(await db.transactions.get('used')).toEqual({ ...original, categoryId: 'new', updatedAt: result.updatedAt });
    expect(await db.transactions.get('deleted')).toMatchObject({ categoryId: 'new', isDeleted: true });
    expect(await db.transactions.get('foreign-record')).toMatchObject({ categoryId: 'old', ledgerId: 'other' });
    expect(await db.categories.get('old')).toMatchObject({ isDeleted: true });
    expect((await db.categoryGroups.get('group'))?.categoryIds).toEqual(['new']);
    expect((await db.categoryGroups.get('foreign-group'))?.categoryIds).toEqual(['old']);
    const settings = (await db.settings.get('main'))!.value;
    expect(settings.autoRecords[0].categoryId).toBe('new');
    expect(settings.categoryNotes).toEqual({ new: ['新备注', '公共', '旧备注'] });
    expect(await db.syncQueue.get('transaction:deleted')).toMatchObject({ operation: 'delete' });
    expect(await db.syncQueue.get('category:old')).toMatchObject({ operation: 'delete' });
    expect(await db.syncQueue.get('settings:main')).toMatchObject({ operation: 'upsert' });
    expect(await db.syncQueue.count()).toBe(5);
  });

  it.each(['income', 'foreign', 'removed', 'old', 'missing'])('revalidates destination %s before making any change', async target => {
    await expect(transferCategoryData('book', 'old', target, 1000)).rejects.toThrow('分类状态已变化');
    expect((await db.categories.get('old'))?.isDeleted).not.toBe(true);
    expect((await db.transactions.get('used'))?.categoryId).toBe('old');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('rolls back every write if the sync queue cannot be committed', async () => {
    vi.spyOn(db.syncQueue, 'bulkPut').mockRejectedValueOnce(new Error('queue failure'));
    await expect(transferCategoryData('book', 'old', 'new', 1000)).rejects.toThrow('queue failure');
    expect((await db.categories.get('old'))?.isDeleted).not.toBe(true);
    expect((await db.transactions.get('used'))?.categoryId).toBe('old');
    expect((await db.categoryGroups.get('group'))?.categoryIds).toEqual(['old', 'new', 'old']);
    expect((await db.settings.get('main'))?.value.autoRecords[0].categoryId).toBe('old');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('keeps card-key and normal trading inventory in compatible categories', () => {
    const source = category('old', { type: 'trade', tradeItemType: 'cardKey' });
    expect(canTransferCategoryTo(source, category('new', { type: 'trade', tradeItemType: 'normal' }))).toBe(false);
    expect(canTransferCategoryTo(source, category('new', { type: 'trade', tradeItemType: 'cardKey' }))).toBe(true);
  });
});
