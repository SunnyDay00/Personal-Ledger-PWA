// 允许的前端域名（本地调试可加 http://localhost:3000）
const ALLOW_ORIGINS = [
  'https://money.hellogggboy.com.kg',
  'http://localhost:3000',
];
const DEFAULT_ALLOW_ORIGIN = 'https://money.hellogggboy.com.kg'; // 不在白名单时用这个，测试可暂设为 '*'

// ---- CORS 工具 ----
function makeCorsHeaders(origin) {
  const allowed = origin && ALLOW_ORIGINS.includes(origin) ? origin : DEFAULT_ALLOW_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

// ---- 建表 SQL ----
const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS ledgers (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  theme_color TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  is_deleted INTEGER
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ledger_id TEXT,
  name TEXT,
  icon TEXT,
  type TEXT,
  "order" INTEGER,
  is_custom INTEGER,
  updated_at INTEGER,
  is_deleted INTEGER
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ledger_id TEXT,
  name TEXT,
  category_ids TEXT,
  "order" INTEGER,
  updated_at INTEGER,
  is_deleted INTEGER
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ledger_id TEXT,
  amount REAL,
  type TEXT,
  category_id TEXT,
  date INTEGER,
  note TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  is_deleted INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY,
  data TEXT,
  updated_at INTEGER
);
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: makeCorsHeaders(origin) });
    }

    // 健康检查
    if (url.pathname === '/health') return text('ok', 200, origin);

    // 鉴权（Bearer AUTH_TOKEN）
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== env.AUTH_TOKEN) {
      return text('Unauthorized', 401, origin);
    }

    // 确保表存在
    const stmts = CREATE_SQL.split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of stmts) await env.DB.prepare(sql).run();

    if (url.pathname === '/sync/pull' && request.method === 'GET') {
      return pullHandler(url, env, origin);
    }
    if (url.pathname === '/sync/push' && request.method === 'POST') {
      return pushHandler(request, url, env, origin);
    }
    // 版本探测：只返回当前 version，便于前端轻量检测
    if (url.pathname === '/sync/version' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id') || 'default';
      const versionStr = await env.SYNC_KV.get(`version:${userId}`);
      const version = versionStr ? Number(versionStr) : Date.now();
      return json({ version }, 200, origin);
    }

    return text('Not found', 404, origin);
  },
};

// ---- 辅助：分批执行，避免超过 D1 50 查询限制 ----
async function batchInsert(bindings, db) {
  // bindings: Array<Statement>
  for (let i = 0; i < bindings.length; i += 40) {
    const slice = bindings.slice(i, i + 40);
    await db.batch(slice);
  }
}

