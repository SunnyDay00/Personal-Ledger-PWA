// 允许的前端域名（本地调试可加 http://localhost:3000）
const ALLOW_ORIGINS = [
  '*',
];
const PASSWORD_ITERATIONS = 100000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9_.-]{3,40}$/;
const INVITE_CODE_RE = /^\d{6}$/;
const DEFAULT_ALLOW_ORIGIN = '*'; // 不在白名单时用这个，测试可暂设为 '*'
const tableInitPromises = new WeakMap();

// ---- CORS 工具 ----
function makeCorsHeaders(origin) {
  const allowed = origin && ALLOW_ORIGINS.includes(origin) ? origin : DEFAULT_ALLOW_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CF-Account-ID, X-CF-API-Token, X-CF-KV-Namespace-ID, X-Image-Key',
    'Access-Control-Max-Age': '86400',
  };
}
function json(body, status = 200, origin = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...makeCorsHeaders(origin) },
  });
}
function text(body, status = 200, origin = null) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...makeCorsHeaders(origin) },
  });
}

async function parseJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch (e) {
    return null;
  }
}

function stringifyJsonArrayField(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  return null;
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

function normalizeInviteCode(inviteCode) {
  return typeof inviteCode === 'string' ? inviteCode.trim() : '';
}

function d1Changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function createUserId() {
  return `user_${crypto.randomUUID()}`;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex input');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function createRandomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

async function pbkdf2HashPassword(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(salt),
      iterations,
    },
    keyMaterial,
    256
  );
  return bytesToHex(bits);
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

async function verifyPassword(password, user) {
  if (!user || typeof password !== 'string') return false;
  if (!user.password_hash || !user.password_salt || !user.password_iterations) return false;
  const hash = await pbkdf2HashPassword(password, user.password_salt, Number(user.password_iterations));
  return constantTimeEqual(hash, user.password_hash);
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function getSessionUser(request, env) {
  const token = getBearerToken(request);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.user_id AS session_user_id,
      sessions.expires_at AS expires_at,
      sessions.revoked_at AS revoked_at,
      users.id AS user_id,
      users.username AS username,
      users.disabled AS disabled
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).bind(tokenHash).first();

  if (!row) return null;
  if (row.revoked_at !== null && row.revoked_at !== undefined) return null;
  if (Number(row.expires_at) <= Date.now()) return null;
  if (Number(row.disabled) === 1) return null;

  return {
    user: {
      id: row.user_id,
      username: row.username,
    },
    session: {
      id: row.session_id,
      expiresAt: Number(row.expires_at),
    },
    tokenHash,
  };
}

async function requireSessionUser(request, env, origin) {
  const sessionUser = await getSessionUser(request, env);
  if (!sessionUser) {
    return { response: json({ error: 'Unauthorized' }, 401, origin) };
  }
  return sessionUser;
}

async function requirePreparedSessionUser(request, env, origin) {
  if (!getBearerToken(request)) {
    return { response: json({ error: 'Unauthorized' }, 401, origin) };
  }
  await ensureTables(env);
  return requireSessionUser(request, env, origin);
}

async function createSessionForUser(userId, request, env) {
  const token = createSessionToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const sessionId = crypto.randomUUID();
  const userAgent = request.headers.get('User-Agent') || '';

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at, user_agent)
    VALUES (?, ?, ?, ?, ?, NULL, ?)
  `).bind(sessionId, userId, tokenHash, now, expiresAt, userAgent).run();

  return { token, expiresAt, sessionId };
}

function authUserPayload(user) {
  return {
    id: user.id,
    username: user.username,
  };
}

const AUTH_SYNC_TABLES = {
  ledgers: 'ledgers_v2',
  categories: 'categories_v2',
  groups: 'groups_v2',
  transactions: 'transactions_v2',
  settings: 'settings_v2',
  syncVersions: 'sync_versions',
  recordConflict: '(user_id, id)',
};

const STRUCTURED_SYNC_TABLES = [
  AUTH_SYNC_TABLES.ledgers,
  AUTH_SYNC_TABLES.categories,
  AUTH_SYNC_TABLES.groups,
  AUTH_SYNC_TABLES.transactions,
  AUTH_SYNC_TABLES.settings,
];

function normalizeImageKey(rawKey) {
  if (typeof rawKey !== 'string') return null;

  let key = rawKey.trim();
  try {
    key = decodeURIComponent(key);
  } catch (e) {
    return null;
  }

  key = key.replace(/^\/+/, '');
  if (!key || key.includes('..')) return null;
  return key;
}

function imageKeyFromPath(pathname, prefix) {
  return normalizeImageKey(pathname.slice(prefix.length));
}

function userImageObjectKey(userId, key) {
  return `users/${userId}/${key}`;
}

function clientUpdatedAt(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

// ---- 建表 SQL ----
const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by_user_id TEXT,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledgers_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT,
  theme_color TEXT,
  ledger_type TEXT DEFAULT 'accounting',
  created_at INTEGER,
  updated_at INTEGER,
  server_updated_at INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS categories_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ledger_id TEXT,
  name TEXT,
  icon TEXT,
  type TEXT,
  buy_fee_rate REAL DEFAULT 0,
  sell_fee_rate REAL DEFAULT 0,
  "order" INTEGER,
  is_custom INTEGER,
  updated_at INTEGER,
  server_updated_at INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS groups_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ledger_id TEXT,
  name TEXT,
  category_ids TEXT,
  "order" INTEGER,
  updated_at INTEGER,
  server_updated_at INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS transactions_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ledger_id TEXT,
  amount REAL,
  type TEXT,
  category_id TEXT,
  trade_action TEXT,
  trade_quantity REAL,
  trade_gross_amount REAL,
  trade_fee_rate REAL,
  trade_fee_amount REAL,
  trade_allocations TEXT,
  date INTEGER,
  note TEXT,
  attachments TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  server_updated_at INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS settings_v2 (
  user_id TEXT PRIMARY KEY,
  data TEXT,
  updated_at INTEGER,
  server_updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_versions (
  user_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledgers_v2_user_updated ON ledgers_v2(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_categories_v2_user_updated ON categories_v2(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_groups_v2_user ON groups_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_updated ON transactions_v2(user_id, updated_at);
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: makeCorsHeaders(origin) });
    }

    // 健康检查
    if (url.pathname === '/health') return text('ok', 200, origin);
    if (url.pathname === '/time' && request.method === 'GET') {
      return json({ serverTime: Date.now() }, 200, origin);
    }

    if (url.pathname === '/auth/register' && request.method === 'POST') {
      await ensureTables(env);
      return registerHandler(request, env, origin);
    }
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      await ensureTables(env);
      return loginHandler(request, env, origin);
    }
    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      await ensureTables(env);
      return logoutHandler(request, env, origin);
    }
    if (url.pathname === '/auth/me' && request.method === 'GET') {
      await ensureTables(env);
      return meHandler(request, env, origin);
    }

    // Normal cloud data routes trust only the authenticated session user.
    if (url.pathname === '/sync/version' && request.method === 'GET') {
      const sessionUser = await requirePreparedSessionUser(request, env, origin);
      if (sessionUser.response) return sessionUser.response;
      return versionHandler(sessionUser.user.id, env, origin, ctx);
    }
    if (url.pathname === '/sync/pull' && request.method === 'GET') {
      const sessionUser = await requirePreparedSessionUser(request, env, origin);
      if (sessionUser.response) return sessionUser.response;
      return pullHandler(url, sessionUser.user.id, env, origin, ctx, AUTH_SYNC_TABLES);
    }
    if (url.pathname === '/sync/push' && request.method === 'POST') {
      const sessionUser = await requirePreparedSessionUser(request, env, origin);
      if (sessionUser.response) return sessionUser.response;
      return pushHandler(request, sessionUser.user.id, env, origin, ctx, AUTH_SYNC_TABLES);
    }
    if (url.pathname === '/upload/image' && request.method === 'POST') {
      const sessionUser = await requirePreparedSessionUser(request, env, origin);
      if (sessionUser.response) return sessionUser.response;
      return uploadImageHandler(request, sessionUser.user.id, env, origin);
    }
    if (url.pathname.startsWith('/image/') && request.method === 'GET') {
      const sessionUser = await requirePreparedSessionUser(request, env, origin);
      if (sessionUser.response) return sessionUser.response;
      const key = imageKeyFromPath(url.pathname, '/image/');
      return getImageHandler(key, sessionUser.user.id, env, origin);
    }
    if (url.pathname.startsWith('/image/') && request.method === 'DELETE') {
      const sessionUser = await requirePreparedSessionUser(request, env, origin);
      if (sessionUser.response) return sessionUser.response;
      const key = imageKeyFromPath(url.pathname, '/image/');
      return deleteImageHandler(key, sessionUser.user.id, env, origin);
    }

    return text('Not found', 404, origin);
  }
};

// ---- 辅助：确保表存在 ----
async function ensureTables(env) {
    let promise = tableInitPromises.get(env.DB);
    if (!promise) {
      promise = initializeTables(env).catch(error => {
        tableInitPromises.delete(env.DB);
        throw error;
      });
      tableInitPromises.set(env.DB, promise);
    }
    return promise;
}

async function initializeTables(env) {
    const stmts = CREATE_SQL.split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of stmts) await env.DB.prepare(sql).run();
    await ensureStructuredCompatibilityColumns(env);
    await ensureServerUpdatedAtColumns(env);
    await ensureServerUpdatedAtIndexes(env);
}

async function tableHasColumn(env, tableName, columnName) {
  const info = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return (info.results || []).some(row => row.name === columnName);
}

async function ensureServerUpdatedAtColumns(env) {
  const now = Date.now();
  for (const tableName of STRUCTURED_SYNC_TABLES) {
    const hasColumn = await tableHasColumn(env, tableName, 'server_updated_at');
    if (!hasColumn) {
      await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN server_updated_at INTEGER NOT NULL DEFAULT 0`).run();
    }
    await env.DB.prepare(
      `UPDATE ${tableName} SET server_updated_at = ? WHERE server_updated_at IS NULL OR server_updated_at <= 0`
    ).bind(now).run();
  }
}

