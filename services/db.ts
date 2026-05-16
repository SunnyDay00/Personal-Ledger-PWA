import Dexie, { Table } from 'dexie';
import { Transaction, Ledger, Category, CategoryGroup, AppSettings, OperationLog, BackupLog, SyncEntityType, SyncOperation, SyncQueueItem } from '../types';
import { loadState } from './storage';

// 再次 bump DB 名称，彻底规避旧 schema 残留导致 objectStore not found。
export const DB_NAME = 'FinanceDB_v9';
const LEGACY_DB_NAMES = ['FinanceDB_v8', 'FinanceDB_v7', 'FinanceDB_v6', 'FinanceDB_v5', 'FinanceDB_v4', 'FinanceDB_v3', 'FinanceDB'];

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction>;
  ledgers!: Table<Ledger>;
  categories!: Table<Category>;
  categoryGroups!: Table<CategoryGroup>;
  settings!: Table<{ key: string; value: AppSettings }>; // Singleton key='main'
  operationLogs!: Table<OperationLog>;
  backupLogs!: Table<BackupLog>;
  images!: Table<{ key: string; blob: Blob; size: number; lastAccess: number }>;
  pending_uploads!: Table<{ key: string; blob: Blob; createdAt: number }>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super(DB_NAME);
    (this as any).version(1).stores({
      transactions: 'id, ledgerId, categoryId, date, updatedAt, isDeleted',
      ledgers: 'id, updatedAt, isDeleted',
      categories: 'id, ledgerId, type, order, updatedAt, isDeleted',
      categoryGroups: 'id, ledgerId, order, updatedAt, isDeleted',
      settings: 'key',
      operationLogs: 'id, timestamp, type',
      backupLogs: 'id, timestamp',
    });
    // Add Image Cache
    (this as any).version(2).stores({
        images: 'key, lastAccess, size'
    });
    // Add Offline Upload Queue
    (this as any).version(3).stores({
        pending_uploads: 'key, createdAt'
    });
    (this as any).version(4).stores({
        syncQueue: 'id, entityType, entityId, updatedAt'
    });
  }

}

export let db = new FinanceDB();

// 显式打开数据库，确保建库流程执行；失败时抛出错误，不自动删库
async function openDB() {
  if (db.isOpen()) return;
  await db.open();
}

// 便于浏览器 Console 调试（只在浏览器环境挂载）
if (typeof window !== 'undefined') {
  (window as any).__db = db;
}

export async function resetDB() {
  try { db.close(); } catch {}
  // 删除当前以及历史库名，确保全量重建
  for (const name of [DB_NAME, ...LEGACY_DB_NAMES]) {
    try { await Dexie.delete(name); } catch {}
  }
  db = new FinanceDB();
  await db.open();
  return db;
}

export const createSyncQueueId = (entityType: SyncEntityType, entityId: string) => `${entityType}:${entityId}`;

export const createSyncQueueItem = (
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  updatedAt: number
): SyncQueueItem => ({
  id: createSyncQueueId(entityType, entityId),
  entityType,
  entityId,
  operation,
  updatedAt,
  createdAt: Date.now(),
});

const hasMissingUpdatedAt = <T extends { updatedAt?: number }>(items: T[]) =>
  items.some(item => !item.updatedAt);

export async function markAllLocalDataForSync(): Promise<number> {
  await openDB();
  const now = Date.now();
  const [transactions, ledgers, categories, groups] = await Promise.all([
    db.transactions.toArray(),
    db.ledgers.toArray(),
    db.categories.toArray(),
    db.categoryGroups.toArray().catch(() => [] as CategoryGroup[]),
  ]);

  const normalizedTransactions = transactions.map(t => ({
    ...t,
    updatedAt: t.updatedAt || t.createdAt || t.date || now,
    isDeleted: !!t.isDeleted,
  }));
  const normalizedLedgers = ledgers.map(l => ({
    ...l,
    updatedAt: l.updatedAt || l.createdAt || now,
    isDeleted: !!l.isDeleted,
  }));
  const normalizedCategories = categories.map(c => ({
    ...c,
    updatedAt: c.updatedAt || now,
    isDeleted: !!c.isDeleted,
  }));
  const normalizedGroups = groups.map(g => ({
    ...g,
    updatedAt: g.updatedAt || now,
    isDeleted: !!g.isDeleted,
  }));

  const queueItems = [
    ...normalizedTransactions.map(t => createSyncQueueItem('transaction', t.id, t.isDeleted ? 'delete' : 'upsert', t.updatedAt || now)),
    ...normalizedLedgers.map(l => createSyncQueueItem('ledger', l.id, l.isDeleted ? 'delete' : 'upsert', l.updatedAt || now)),
    ...normalizedCategories.map(c => createSyncQueueItem('category', c.id, c.isDeleted ? 'delete' : 'upsert', c.updatedAt || now)),
    ...normalizedGroups.map(g => createSyncQueueItem('categoryGroup', g.id, g.isDeleted ? 'delete' : 'upsert', g.updatedAt || now)),
  ];

  await (db as any).transaction('rw', db.transactions, db.ledgers, db.categories, db.categoryGroups, db.syncQueue, async () => {
    if (hasMissingUpdatedAt(transactions)) await db.transactions.bulkPut(normalizedTransactions);
    if (hasMissingUpdatedAt(ledgers)) await db.ledgers.bulkPut(normalizedLedgers);
    if (hasMissingUpdatedAt(categories)) await db.categories.bulkPut(normalizedCategories);
    if (hasMissingUpdatedAt(groups)) await db.categoryGroups.bulkPut(normalizedGroups);
    if (queueItems.length > 0) await db.syncQueue.bulkPut(queueItems);
  });

  return queueItems.length;
}

