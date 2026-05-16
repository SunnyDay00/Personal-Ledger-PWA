# Step 3: Frontend Auth UI And Session Wiring

## Goal
Add frontend login/register state and UI, fixed sync endpoint usage, and session-token-based cloud requests while preserving guest local mode.

## Context
After Step 1 and Step 2, the Worker supports account sessions and authenticated sync. The frontend still asks users for a Worker endpoint, `AUTH_TOKEN`, and `syncUserId`. This step replaces that normal user flow with login/register against the fixed endpoint.

The fixed endpoint is:

```text
https://sync.sssr.edu.kg
```

## Files To Inspect
- `types.ts`
- `constants.ts`
- `contexts/AppContext.tsx`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `components/CloudSyncButton.tsx`
- `components/Layout.tsx`
- `App.tsx`
- `README.md`

## Files To Change
- `types.ts`
- `constants.ts`
- `contexts/AppContext.tsx`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `components/CloudSyncButton.tsx`
- Any small UI component needed for login/register if the existing component structure becomes too large.
- `README.md` if runtime behavior is changed during this step.

## Implementation Details
- Add a single source of truth for the sync endpoint:

```ts
export const FIXED_SYNC_ENDPOINT = 'https://sync.sssr.edu.kg';
```

- Do not allow normal users to edit the sync endpoint.
- Add frontend auth types:

```ts
export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt: number;
}

export type AuthMode = 'guest' | 'authenticated';
```

- Add auth fields to settings or a dedicated local auth storage row:
  - `authSession?: AuthSession`
  - `authMode?: AuthMode`
  - `legacySyncEndpoint?: string`
  - `legacySyncToken?: string`
  - `legacySyncUserId?: string`
- Prefer storing the session in IndexedDB settings so it survives reloads. Do not put it in source files.
- Add auth API service functions, either in a new `services/auth.ts` or in `services/d1Sync.ts`:
  - `register(username, password, inviteCode)`
  - `login(username, password)`
  - `logout(token)`
  - `getMe(token)`
- Update `pushToCloud`, `pullFromCloud`, version checks, and image upload/download/delete to:
  - Use `FIXED_SYNC_ENDPOINT`.
  - Use `Authorization: Bearer <session.token>`.
  - Stop requiring `syncEndpoint`, `syncToken`, or `syncUserId` for normal operation.
- Update onboarding:
  - Keep `创建新账本`.
  - Keep local JSON restore.
  - Add `登录` and `注册` for account cloud sync.
  - Add an explicit `暂不登录，本地使用` path.
- Update settings:
  - Replace `同步地址`、`AUTH_TOKEN`、`用户标识` inputs with account status.
  - Show logged-in username.
  - Provide login/register if guest.
  - Provide logout if authenticated.
  - Keep manual sync button only when authenticated.
  - Keep WebDAV settings unchanged.
- Logout behavior:
  - Call `/auth/logout` when possible.
  - Remove local session token.
  - Do not delete local ledger data automatically.
  - After logout, app remains usable in guest/local mode.
- Login behavior:
  - Save session.
  - Call `/auth/me` on app startup if a session exists.
  - If session is invalid or expired, clear session and remain in local mode.
- Sync dirty handling:
  - Auto D1 sync runs only when authenticated.
  - Guest mode still tracks local changes but does not attempt D1 sync.

## Acceptance Criteria
- A fresh user can choose local-only mode and create ledgers without logging in.
- A user can register with invite code and immediately be authenticated.
- A user can log in after reload and see account status in settings.
- `syncEndpoint`, `AUTH_TOKEN`, and `userId` are no longer normal user inputs.
- D1 sync and image requests use `https://sync.sssr.edu.kg` and session token.
- Invalid/expired session returns the app to guest mode without deleting local data.
- WebDAV backup still works.

## Commands
Run after implementing this step:

```bash
npm run build
```

If frontend behavior is tested locally:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Do Not
- Do not hardcode any user password, invite code, or session token.
- Do not remove local-only usage.
- Do not delete local IndexedDB data on logout.
- Do not expose the old Worker `AUTH_TOKEN` in UI or frontend constants.
- Do not remove WebDAV configuration or backup flows.

## Handoff To Step 4

### Files Modified In Step 3
- `types.ts`
- `constants.ts`
- `services/auth.ts`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `services/settingsUtils.ts`
- `contexts/AppContext.tsx`
- `components/AuthPanel.tsx`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `components/CloudSyncButton.tsx`
- `components/AddView.tsx`
- `README.md`
- `docs/auth-migration-plan/03-frontend-auth-ui.md`

`cloudflareworker/` was not modified in this step, so no Worker deploy was attempted.

### Fixed Sync Endpoint
- The single frontend constant is `FIXED_SYNC_ENDPOINT` in `constants.ts`.
- Current value:

```ts
export const FIXED_SYNC_ENDPOINT = 'https://sync.sssr.edu.kg';
```

- `services/auth.ts`, `services/d1Sync.ts`, `services/imageService.ts`, and settings UI all import this constant.

### Auth Types And Settings Fields
- `AuthUser`, `AuthSession`, and `AuthMode` are defined in `types.ts`.
- `AppSettings` now includes:
  - `authSession?: AuthSession`
  - `authMode?: AuthMode`
  - `legacySyncEndpoint?: string`
  - `legacySyncToken?: string`
  - `legacySyncUserId?: string`
