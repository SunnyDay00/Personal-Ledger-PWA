import { Category } from '../types';
import { db, createSyncQueueItem } from './db';
import { getCategoryGroupOwners, getLedgerGroupCategories, normalizeExclusiveCategoryGroups } from './categoryGroups';

export const canTransferCategoryTo = (source: Category, target: Category): boolean =>
  !source.isDeleted && !target.isDeleted && !!source.ledgerId && source.ledgerId === target.ledgerId
  && source.id !== target.id && source.type === target.type
  && (source.type !== 'trade' || (source.tradeItemType ?? 'normal') === (target.tradeItemType ?? 'normal'));

// Records, references, source deletion and sync queue commit together or not at all.
export const transferCategoryData = async (ledgerId: string, sourceId: string, targetId: string, requestedAt: number) =>
  db.transaction('rw', [db.ledgers, db.categories, db.transactions, db.categoryGroups, db.settings, db.syncQueue], async () => {
    const [ledger, source, target] = await Promise.all([
      db.ledgers.get(ledgerId), db.categories.get(sourceId), db.categories.get(targetId),
    ]);
    if (!ledger || ledger.isDeleted || !source || source.ledgerId !== ledgerId || !target || !canTransferCategoryTo(source, target)) {
      throw new Error('分类状态已变化，请选择当前账本中其他有效的同类型分类');
    }
    const [records, rawGroups, settingsRow, categories] = await Promise.all([
      db.transactions.where('categoryId').equals(sourceId).filter(record => record.ledgerId === ledgerId).toArray(),
      db.categoryGroups.where('ledgerId').equals(ledgerId).filter(group => !group.isDeleted).toArray(),
      db.settings.get('main'), db.categories.where('ledgerId').equals(ledgerId).toArray(),
    ]);
    const catalog = getLedgerGroupCategories(categories, ledgerId);
    const targetOwner = getCategoryGroupOwners(catalog, rawGroups, ledgerId).get(targetId);
    const candidates = normalizeExclusiveCategoryGroups(catalog, rawGroups).map(group => ({
      ...group,
      categoryIds: [...new Set(group.categoryIds.flatMap(id => id !== sourceId ? [id]
        : !targetOwner || targetOwner.id === group.id ? [targetId] : []))],
    }));
    const originals = new Map(rawGroups.map(group => [group.id, group]));
    const groups = candidates.filter(group => JSON.stringify(group.categoryIds) !== JSON.stringify(originals.get(group.id)?.categoryIds));
    const settings = settingsRow?.value;
    const updatedAt = [source.updatedAt, target.updatedAt, settings?.settingsUpdatedAt,
      ...records.map(record => record.updatedAt), ...groups.map(group => group.updatedAt)]
      .reduce<number>((latest, value) => Math.max(latest, Number(value || 0) + 1), requestedAt);
    const transferred = records.map(record => ({ ...record, categoryId: targetId, updatedAt }));
    const updatedGroups = groups.map(group => ({
      ...group, updatedAt,
      categoryIds: group.categoryIds,
    }));
    const queue = [
      createSyncQueueItem('category', sourceId, 'delete', updatedAt),
      ...transferred.map(record => createSyncQueueItem('transaction', record.id, record.isDeleted ? 'delete' : 'upsert', updatedAt)),
      ...updatedGroups.map(group => createSyncQueueItem('categoryGroup', group.id, 'upsert', updatedAt)),
    ];
    const rules = settings?.autoRecords || [];
    const notes = settings?.categoryNotes || {};
    if (settings && (rules.some(rule => rule.ledgerId === ledgerId && rule.categoryId === sourceId)
      || Object.prototype.hasOwnProperty.call(notes, sourceId))) {
      const categoryNotes = { ...notes };
      if (Object.prototype.hasOwnProperty.call(notes, sourceId)) {
        categoryNotes[targetId] = [...new Set([...(notes[targetId] || []), ...(notes[sourceId] || [])])].slice(0, 10);
        delete categoryNotes[sourceId];
      }
      await db.settings.put({ key: 'main', value: {
        ...settings, settingsUpdatedAt: updatedAt, categoryNotes,
        autoRecords: rules.map(rule => rule.ledgerId === ledgerId && rule.categoryId === sourceId
          ? { ...rule, categoryId: targetId, updatedAt } : rule),
      } });
      queue.push(createSyncQueueItem('settings', 'main', 'upsert', updatedAt));
    }
    if (transferred.length) await db.transactions.bulkPut(transferred);
    if (updatedGroups.length) await db.categoryGroups.bulkPut(updatedGroups);
    await db.categories.put({ ...source, isDeleted: true, updatedAt });
    await db.syncQueue.bulkPut(queue);
    return { movedCount: transferred.filter(record => !record.isDeleted).length, updatedAt, sourceName: source.name, targetName: target.name };
  });