export async function queueCachedImagesForUpload(imageKeys?: string[]): Promise<number> {
  await openDB();
  const keys = imageKeys
    ? imageKeys
    : (await db.transactions.toArray()).flatMap(transaction => transaction.attachments || []);
  const uniqueKeys = Array.from(new Set(keys.filter(key => typeof key === 'string' && key.trim() !== '')));
  if (uniqueKeys.length === 0) return 0;

  let queued = 0;
  await (db as any).transaction('rw', db.images, db.pending_uploads, async () => {
    for (const key of uniqueKeys) {
      const pending = await db.pending_uploads.get(key);
      if (pending) continue;

      const cached = await db.images.get(key);
      if (!cached?.blob || cached.blob.size <= 0) continue;

      await db.pending_uploads.put({ key, blob: cached.blob, createdAt: Date.now() });
      queued++;
    }
  });

  return queued;
}

// 确保所有表存在；如果缺表或打开失败，停止流程以保护本地数据
export async function ensureStoresReady(): Promise<boolean> {
  try {
    await openDB();
    await Promise.all([
      db.transactions.count(),
      db.ledgers.count(),
      db.categories.count(),
      db.categoryGroups.count(),
      db.settings.count(),
      db.operationLogs.count(),
      db.backupLogs.count(),
      db.syncQueue.count(),
    ]);
    return true;
  } catch (e: any) {
    console.warn('ensureStoresReady failed; local database was not reset automatically.', e?.message);
    return false;
  }
}

type LegacyFinanceDB = Dexie & {
  transactions: Table<Transaction>;
  ledgers: Table<Ledger>;
  categories: Table<Category>;
  categoryGroups: Table<CategoryGroup>;
  settings: Table<{ key: string; value: AppSettings }>;
  operationLogs: Table<OperationLog>;
  backupLogs: Table<BackupLog>;
  images: Table<{ key: string; blob: Blob; size: number; lastAccess: number }>;
  pending_uploads: Table<{ key: string; blob: Blob; createdAt: number }>;
};

const createLegacyDB = (name: string): LegacyFinanceDB => {
  const legacy = new Dexie(name) as LegacyFinanceDB;
  legacy.version(1).stores({
    transactions: 'id, ledgerId, categoryId, date, updatedAt, isDeleted',
    ledgers: 'id, updatedAt, isDeleted',
    categories: 'id, ledgerId, type, order, updatedAt, isDeleted',
    categoryGroups: 'id, ledgerId, order, updatedAt, isDeleted',
    settings: 'key',
    operationLogs: 'id, timestamp, type',
    backupLogs: 'id, timestamp',
  });
  legacy.version(2).stores({
    images: 'key, lastAccess, size'
  });
  legacy.version(3).stores({
    pending_uploads: 'key, createdAt'
  });
  return legacy;
};

