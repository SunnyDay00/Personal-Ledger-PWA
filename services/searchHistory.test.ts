import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants';
import { db, dbAPI } from './db';
import { getSyncableSettings } from './settingsUtils';
import { normalizeSearchHistory, prependSearchHistory, readDeviceSearchHistory, saveDeviceSearchHistory, SEARCH_HISTORY_STORAGE_KEY } from './searchHistory';

let storage: Map<string, string>;
beforeEach(async () => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  await db.open();
  await db.settings.clear();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await db.delete(); });

describe('device-local search history', () => {
  it('migrates existing history once and restores the saved value after reopening', () => {
    expect(readDeviceSearchHistory([' 理发 ', '起点'])).toEqual(['理发', '起点']);
    saveDeviceSearchHistory(prependSearchHistory(readDeviceSearchHistory(), ' 咖啡 '));
    expect(JSON.parse(storage.get(SEARCH_HISTORY_STORAGE_KEY)!)).toEqual(['咖啡', '理发', '起点']);
    expect(readDeviceSearchHistory(['cloud-history'])).toEqual(['咖啡', '理发', '起点']);
  });
  it('does not resurrect cleared history from stale settings or backups', async () => {
    saveDeviceSearchHistory([]);
    await db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, searchHistory: ['cloud-history'] } });
    expect((await dbAPI.getSettings())?.searchHistory).toEqual([]);
    await dbAPI.saveSettings({ ...DEFAULT_SETTINGS, searchHistory: ['stale-ui-history'] });
    expect((await db.settings.get('main'))?.value.searchHistory).toEqual([]);
    expect(readDeviceSearchHistory(['legacy-history'])).toEqual([]);
  });
  it('keeps 10 trimmed unique terms in most-recent order and excludes history from account settings', () => {
    const history = prependSearchHistory([' 起点 ', '理发', ...Array.from({ length: 12 }, (_, i) => `词${i}`)], ' 理发 ');
    expect(history).toHaveLength(10);
    expect(history.slice(0, 2)).toEqual(['理发', '起点']);
    expect(normalizeSearchHistory([' ', null, '词', '词'])).toEqual(['词']);
    expect(getSyncableSettings({ ...DEFAULT_SETTINGS, searchHistory: history }).searchHistory).toBeUndefined();
  });
});
