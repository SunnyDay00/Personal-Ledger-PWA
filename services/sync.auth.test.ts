import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants';
import { db } from './db';
import { SyncService } from './sync';
import { saveDeviceSearchHistory } from './searchHistory';

const dav = vi.hoisted(() => ({
  cloud: '',
  uploads: new Map<string, string>(),
}));
vi.mock('./webdav', () => ({
  WebDAVService: class {
    async listFiles() { return [{ filename: 'settings.json' }]; }
    async getFile() { return { text: dav.cloud, etag: 'old' }; }
    async putFile(filename: string, text: string) { dav.uploads.set(filename, text); }
    async createDirectory() { }
  },
}));

beforeEach(async () => {
  await db.open();
  for (const table of db.tables) await table.clear();
  dav.uploads.clear();
});
afterAll(async () => { await db.delete(); });

it.each([
  { incoming: undefined, expected: false },
  { incoming: { food: true }, expected: true },
])('restores group eye preferences and retains them for legacy backups: $expected', async ({ incoming, expected }) => {
  await db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, categoryGroupVisibility: { food: false } } });
  dav.cloud = JSON.stringify({ settings: { ...DEFAULT_SETTINGS, categoryGroupVisibility: incoming } });
  await new SyncService(DEFAULT_SETTINGS).performSync();
  expect((await db.settings.get('main'))?.value.categoryGroupVisibility).toEqual({ food: expected });
  expect(JSON.parse(dav.uploads.get('settings.json')!).settings.categoryGroupVisibility).toEqual({ food: expected });
});

it.each([{ history: ['本机搜索'] }, { history: [] }])('preserves device history $history across WebDAV restore and omits it from backup', async ({ history: localHistory }) => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  try {
    saveDeviceSearchHistory(localHistory);
    await db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, searchHistory: localHistory } });
    dav.cloud = JSON.stringify({ settings: { ...DEFAULT_SETTINGS, searchHistory: ['其他设备搜索'] } });
    await new SyncService(DEFAULT_SETTINGS).performSync();
    expect((await db.settings.get('main'))?.value.searchHistory).toEqual(localHistory);
    const backup = dav.uploads.get('settings.json');
    expect(backup).toBeDefined();
    expect(JSON.parse(backup!).settings.searchHistory).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps the current device session when restoring WebDAV settings and never backs up its token', async () => {
  const localSession = {
    user: { id: 'local-user', username: 'local' }, token: 'device-token',
    logoutAfter: 'week' as const, expiresAt: Date.now() + 604800000,
  };
  await db.settings.put({ key: 'main', value: { ...DEFAULT_SETTINGS, authSession: localSession, authMode: 'authenticated' } });
  dav.cloud = JSON.stringify({ settings: {
    ...DEFAULT_SETTINGS,
    themeMode: 'dark',
    authSession: { ...localSession, token: 'other-device-token', logoutAfter: 'permanent' },
  } });
  await new SyncService(DEFAULT_SETTINGS).performSync();
  const restored = await db.settings.get('main');
  expect(restored?.value.authSession).toEqual(localSession);
  expect(restored?.value.themeMode).toBe('dark');
  const backup = dav.uploads.get('settings.json');
  expect(backup).toBeDefined();
  expect(backup).not.toContain('device-token');
  expect(JSON.parse(backup!).settings.authSession).toBeUndefined();
});
