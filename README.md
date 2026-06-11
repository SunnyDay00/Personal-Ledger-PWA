# Personal Ledger PWA

Personal Ledger PWA is a privacy-friendly, local-first, self-hostable personal bookkeeping PWA.

It is an early-stage public repository under active maintenance. The app can run as a browser/PWA-first ledger, and the repository also includes Capacitor projects for Android and iOS packaging.

中文简介：Personal Ledger PWA 是一个隐私友好、本地优先、可自托管的个人记账 PWA，支持离线使用、多账本、图片附件、WebDAV 备份，以及可选的 Cloudflare 同步后端。

Online demo / 在线体验：<https://personal-ledger-pwa.pages.dev/>

## Highlights

- Local-first personal finance records stored primarily in IndexedDB.
- Installable PWA with offline-capable static assets through `vite-plugin-pwa` and Workbox.
- Multiple ledgers, income/expense records, trading-style ledgers, categories, groups, budgets, search, batch operations, and statistics.
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
- Category and category group management per ledger.
- Daily, weekly, monthly, and yearly statistics with charts.
- Budget display and progress tracking.
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

The local IndexedDB database stores ledgers, categories, category groups, transactions, settings, operation logs, backup logs, cached images, pending image uploads, and a sync queue. Older local storage and earlier IndexedDB database names are migrated when supported by the current code.

When optional Cloudflare sync is enabled, local changes are queued and later pushed to the Worker. If the network is unavailable, a session expires, or sync fails, local data is kept and the queue is retried later.

Image attachments are saved locally first. When cloud sync is configured, pending images can be uploaded to R2, while transactions keep attachment keys instead of embedding binary image data.

WebDAV backup is file-based backup, not real-time row-level sync. It stores ledger/settings data and transaction exports and uses retry behavior in the WebDAV service.

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
- Public Worker deployments should review origin policy, authentication, rate limiting, secret handling, D1/KV/R2 access boundaries, and logging behavior.

For vulnerability reporting and review scope, see [SECURITY.md](SECURITY.md).

## Roadmap

- Improve setup documentation for self-hosted Cloudflare deployments.
- Add clearer threat-model notes for local storage, WebDAV, Worker APIs, and attachment handling.
- Add automated linting and test scripts when the project is ready for stricter contribution checks.
- Expand security-focused tests around sync isolation, image access, and backup flows.
- Continue improving mobile packaging notes for Android and iOS.

## Contributing

Contributions are welcome, especially documentation, security review, bug reports, and focused fixes that preserve the local-first data model.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening issues or pull requests.

## License

This project is licensed under the [MIT License](LICENSE).