async function migrateFromLegacyIndexedDB(): Promise<boolean> {
  for (const name of LEGACY_DB_NAMES) {
    const exists = await (Dexie as any).exists(name);
    if (!exists) continue;

    const legacy = createLegacyDB(name);
    try {
      await legacy.open();
      const [ledgers, categories, groups, transactions, settingsRows, operationLogs, backupLogs, images, pendingUploads] = await Promise.all([
        legacy.ledgers.toArray().catch(() => [] as Ledger[]),
        legacy.categories.toArray().catch(() => [] as Category[]),
        legacy.categoryGroups.toArray().catch(() => [] as CategoryGroup[]),
        legacy.transactions.toArray().catch(() => [] as Transaction[]),
        legacy.settings.toArray().catch(() => [] as { key: string; value: AppSettings }[]),
        legacy.operationLogs.toArray().catch(() => [] as OperationLog[]),
        legacy.backupLogs.toArray().catch(() => [] as BackupLog[]),
        legacy.images.toArray().catch(() => [] as { key: string; blob: Blob; size: number; lastAccess: number }[]),
        legacy.pending_uploads.toArray().catch(() => [] as { key: string; blob: Blob; createdAt: number }[]),
      ]);

      const hasData = ledgers.length + categories.length + groups.length + transactions.length + settingsRows.length > 0;
      if (!hasData) continue;

      const now = Date.now();
      const ledgersWithTime = ledgers.map(l => ({
        ...l,
        updatedAt: l.updatedAt || now,
        isDeleted: !!l.isDeleted,
      }));
      const defaultLedgerId = ledgersWithTime[0]?.id || 'default';
      const catsWithTime = categories.map(c => ({
        ...c,
        ledgerId: c.ledgerId || defaultLedgerId,
        updatedAt: c.updatedAt || now,
        isDeleted: !!c.isDeleted,
      }));
      const groupsWithTime = groups.map(g => ({
        ...g,
        ledgerId: g.ledgerId || defaultLedgerId,
        updatedAt: g.updatedAt || now,
        isDeleted: !!g.isDeleted,
      }));
      const txsWithTime = transactions.map(t => ({
        ...t,
        updatedAt: t.updatedAt || t.createdAt || t.date || now,
        isDeleted: !!t.isDeleted,
      }));

      await (db as any).transaction('rw', db.transactions, db.ledgers, db.categories, db.categoryGroups, db.settings, db.operationLogs, db.backupLogs, db.images, db.pending_uploads, async () => {
        if (ledgersWithTime.length) await db.ledgers.bulkPut(ledgersWithTime);
        if (catsWithTime.length) await db.categories.bulkPut(catsWithTime);
        if (groupsWithTime.length) await db.categoryGroups.bulkPut(groupsWithTime);
        if (txsWithTime.length) await db.transactions.bulkPut(txsWithTime);
        if (settingsRows.length) await db.settings.bulkPut(settingsRows);
        if (operationLogs.length) await db.operationLogs.bulkPut(operationLogs);
        if (backupLogs.length) await db.backupLogs.bulkPut(backupLogs);
        if (images.length) await db.images.bulkPut(images);
        if (pendingUploads.length) await db.pending_uploads.bulkPut(pendingUploads);
      });

      console.log(`Migrated data from legacy IndexedDB ${name}.`);
      return true;
    } catch (e) {
      console.warn(`Legacy IndexedDB migration skipped for ${name}`, e);
    } finally {
      legacy.close();
    }
  }

  return false;
}

/**
 * Migrate data from LocalStorage (File-based) to IndexedDB (Database-based)
 * This runs once on startup if DB is empty.
 */
export async function initAndMigrateDB() {
  let txCount = 0;
  let ledgerCount = 0;
  try {
    await openDB();
    txCount = await db.transactions.count();
    ledgerCount = await db.ledgers.count();
  } catch (e: any) {
    console.warn('DB init failed; local database was not reset automatically.', e?.message);
    throw e;
  }

  // If DB is empty, migrate older IndexedDB names first, then legacy LocalStorage data.
  if (txCount === 0 && ledgerCount === 0) {
    const migratedFromIndexedDB = await migrateFromLegacyIndexedDB();
    if (migratedFromIndexedDB) return;

    const legacyState = loadState();
    if (legacyState) {
      console.log('Migrating LocalStorage data to IndexedDB...');

      try {
        await (db as any).transaction('rw', db.transactions, db.ledgers, db.categories, db.categoryGroups, db.settings, db.operationLogs, db.backupLogs, async () => {
          // Migrate Settings
          if (legacyState.settings) {
            await db.settings.put({ key: 'main', value: legacyState.settings });
          }

          // Migrate Ledgers
          let ledgersWithTime: Ledger[] = [];
          if (legacyState.ledgers && legacyState.ledgers.length > 0) {
            ledgersWithTime = legacyState.ledgers.map(l => ({
              ...l,
              updatedAt: l.updatedAt || Date.now(),
              isDeleted: false,
            }));
            await db.ledgers.bulkPut(ledgersWithTime);
          }

            const defaultLedgerId = ledgersWithTime[0]?.id || 'default';

            // Migrate Categories
            if (legacyState.categories && legacyState.categories.length > 0) {
              const catsWithTime = legacyState.categories.map(c => ({
                ...c,
                ledgerId: c.ledgerId || defaultLedgerId,
                updatedAt: c.updatedAt || Date.now(),
                isDeleted: false,
              }));
              await db.categories.bulkPut(catsWithTime);
            }

            // Migrate Category Groups (if present)
            if (legacyState.categoryGroups && legacyState.categoryGroups.length > 0) {
              const groupsWithTime = legacyState.categoryGroups.map(g => ({
                ...g,
                ledgerId: g.ledgerId || defaultLedgerId,
                updatedAt: g.updatedAt || Date.now(),
                isDeleted: false,
              }));
              await db.categoryGroups.bulkPut(groupsWithTime);
            }

          // Migrate Transactions
          if (legacyState.transactions && legacyState.transactions.length > 0) {
            const txsWithTime = legacyState.transactions.map(t => ({
              ...t,
              updatedAt: t.updatedAt || Date.now(),
              isDeleted: false,
            }));
            await db.transactions.bulkPut(txsWithTime);
          }

          // Migrate Logs
          if (legacyState.operationLogs) await db.operationLogs.bulkPut(legacyState.operationLogs);
          if (legacyState.backupLogs) await db.backupLogs.bulkPut(legacyState.backupLogs);
        });

        console.log('Migration successful.');
      } catch (e) {
        console.error('Migration failed:', e);
      }
    } else {
      // Init default if nothing exists
      console.log('No legacy data, initialized fresh DB.');
    }
  }
}

