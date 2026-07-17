# Personal Ledger PWA

Personal Ledger PWA is a privacy-friendly, local-first, self-hostable personal bookkeeping PWA.

It is an early-stage public repository under active maintenance. The app can run as a browser/PWA-first ledger, and the repository also includes Capacitor projects for Android and iOS packaging.

中文简介：Personal Ledger PWA 是一个隐私友好、本地优先、可自托管的个人记账 PWA，支持离线使用、多账本、图片附件、WebDAV 备份，以及可选的 Cloudflare 同步后端。

Online demo / 在线体验：<https://personal-ledger-pwa.pages.dev/>

## Highlights

- Local-first personal finance records stored primarily in IndexedDB.
- Installable PWA with offline-capable static assets through `vite-plugin-pwa` and Workbox.
- Multiple ledgers, income/expense records, trading-style ledgers, categories, groups, budgets, search, batch operations, and statistics.
- Ledger display currency can be changed per ledger. Existing data defaults to CNY, and displayed totals are converted from the CNY base amount.
- Image attachments with local caching and optional remote object storage.
- WebDAV backup for file-based backup and restore flows.
- Optional Cloudflare Worker sync backend using D1, KV, and R2, based on the implementation in `cloudflareworker/`.
- React + TypeScript + Vite frontend, confirmed by `package.json`.
- Capacitor-based Android and iOS project scaffolding for native packaging.

## Why This Project Fits Codex Security

Personal Ledger PWA handles personal finance data and several sensitive data flows. It is a practical target for security review because the code touches:

- Personal finance records, categories, ledgers, budgets, notes, and exports.
- IndexedDB and limited local storage state.
- WebDAV URLs, usernames, and passwords entered by users at runtime.
- Cloudflare Worker authentication and sync APIs.
- D1, KV, and R2 storage for optional account sync and image attachments.
- Image upload, caching, retrieval, and deletion behavior.
- PWA and service worker caching behavior.

The goal of a Codex Security review would be to improve data protection, authentication boundaries, storage safety, backup safety, and deployment guidance without overstating the project's maturity.

## Current Features

- Local ledger creation and management.
- Accounting ledgers for income and expense records.
- Trading-style ledgers for buy/sell records, inventory-like quantity tracking, fees, realized profit, and card-key style items.
- Trading categories can set separate buy and sell currencies. New foreign-currency buy/sell records keep the original currency amount plus an exchange-rate snapshot while storing CNY as the base amount for inventory, cost, and profit math.
- Category and category group management per ledger.
- Daily, weekly, monthly, and yearly statistics with charts.
- Read-only DeepSeek AI assistant for natural-language transaction lookup, deterministic aggregation, category/group analysis, and trading-ledger summaries.
- Budget display, progress tracking, and budget target inputs follow the current ledger display currency while keeping CNY as the stored base.
- Search, filtering, batch edit, batch delete, and undo delete flows.
- JSON and CSV import/export.
- Operation logs and backup logs.
- Image attachments for records.
- Manual and scheduled WebDAV backup.
- Optional account-based Cloudflare sync.
- PWA installation and offline static asset caching.
- Capacitor integration for keyboard handling, haptics, file export, system sharing, deep links, and iOS home screen quick actions.

## Tech Stack

### Frontend

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- Recharts
- Lucide React

### Local Data And Offline Layer

- Dexie
- IndexedDB
- `vite-plugin-pwa`
- Workbox

### Mobile Packaging

- Capacitor
- Android native project
- iOS native project

### Optional Sync And Backup

- WebDAV
- Cloudflare Worker
- Cloudflare D1
- Cloudflare KV
- Cloudflare R2

## Repository Structure

```text
.
├─ components/          React UI views and interaction components
├─ contexts/            App state and workflow orchestration
├─ services/            IndexedDB, sync, WebDAV, image, and helper services
├─ android/             Capacitor Android project
├─ ios/                 Capacitor iOS project
├─ cloudflareworker/    Optional Cloudflare Worker backend and Wrangler config
├─ docs/                Project notes and migration planning docs
├─ capacitor.config.ts  Capacitor configuration
├─ vite.config.ts       Vite and PWA configuration
└─ README.md
```

## Architecture Notes

The core app is local-first. Ledger operations are written to IndexedDB before the UI reports success, so records remain available while offline.

The local IndexedDB database stores ledgers, categories, category groups, transactions, settings, operation logs, backup logs, cached images, pending image uploads, a sync queue, and AI conversation tables. The DeepSeek API key is part of the main application settings, with the dedicated `aiConfig` table retained as a compatibility mirror for earlier AI builds. Ledger display currency, trading category buy/sell currencies, transaction original-currency amounts, and exchange-rate snapshots are stored with the related records. Older local storage and earlier IndexedDB database names are migrated when supported by the current code, and missing currency fields default to CNY.

