import Dexie, { Table } from 'dexie';
import { Transaction, Ledger, Category, CategoryGroup, AppSettings, OperationLog, BackupLog } from '../types';
import { loadState } from './storage';

// 再次 bump DB 名称，彻底规避旧 schema 残留导致 objectStore not found。
export const DB_NAME = 'FinanceDB_v9';
const LEGACY_DB_NAMES = ['FinanceDB_v7', 'FinanceDB_v6', 'FinanceDB_v5', 'FinanceDB_v4', 'FinanceDB_v3', 'FinanceDB'];

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
  }

}

export let db = new FinanceDB();

// 显式打开数据库，确保建库流程执行；若失败则重建
async function openDB() {
  if (db.isOpen()) return;
  try {
    await db.open();
  } catch (e) {
    console.warn('openDB failed, resetting...', (e as any)?.message);
    await resetDB();
  }
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

// 确保所有表存在；如果缺表则自动重建
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
    ]);
    return true;
  } catch (e: any) {
    console.warn('ensureStoresReady failed, resetting DB...', e?.message);
    await resetDB();
    return false;
  }
}

/**
 * Migrate data from LocalStorage (File-based) to IndexedDB (Database-based)
 * This runs once on startup if DB is empty.
 */
export async function initAndMigrateDB() {
  let txCount = 0;
  let ledgerCount = 0;
  try {
    txCount = await db.transactions.count();
    ledgerCount = await db.ledgers.count();
  } catch (e: any) {
    console.warn('DB init failed, resetting DB...', e?.message);
    await resetDB();
    txCount = await db.transactions.count();
    ledgerCount = await db.ledgers.count();
  }

  // If DB is empty, check for legacy LocalStorage data
  if (txCount === 0 && ledgerCount === 0) {
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
  async hasUnsyncedData(lastSyncVersion: number): Promise<boolean> {
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
