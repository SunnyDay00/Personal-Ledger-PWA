# Step 2: Worker Sync Isolation

## Goal
Change Worker sync and image APIs so authenticated sessions determine the user. Frontend-provided `user_id` must no longer be trusted for normal sync, version, image upload, image download, or image delete operations.

## Context
Step 1 added D1-backed users and sessions. The existing Worker sync tables already have a `user_id` column, but table primary keys are currently only record IDs. That can cause conflicts if different accounts generate the same ledger, category, group, transaction, or image key.

## Files To Inspect
- `cloudflareworker/worker.js`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `README.md`

## Files To Change
- `cloudflareworker/worker.js`
- `README.md` only if this step is implemented in runtime code during the same turn.

Frontend call-site changes happen in Step 3 and Step 4 unless a minimal temporary compatibility change is needed for testing.

## Implementation Details
- Reuse the Step 1 session helpers. Every normal cloud data route must call `requireSessionUser`.
- Update these routes to use the authenticated user ID:
  - `GET /sync/version`
  - `GET /sync/pull`
  - `POST /sync/push`
  - `POST /upload/image`
  - `GET /image/:key`
  - `DELETE /image/:key`
- Ignore `url.searchParams.get('user_id')` for authenticated routes.
- Preserve a narrow legacy migration path only if needed:
  - It must require the old `AUTH_TOKEN`.
  - It must be clearly named, for example `/legacy/sync/pull`.
  - It must not be used by the normal frontend login flow.
- Update table uniqueness so records are isolated by user:
  - New writes must use `(user_id, id)` as the logical unique key.
  - If D1 cannot alter existing primary keys easily in-place, create new `*_v2` tables or use a controlled migration that copies data and preserves old records.
- Recommended new table shapes:

```sql
CREATE TABLE IF NOT EXISTS ledgers_v2 (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT,
  theme_color TEXT,
  created_at INTEGER,
  updated_at INTEGER,
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
  "order" INTEGER,
  is_custom INTEGER,
  updated_at INTEGER,
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
  date INTEGER,
  note TEXT,
  attachments TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  is_deleted INTEGER,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS settings_v2 (
  user_id TEXT PRIMARY KEY,
  data TEXT,
  updated_at INTEGER
);
```

- If retaining original table names, ensure the actual D1 schema no longer permits cross-user conflicts on record IDs. Do not rely on code comments only.
- Use `version:${userId}` in KV exactly as before, but derive `userId` from the session.
- Image storage:
  - Store new R2 objects under `users/<userId>/<imageKey>`.
  - Strip any leading slash from client-provided image keys.
  - Reject keys containing `..`.
  - For `GET /image/:key`, fetch only from `users/<userId>/<key>` for normal requests.
  - Keep legacy image key fallback only for migration if explicitly needed, and never allow one user to fetch another user's scoped image.
- Update usage statistics without exposing per-user private data.
- Return `401` for missing/invalid session on normal sync/image routes.

## Acceptance Criteria
- User A and user B can create transactions with the same local `id` without D1 conflict.
- User A cannot pull user B data by adding or changing `?user_id=...`.
- User A cannot download or delete user B images by guessing image keys.
- `/sync/version` returns the version for the logged-in account only.
- Existing local-first clients are not affected until they opt into login UI in Step 3.
- Any legacy route is visibly separate from normal routes and requires `AUTH_TOKEN`.

## Commands
Run after implementing this step:

