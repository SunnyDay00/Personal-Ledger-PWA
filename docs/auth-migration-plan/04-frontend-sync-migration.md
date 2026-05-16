# Step 4: Legacy Sync Migration And Account Takeover

## Goal
Migrate existing local and old cloud sync data into the first authenticated account without data loss.

## Context
Before this migration, old users may have:

- Local IndexedDB data in `FinanceDB_v9`.
- Settings containing `syncEndpoint`, `syncToken`, and `syncUserId`.
- Cloud data stored under old Worker `user_id`, often `default`.
- JSON/CSV backups.

Step 3 introduced login and fixed endpoint usage, but old users still need a controlled path to attach their current data to the logged-in account.

## Files To Inspect
- `services/db.ts`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `contexts/AppContext.tsx`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `types.ts`
- `constants.ts`
- `cloudflareworker/worker.js`
- `README.md`

## Files To Change
- `services/db.ts`
- `services/d1Sync.ts`
- `contexts/AppContext.tsx`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `types.ts`
- `README.md` if runtime behavior changes during this step.
- `cloudflareworker/worker.js` only if Step 2 did not already add a legacy migration route.

## Implementation Details
- Preserve all existing legacy IndexedDB migration code in `services/db.ts`.
- Detect legacy cloud settings:
  - `settings.syncEndpoint`
  - `settings.syncToken`
  - `settings.syncUserId`
- On first successful login/register, run account takeover once if local settings show it has not run:

```ts
legacyCloudMigratedToUserId?: string;
legacyLocalMigratedToUserId?: string;
```

- Local takeover:
  - Keep current local ledgers, categories, groups, transactions, images, pending uploads, operation logs, backup logs, and settings.
  - Mark them dirty for authenticated sync.
  - Do not change record IDs unless absolutely required.
  - Do not delete guest/local data during takeover.
- Cloud takeover:
  - If old cloud settings exist, call a controlled legacy pull endpoint using the old token and old user ID.
  - Merge pulled data into local DB with the existing last-write-wins `updatedAt` rules.
  - Then push merged local data through the new authenticated sync endpoint.
- If no legacy cloud settings exist:
  - Only push current local data to the logged-in account.
- If local DB is empty:
  - Pull authenticated account data from the new Worker after login.
- Add a small explicit UI prompt after first login if needed:
  - `将当前本地数据迁移到此账号`
  - Recommended default: run takeover automatically once for existing local data, with clear success/failure messaging.
- Ensure `isFirstRun` remains false after successful migration when the user already completed onboarding.
- Preserve JSON import/export exactly as current behavior.
- Preserve old `syncEndpoint`, `syncToken`, `syncUserId` values as `legacy*` fields only for migration and troubleshooting. They must not be used for normal sync after takeover.
- After a successful takeover, clear normal old sync fields from active settings:
  - `syncEndpoint`
  - `syncToken`
  - `syncUserId`
  Keep only `legacySyncEndpoint`, `legacySyncToken`, `legacySyncUserId` if needed.

## Acceptance Criteria
- Existing local data remains visible after login.
- Existing local data is pushed to the authenticated account.
- Existing old cloud data under `default` or the previous `syncUserId` can be pulled and merged.
- Running takeover twice does not duplicate records or erase data.
- If old cloud pull fails, local data remains intact and the user sees a recoverable error.
- JSON/CSV import and export still work.
- Guest mode still works if the user logs out after migration.

## Commands
Run after implementing this step:

```bash
npm run build
```

If `cloudflareworker/worker.js` is modified during this step:

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

Manual migration test matrix:

```text
1. Old local data only -> login -> data remains visible -> sync succeeds.
2. Old cloud data only -> login -> pull/restore succeeds.
3. Old local + old cloud data -> login -> merge succeeds without duplicates.
4. Fresh install -> login -> pulls new account data or starts empty.
```

## Do Not
- Do not clear IndexedDB automatically during migration.
- Do not overwrite newer local records with older cloud records.
- Do not keep using old `AUTH_TOKEN` for normal sync after takeover.
- Do not remove JSON/CSV backup compatibility.
- Do not force users to log in before they can access old local records.

## Handoff To Step 5

### Files Modified In Step 4
- `types.ts`
- `constants.ts`
- `services/settingsUtils.ts`
- `services/db.ts`
- `services/d1Sync.ts`
- `contexts/AppContext.tsx`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `README.md`
- `docs/auth-migration-plan/04-frontend-sync-migration.md`

`cloudflareworker/` was not modified in Step 4. The existing Step 2 Worker already exposes the legacy/admin migration routes, so no Worker deploy was run in this step.

### Legacy Field Detection
- `normalizeAppSettings` now copies old active fields into legacy fields when a legacy token exists:
  - `syncEndpoint` -> `legacySyncEndpoint`
  - `syncToken` -> `legacySyncToken`
  - `syncUserId` -> `legacySyncUserId`