// ---- 拉取 ----
async function pullHandler(url, env, origin) {
  const userId = url.searchParams.get('user_id') || 'default';
  const since = Number(url.searchParams.get('since') || 0);

  const versionStr = await env.SYNC_KV.get(`version:${userId}`);
  const version = versionStr ? Number(versionStr) : Date.now();

  // groups 使用全量返回，避免版本不一致导致分组缺失（如需增量可再改回 > since）
  const [ledgers, categories, groups, transactions, settings] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ledgers WHERE user_id=? AND updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM categories WHERE user_id=? AND updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM groups WHERE user_id=?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM transactions WHERE user_id=? AND updated_at > ?`).bind(userId, since).all(),
    env.DB.prepare(`SELECT * FROM settings WHERE user_id=?`).bind(userId).first(),
  ]);

  return json(
    {
      version,
      ledgers: ledgers.results || [],
      categories: categories.results || [],
      groups: groups.results || [],
      transactions: transactions.results || [],
      settings: settings || null,
    },
    200,
    origin
  );
}

// ---- 推送 ----
async function pushHandler(request, url, env, origin) {
  const userId = url.searchParams.get('user_id') || 'default';
  const payload = await request.json();
  if (!payload || typeof payload !== 'object') return text('Bad payload', 400, origin);

  const now = Date.now();

  // Ledgers
  if (Array.isArray(payload.ledgers) && payload.ledgers.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO ledgers (id,user_id,name,theme_color,created_at,updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET 
         name=excluded.name, 
         theme_color=excluded.theme_color, 
         updated_at=excluded.updated_at, 
         is_deleted=excluded.is_deleted, 
         user_id=excluded.user_id
       WHERE excluded.updated_at >= ledgers.updated_at`
    );
    const binds = payload.ledgers.map(l => {
      const isDel = l.isDeleted ?? l.is_deleted ?? false;
      const updatedAt = Math.max(Number(l.updatedAt ?? l.updated_at ?? 0), now);
      const createdAt = Number(l.createdAt ?? l.created_at ?? now);
      return stmt.bind(
        l.id,
        userId,
        l.name || '',
        l.themeColor || l.theme_color || '#007AFF',
        createdAt,
        updatedAt,
        isDel ? 1 : 0
      );
    });
    await batchInsert(binds, env.DB);
  }

  // Categories
  if (Array.isArray(payload.categories) && payload.categories.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO categories (id,user_id,ledger_id,name,icon,type,"order",is_custom,updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET 
         ledger_id=excluded.ledger_id, 
         name=excluded.name, 
         icon=excluded.icon, 
         type=excluded.type, 
         "order"=excluded."order", 
         is_custom=excluded.is_custom, 
         updated_at=excluded.updated_at, 
         is_deleted=excluded.is_deleted, 
         user_id=excluded.user_id
       WHERE excluded.updated_at >= categories.updated_at`
    );
    const binds = payload.categories.map(c => {
      const isDel = c.isDeleted ?? c.is_deleted ?? false;
      const isCustom = c.isCustom ?? c.is_custom ?? false;
      const updatedAt = Math.max(Number(c.updatedAt ?? c.updated_at ?? 0), now);
      return stmt.bind(
        c.id,
        userId,
        c.ledgerId || c.ledger_id || '',
        c.name || '',
        c.icon || 'Circle',
        c.type || 'expense',
        c.order ?? 0,
        isCustom ? 1 : 0,
        updatedAt,
        isDel ? 1 : 0
      );
    });
    await batchInsert(binds, env.DB);
  }

  // Groups
  if (Array.isArray(payload.groups) && payload.groups.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO groups (id,user_id,ledger_id,name,category_ids,"order",updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET 
         ledger_id=excluded.ledger_id,
         name=excluded.name,
         category_ids=excluded.category_ids,
         "order"=excluded."order",
         updated_at=excluded.updated_at,
         is_deleted=excluded.is_deleted,
         user_id=excluded.user_id
       WHERE excluded.updated_at >= groups.updated_at`
    );
    const binds = payload.groups.map(g => {
      const isDel = g.isDeleted ?? g.is_deleted ?? false;
      const updatedAt = Math.max(Number(g.updatedAt ?? g.updated_at ?? 0), now);
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
        isDel ? 1 : 0
      );
    });
    await batchInsert(binds, env.DB);
  }

  // Transactions
  if (Array.isArray(payload.transactions) && payload.transactions.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO transactions (id,user_id,ledger_id,amount,type,category_id,date,note,created_at,updated_at,is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET 
         ledger_id=excluded.ledger_id, 
         amount=excluded.amount, 
         type=excluded.type, 
         category_id=excluded.category_id, 
         date=excluded.date, 
         note=excluded.note, 
         created_at=excluded.created_at, 
         updated_at=excluded.updated_at, 
         is_deleted=excluded.is_deleted, 
         user_id=excluded.user_id
       WHERE excluded.updated_at >= transactions.updated_at`
    );
    const binds = payload.transactions.map(t => {
      const isDel = t.isDeleted ?? t.is_deleted ?? false;
      const updatedAt = Math.max(Number(t.updatedAt ?? t.updated_at ?? 0), now);
      const createdAt = Number(t.createdAt ?? t.created_at ?? t.date ?? now);
      return stmt.bind(
        t.id,
        userId,
        t.ledgerId || t.ledger_id || '',
        Number(t.amount || 0),
        t.type || 'expense',
        t.categoryId || t.category_id || '',
        t.date || now,
        t.note || '',
        createdAt,
        updatedAt,
        isDel ? 1 : 0
      );
    });
    await batchInsert(binds, env.DB);
  }

  // Settings
  if (payload.settings) {
    const dataStr = typeof payload.settings.data === 'string' ? payload.settings.data : JSON.stringify(payload.settings.data || {});
    const updatedAt = payload.settings.updated_at || now;
    await env.DB.prepare(
      `INSERT INTO settings (user_id,data,updated_at) VALUES (?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`
    ).bind(userId, dataStr, updatedAt).run();
  }

  const newVersion = Date.now();
  await env.SYNC_KV.put(`version:${userId}`, String(newVersion));

  return json({ ok: true, version: newVersion }, 200, origin);
}
