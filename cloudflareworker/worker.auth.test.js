import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

// Execute the production SQL against SQLite instead of matching query strings.
class TestD1 {
  database = new DatabaseSync(':memory:');
  prepare(sql) {
    const statement = this.database.prepare(sql);
    let values = [];
    const query = {
      bind(...args) { values = args; return query; },
      async first() { return statement.get(...values) || null; },
      async all() { return { results: statement.all(...values) }; },
      async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
    };
    return query;
  }
}

let env;
const NOW = Date.UTC(2026, 9, 4);
const call = (path, token, body) => worker.fetch(new Request(`https://worker.test${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), env);
const hash = async token => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  env = { DB: new TestD1() };
});
afterEach(() => {
  env.DB.database.close();
  vi.restoreAllMocks();
});

async function registerUser() {
  await call('/auth/me', 'bootstrap');
  env.DB.database.prepare('INSERT INTO invite_codes (code, created_at, disabled) VALUES (?, ?, 0)').run('123456', NOW);
  const response = await call('/auth/register', null, { username: 'tester', password: 'password123', inviteCode: '123456' });
  expect(response.status).toBe(201);
  return response.json();
}

describe('account session policy', () => {
  it('defaults registration and login to permanent and remains logged in years later', async () => {
    const registered = await registerUser();
    expect(registered.logoutAfter).toBe('permanent');
    const login = await call('/auth/login', null, { username: 'tester', password: 'password123' });
    const session = await login.json();
    expect(session.logoutAfter).toBe('permanent');
    vi.mocked(Date.now).mockReturnValue(NOW + 10 * 365 * 86400000);
    expect((await call('/auth/me', registered.token)).status).toBe(200);
    expect((await call('/auth/me', session.token)).status).toBe(200);
  });

  it.each([['week', 7], ['month', 30], ['year', 365]])('expires %s at the fixed deadline and does not slide with use', async (period, days) => {
    const session = await registerUser();
    const response = await call('/auth/session', session.token, { logoutAfter: period });
    const policy = await response.json();
    expect(policy.expiresAt).toBe(NOW + days * 86400000);
    vi.mocked(Date.now).mockReturnValue(policy.expiresAt - 1);
    const me = await (await call('/auth/me', session.token)).json();
    expect(me.expiresAt).toBe(policy.expiresAt);
    vi.mocked(Date.now).mockReturnValue(policy.expiresAt);
    expect((await call('/auth/me', session.token)).status).toBe(401);
    expect((await call('/auth/session', session.token, { logoutAfter: 'permanent' })).status).toBe(401);
  });

  it('can cancel a finite deadline and only changes the requesting device session', async () => {
    const first = await registerUser();
    const second = await (await call('/auth/login', null, { username: 'tester', password: 'password123' })).json();
    await call('/auth/session', first.token, { logoutAfter: 'week' });
    expect((await (await call('/auth/me', second.token)).json()).logoutAfter).toBe('permanent');
    await call('/auth/session', first.token, { logoutAfter: 'permanent' });
    vi.mocked(Date.now).mockReturnValue(NOW + 400 * 86400000);
    expect((await call('/auth/me', first.token)).status).toBe(200);
  });

  it('rejects invalid policies and revoked permanent sessions', async () => {
    const session = await registerUser();
    expect((await call('/auth/session', session.token, { logoutAfter: 'tomorrow' })).status).toBe(400);
    expect((await call('/auth/session', null, { logoutAfter: 'week' })).status).toBe(401);
    expect((await call('/auth/logout', session.token, {})).status).toBe(200);
    expect((await call('/auth/me', session.token)).status).toBe(401);
  });

  it('migrates live legacy sessions without reviving expired, revoked, or disabled logins', async () => {
    const database = env.DB.database;
    database.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, password_salt TEXT,
        password_iterations INTEGER, created_at INTEGER, updated_at INTEGER, disabled INTEGER DEFAULT 0);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT UNIQUE,
        created_at INTEGER, expires_at INTEGER, revoked_at INTEGER, user_agent TEXT);
      INSERT INTO users (id, username, disabled) VALUES ('user', 'tester', 0), ('disabled', 'disabled', 1);
    `);
    for (const [token, expiry, revoked, user] of [
      ['live', NOW + 1000, null, 'user'],
      ['expired', NOW - 1, null, 'user'],
      ['revoked', NOW + 1000, NOW - 100, 'user'],
      ['disabled', NOW + 1000, null, 'disabled'],
    ]) {
      database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(token, user, await hash(token), NOW - 1000, expiry, revoked, 'test');
    }
    const me = await (await call('/auth/me', 'live')).json();
    expect(me.logoutAfter).toBe('permanent');
    vi.mocked(Date.now).mockReturnValue(NOW + 40 * 86400000);
    expect((await call('/auth/me', 'live')).status).toBe(200);
    for (const token of ['expired', 'revoked', 'disabled']) {
      expect((await call('/auth/me', token)).status).toBe(401);
    }
  });
});