- `contexts/AppContext.tsx` reads legacy credentials with this priority:
  - endpoint: `legacySyncEndpoint`, then `syncEndpoint`, then `FIXED_SYNC_ENDPOINT`
  - token: `legacySyncToken`, then `syncToken`
  - user id: `legacySyncUserId`, then `syncUserId`, then `default`
- Normal D1 sync, version polling, image upload/download/delete, onboarding, and settings UI continue to use only the fixed endpoint plus the authenticated session token.

### Migration State And Idempotency
- Local-only migration state fields are:
  - `legacyLocalMigratedToUserId`
  - `legacyCloudMigratedToUserId`
- These fields are excluded by `withoutLocalAuthSecrets`, so they are not sent in authenticated settings sync payloads.
- Account takeover compares those fields with `authSession.user.id`. If the current user was already marked, takeover is not repeated for that part.
- Local dirty marking uses deterministic `syncQueue` ids such as `transaction:<id>`, so rerunning the process overwrites queue rows instead of duplicating them.
- Cloud merge keeps original record ids and uses existing last-write-wins `updatedAt` checks, so repeated legacy pulls are idempotent.

### Local IndexedDB Takeover
- `markAllLocalDataForSync()` in `services/db.ts` reads all local ledgers, categories, category groups, and transactions, including soft-deleted rows.
- It preserves record ids and existing `updatedAt` values. Only records missing `updatedAt` receive a fallback timestamp from `createdAt`, `date`, or `Date.now()`.
- It writes every local entity into `syncQueue` as `upsert` or `delete`, preserving local data, local images, pending uploads, operation logs, backup logs, WebDAV settings, and `isFirstRun`.
- Login/register calls `runAccountTakeover(session)` before returning to the UI. The onboarding screen no longer asks for old Worker URL or `AUTH_TOKEN`; it waits for the account takeover flow.

### Legacy Cloud Pull, Merge, And Push
- If the local structured data tables are empty, takeover first pulls the authenticated account with `GET /sync/pull?since=0` using the session token.
- If legacy cloud credentials exist, takeover calls `pullLegacyFromCloud()` against:
  - `GET /legacy/sync/pull?user_id=<legacySyncUserId>&since=0`
  - `GET /legacy/sync/pull?user_id=default&since=0` when different
  - the saved legacy endpoint and the fixed endpoint are both tried when distinct
- Legacy route authorization is `Authorization: Bearer <legacy AUTH_TOKEN>`.
- Each successful legacy pull is merged by `mergeFromCloud()` using existing `updatedAt` last-write-wins behavior.
- After local and legacy cloud data are merged, takeover forces `lastSyncVersion: 0`, queues all local rows, and runs a full migration sync through the new authenticated `/sync/push` and `/sync/pull` endpoints.
- After a fully successful takeover, active old fields `syncEndpoint`, `syncToken`, and `syncUserId` are cleared. The `legacy*` values remain for troubleshooting and any later migration retry needs.

### Failure Protection
- No migration path clears IndexedDB.
- If the legacy pull fails, local data remains intact, `legacyCloudMigratedToUserId` is not set, old active fields are not cleared, and the user sees a recoverable alert plus `lastSyncError`.
- If the authenticated push fails, `legacyLocalMigratedToUserId` is not set, the `syncQueue` remains populated, and the next login/manual sync can retry.
- A `401` from authenticated routes clears the local session but does not delete ledger data.

### README Updates
- README now documents automatic account takeover after first login/register.
- README now documents how old `syncEndpoint` / `syncToken` / `syncUserId` values are retained as legacy fields.
- README now documents the legacy pull route, `AUTH_TOKEN` authorization, migration status fields, and local-data protection behavior.

### Build Result
- Command run:

```bash
npm run build
```

- Result: passed.
- TypeScript compile, Vite production build, and PWA service worker generation completed successfully.

### Worker Deploy
- Step 4 did not modify `cloudflareworker/`.
- Worker deploy was not run in Step 4.
- Existing legacy/admin routes used by this step:
  - `GET /legacy/sync/pull?user_id=...&since=...`
  - Authorization: `Bearer AUTH_TOKEN`

### Step 5 Cleanup Notes
- Remove or hide any remaining old `syncEndpoint`, `syncToken`, and `syncUserId` active-field display from normal user UI.
- Keep `legacySyncEndpoint`, `legacySyncToken`, and `legacySyncUserId` only for migration/debug visibility if Step 5 still wants troubleshooting access.
- Keep normal settings copy focused on account login/session, fixed sync endpoint, migration status, and manual sync controls.
- Re-check docs for old phrases telling users to enter Worker URL, `AUTH_TOKEN`, or manual `userId`.