When optional Cloudflare sync is enabled, local changes are queued and later pushed to the Worker. If the network is unavailable, a session expires, or sync fails, local data is kept and the queue is retried later.

Exchange-rate lookup uses the public ExchangeRate-API Open Access endpoint through the Cloudflare Worker. The Worker exposes a CNY-base proxy, caches the provider response in `SYNC_KV` until the provider's next update time, and the frontend stores a local cache. Foreign-currency trading records require a fresh rate when they are created or edited; previously saved records keep their original snapshot and do not change when future rates update.

Image attachments are saved locally first. When cloud sync is configured, pending images can be uploaded to R2, while transactions keep attachment keys instead of embedding binary image data.

WebDAV backup is file-based backup, not real-time row-level sync. It stores ledger/settings data and transaction exports and uses retry behavior in the WebDAV service. Because the DeepSeek API key is part of the main settings, it is included in WebDAV `settings.json`; AI conversations and messages are not.

The AI assistant never connects DeepSeek directly to IndexedDB and never sends the full database to a model. DeepSeek selects from fixed read-only tool schemas, the frontend validates the call and calculates the requested filters or aggregates locally, and only the user question plus the necessary metadata/result rows are sent back to DeepSeek. No AI tool can call transaction mutation, import, backup, or sync workflows.

## Local Development

### Requirements

- Node.js 20 or newer
- npm

### Install Dependencies

Because this repository has a `package-lock.json`, CI-style installs should use:

```bash
npm ci
```

For day-to-day local development, `npm install` also works:

```bash
npm install
```

### Start The Dev Server

```bash
npm run dev
```

The Vite dev server is configured for:

```text
http://localhost:3000
```

### Build

```bash
npm run build
```

Production assets are written to:

```text
dist/
```

### Test

```bash
npm test
```

The AI analytics, synchronized API-key storage boundary, DeepSeek stream parser, and conversation context window have automated Vitest coverage.

### Preview A Production Build

```bash
npm run preview
```

## Deployment

### Static PWA Deployment

If you only need the local-first web app or PWA, build the frontend and deploy `dist/` to a static hosting platform.

```bash
npm ci
npm run build
```

The current Vite config uses `base: './'`, which is friendly to static hosting paths. Suitable hosts include Cloudflare Pages, GitHub Pages, Nginx, or other static file hosting. Configure HTTPS for PWA installation and service worker behavior.

The public Cloudflare Pages demo is available at:

```text
https://personal-ledger-pwa.pages.dev/
```

To publish the current build to Cloudflare Pages by direct upload:

```bash
npm run build
npx wrangler pages deploy dist --project-name personal-ledger-pwa --branch main
```

The hosted demo supports the local-first browser/PWA workflow by default. Account sync still uses the fixed Worker endpoint configured in `constants.ts`, so registration and login require a valid account or invite code for that backend.

### Optional Cloudflare Sync Backend

The optional sync backend lives in:

```text
cloudflareworker/worker.js
```

The Wrangler config is:

```text
cloudflareworker/wrangler.toml
```

The configured Worker name is:

```text
personal-ledger-sync
```

The Worker expects these bindings:

- `DB`: Cloudflare D1 database
- `SYNC_KV`: Cloudflare KV namespace
- `IMAGES_BUCKET`: Cloudflare R2 bucket

The current Worker exposes account/session routes, sync routes, image routes, and a lightweight time endpoint:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /sync/version`
- `GET /sync/pull`
- `POST /sync/push`
- `POST /upload/image`
- `GET /image/:key`
- `DELETE /image/:key`
- `GET /time`
- `GET /exchange-rates/latest?base=CNY`

`GET /exchange-rates/latest?base=CNY` is public and returns the latest CNY-base rates used by ledger display conversion and foreign-currency trading entries. Rates are provided by ExchangeRate-API Open Access and require the in-app attribution link `Rates By Exchange Rate API`.

Initialize or update invite-code data when needed:

```bash
npx wrangler d1 execute personal --remote --file cloudflareworker/invite-codes.sql --config cloudflareworker/wrangler.toml
```

Deploy the Worker:

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

The frontend currently imports a fixed sync endpoint from `constants.ts`. If you self-host the Worker, review that endpoint and your routing before publishing your own deployment.

### WebDAV Backup Only

Users can use WebDAV backup without deploying the Cloudflare backend. Browser/PWA deployments may still be affected by WebDAV provider CORS policies. The iOS Capacitor build can use native HTTP behavior for WebDAV backup flows.

## DeepSeek AI Assistant

Long-press the second bottom tab and choose **Statistics / 统计** or **AI Assistant / AI 助手**. After AI is selected, the tab icon and label change to **AI**, and normal taps continue opening the AI conversation view. The selected mode is stored on the current device and remains in effect across tab changes, refreshes, and app restarts until the user long-presses the tab and explicitly switches modes again.

Configure the assistant from **Settings → AI Assistant**:

- Provider: DeepSeek
- API base URL: `https://api.deepseek.com`
- Models: `deepseek-v4-flash` (default) and `deepseek-v4-pro`
- User input: only a DeepSeek API key