async function ensureStructuredCompatibilityColumns(env) {
  const columns = [
    { table: AUTH_SYNC_TABLES.ledgers, name: 'ledger_type', ddl: "TEXT DEFAULT 'accounting'" },
    { table: AUTH_SYNC_TABLES.categories, name: 'buy_fee_rate', ddl: 'REAL DEFAULT 0' },
    { table: AUTH_SYNC_TABLES.categories, name: 'sell_fee_rate', ddl: 'REAL DEFAULT 0' },
    { table: AUTH_SYNC_TABLES.transactions, name: 'trade_action', ddl: 'TEXT' },
    { table: AUTH_SYNC_TABLES.transactions, name: 'trade_quantity', ddl: 'REAL' },
    { table: AUTH_SYNC_TABLES.transactions, name: 'trade_gross_amount', ddl: 'REAL' },
    { table: AUTH_SYNC_TABLES.transactions, name: 'trade_fee_rate', ddl: 'REAL' },
    { table: AUTH_SYNC_TABLES.transactions, name: 'trade_fee_amount', ddl: 'REAL' },
    { table: AUTH_SYNC_TABLES.transactions, name: 'trade_allocations', ddl: 'TEXT' },
  ];

  for (const column of columns) {
    const hasColumn = await tableHasColumn(env, column.table, column.name);
    if (!hasColumn) {
      await env.DB.prepare(`ALTER TABLE ${column.table} ADD COLUMN ${column.name} ${column.ddl}`).run();
    }
  }

  await env.DB.prepare(
    `UPDATE ${AUTH_SYNC_TABLES.ledgers} SET ledger_type='accounting' WHERE ledger_type IS NULL OR ledger_type=''`
  ).run();
}

