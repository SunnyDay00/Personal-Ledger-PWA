import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Category, CategoryGroup } from '../types';
import { db, dbAPI } from './db';
import { saveCategoryGroupExclusive } from './categoryGroupStorage';

const group = (id: string, categoryIds: string[], order = 0): CategoryGroup => ({
  id, categoryIds, ledgerId: 'book', name: id, order, updatedAt: 10,
});
beforeEach(async () => {
  await db.open();
  for (const table of db.tables) await table.clear();
  await db.ledgers.put({ id: 'book', name: '账本', themeColor: '#007AFF', createdAt: 1 });
  await db.categories.bulkPut(['a', 'b', 'c'].map((id): Category => ({
    id, name: id, ledgerId: 'book', type: 'expense', icon: 'Circle', order: 0,
  })));
  await db.categoryGroups.bulkPut([group('first', ['a']), group('second', ['b'], 1)]);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await db.delete(); });

describe('exclusive group persistence', () => {
  it('releases an unchecked category instead of reviving another legacy duplicate assignment', async () => {
    await db.categoryGroups.put(group('second', ['a', 'b'], 1));
    await saveCategoryGroupExclusive(group('first', []), 'edit', 100);
    expect((await db.categoryGroups.get('first'))?.categoryIds).toEqual([]);
    expect((await db.categoryGroups.get('second'))?.categoryIds).toEqual(['b']);
    expect((await dbAPI.getCategoryGroups()).some(item => item.categoryIds.includes('a'))).toBe(false);
  });
  it('allows retaining own members and adding an unassigned category', async () => {
    await saveCategoryGroupExclusive(group('first', ['a', 'c']), 'edit', 100);
    expect((await db.categoryGroups.get('first'))?.categoryIds).toEqual(['a', 'c']);
    expect((await db.categoryGroups.get('second'))?.categoryIds).toEqual(['b']);
    expect(await db.syncQueue.get('categoryGroup:first')).toMatchObject({ operation: 'upsert' });
  });

  it('revalidates an ownership change that happened after the editor opened', async () => {
    await db.categoryGroups.put(group('second', ['b', 'c'], 1));
    await expect(saveCategoryGroupExclusive(group('first', ['a', 'c']), 'edit', 100))
      .rejects.toThrow('已归属“second”');
    expect((await db.categoryGroups.get('first'))?.categoryIds).toEqual(['a']);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('allows only one of two concurrent saves to claim the same category', async () => {
    const results = await Promise.allSettled([
      saveCategoryGroupExclusive(group('new-one', ['c'], 2), 'create', 100),
      saveCategoryGroupExclusive(group('new-two', ['c'], 3), 'create', 101),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await db.categoryGroups.toArray()).filter(item => item.categoryIds.includes('c'))).toHaveLength(1);
  });

  it('cleans legacy duplicate membership and queues all changed groups together', async () => {
    await db.categoryGroups.put(group('second', ['a', 'b'], 1));
    await saveCategoryGroupExclusive(group('first', ['a']), 'edit', 100);
    expect((await db.categoryGroups.get('first'))?.categoryIds).toEqual(['a']);
    expect((await db.categoryGroups.get('second'))?.categoryIds).toEqual(['b']);
    expect(await db.syncQueue.count()).toBe(2);
  });

  it('rolls back the group and legacy cleanup if queuing the save fails', async () => {
    await db.categoryGroups.put(group('second', ['a', 'b'], 1));
    vi.spyOn(db.syncQueue, 'bulkPut').mockRejectedValueOnce(new Error('queue failure'));
    await expect(saveCategoryGroupExclusive(group('first', ['a', 'c']), 'edit', 100)).rejects.toThrow('queue failure');
    expect((await db.categoryGroups.get('first'))?.categoryIds).toEqual(['a']);
    expect((await db.categoryGroups.get('second'))?.categoryIds).toEqual(['a', 'b']);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('rejects reviving a deleted group or claiming another ledger category', async () => {
    await db.categoryGroups.update('first', { isDeleted: true });
    await expect(saveCategoryGroupExclusive(group('first', ['a']), 'edit', 100)).rejects.toThrow('状态已变化');
    const foreign = { ...group('foreign', ['a']), ledgerId: 'missing-book' };
    await expect(saveCategoryGroupExclusive(foreign, 'create', 100)).rejects.toThrow('状态已变化');
    expect(await db.syncQueue.count()).toBe(0);
  });
});