- `DEFAULT_SETTINGS` in `constants.ts` initializes `authMode: 'guest'`, `authSession: undefined`, and empty `legacy*` fields.
- `normalizeAppSettings` in `services/settingsUtils.ts` clears expired local sessions and derives `authMode` from a usable `authSession`.

### Session Token Storage And Startup Validation
- The raw session token is stored locally in IndexedDB `settings` row `main`, field `settings.authSession.token`.
- It is not stored in source files and is removed from normal D1 settings sync payload by `withoutLocalAuthSecrets` in `contexts/AppContext.tsx`.
- On app startup, `validateStoredAuthSettings` in `contexts/AppContext.tsx` checks the saved session:
  - Missing or expired session -> clears `authSession` and sets `authMode: 'guest'`.
  - Valid-looking session -> calls `getMe(token)` (`GET /auth/me`) from `services/auth.ts`.
  - `401` from `/auth/me` -> clears session and remains guest/local.
  - Non-auth network errors keep the local session so offline startup does not delete credentials.

### Login, Register, Logout
- API wrappers live in `services/auth.ts`:
  - `register(username, password, inviteCode)` -> `POST /auth/register`
  - `login(username, password)` -> `POST /auth/login`
  - `logout(token)` -> `POST /auth/logout`
  - `getMe(token)` -> `GET /auth/me`
- App-level functions live in `contexts/AppContext.tsx`:
  - `registerAccount(username, password, inviteCode)`
  - `loginAccount(username, password)`
  - `logoutAccount()`
- Register/login save `authSession`, set `authMode: 'authenticated'`, reset `lastSyncVersion` to `0`, and mark sync dirty.
- Logout calls `/auth/logout` when a token exists, clears only the local session fields, and leaves local ledger data intact.

### D1 Sync And Image Service Credentials
- `services/d1Sync.ts` no longer accepts endpoint or userId for normal sync.
- D1 helpers now use `FIXED_SYNC_ENDPOINT` and the session token:
  - `pushToCloud(token, payload)` -> `POST /sync/push`
  - `pullFromCloud(token, since)` -> `GET /sync/pull?since=...`
  - `getCloudVersion(token)` -> `GET /sync/version`
- `contexts/AppContext.tsx` calls those helpers with `settings.authSession.token` only when `authMode === 'authenticated'`.
- Sync payload rows no longer send frontend `user_id`; Worker derives user identity from the session.
- `services/imageService.ts` uses `FIXED_SYNC_ENDPOINT` and `settings.authSession.token` for:
  - `POST /upload/image`
  - `GET /image/:key`
  - `DELETE /image/:key`
- Clipboard image attachments now use `imageService.saveLocalImage` in `components/AddView.tsx` so guest/local image capture still works and authenticated sync uploads pending images later.

### Guest / Local Mode
- Guest/local mode is determined by:

```ts
settings.authMode !== 'authenticated' || !settings.authSession?.token
```

- Auto D1 sync, version polling, manual D1 sync, D1 restore, and remote image sync require an authenticated session.
- Guest mode still writes ledger data, image cache, pending image uploads, and sync queue entries locally.
- Guest mode does not delete local data and does not attempt D1 sync.

### Old Sync Fields
- `syncEndpoint`, `syncToken`, and `syncUserId` still exist in `AppSettings` and `DEFAULT_SETTINGS`.
- They are not used for normal D1 sync, version checks, image upload/download/delete, onboarding, or normal settings UI.
- They are retained only for Step 4 migration compatibility.
- New `legacySyncEndpoint`, `legacySyncToken`, and `legacySyncUserId` fields exist but Step 3 does not populate or migrate old values into them.
- `withoutLocalAuthSecrets` excludes `authSession`, `authMode`, old sync fields, and `legacy*` sync fields from the authenticated settings payload sent to D1.

### README Updates
- README now documents the fixed frontend sync endpoint `https://sync.sssr.edu.kg`.
- README now says ordinary users log in or register in the app instead of entering Worker URL, `AUTH_TOKEN`, or `userId`.
- README documents local IndexedDB session storage and startup `/auth/me` validation.
- README keeps WebDAV backup documentation intact.
- README still documents `AUTH_TOKEN` only for legacy/admin Worker paths.

### Build Result
- Command run:

```bash
npm run build
```

- Result: passed.
- TypeScript compile, Vite production build, and PWA service worker generation completed successfully.

### Step 4 Reuse Points
- Reuse `FIXED_SYNC_ENDPOINT` from `constants.ts`; do not introduce another endpoint constant.
- Reuse `AuthSession`, `AuthUser`, `AuthMode`, and `AppSettings.authSession/authMode` from `types.ts`.
- Reuse `loginAccount`, `registerAccount`, `logoutAccount`, `restoreFromD1`, `manualCloudSync`, and `triggerCloudSync` from `contexts/AppContext.tsx`.
- Reuse `pushToCloud(token, payload)`, `pullFromCloud(token, since)`, and `getCloudVersion(token)` from `services/d1Sync.ts`.
- Reuse `imageService.syncPendingImages`, `uploadImageWithKey`, `fetchImageBlob`, and `deleteRemoteImage`; they already resolve endpoint/token from fixed endpoint plus current session.
- Step 4 migration should populate or consume `legacySyncEndpoint`, `legacySyncToken`, and `legacySyncUserId` from old `syncEndpoint`, `syncToken`, and `syncUserId` without re-enabling those old fields for normal sync.
- Step 4 should preserve `authSession`, local ledgers/categories/groups/transactions/images, pending uploads, sync queue, backup logs, WebDAV settings, and `isFirstRun`.