The provider card uses a DeepSeek logo stored locally at `public/deepseek-logo.png`, so the interface does not depend on a runtime image URL. Users can switch between Flash and Pro from AI settings; the selected model is stored and synchronized with the API key. The connection test uses DeepSeek's `/models` endpoint and does not create a chat completion. Responses are received through SSE but are displayed and saved only after local evidence validation; they can use Markdown tables and include a collapsible query-evidence section. The conversation-history drawer enters horizontally from the left. Conversations are saved by default and can be deleted individually or cleared together. The last selected conversation ID is stored on the current device, so reopening the AI view, refreshing, or restarting restores that conversation when it still exists.

The in-app **Settings → AI Assistant** page also contains expandable guidance covering the local tool-query flow, supported and unsupported data, context compression and limits, statistical rules, DeepSeek data transmission, API-key synchronization, conversation storage, local answer grounding, and verification precautions.

When the user scrolls away from the latest message, the conversation view shows a floating down button that returns directly to the bottom. Keyboard positioning combines browser `visualViewport` changes with Capacitor's native keyboard height events. On iOS, where `KeyboardResize.None` leaves the WebView at full height, the composer and scroll padding are lifted by the actual native keyboard height so the input remains visible; environments that already resize `visualViewport` do not receive the offset twice. The bottom navigation is hidden only while a keyboard is actually visible and is restored when it closes.

Supported read-only queries include:

- Highest/lowest or matching transaction details.
- Date presets such as the latest 15 days, 6 months, 12 months, this week/month/year, or all records.
- Amount, count, average, maximum, minimum, income, expense, and net summaries.
- Breakdowns by day, week, month, year, ledger, type, category, or category group.
- Note-keyword filtering.
- Trading-ledger buy/sell counts, realized revenue/cost/profit, and inventory quantity.

The default scope is the ledger active when a conversation is created. The assistant only queries every ledger when the user explicitly asks for all ledgers. Accounting and trading ledgers are reported separately, and cross-ledger currency totals are labeled as CNY rather than silently mixing display currencies.

### AI 如何查询账本数据

AI 使用的是“模型理解问题 + 本地只读工具计算”的方式，不是让 DeepSeek 直接连接 IndexedDB，也不是把整库记录放进提示词：

1. 前端先判断本轮是否涉及账本数据。普通交流、能力询问或对回答的反馈不携带查询工具，由 DeepSeek 正常对话；明确的数据问题以及“收入呢”“为什么这么高”等数据追问才会携带只读工具定义。
2. 对数据问题，前端把用户问题、当前时间和时区、会话默认账本、必要的近期上下文及只读工具定义发送给 DeepSeek。DeepSeek 负责理解自然语言并返回结构化工具调用，例如查询最近一年的支出、按分类聚合，或查找金额最高的明细。
3. `services/aiAssistant.ts` 解析工具调用并限制调用轮数和结果大小；`services/aiAnalytics.ts` 再次校验账本、日期、类型、分类、分类组、备注关键字和金额范围等参数，不信任模型直接给出的参数。
4. 查询在设备本地执行。主要数据源是当前 `AppState` 中的账本、交易、分类和分类组快照，这些数据在应用启动时从 IndexedDB 载入，并随正常记账操作保持更新。为了正确显示历史记录引用的已删除分类或分类组，查询引擎会按需通过 `dbAPI` 读取本地 IndexedDB 中的历史元数据。
5. 日期范围解析、筛选、排序、合计、平均值、最大/最小值、收支差额、分组统计、币种展示和买卖本利润计算都由本地 TypeScript 代码确定性完成。
6. 前端只把回答当前问题所需的聚合结果或受数量上限约束的明细返回 DeepSeek；附件不会读取，备注只在明细查询或备注搜索确有需要时包含。
7. DeepSeek 根据本地工具结果组织自然语言答案。系统提示词要求模型自然回应用户，同时禁止把工具未提供的账目事实写进答案；它可以基于本地数字进行比较、占比和趋势解释。`aggregate_transactions` 只能支持汇总或分组结论；任何单笔日期、分类或备注都必须有 `find_transactions` 的匹配结果，查询为 0 时只能说明未找到。
8. 最终文字在显示和保存前仍有一层轻量本地兜底校验，但只拦截明确事实冲突，例如未成功查询就回答账本数据、用聚合结果编造单笔明细、明细表出现不存在的分类或备注、零匹配却声称找到了记录。它不再逐字限制所有金额、日期、笔数或百分比，避免把正常分析和自然表达误判后强制替换成固定模板。明确冲突会要求模型只修正有问题的数据部分；一次重答仍失败时才使用本地结果生成保底答案。
9. 历史助手的完整文字会保留在上下文中，以便理解语气和连续追问，但旧金额及结论会被标记为历史内容；后续引用相关数据时必须重新查询当前账本，避免旧数据继续传播。回答中的“查询依据”会显示使用的工具、账本、实际日期范围、筛选条件、记录数以及是否发生截断。

