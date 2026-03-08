# Personal Ledger PWA

Personal Ledger PWA is a local-first personal finance app built with React, Vite, Dexie, Capacitor, and Cloudflare services. It supports offline usage, multi-ledger management, statistics, image attachments, WebDAV backup, and optional cloud sync through Cloudflare Worker + D1 + KV + R2.

## Overview

This project is designed as a practical personal bookkeeping system that can run in three forms:

- Web application in the browser
- Installable PWA on desktop or mobile
- Native shell app through Capacitor for Android and iOS

The default mode is local-first. Users can use the app without any cloud service. Cloud capabilities are optional.

## Core Features

- Multi-ledger management
- Income and expense records
- Custom categories and category groups
- Weekly, monthly, and yearly statistics
- Charts with pie, bar, and line views
- Budget display and progress tracking
- Search, batch edit, batch delete, and undo delete
- JSON and CSV import/export
- First-run onboarding and data restore
- Image attachments for transactions
- WebDAV manual backup and scheduled backup
- Cloud sync with Cloudflare Worker + D1 + KV + R2
- PWA install and offline access
- Capacitor integrations for keyboard, haptics, file export, share, and deep links

## Tech Stack

### Frontend

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- Recharts
- Lucide React

### Local Data and Offline Layer

- Dexie
- IndexedDB
- vite-plugin-pwa
- Workbox

### Mobile Packaging

- Capacitor
- Android native project
- iOS native project

### Cloud Services

- Cloudflare Worker
- Cloudflare D1
- Cloudflare KV
- Cloudflare R2
- WebDAV

## Project Structure

```text
.
├─ components/          UI views and interaction components
├─ contexts/            global state and business workflow entry
├─ services/            database, sync, WebDAV, and image services
├─ android/             Capacitor Android project
├─ ios/                 Capacitor iOS project
├─ cloudflareworker/    Cloudflare Worker backend and Wrangler config
├─ capacitor.config.ts  Capacitor config
├─ vite.config.ts       Vite and PWA config
└─ README.md
```

## How It Works

### Local-first data model

All primary user operations write data to local IndexedDB first. The app stays usable offline and does not depend on a remote server for core bookkeeping.

Main local tables include:

- transactions
- ledgers
- categories
- categoryGroups
- settings
- operationLogs
- backupLogs
- images
- pending_uploads

### Local migration

The app keeps migration logic for older localStorage-based data. On first startup, if legacy data is found, it is migrated into IndexedDB automatically.

### Cloud sync with Cloudflare

The optional sync backend is implemented in `cloudflareworker/worker.js`.

Sync flow:

- The frontend calls the Worker with `Authorization: Bearer AUTH_TOKEN`
- The Worker stores structured data in D1
- KV is used to track user version state
- The client compares versions and runs push/pull sync when needed
- Image binaries are stored in R2 and transaction records keep only attachment keys

This design separates structured records from image objects and keeps the frontend lightweight.

### WebDAV backup

The WebDAV path is a file-based backup strategy.

It stores:

- `ledgers.json` for ledgers
- `settings.json` for settings, categories, and groups
- split CSV files for transactions by ledger and year

The implementation uses ETag-based optimistic locking and retry logic to reduce overwrite conflicts.

### Image attachment flow

- New images are cached locally first
- Pending images are uploaded later when sync is available
- Transaction records store only image keys
- Images are fetched on demand and cached locally for display

### PWA and native shell

The web app supports installable PWA behavior with cached static assets. The Capacitor layer adds native integrations such as keyboard handling, haptics, file export, share, and deep link entry.

## Local Development

### Requirements

- Node.js 20 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start dev server

```bash
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

### Build production assets

```bash
npm run build
```

Build output:

```text
dist/
```

## Deployment

### Option 1: Static frontend only

If you only need local bookkeeping or PWA usage, deploy the built `dist/` folder to any static hosting service such as:

- Cloudflare Pages
- EdgeOne Pages
- Nginx
- GitHub Pages

Typical steps:

```bash
npm install
npm run build
```

Then publish `dist/`.

### Option 2: Cloudflare sync backend

If you need D1 + KV + R2 sync, deploy the Worker from `cloudflareworker/`.

Worker name:

```text
personal-ledger-sync
```

Current Worker config file:

```text
cloudflareworker/wrangler.toml
```

Expected bindings:

- `DB` for Cloudflare D1
- `SYNC_KV` for Cloudflare KV
- `IMAGES_BUCKET` for Cloudflare R2
- `AUTH_TOKEN` as Worker secret

Deploy commands:

```bash
npx wrangler secret put AUTH_TOKEN --config cloudflareworker/wrangler.toml
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

After deployment, configure the app with:

- Worker endpoint URL
- `AUTH_TOKEN`
- a stable `userId` used across devices

### Option 3: WebDAV backup endpoint

If you do not want to run the Cloudflare backend, you can use WebDAV only.

Required settings:

- WebDAV URL
- Username
- Password

## Android and iOS Packaging

### Sync web assets into native projects

```bash
npm run build
npx cap sync
```

### Android

```bash
npx cap open android
```

The repository also contains a GitHub Actions workflow that can build an APK artifact.

### iOS

```bash
npx cap open ios
```

The repository also contains an iOS build workflow for packaging a test IPA artifact. Formal signing and distribution still need your own Apple signing setup.

## Usage Notes

### First run

On first launch, users can:

- create a new ledger
- restore from a local JSON backup
- restore from Cloudflare D1 + KV

### Recommended backup strategy

- Local-only usage: export JSON or CSV regularly
- WebDAV usage: enable scheduled backup
- Cloud sync usage: still keep local exports as an extra recovery layer

## Security Notes

- Do not hardcode `AUTH_TOKEN` in tracked frontend files
- WebDAV credentials are user-provided at runtime
- Cloudflare API credentials used for usage statistics should remain user-managed
- Restrict Worker access and secrets appropriately before public deployment

## License

No license file is currently included in this repository. Add an explicit license before public redistribution or external contribution.