```bash
npm run build
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

Recommended manual API checks:

```bash
curl -i https://sync.sssr.edu.kg/health
curl -i https://sync.sssr.edu.kg/sync/version
```

The second command should return `401` without a session token after this step.

## Do Not
- Do not accept `user_id` from the frontend as an authorization boundary.
- Do not continue using single-column `id` uniqueness for user-owned data.
- Do not expose raw session tokens in logs.
- Do not make image URLs public unless there is a separate signed URL strategy.
- Do not implement shared ledgers or account-to-account access in this step.

## Handoff To Step 3

### Files Modified In Step 2
- `cloudflareworker/worker.js`
- `README.md`
- `docs/auth-migration-plan/02-worker-sync-isolation.md`

### Normal Authorization Format
- Normal cloud sync and image routes now require:

```http
Authorization: Bearer <raw-session-token>
```

- `<raw-session-token>` is the token returned by `POST /auth/register` or `POST /auth/login`.
- The Worker still stores only `sha256(token)` in D1.
- The old `Authorization: Bearer AUTH_TOKEN` no longer authorizes normal `/sync/*`, `/upload/image`, or `/image/:key` routes.

### `/sync/version`, `/sync/pull`, `/sync/push` User Handling
- `GET /sync/version` still accepts query strings syntactically, but ignores `user_id`.
- `GET /sync/pull` still accepts query strings syntactically, but ignores `user_id`; it still uses `since`.
- `POST /sync/push` still accepts query strings syntactically, but ignores `user_id`.
- All three routes derive the effective `user_id` from `requireSessionUser(request, env, origin)` and use `sessionUser.user.id`.
- Missing, fake, expired, revoked, or disabled-user session tokens return `401`.

### D1 User Isolation
- Original legacy tables are retained:
  - `ledgers`
  - `categories`
  - `groups`
  - `transactions`
  - `settings`
- Normal authenticated sync now uses new account-isolated tables:
  - `ledgers_v2`
  - `categories_v2`
  - `groups_v2`
  - `transactions_v2`
  - `settings_v2`
- `ledgers_v2`, `categories_v2`, `groups_v2`, and `transactions_v2` use:

```sql
PRIMARY KEY (user_id, id)
```

- `settings_v2` uses `user_id TEXT PRIMARY KEY`.
- New sync writes use `ON CONFLICT(user_id, id)` for user-owned records, so two accounts can write the same local record ID without conflicting.

### R2 Image User Isolation
- Normal uploads normalize the client image key by stripping leading `/`.
- Image keys containing `..` are rejected.
- Normal uploads store objects at:

```text
users/<user_id>/<imageKey>
```

- Normal `GET /image/:key` and `DELETE /image/:key` only access `users/<sessionUser.user.id>/<key>`.
- The JSON upload response still returns the unscoped logical key:

```json
{ "key": "imageKey" }
```

- Transaction attachments should continue storing only that logical key, not the `users/<user_id>/` R2 prefix.

### Legacy/Admin Routes Retained
- Legacy migration/admin paths are visibly separate from the normal login flow.
- All retained legacy/admin paths require:

```http
Authorization: Bearer AUTH_TOKEN
```

- Retained paths:
  - `GET /legacy/sync/version?user_id=...`
  - `GET /legacy/sync/pull?user_id=...&since=...`
  - `POST /legacy/sync/push?user_id=...`
  - `POST /legacy/upload/image`
  - `GET /legacy/image/:key`
  - `DELETE /legacy/image/:key`
  - `GET /usage`
- Legacy sync routes continue using original D1 tables and the explicit legacy `user_id`.
- Legacy image routes continue using raw R2 keys.
- `/usage` remains admin-only and returns aggregate usage statistics, not per-user private records.

### README Updates
- Updated the Cloudflare sync architecture description from `AUTH_TOKEN + user_id` to session-token-authenticated sync.
- Documented that normal sync ignores frontend `user_id`.
- Documented the new `*_v2` D1 tables and `(user_id, id)` uniqueness.
- Documented R2 image key scoping under `users/<user_id>/<imageKey>`.
- Documented retained legacy/admin paths and their `AUTH_TOKEN` requirement.
- Updated deployment/security notes so `AUTH_TOKEN` is no longer described as the normal sync credential.

### Checks Run
- `node --check cloudflareworker\worker.js`
  - Result: passed.
- In-memory `worker.fetch()` smoke test with fake D1/KV/R2 bindings
  - Result: passed.
  - Covered normal `/sync/version` without session returning `401`.
  - Covered two session users pushing the same local transaction ID without conflict in `transactions_v2`.
  - Covered forged `?user_id=...` being ignored on normal pull.
  - Covered old `AUTH_TOKEN` returning `401` on normal `/sync/version`.
  - Covered `/legacy/sync/version` accepting `AUTH_TOKEN`.
  - Covered normal image upload storing under `users/<user_id>/receipt.png`.
  - Covered another user getting `404` for that image.
  - Covered owner image read returning `200`.
  - Covered `..` image key rejection returning `400`.
- `npx wrangler --version`
  - Result: passed, reported `4.86.0`.
- `npm run build`
  - Result: passed. TypeScript, Vite build, and PWA generation completed.
- `git diff --check`
  - Result: passed with only CRLF normalization warnings from Git.
- `npx wrangler deploy --config cloudflareworker/wrangler.toml`
  - Result: failed before upload because Wrangler could not fetch an auth token in this non-interactive environment.
  - Error requires setting `CLOUDFLARE_API_TOKEN`.

### Deployment Status
- Worker was not deployed successfully in Step 2.
- Deployment was attempted with the required command:

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

- The attempt failed before upload because the environment has no Wrangler login or `CLOUDFLARE_API_TOKEN`.
- After configuring `CLOUDFLARE_API_TOKEN`, rerun the same command.

### Step 3 Frontend API Contract
- Registration:

```http
POST /auth/register
Content-Type: application/json

{ "username": "alice", "password": "strong-password", "inviteCode": "invite-code" }
```

- Login:

```http
POST /auth/login
Content-Type: application/json

{ "username": "alice", "password": "strong-password" }
```

- Register/login success response:

```json
{
  "user": { "id": "user-id", "username": "alice" },
  "token": "raw-session-token",
  "expiresAt": 1710000000000
}
```

- Current user:

```http
GET /auth/me
Authorization: Bearer <raw-session-token>
```

- Current user response:

```json
{
  "user": { "id": "user-id", "username": "alice" },
  "expiresAt": 1710000000000
}
```

- Version:

```http
GET /sync/version
Authorization: Bearer <raw-session-token>
```

Response:

```json
{ "version": 1710000000000 }
```

- Pull:

```http
GET /sync/pull?since=<lastSyncVersion>
Authorization: Bearer <raw-session-token>
```

Response shape:

```json
{
  "version": 1710000000000,
  "ledgers": [],
  "categories": [],
  "groups": [],
  "transactions": [],
  "settings": null
}
```

- Push:

```http
POST /sync/push
Authorization: Bearer <raw-session-token>
Content-Type: application/json

{
  "ledgers": [],
  "categories": [],
  "groups": [],
  "transactions": [],
  "settings": null
}
```

Response:

```json
{ "ok": true, "version": 1710000000000 }
```

- Image upload:

```http
POST /upload/image
Authorization: Bearer <raw-session-token>
Content-Type: image/png
X-Image-Key: <optional-client-image-key>

<binary image body>
```

Response:

```json
{ "key": "imageKey" }
```

- Image read:

```http
GET /image/:key
Authorization: Bearer <raw-session-token>
```

Response is the image binary, or `404` when the object is not in the current user's R2 scope.

- Image delete:

```http
DELETE /image/:key
Authorization: Bearer <raw-session-token>
```

Response:

```json
{ "success": true }
```

- Logout:

```http
POST /auth/logout
Authorization: Bearer <raw-session-token>
```

Response:

```json
{ "ok": true }
```

### Step 3 Compatibility Risks
- Existing frontend sync helpers still send `AUTH_TOKEN` and `?user_id=...` to normal `/sync/*`; they will now receive `401` until Step 3 switches them to the login session token.
- The existing settings field named `syncToken` may need a semantic migration or clear naming, because the normal token is now a session token, not `AUTH_TOKEN`.
- Frontend code must stop using `userId` as an authorization boundary. A local user ID can remain as a client-side identifier only if it is not sent as authority to the Worker.
- Existing D1 data in old tables is not automatically moved into the authenticated user's `*_v2` rows in this step.
- Existing raw R2 image keys are not readable through normal `/image/:key`; they must be migrated, reuploaded, or accessed only through the legacy path during a migration flow.
- Do not expose raw session tokens in logs, error reports, URLs, analytics, or persisted plaintext beyond the app's intended credential storage.
- Before production verification, make sure the deployed Worker still has `DB`, `SYNC_KV`, and `IMAGES_BUCKET` bindings and both `AUTH_TOKEN` and `REGISTRATION_INVITE_CODE` secrets configured.