async function ensureServerUpdatedAtIndexes(env) {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_ledgers_v2_user_server_updated ON ${AUTH_SYNC_TABLES.ledgers}(user_id, server_updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_v2_user_server_updated ON ${AUTH_SYNC_TABLES.categories}(user_id, server_updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_groups_v2_user_server_updated ON ${AUTH_SYNC_TABLES.groups}(user_id, server_updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_server_updated ON ${AUTH_SYNC_TABLES.transactions}(user_id, server_updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_settings_v2_user_server_updated ON ${AUTH_SYNC_TABLES.settings}(user_id, server_updated_at)`,
  ];
  for (const sql of indexes) await env.DB.prepare(sql).run();
}

async function registerHandler(request, env, origin) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400, origin);

  const username = normalizeUsername(body.username);
  const password = body.password;
  const inviteCode = normalizeInviteCode(body.inviteCode);

  if (!INVITE_CODE_RE.test(inviteCode)) {
    return json({ error: 'Invalid invite code' }, 403, origin);
  }
  if (!USERNAME_RE.test(username)) {
    return json({ error: 'Username must be 3-40 characters and use only letters, numbers, underscore, hyphen, or dot' }, 400, origin);
  }
  if (typeof password !== 'string' || password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400, origin);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return json({ error: 'Username already exists' }, 409, origin);

  const now = Date.now();
  const user = {
    id: createUserId(),
    username,
  };
  const salt = createRandomHex(16);
  const passwordHash = await pbkdf2HashPassword(password, salt, PASSWORD_ITERATIONS);

  const claim = await env.DB.prepare(`
    UPDATE invite_codes
    SET used_at = ?, used_by_user_id = ?
    WHERE code = ? AND disabled = 0 AND used_at IS NULL
  `).bind(now, user.id, inviteCode).run();

  if (d1Changes(claim) !== 1) {
    return json({ error: 'Invalid invite code' }, 403, origin);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO users (id, username, password_hash, password_salt, password_iterations, created_at, updated_at, disabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).bind(user.id, username, passwordHash, salt, PASSWORD_ITERATIONS, now, now).run();
  } catch (e) {
    if (String(e?.message || e).toLowerCase().includes('unique')) {
      await releaseInviteCode(env, inviteCode, user.id);
      return json({ error: 'Username already exists' }, 409, origin);
    }
    await releaseInviteCode(env, inviteCode, user.id);
    return json({ error: 'Registration failed' }, 500, origin);
  }

  const session = await createSessionForUser(user.id, request, env);
  return json({
    user: authUserPayload(user),
    token: session.token,
    expiresAt: session.expiresAt,
  }, 201, origin);
}

async function releaseInviteCode(env, inviteCode, userId) {
  try {
    await env.DB.prepare(`
      UPDATE invite_codes
      SET used_at = NULL, used_by_user_id = NULL
      WHERE code = ? AND used_by_user_id = ?
    `).bind(inviteCode, userId).run();
  } catch (e) {
    console.error('Failed to release invite code after registration failure', e);
  }
}

async function loginHandler(request, env, origin) {
  const body = await parseJsonBody(request);
  if (!body) return json({ error: 'Invalid JSON body' }, 400, origin);

  const username = normalizeUsername(body.username);
  const password = body.password;
  if (!USERNAME_RE.test(username) || typeof password !== 'string') {
    return json({ error: 'Invalid username or password' }, 401, origin);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, password_hash, password_salt, password_iterations, disabled
    FROM users
    WHERE username = ?
  `).bind(username).first();

  if (!user || Number(user.disabled) === 1) {
    return json({ error: 'Invalid username or password' }, 401, origin);
  }

  const validPassword = await verifyPassword(password, user);
  if (!validPassword) {
    return json({ error: 'Invalid username or password' }, 401, origin);
  }

  const session = await createSessionForUser(user.id, request, env);
  return json({
    user: authUserPayload(user),
    token: session.token,
    expiresAt: session.expiresAt,
  }, 200, origin);
}

async function logoutHandler(request, env, origin) {
  const token = getBearerToken(request);
  if (!token) return json({ error: 'Unauthorized' }, 401, origin);

  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(`
    UPDATE sessions
    SET revoked_at = COALESCE(revoked_at, ?)
    WHERE token_hash = ?
  `).bind(Date.now(), tokenHash).run();

  return json({ ok: true }, 200, origin);
}

async function meHandler(request, env, origin) {
  const sessionUser = await requireSessionUser(request, env, origin);
  if (sessionUser.response) return sessionUser.response;

  return json({
    user: authUserPayload(sessionUser.user),
    expiresAt: sessionUser.session.expiresAt,
  }, 200, origin);
}

// ---- 辅助：分批执行，避免超过 D1 50 查询限制 ----
async function batchInsert(bindings, db) {
  // bindings: Array<Statement>
  const results = [];
  for (let i = 0; i < bindings.length; i += 40) {
    const slice = bindings.slice(i, i + 40);
    const batchResults = await db.batch(slice);
    results.push(...batchResults);
  }
  return results;
}

async function getMaxServerUpdatedAt(env, userId, tableName) {
  const row = await env.DB.prepare(
    `SELECT MAX(server_updated_at) AS version FROM ${tableName} WHERE user_id=?`
  ).bind(userId).first();
  return Number(row?.version || 0);
}

async function scanServerVersion(userId, env, tables) {
  const tableVersions = await Promise.all([
    getMaxServerUpdatedAt(env, userId, tables.ledgers),
    getMaxServerUpdatedAt(env, userId, tables.categories),
    getMaxServerUpdatedAt(env, userId, tables.groups),
    getMaxServerUpdatedAt(env, userId, tables.transactions),
    getMaxServerUpdatedAt(env, userId, tables.settings),
  ]);

  return Math.max(
    ...tableVersions.map(value => Number(value || 0))
  );
}

async function getServerVersion(userId, env, tables) {
  const [versionStr, versionRow] = await Promise.all([
    env.SYNC_KV.get(`version:${userId}`),
    env.DB.prepare(`SELECT version FROM ${tables.syncVersions} WHERE user_id=?`).bind(userId).first(),
  ]);
  const storedVersion = Math.max(Number(versionStr || 0), Number(versionRow?.version || 0));
  if (storedVersion > 0) return storedVersion;
  return scanServerVersion(userId, env, tables);
}

async function reserveSyncVersion(userId, env, tables) {
  const [currentVersion, reservedRow] = await Promise.all([
    getServerVersion(userId, env, tables),
    env.DB.prepare(`SELECT version FROM ${tables.syncVersions} WHERE user_id=?`).bind(userId).first(),
  ]);
  const reservedVersion = Number(reservedRow?.version || 0);
  const candidate = Math.max(Date.now(), currentVersion + 1, reservedVersion + 1);
  await env.DB.prepare(`
    INSERT INTO ${tables.syncVersions} (user_id, version)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      version = CASE
        WHEN ${tables.syncVersions}.version >= excluded.version THEN ${tables.syncVersions}.version + 1
        ELSE excluded.version
      END
  `).bind(userId, candidate).run();

  const row = await env.DB.prepare(`SELECT version FROM ${tables.syncVersions} WHERE user_id=?`).bind(userId).first();
  return Number(row?.version || candidate);
}

async function publishSyncVersion(userId, version, env, tables) {
  await env.DB.prepare(`
    INSERT INTO ${tables.syncVersions} (user_id, version)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET version = MAX(${tables.syncVersions}.version, excluded.version)
  `).bind(userId, version).run();
  await env.SYNC_KV.put(`version:${userId}`, String(version));
}

async function versionHandler(userId, env, origin, ctx) {
  const version = await getServerVersion(userId, env, AUTH_SYNC_TABLES);

  return json({ version }, 200, origin);
}

async function uploadImageHandler(request, userId, env, origin) {
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  const key = normalizeImageKey(request.headers.get('X-Image-Key') || crypto.randomUUID());
  if (!key) return json({ error: 'Invalid image key' }, 400, origin);

  try {
    await env.IMAGES_BUCKET.put(userImageObjectKey(userId, key), request.body, {
      httpMetadata: { contentType },
    });
    return json({ key }, 201, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}

function imageResponse(object, origin) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  const cors = makeCorsHeaders(origin);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  headers.set('Cache-Control', 'private, max-age=31536000');
  headers.set('Vary', 'Authorization');
  return new Response(object.body, { headers });
}

async function getImageHandler(key, userId, env, origin) {
  if (!key) return text('Missing or invalid key', 400, origin);

  try {
    const object = await env.IMAGES_BUCKET.get(userImageObjectKey(userId, key));
    if (!object) return text('Not found', 404, origin);
    return imageResponse(object, origin);
  } catch (e) {
    return text('Error fetching image', 500, origin);
  }
}

async function deleteImageHandler(key, userId, env, origin) {
  if (!key) return json({ error: 'Missing or invalid key' }, 400, origin);

  try {
    await env.IMAGES_BUCKET.delete(userImageObjectKey(userId, key));
    return json({ success: true }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}

// ---- 拉取 ----
async function pullHandler(url, userId, env, origin, ctx, tables) {
  const since = Number(url.searchParams.get('since') || 0);

  const version = await getServerVersion(userId, env, tables);

  const [ledgers, categories, groups, transactions, settings] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ${tables.ledgers} WHERE user_id=? AND server_updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM ${tables.categories} WHERE user_id=? AND server_updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM ${tables.groups} WHERE user_id=? AND server_updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM ${tables.transactions} WHERE user_id=? AND server_updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM ${tables.settings} WHERE user_id=? AND server_updated_at > ?`).bind(userId, since).first(),
  ]);

  const lRes = ledgers.results || [];
  const cRes = categories.results || [];
  const gRes = groups.results || [];
  const tRes = transactions.results || [];

  // 统计读取:

  return json(
    {
      version,
      ledgers: lRes,
      categories: cRes,
      groups: gRes,
      transactions: tRes,
      settings: settings || null,
    },
    200,
    origin
  );
}

// ---- 推送 ----
async function pushHandler(request, userId, env, origin, ctx, tables) {
  const payload = await parseJsonBody(request);
  if (!payload) return text('Bad payload', 400, origin);

  const now = Date.now();
  const accepted = [];
  const superseded = [];
  const potentialWrites =
    (Array.isArray(payload.ledgers) ? payload.ledgers.length : 0) +
    (Array.isArray(payload.categories) ? payload.categories.length : 0) +
    (Array.isArray(payload.groups) ? payload.groups.length : 0) +
    (Array.isArray(payload.transactions) ? payload.transactions.length : 0) +
    (payload.settings ? 1 : 0);
  const newVersion = potentialWrites > 0 ? await reserveSyncVersion(userId, env, tables) : 0;

  const recordBatchResults = async (entries, results, tableName) => {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (d1Changes(results[index]) > 0) {
        accepted.push({ ...entry, serverUpdatedAt: newVersion });
      } else {
        const existing = await env.DB.prepare(
          `SELECT updated_at, server_updated_at FROM ${tableName} WHERE user_id=? AND id=?`
        ).bind(userId, entry.id).first();
        superseded.push({
          ...entry,
          serverUpdatedAt: Number(existing?.server_updated_at || 0) || null,
          remoteUpdatedAt: Number(existing?.updated_at || 0) || null,
        });
      }
    }
  };

  // Ledgers
  if (Array.isArray(payload.ledgers) && payload.ledgers.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO ${tables.ledgers} (id,user_id,name,theme_color,ledger_type,created_at,updated_at,server_updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT${tables.recordConflict} DO UPDATE SET
         name=excluded.name, 
         theme_color=excluded.theme_color, 
         ledger_type=excluded.ledger_type,
         updated_at=excluded.updated_at, 
         server_updated_at=excluded.server_updated_at,
         is_deleted=excluded.is_deleted, 
         user_id=excluded.user_id
       WHERE excluded.updated_at > COALESCE(${tables.ledgers}.updated_at, 0)
          OR (excluded.updated_at = COALESCE(${tables.ledgers}.updated_at, 0)
              AND excluded.is_deleted = 1
              AND COALESCE(${tables.ledgers}.is_deleted, 0) = 0)`
    );
    const entries = [];
    const binds = payload.ledgers.map(l => {
      const isDel = l.isDeleted ?? l.is_deleted ?? false;
      const updatedAt = clientUpdatedAt(l.updatedAt ?? l.updated_at, now);
      const createdAt = Number(l.createdAt ?? l.created_at ?? now);
      entries.push({ entityType: 'ledger', id: l.id, updatedAt });
      return stmt.bind(
        l.id,
        userId,
        l.name || '',
        l.themeColor || l.theme_color || '#007AFF',
        l.ledgerType || l.ledger_type || 'accounting',
        createdAt,
        updatedAt,
        newVersion,
        isDel ? 1 : 0
      );
    });
    const results = await batchInsert(binds, env.DB);
    await recordBatchResults(entries, results, tables.ledgers);
  }

  // Categories
  if (Array.isArray(payload.categories) && payload.categories.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO ${tables.categories} (id,user_id,ledger_id,name,icon,type,buy_fee_rate,sell_fee_rate,"order",is_custom,updated_at,server_updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT${tables.recordConflict} DO UPDATE SET
         ledger_id=excluded.ledger_id, 
         name=excluded.name, 
         icon=excluded.icon, 
         type=excluded.type, 
         buy_fee_rate=excluded.buy_fee_rate,
         sell_fee_rate=excluded.sell_fee_rate,
         "order"=excluded."order", 
         is_custom=excluded.is_custom, 
         updated_at=excluded.updated_at, 
         server_updated_at=excluded.server_updated_at,
         is_deleted=excluded.is_deleted, 
         user_id=excluded.user_id
       WHERE excluded.updated_at > COALESCE(${tables.categories}.updated_at, 0)
          OR (excluded.updated_at = COALESCE(${tables.categories}.updated_at, 0)
              AND excluded.is_deleted = 1
              AND COALESCE(${tables.categories}.is_deleted, 0) = 0)`
    );
    const entries = [];
    const binds = payload.categories.map(c => {
      const isDel = c.isDeleted ?? c.is_deleted ?? false;
      const isCustom = c.isCustom ?? c.is_custom ?? false;
      const updatedAt = clientUpdatedAt(c.updatedAt ?? c.updated_at, now);
      entries.push({ entityType: 'category', id: c.id, updatedAt });
      return stmt.bind(
        c.id,
        userId,
        c.ledgerId || c.ledger_id || '',
        c.name || '',
        c.icon || 'Circle',
        c.type || 'expense',
        Number(c.buyFeeRate ?? c.buy_fee_rate ?? 0) || 0,
        Number(c.sellFeeRate ?? c.sell_fee_rate ?? 0) || 0,
        c.order ?? 0,
        isCustom ? 1 : 0,
        updatedAt,
        newVersion,
        isDel ? 1 : 0
      );
    });
    const results = await batchInsert(binds, env.DB);
    await recordBatchResults(entries, results, tables.categories);
  }

  // Groups
  if (Array.isArray(payload.groups) && payload.groups.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO ${tables.groups} (id,user_id,ledger_id,name,category_ids,"order",updated_at,server_updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT${tables.recordConflict} DO UPDATE SET
         ledger_id=excluded.ledger_id,
         name=excluded.name,
         category_ids=excluded.category_ids,
         "order"=excluded."order",
         updated_at=excluded.updated_at,
         server_updated_at=excluded.server_updated_at,
         is_deleted=excluded.is_deleted,
         user_id=excluded.user_id
       WHERE excluded.updated_at > COALESCE(${tables.groups}.updated_at, 0)
          OR (excluded.updated_at = COALESCE(${tables.groups}.updated_at, 0)
              AND excluded.is_deleted = 1
              AND COALESCE(${tables.groups}.is_deleted, 0) = 0)`
    );
    const entries = [];
    const binds = payload.groups.map(g => {
      const isDel = g.isDeleted ?? g.is_deleted ?? false;
      const updatedAt = clientUpdatedAt(g.updatedAt ?? g.updated_at, now);
      entries.push({ entityType: 'categoryGroup', id: g.id, updatedAt });
      let cats = [];
      if (Array.isArray(g.categoryIds)) cats = g.categoryIds;
      else if (Array.isArray(g.category_ids)) cats = g.category_ids;
      else if (typeof g.categoryIds === 'string') {
        try { cats = JSON.parse(g.categoryIds); } catch {}
      } else if (typeof g.category_ids === 'string') {
        try { cats = JSON.parse(g.category_ids); } catch {}
      }
      return stmt.bind(
        g.id,
        userId,
        g.ledgerId || g.ledger_id || '',
        g.name || '',
        JSON.stringify(cats),
        g.order ?? 0,
        updatedAt,
        newVersion,
        isDel ? 1 : 0
      );
    });
    const results = await batchInsert(binds, env.DB);
    await recordBatchResults(entries, results, tables.groups);
  }

  // Transactions
  if (Array.isArray(payload.transactions) && payload.transactions.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO ${tables.transactions} (id,user_id,ledger_id,amount,type,category_id,trade_action,trade_quantity,trade_gross_amount,trade_fee_rate,trade_fee_amount,trade_allocations,date,note,attachments,created_at,updated_at,server_updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT${tables.recordConflict} DO UPDATE SET
         ledger_id=excluded.ledger_id, 
         amount=excluded.amount, 
         type=excluded.type, 
         category_id=excluded.category_id, 
         trade_action=excluded.trade_action,
         trade_quantity=excluded.trade_quantity,
         trade_gross_amount=excluded.trade_gross_amount,
         trade_fee_rate=excluded.trade_fee_rate,
         trade_fee_amount=excluded.trade_fee_amount,
         trade_allocations=excluded.trade_allocations,
         date=excluded.date, 
         note=excluded.note, 
         attachments=excluded.attachments,
         created_at=excluded.created_at, 
         updated_at=excluded.updated_at, 
         server_updated_at=excluded.server_updated_at,
         is_deleted=excluded.is_deleted, 
         user_id=excluded.user_id
       WHERE excluded.updated_at > COALESCE(${tables.transactions}.updated_at, 0)
          OR (excluded.updated_at = COALESCE(${tables.transactions}.updated_at, 0)
              AND excluded.is_deleted = 1
              AND COALESCE(${tables.transactions}.is_deleted, 0) = 0)`
    );
    const entries = [];
    const binds = payload.transactions.map(t => {
      const isDel = t.isDeleted ?? t.is_deleted ?? false;
      const updatedAt = clientUpdatedAt(t.updatedAt ?? t.updated_at, now);
      const createdAt = Number(t.createdAt ?? t.created_at ?? t.date ?? now);
      entries.push({ entityType: 'transaction', id: t.id, updatedAt });
      return stmt.bind(
        t.id,
        userId,
        t.ledgerId || t.ledger_id || '',
        Number(t.amount || 0),
        t.type || 'expense',
        t.categoryId || t.category_id || '',
        t.tradeAction || t.trade_action || null,
        t.tradeQuantity ?? t.trade_quantity ?? null,
        t.tradeGrossAmount ?? t.trade_gross_amount ?? null,
        t.tradeFeeRate ?? t.trade_fee_rate ?? null,
        t.tradeFeeAmount ?? t.trade_fee_amount ?? null,
        stringifyJsonArrayField(t.tradeAllocations ?? t.trade_allocations),
        t.date || now,
        t.note || '',
        JSON.stringify(t.attachments || []),
        createdAt,
        updatedAt,
        newVersion,
        isDel ? 1 : 0
      );
    });
    const results = await batchInsert(binds, env.DB);
    await recordBatchResults(entries, results, tables.transactions);
  }

  // Settings
  if (payload.settings) {
    const dataStr = typeof payload.settings.data === 'string' ? payload.settings.data : JSON.stringify(payload.settings.data || {});
    const updatedAt = clientUpdatedAt(payload.settings.updatedAt ?? payload.settings.updated_at, now);
    const result = await env.DB.prepare(
      `INSERT INTO ${tables.settings} (user_id,data,updated_at,server_updated_at) VALUES (?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         data=excluded.data,
         updated_at=excluded.updated_at,
         server_updated_at=excluded.server_updated_at
       WHERE excluded.updated_at > COALESCE(${tables.settings}.updated_at, 0)`
    ).bind(userId, dataStr, updatedAt, newVersion).run();
    const entry = { entityType: 'settings', id: 'main', updatedAt };
    if (d1Changes(result) > 0) {
      accepted.push({ ...entry, serverUpdatedAt: newVersion });
    } else {
      const existing = await env.DB.prepare(
        `SELECT updated_at, server_updated_at FROM ${tables.settings} WHERE user_id=?`
      ).bind(userId).first();
      superseded.push({
        ...entry,
        serverUpdatedAt: Number(existing?.server_updated_at || 0) || null,
        remoteUpdatedAt: Number(existing?.updated_at || 0) || null,
      });
    }
  }

  if (accepted.length > 0) {
    await publishSyncVersion(userId, newVersion, env, tables);
  }

  const version = accepted.length > 0 ? newVersion : await getServerVersion(userId, env, tables);

  // 统计写入: 
  
  // 异步更新统计，不阻塞主流程

  return json({ ok: true, success: true, version, accepted, superseded, results: { accepted, superseded } }, 200, origin);
}