目前提供四个只读工具：

| 工具 | 用途 | 本地返回内容 |
| --- | --- | --- |
| `get_ledger_catalog` | 识别账本、账本类型、显示币种、分类和分类组 | 查询所需的元数据目录 |
| `find_transactions` | 查最高消费、备注匹配或其他具体明细 | 最多 50 条匹配明细及查询口径 |
| `aggregate_transactions` | 计算合计、数量、平均、极值、净额和各维度分组 | 本地计算后的聚合结果 |
| `get_trading_summary` | 查询买卖本的买入、卖出、成本、利润和库存 | 复用本地买卖本口径的摘要 |

这些工具没有新增、修改、删除、导入、同步或备份入口。账目备注等内容也被视为不可信数据，不能覆盖系统规则或扩大工具权限。模型不会因为用户问题或历史回答中出现了某个商品名、备注、金额或日期，就把它视为数据库中已存在的记录。

AI limitations and privacy boundaries:

- The assistant is read-only and cannot add, edit, delete, import, back up, or sync ledger data.
- Attachments are never read or sent to DeepSeek.
- Notes are included only when a detail query or note search needs them.
- The API key is stored locally in IndexedDB as `AppSettings.aiConfig`.
- When account sync is enabled, `aiConfig` is included in the D1 `settings.data` payload. WebDAV backup includes it under `settings.aiConfig` in `settings.json`, and a full JSON export includes it as part of application settings.
- Conversations, messages, context summaries, and query traces stay in the local `aiConversations` and `aiMessages` tables. They are excluded from D1 account sync, WebDAV backup, the sync queue, and JSON export.
- Browser/PWA storage, D1 settings, WebDAV JSON, and exported JSON are not equivalent to an operating-system keychain and do not add separate API-key encryption. Protect the device, account, WebDAV access, and exported files.
- AI history remains available offline, but sending a new question requires network access.

## Android And iOS Packaging

Sync built web assets into the native projects:

```bash
npm run build
npx cap sync
```

Open the Android project:

```bash
npx cap open android
```

Open the iOS project:

```bash
npx cap open ios
```

This repository also includes GitHub Actions workflows for Android APK and iOS IPA build artifacts. Production signing and app distribution require your own platform-specific credentials and configuration.

On Windows, the helper script can trigger/download iOS GitHub Actions artifacts when GitHub CLI is installed and authenticated:

```bat
build-ios-github.cmd
```

## Data And Security Notes

- Do not commit real ledger data, exported backups, passwords, invite codes, Cloudflare tokens, WebDAV credentials, or local environment files.
- User records are stored locally first, primarily in IndexedDB.
- Cloud sync uses session-token authentication for normal sync and image routes.
- WebDAV credentials are entered by users at runtime.
- Cloudflare API configuration is not intended to be synced as account settings.
- DeepSeek API keys are stored in local IndexedDB and are included in D1 account settings sync, WebDAV `settings.json`, and full JSON exports. AI conversations, messages, summaries, and query traces remain local-only.
- AI queries send the user's question and the minimum locally calculated tool result required to answer it directly to `api.deepseek.com`; image attachments are excluded.
- Public Worker deployments should review origin policy, authentication, rate limiting, secret handling, D1/KV/R2 access boundaries, and logging behavior.

For vulnerability reporting and review scope, see [SECURITY.md](SECURITY.md).

## Roadmap

- Improve setup documentation for self-hosted Cloudflare deployments.
- Add clearer threat-model notes for local storage, WebDAV, Worker APIs, and attachment handling.
- Expand automated tests beyond the current AI analytics and provider coverage.
- Expand security-focused tests around sync isolation, image access, and backup flows.
- Continue improving mobile packaging notes for Android and iOS.

## Contributing

Contributions are welcome, especially documentation, security review, bug reports, and focused fixes that preserve the local-first data model.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening issues or pull requests.

## License

This project is licensed under the [MIT License](LICENSE).
