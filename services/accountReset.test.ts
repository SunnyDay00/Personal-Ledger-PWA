import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it, vi } from 'vitest';
import { clearLocalAccountData, db, DB_NAME, dbAPI } from './db';

it('removes all account stores, legacy databases and browser state, then blocks late writes', async () => {
  const local = new Map([['ledger_app_v1', 'old-account'], ['lastLedgerId', 'private-ledger'], ['ai-active-conversation', 'private-chat']]);
  const session = new Map([['private', 'cached']]);
  vi.stubGlobal('window', {
    localStorage: { setItem: (key: string, value: string) => local.set(key, value), clear: () => local.clear() },
    sessionStorage: { clear: () => session.clear() },
  });
  try {
    await db.open();
    for (const table of db.tables) {
      const key = String(table.schema.primKey.keyPath);
      await table.put({ [key]: 'private-row', value: { authSession: { token: 'private-token' } } });
    }
    const legacy = new Dexie('FinanceDB_v8');
    legacy.version(1).stores({ transactions: 'id' });
    await legacy.open();
    await legacy.table('transactions').put({ id: 'legacy-private-data' });
    legacy.close();
    await clearLocalAccountData();
    expect(await Dexie.exists(DB_NAME)).toBe(false);
    expect(await Dexie.exists('FinanceDB_v8')).toBe(false);
    expect(local.size).toBe(0);
    expect(session.size).toBe(0);
    await expect(dbAPI.getSettings()).rejects.toThrow();
    expect(await Dexie.exists(DB_NAME)).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
