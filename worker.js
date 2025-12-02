// 允许的前端域名（本地调试可加 http://localhost:3000）
const ALLOW_ORIGINS = [
  '*',
];
const DEFAULT_ALLOW_ORIGIN = '*'; // 不在白名单时用这个，测试可暂设为 '*'

// ---- CORS 工具 ----
function makeCorsHeaders(origin) {
  const allowed = origin && ALLOW_ORIGINS.includes(origin) ? origin : DEFAULT_ALLOW_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CF-Account-ID, X-CF-API-Token, X-CF-KV-Namespace-ID',
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
CREATE TABLE IF NOT EXISTS usage_stats (
  id INTEGER PRIMARY KEY,
  d1_rows_read INTEGER DEFAULT 0,
  d1_rows_written INTEGER DEFAULT 0,
  kv_read_ops INTEGER DEFAULT 0,
  kv_write_ops INTEGER DEFAULT 0,
  updated_at INTEGER
);
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

    // 鉴权（Bearer AUTH_TOKEN）
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== env.AUTH_TOKEN) {
      return text('Unauthorized', 401, origin);
    }

    // 路由分发
    if (url.pathname === '/sync/pull' && request.method === 'GET') {
      // 仅在真正同步时检查表结构，减少 D1 读写
      await ensureTables(env);
      return pullHandler(url, env, origin, ctx);
    }
    if (url.pathname === '/sync/push' && request.method === 'POST') {
      await ensureTables(env);
      return pushHandler(request, url, env, origin, ctx);
    }
    
    // 版本探测：只返回当前 version，便于前端轻量检测
    if (url.pathname === '/sync/version' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id') || 'default';
      const versionStr = await env.SYNC_KV.get(`version:${userId}`);
      const version = versionStr ? Number(versionStr) : Date.now();
      
      // 统计 KV 读取 (1次)
      ctx.waitUntil(updateStats(env, 0, 0, 1, 0));
      
      return json({ version }, 200, origin);
    }

    // Usage stats
    if (url.pathname === '/usage' && request.method === 'GET') {
      // Check for Cloudflare API headers
      const cfAccount = request.headers.get('X-CF-Account-ID');
      const cfToken = request.headers.get('X-CF-API-Token');
      const cfKvId = request.headers.get('X-CF-KV-Namespace-ID');

      // Get D1 storage usage (approximate) - Always fetch locally for accuracy
      let dbSize = 0;
      try {
         const sizeRes = await env.DB.prepare('PRAGMA page_count;').first();
         dbSize = (sizeRes?.page_count || 0) * 4096; // 4KB pages
      } catch (e) {}

      if (cfAccount && cfToken) {
        return fetchCloudflareStats(cfAccount, cfToken, cfKvId, origin, dbSize);
      }

      // Local stats logic
      // 确保 usage_stats 表存在 (读取时检查一次即可)
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS usage_stats (
          id INTEGER PRIMARY KEY,
          d1_rows_read INTEGER DEFAULT 0,
          d1_rows_written INTEGER DEFAULT 0,
          kv_read_ops INTEGER DEFAULT 0,
          kv_write_ops INTEGER DEFAULT 0,
          updated_at INTEGER
        );
      `).run();

      const stats = await env.DB.prepare('SELECT * FROM usage_stats WHERE id=1').first();
      
      return json({ 
        ...stats, 
        d1_storage_bytes: dbSize,
        kv_storage_bytes: 0,
        note: "数据来源：本地软件统计 (UTC)"
      }, 200, origin);
    }

    return text('Not found', 404, origin);
  },
};

// ---- 辅助：确保表存在 ----
async function ensureTables(env) {
    const stmts = CREATE_SQL.split(';').map(s => s.trim()).filter(Boolean);
    // 简单优化：并发执行，虽然 D1 内部可能是串行，但减少 await 往返
    // 注意：usage_stats 表也包含在 CREATE_SQL 中
    for (const sql of stmts) await env.DB.prepare(sql).run();
}

// ---- 辅助：分批执行，避免超过 D1 50 查询限制 ----
async function batchInsert(bindings, db) {
  // bindings: Array<Statement>
  for (let i = 0; i < bindings.length; i += 40) {
    const slice = bindings.slice(i, i + 40);
    await db.batch(slice);
  }
}

// ---- 拉取 ----
async function pullHandler(url, env, origin, ctx) {
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

  const lRes = ledgers.results || [];
  const cRes = categories.results || [];
  const gRes = groups.results || [];
  const tRes = transactions.results || [];

  // 统计读取:
  // D1 Read: sum of rows returned + 1 (settings)
  // KV Read: 1 (version)
  const d1Reads = lRes.length + cRes.length + gRes.length + tRes.length + (settings ? 1 : 0);
  ctx.waitUntil(updateStats(env, d1Reads, 0, 1, 0));

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
async function pushHandler(request, url, env, origin, ctx) {
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

  // 统计写入: 
  // D1 Write: ledgers + categories + groups + transactions + settings(1)
  // KV Write: 1 (version)
  const d1Writes = (payload.ledgers?.length || 0) + 
                   (payload.categories?.length || 0) + 
                   (payload.groups?.length || 0) + 
                   (payload.transactions?.length || 0) + 
                   (payload.settings ? 1 : 0);
  
  // 异步更新统计，不阻塞主流程
  ctx.waitUntil(updateStats(env, 0, d1Writes, 0, 1));

  return json({ ok: true, version: newVersion }, 200, origin);
}

// ---- 统计工具 ----
async function updateStats(env, d1Read, d1Write, kvRead, kvWrite) {
  try {
    const now = Date.now();
    // 获取当前 UTC 日期字符串 (YYYY-MM-DD)
    const today = new Date(now).toISOString().split('T')[0];

    // 先读取现有统计
    const current = await env.DB.prepare('SELECT * FROM usage_stats WHERE id=1').first();
    
    let shouldReset = false;
    if (current && current.updated_at) {
      const lastDate = new Date(current.updated_at).toISOString().split('T')[0];
      if (lastDate !== today) {
        shouldReset = true;
      }
    }

    if (shouldReset) {
      // 跨天重置：覆盖旧数据
      await env.DB.prepare(`
        INSERT INTO usage_stats (id, d1_rows_read, d1_rows_written, kv_read_ops, kv_write_ops, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          d1_rows_read = excluded.d1_rows_read,
          d1_rows_written = excluded.d1_rows_written,
          kv_read_ops = excluded.kv_read_ops,
          kv_write_ops = excluded.kv_write_ops,
          updated_at = excluded.updated_at
      `).bind(d1Read, d1Write, kvRead, kvWrite, now).run();
    } else {
      // 当天累加
      await env.DB.prepare(`
        INSERT INTO usage_stats (id, d1_rows_read, d1_rows_written, kv_read_ops, kv_write_ops, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          d1_rows_read = d1_rows_read + excluded.d1_rows_read,
          d1_rows_written = d1_rows_written + excluded.d1_rows_written,
          kv_read_ops = kv_read_ops + excluded.kv_read_ops,
          kv_write_ops = kv_write_ops + excluded.kv_write_ops,
          updated_at = excluded.updated_at
      `).bind(d1Read, d1Write, kvRead, kvWrite, now).run();
    }
  } catch (e) {
    console.error('Failed to update stats', e);
  }
}

// ---- Cloudflare API Proxy ----
async function fetchCloudflareStats(accountId, token, kvId, origin, localD1Size) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      query {
        viewer {
          accounts(filter: {accountTag: "${accountId}"}) {
            d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: "${today}"}) {
              sum {
                rowsRead
                rowsWritten
              }
            }
            d1QueriesAdaptiveGroups(limit: 1, filter: {date_geq: "${today}"}) {
              count
            }
            d1StorageAdaptiveGroups(limit: 1, filter: {date_geq: "${today}"}) {
              max {
                databaseSizeBytes
              }
            }
            ${kvId ? `
            kvOperationsAdaptiveGroups(limit: 1000, filter: {namespaceId: "${kvId}", date_geq: "${today}"}) {
              sum {
                requests
              }
              dimensions {
                actionType
              }
            }
            kvStorageAdaptiveGroups(limit: 1, filter: {namespaceId: "${kvId}", date_geq: "${today}"}) {
              max {
                byteCount
              }
            }
            ` : ''}
          }
        }
      }
    `;

    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return json({ error: 'Failed to fetch from Cloudflare API' }, 500, origin);
    }

    const data = await res.json();
    const accountData = data?.data?.viewer?.accounts?.[0];
    
    if (!accountData) {
      return json({ error: 'No account data found' }, 404, origin);
    }

    // Parse D1
    const d1Sum = accountData.d1AnalyticsAdaptiveGroups?.[0]?.sum || {};
    const d1Read = d1Sum.rowsRead || 0;
    const d1Write = d1Sum.rowsWritten || 0;
    
    const d1Queries = accountData.d1QueriesAdaptiveGroups?.[0]?.count || 0;

    // Parse D1 Storage (Use API value if available, otherwise fallback to local)
    let d1Storage = localD1Size;
    if (accountData.d1StorageAdaptiveGroups?.[0]) {
        d1Storage = accountData.d1StorageAdaptiveGroups[0].max?.databaseSizeBytes || localD1Size;
    }

    // Parse KV
    let kvRead = 0;
    let kvWrite = 0;
    let kvStorage = 0;

    if (accountData.kvOperationsAdaptiveGroups) {
      for (const g of accountData.kvOperationsAdaptiveGroups) {
        const type = (g.dimensions?.actionType || '').toLowerCase();
        const count = g.sum?.requests || 0;
        // KV Free Tier: Read (100k), Write/Delete/List (1k)
        // Group 'read'/'get' as Read. Group 'write'/'put'/'delete'/'list' as Write.
        if (['read', 'get'].includes(type)) kvRead += count;
        else kvWrite += count;
      }
    }

    if (accountData.kvStorageAdaptiveGroups?.[0]) {
      kvStorage = accountData.kvStorageAdaptiveGroups[0].max?.byteCount || 0;
    }

    return json({
      id: 0,
      d1_rows_read: d1Read,
      d1_rows_written: d1Write,
      d1_queries: d1Queries,
      kv_read_ops: kvRead,
      kv_write_ops: kvWrite,
      updated_at: Date.now(),
      d1_storage_bytes: d1Storage,
      kv_storage_bytes: kvStorage,
      note: "数据来源：Cloudflare 官方 API"
    }, 200, origin);

  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