// Data Access Helpers
export const dbAPI = {
  async getSettings(): Promise<AppSettings | undefined> {
    const row = await db.settings.get('main');
    return row?.value;
  },
  async saveSettings(settings: AppSettings) {
    await db.settings.put({ key: 'main', value: settings });
  },
  async getLedgers() {
    return (await db.ledgers.toArray()).filter(l => !l.isDeleted);
  },
  async getCategories() {
    return (await db.categories.orderBy('order').toArray()).filter(c => !c.isDeleted);
  },
  async getCategoryGroups() {
    return (await db.categoryGroups.orderBy('order').toArray()).filter(g => !g.isDeleted);
  },
  async getTransactions() {
    return (await db.transactions.orderBy('date').reverse().toArray()).filter(t => !t.isDeleted);
  },
  async getAllTransactionsIncludingDeleted() {
    return await db.transactions.toArray();
  },
  async getAllLedgersIncludingDeleted() {
    return await db.ledgers.toArray();
  },
  async getAllCategoriesIncludingDeleted() {
    return await db.categories.toArray();
  },
  async getAllCategoryGroupsIncludingDeleted() {
    try {
      return await db.categoryGroups.toArray();
    } catch (e) {
      console.warn('getAllCategoryGroupsIncludingDeleted failed', (e as any)?.message);
      return [];
    }
  },
  async getOperationLogs() {
    return await db.operationLogs.orderBy('timestamp').reverse().toArray();
  },
  async getBackupLogs() {
    return await db.backupLogs.orderBy('timestamp').reverse().toArray();
  },
  async getCFConfig() {
    const row = await db.settings.get('cf_stats_config');
    return row?.value as any;
  },
  async saveCFConfig(config: any) {
    await db.settings.put({ key: 'cf_stats_config', value: config });
  },
  async getSyncQueueItems() {
    return await db.syncQueue.toArray();
  },
  async getPendingSyncCount() {
    return await db.syncQueue.count();
  },
  async markSyncQueueItemsSynced(items: Pick<SyncQueueItem, 'id' | 'updatedAt'>[]) {
    if (items.length === 0) return;
    await (db as any).transaction('rw', db.syncQueue, async () => {
      for (const syncedItem of items) {
        const current = await db.syncQueue.get(syncedItem.id);
        if (!current) continue;
        if (current.updatedAt !== syncedItem.updatedAt) continue;
        await db.syncQueue.delete(syncedItem.id);
      }
    });
  },
  async hasUnsyncedData(lastSyncVersion: number): Promise<boolean> {
    const queued = await db.syncQueue.count();
    if (queued > 0) return true;

    const minTime = lastSyncVersion;
    // Check if any entity has updatedAt > lastSyncVersion
    const txCount = await db.transactions.where('updatedAt').above(minTime).count();
    if (txCount > 0) return true;
    
    const ledgerCount = await db.ledgers.where('updatedAt').above(minTime).count();
    if (ledgerCount > 0) return true;

    const catCount = await db.categories.where('updatedAt').above(minTime).count();
    if (catCount > 0) return true;

    const groupCount = await db.categoryGroups.where('updatedAt').above(minTime).count();
    if (groupCount > 0) return true;

    return false;
  },
};
