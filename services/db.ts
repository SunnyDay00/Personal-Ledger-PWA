import Dexie, { Table } from 'dexie';
import { Transaction, Ledger, Category, AppSettings, OperationLog, BackupLog } from '../types';
import { loadState } from './storage';

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction>;
  ledgers!: Table<Ledger>;
  categories!: Table<Category>;
  settings!: Table<{ key: string; value: AppSettings }>; // Singleton key='main'
  operationLogs!: Table<OperationLog>;
  backupLogs!: Table<BackupLog>;

  constructor() {
    super('FinanceDB');
    (this as any).version(1).stores({
      transactions: 'id, ledgerId, categoryId, date, updatedAt, isDeleted',
      ledgers: 'id, updatedAt, isDeleted',
      categories: 'id, type, order, updatedAt, isDeleted',
      settings: 'key',
      operationLogs: 'id, timestamp, type',
      backupLogs: 'id, timestamp'
    });
  }
}

export const db = new FinanceDB();

/**
 * Migrate data from LocalStorage (File-based) to IndexedDB (Database-based)
 * This runs once on startup if DB is empty.
 */
export async function initAndMigrateDB() {
  const txCount = await db.transactions.count();
  const ledgerCount = await db.ledgers.count();

  // If DB is empty, check for legacy LocalStorage data
  if (txCount === 0 && ledgerCount === 0) {
    const legacyState = loadState();
    if (legacyState) {
      console.log('Migrating LocalStorage data to IndexedDB...');
      
      try {
        await (db as any).transaction('rw', db.transactions, db.ledgers, db.categories, db.settings, db.operationLogs, db.backupLogs, async () => {
          
          // Migrate Settings
          if (legacyState.settings) {
            await db.settings.put({ key: 'main', value: legacyState.settings });
          }

          // Migrate Ledgers
          if (legacyState.ledgers && legacyState.ledgers.length > 0) {
             const ledgersWithTime = legacyState.ledgers.map(l => ({
                 ...l,
                 updatedAt: l.updatedAt || Date.now(),
                 isDeleted: false
             }));
             await db.ledgers.bulkPut(ledgersWithTime);
          }

          // Migrate Categories
          if (legacyState.categories && legacyState.categories.length > 0) {
              const catsWithTime = legacyState.categories.map(c => ({
                  ...c,
                  updatedAt: c.updatedAt || Date.now(),
                  isDeleted: false
              }));
              await db.categories.bulkPut(catsWithTime);
          }

          // Migrate Transactions
          if (legacyState.transactions && legacyState.transactions.length > 0) {
              const txsWithTime = legacyState.transactions.map(t => ({
                  ...t,
                  updatedAt: t.updatedAt || Date.now(),
                  isDeleted: false
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
        console.log("No legacy data, initialized fresh DB.");
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
    async getTransactions() {
        return (await db.transactions.orderBy('date').reverse().toArray()).filter(t => !t.isDeleted);
    },
    async getAllTransactionsIncludingDeleted() {
        return await db.transactions.toArray();
    }
};