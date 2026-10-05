import { describe, expect, it } from 'vitest';
import { AuthSession } from '../types';
import { hasSessionExpired } from './auth';
import { normalizeAppSettings, getSyncableSettings } from './settingsUtils';

const session: AuthSession = { token: 'local-token', user: { id: 'user', username: 'tester' }, expiresAt: 100 };

describe('stored account expiry', () => {
  it('keeps legacy tokens for server migration and permanent sessions indefinitely', () => {
    expect(hasSessionExpired(session, 200)).toBe(false);
    expect(normalizeAppSettings({ authSession: session }).authSession).toEqual(session);
    expect(hasSessionExpired({ ...session, logoutAfter: 'permanent' }, 200)).toBe(false);
  });
  it.each(['week', 'month', 'year'] as const)('detects %s expiry including offline startup without silently dropping account data', period => {
    const finite = { ...session, logoutAfter: period };
    expect(hasSessionExpired(finite, 99)).toBe(false);
    expect(hasSessionExpired(finite, 100)).toBe(true);
    expect(normalizeAppSettings({ authSession: finite }).authSession).toEqual(finite);
    expect(getSyncableSettings(normalizeAppSettings({ authSession: finite })).authSession).toBeUndefined();
  });
});
