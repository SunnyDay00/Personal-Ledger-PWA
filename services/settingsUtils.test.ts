import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants';
import { getSyncableSettings, normalizeAppSettings } from './settingsUtils';

describe('synchronized settings boundary', () => {
  it('includes the DeepSeek API key in D1 settings while excluding local auth and Cloudflare secrets', () => {
    const settings = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      aiConfig: {
        id: 'main',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        apiKey: 'sync-me',
        dataConsentAt: 1,
        updatedAt: 2,
      },
      authSession: {
        user: {
          id: 'user',
          username: 'tester',
        },
        token: 'local-session-token',
        expiresAt: Date.now() + 60_000,
      },
      cfConfig: {
        accountId: 'account',
        apiToken: 'cloudflare-secret',
        kvId: 'kv',
      },
    });

    const syncable = getSyncableSettings(settings);

    expect(syncable.aiConfig?.apiKey).toBe('sync-me');
    expect(syncable.authSession).toBeUndefined();
    expect(syncable.cfConfig).toBeUndefined();
    expect(JSON.stringify(syncable)).not.toContain('local-session-token');
    expect(JSON.stringify(syncable)).not.toContain('cloudflare-secret');
  });
});
