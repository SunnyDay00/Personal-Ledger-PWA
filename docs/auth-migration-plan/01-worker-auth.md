# Step 1: Worker Auth Foundation

## Goal
Modify `cloudflareworker/worker.js` to support invite-code registration, username/password login, session creation, session validation, logout, and current-user lookup.

This step builds the auth foundation only. It must not yet rewrite sync ownership rules; that happens in Step 2.

## Context
The Worker currently uses one global secret:

```text
Authorization: Bearer AUTH_TOKEN
```

That model is not safe for multiple users because anyone with the token can choose any `user_id`. The new model uses per-user sessions stored in D1. Passwords must never be stored in plain text.

## Files To Inspect
- `cloudflareworker/worker.js`
- `cloudflareworker/wrangler.toml`
- `README.md`

## Files To Change
- `cloudflareworker/worker.js`
- `README.md` only if this step is implemented in runtime code during the same turn.

Do not change frontend files in this step.

## Implementation Details
- Extend the Worker table initialization SQL with:
  - `users`
  - `sessions`
- Use this D1 schema unless a directly equivalent schema already exists:

```sql
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
```

- Add helper functions in `worker.js`:
  - `parseJsonBody(request)`
  - `normalizeUsername(username)`
  - `createUserId()`
  - `createSessionToken()`
  - `sha256Hex(text)`
  - `pbkdf2HashPassword(password, salt, iterations)`
  - `verifyPassword(password, user)`
  - `getBearerToken(request)`
  - `getSessionUser(request, env)`
  - `requireSessionUser(request, env, origin)`
- Use WebCrypto PBKDF2-SHA-256:
  - Generate a random salt per user.
  - Use at least 150000 iterations.
  - Store only `password_hash`, `password_salt`, and `password_iterations`.
- Use opaque random session tokens:
  - Generate at least 32 random bytes.
  - Return only the raw token to the client once.
  - Store only `sha256(token)` in `sessions.token_hash`.
  - Use a default expiration of 30 days.
- Add routes before the old global `AUTH_TOKEN` check:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
- `POST /auth/register` request body:

```json
{
  "username": "alice",
  "password": "strong-password",
  "inviteCode": "invite-code"
}
```

- Registration rules:
  - `username` is trimmed, lowercased, and limited to safe characters: letters, numbers, underscore, hyphen, dot.
  - Username length: 3 to 40 characters.
  - Password length: at least 8 characters.
  - `inviteCode` must equal `env.REGISTRATION_INVITE_CODE`.
  - Duplicate usernames return `409`.
  - Disabled users cannot log in.
- Successful register/login response:

```json
{
  "user": {
    "id": "user-id",
    "username": "alice"
  },
  "token": "raw-session-token",
  "expiresAt": 1710000000000
}
```

- `POST /auth/logout`:
  - Requires session token.
  - Sets `revoked_at`.
  - Returns `{ "ok": true }` even if the token is already invalid.
- `GET /auth/me`:
  - Requires a valid non-expired, non-revoked session.
  - Returns `{ "user": { "id": "...", "username": "..." }, "expiresAt": ... }`.
- Keep `/health` public.
- Keep existing CORS behavior, but include any new headers only if needed.
- Leave the old global `AUTH_TOKEN` check in place for current sync routes until Step 2.

## Acceptance Criteria
- `POST /auth/register` with a wrong invite code returns `403`.
- `POST /auth/register` with a duplicate username returns `409`.
- `POST /auth/register` with valid data creates a user and returns a token.
- `POST /auth/login` with the right password returns a token.
- `POST /auth/login` with the wrong password returns `401`.
- `GET /auth/me` with a valid session returns the current user.
- `GET /auth/me` with a fake or expired token returns `401`.
- Plain text passwords are never stored in D1.
- Existing `/sync/*`, `/image/*`, `/usage`, and WebDAV proxy behavior still works as before after this step.

## Commands
Run after implementing this step:

```bash
npm run build
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

Before deploying, set the invite code secret if it is not already configured:

```bash
npx wrangler secret put REGISTRATION_INVITE_CODE --config cloudflareworker/wrangler.toml
```

## Do Not
- Do not add frontend login UI in this step.
- Do not remove `AUTH_TOKEN` yet.
- Do not trust frontend-provided `user_id` for new auth logic.
- Do not use JWT unless a separate signing secret, expiration validation, and revocation strategy are fully implemented. Prefer opaque D1-backed sessions.
- Do not store password text, reversible encrypted passwords, or password-equivalent values.

## Handoff To Step 2

### Files Modified In Step 1
- `cloudflareworker/worker.js`
- `README.md`
- `docs/auth-migration-plan/01-worker-auth.md`

### Worker Auth Routes Added
- `POST /auth/register`
  - Body: `{ "username": "...", "password": "...", "inviteCode": "..." }`
  - Requires `inviteCode === env.REGISTRATION_INVITE_CODE`.
  - Normalizes usernames with trim + lowercase.
  - Accepts usernames matching `/^[a-z0-9_.-]{3,40}$/`.
  - Requires password length >= 8.
  - Returns `201` with `{ user, token, expiresAt }` on success.
  - Returns `403` for a bad invite code and `409` for duplicate usernames.
- `POST /auth/login`
  - Body: `{ "username": "...", "password": "..." }`
  - Returns `200` with `{ user, token, expiresAt }` on success.
  - Returns `401` for missing user, disabled user, invalid username shape, or wrong password.
- `POST /auth/logout`
  - Requires `Authorization: Bearer <session-token>`.
  - Hashes the bearer token and sets `sessions.revoked_at`.
  - Returns `{ "ok": true }` for any presented token, even if no matching active session exists.
  - Returns `401` only when no bearer token is presented.
- `GET /auth/me`
  - Requires a valid, non-expired, non-revoked session.
  - Returns `{ user, expiresAt }`.
  - Returns `401` for fake, expired, revoked, disabled, or missing sessions.

### D1 Tables And Fields Added
- Added `users` table:
  - `id TEXT PRIMARY KEY`
  - `username TEXT NOT NULL UNIQUE`
  - `password_hash TEXT NOT NULL`
  - `password_salt TEXT NOT NULL`
  - `password_iterations INTEGER NOT NULL`
  - `created_at INTEGER NOT NULL`
  - `updated_at INTEGER NOT NULL`
  - `disabled INTEGER NOT NULL DEFAULT 0`
- Added `sessions` table:
  - `id TEXT PRIMARY KEY`
  - `user_id TEXT NOT NULL`
  - `token_hash TEXT NOT NULL UNIQUE`
  - `created_at INTEGER NOT NULL`
  - `expires_at INTEGER NOT NULL`
  - `revoked_at INTEGER`
  - `user_agent TEXT`
  - `FOREIGN KEY (user_id) REFERENCES users(id)`
- Added indexes:
  - `idx_sessions_user_id ON sessions(user_id)`
  - `idx_sessions_token_hash ON sessions(token_hash)`
- No existing sync table fields were changed in Step 1.

### Env Secrets
- New required Worker secret: `REGISTRATION_INVITE_CODE`.
- Existing secret retained: `AUTH_TOKEN`.
- `AUTH_TOKEN` is still checked in `cloudflareworker/worker.js` after `/health` and `/auth/*`, before legacy `/sync/*`, `/upload/image`, `/image/*`, `/usage`, and any other non-auth routes.

### Checks Run
- `node --check cloudflareworker/worker.js`
  - Result: passed.
- In-memory Worker auth smoke test through `worker.fetch()`
  - Wrong invite: `403`.
  - Valid register: `201`, normalized username `alice`, token returned.
  - Stored password check: no plaintext password stored, hash differs from password.
  - Duplicate username: `409`.
  - Wrong password login: `401`.
  - Valid login: `200`, token returned.
  - Valid `/auth/me`: `200`.
  - Fake `/auth/me`: `401`.
  - Logout: `200`.
  - `/auth/me` after logout: `401`.
  - Public `/health`: `200`.
  - Legacy `/sync/version` without `AUTH_TOKEN`: `401`.
- `npm run build`
  - Result: passed. Vite build and PWA generation completed.
- `npx wrangler --version`
  - Result: passed, reported `4.86.0`.
- `npx wrangler whoami --config cloudflareworker/wrangler.toml`
  - Result: failed. Wrangler reported `Failed to fetch auth token: 400 Bad Request` and `Not logged in`.
- `npx wrangler secret list --config cloudflareworker/wrangler.toml`
  - Result: failed because the non-interactive environment has no `CLOUDFLARE_API_TOKEN`.
- `npx wrangler deploy --config cloudflareworker/wrangler.toml`
  - Result: failed because the non-interactive environment has no `CLOUDFLARE_API_TOKEN`.

### Deployment Status
- Worker was not deployed successfully in Step 1.
- Deployment was attempted with the required command:
  - `npx wrangler deploy --config cloudflareworker/wrangler.toml`
- The attempt failed before upload due missing Wrangler authentication / missing `CLOUDFLARE_API_TOKEN`.
- `REGISTRATION_INVITE_CODE` could not be verified or set for the same authentication reason.

### Helper Functions And Conventions For Step 2
- Reuse these helpers from `cloudflareworker/worker.js`:
  - `getBearerToken(request)`
  - `getSessionUser(request, env)`
  - `requireSessionUser(request, env, origin)`
  - `sha256Hex(text)`
  - `authUserPayload(user)`
- `getSessionUser(request, env)` expects a session bearer token and returns:
  - `{ user: { id, username }, session: { id, expiresAt }, tokenHash }`
  - or `null` when invalid.
- `requireSessionUser(request, env, origin)` returns the same session object on success.
- `requireSessionUser(request, env, origin)` returns `{ response }` on failure; callers should return `sessionUser.response`.
- Session token convention:
  - Client sends `Authorization: Bearer <raw-session-token>`.
  - D1 stores only `sessions.token_hash = sha256Hex(raw-session-token)`.
  - `sessions.expires_at`, `created_at`, and `revoked_at` are millisecond timestamps.
- User ID convention:
  - Authenticated user IDs are generated by `createUserId()` and currently look like `user_<uuid>`.
  - Step 2 should derive sync ownership from `sessionUser.user.id`, not from `url.searchParams.get('user_id')`.

### Step 2 Risks And Notes
- Sync isolation is not implemented yet. Legacy `/sync/*` still trusts the frontend-provided `user_id` after `AUTH_TOKEN`.
- Do not break the legacy `AUTH_TOKEN` path until the migration/admin compatibility behavior in Step 2 is explicitly implemented.
- Auth routes are before the global `AUTH_TOKEN` check. Step 2 should be careful when adding authenticated sync routes so session bearer tokens are not compared to `AUTH_TOKEN`.
- `ensureTables(env)` is still lazy; auth and sync routes create tables on demand. Step 2 can rely on the auth tables existing after any auth route has run, but should still call `ensureTables(env)` before D1 sync access.
- Production registration will return `403` until `REGISTRATION_INVITE_CODE` is configured as a Worker secret.
- Deployment still needs a valid Wrangler login or `CLOUDFLARE_API_TOKEN` before remote verification is possible.
