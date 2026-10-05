import { CategoryGroup } from '../types';
import { db, createSyncQueueItem } from './db';
import { getCategoryGroupOwners, getLedgerGroupCategories, getValidGroupCategoryIds, normalizeExclusiveCategoryGroups } from './categoryGroups';

export const saveCategoryGroupExclusive = (group: CategoryGroup, mode: 'create' | 'edit', requestedAt: number) =>
  db.transaction('rw', [db.ledgers, db.categories, db.categoryGroups, db.syncQueue], async () => {
    if (!group.ledgerId || !group.name.trim()) throw new Error('请选择账本并填写分类组名称');
    const [ledger, existing, categories, groups] = await Promise.all([
      db.ledgers.get(group.ledgerId), db.categoryGroups.get(group.id),
      db.categories.where('ledgerId').equals(group.ledgerId).toArray(),
      db.categoryGroups.where('ledgerId').equals(group.ledgerId).toArray(),
    ]);
    if (!ledger || ledger.isDeleted || (mode === 'edit' && (!existing || existing.isDeleted || existing.ledgerId !== group.ledgerId))
      || (mode === 'create' && existing)) throw new Error('账本或分类组状态已变化，请重新打开后保存');
    const catalog = getLedgerGroupCategories(categories, group.ledgerId);
    const ids = getValidGroupCategoryIds(group.categoryIds, catalog);
    const owners = getCategoryGroupOwners(catalog, groups, group.ledgerId);
    for (const id of ids) {
      const owner = owners.get(id);
      if (owner && owner.id !== group.id) {
        throw new Error(`“${catalog.find(category => category.id === id)?.name || id}”已归属“${owner.name}”，请重新选择`);
      }
    }
    const updatedAt = groups.reduce((time, item) => Math.max(time, Number(item.updatedAt || 0) + 1), requestedAt);
    const candidate = { ...group, name: group.name.trim(), categoryIds: ids, isDeleted: false, updatedAt };
    const canonical = normalizeExclusiveCategoryGroups(catalog, groups);
    const candidates = existing ? canonical.map(item => item.id === group.id ? candidate : item) : [...canonical, candidate];
    const next = normalizeExclusiveCategoryGroups(catalog, candidates);
    const original = new Map(groups.map(item => [item.id, item]));
    const changed = next.filter(item => item.id === candidate.id || JSON.stringify(item.categoryIds) !== JSON.stringify(original.get(item.id)?.categoryIds))
      .map(item => ({ ...item, updatedAt }));
    await db.categoryGroups.bulkPut(changed);
    await db.syncQueue.bulkPut(changed.map(item => createSyncQueueItem('categoryGroup', item.id, item.isDeleted ? 'delete' : 'upsert', updatedAt)));
    return updatedAt;
  });
