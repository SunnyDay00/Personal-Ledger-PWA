# Step 5: Settings Cleanup, README, And Deployment Notes

## Goal
Clean up user-facing settings and documentation so they match the implemented login-based sync architecture.

## Context
Steps 1 through 4 changed runtime behavior. This step makes sure the app no longer explains or exposes the old normal-user setup flow and that project documentation reflects the current implementation.

## Files To Inspect
- `README.md`
- `components/SettingsView.tsx`
- `components/OnboardingView.tsx`
- `components/CloudSyncButton.tsx`
- `constants.ts`
- `types.ts`
- `cloudflareworker/wrangler.toml`
- `cloudflareworker/worker.js`

## Files To Change
- `README.md`
- `components/SettingsView.tsx`
- `components/OnboardingView.tsx` if text or flow cleanup is still needed.
- `components/CloudSyncButton.tsx` if status messaging still refers to missing endpoint/token.
- `constants.ts` if old sync defaults remain exposed.
- `types.ts` if old active settings fields are now legacy-only.

Do not change Worker sync logic in this step unless a documentation mismatch exposes a small bug.

## Implementation Details
- Settings page:
  - Remove or hide normal-user inputs for:
    - Worker sync address
    - `AUTH_TOKEN`
    - manual `userId`
  - Show account status instead:
    - guest/local mode
    - logged-in username
    - session status if available
    - login/register actions for guest mode
    - logout action for authenticated mode
  - Keep manual sync button visible only when authenticated.
  - Keep database usage stats only if it can work safely without exposing Cloudflare account API tokens to normal users. If not, move it to an advanced/admin-only section.
  - Keep WebDAV backup controls unchanged.
- Cloud sync status text:
  - Guest: local only.
  - Authenticated syncing: syncing.
  - Authenticated success: synced.
  - Authenticated error: show last sync error.
  - Pending local changes: show pending count.
- README:
  - Update the Cloudflare sync section to describe:
    - Fixed endpoint `https://sync.sssr.edu.kg`
    - Invite-code registration
    - Username/password login
    - Session-token sync
    - Per-user data isolation
    - Guest local mode
    - Legacy migration from `AUTH_TOKEN + userId`
  - Update deployment requirements:
    - D1 binding `DB`
    - KV binding `SYNC_KV`
    - R2 binding `IMAGES_BUCKET`
    - Secret `REGISTRATION_INVITE_CODE`
    - Old secret `AUTH_TOKEN` only if still required for legacy migration/admin compatibility.
  - Keep README aligned with actual implemented code. Do not describe features that are still only planned.
- Deployment:
  - If `cloudflareworker/` was modified in the current step or earlier un-deployed changes exist, deploy the Worker.
  - Use the required Worker name `personal-ledger-sync`.

## Acceptance Criteria
- Normal users are no longer asked for Worker address, `AUTH_TOKEN`, or manual `userId`.
- The fixed endpoint is documented as `https://sync.sssr.edu.kg`.
- README accurately describes current login behavior and current deployment commands.
- README still documents local-only usage and WebDAV backup.
- `npm run build` passes.
- Worker deployment succeeds if `cloudflareworker/` changed.

## Commands
Run after implementing this step:

```bash
npm run build
```

If Worker code or config changed:

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

Optional secret setup:

```bash
npx wrangler secret put REGISTRATION_INVITE_CODE --config cloudflareworker/wrangler.toml
```

## Do Not
- Do not leave README describing the old setup as the primary sync path.
- Do not remove local-only usage from README.
- Do not document planned behavior as already complete.
- Do not expose Cloudflare account API tokens or Worker global secrets in frontend UI.
- Do not change sync data ownership rules in this cleanup step.

## Handoff To Step 6

### Files Modified In Step 5
- `README.md`
- `components/SettingsView.tsx`
- `components/OnboardingView.tsx`
- `components/CloudSyncButton.tsx`
- `constants.ts`
- `types.ts`
- `docs/auth-migration-plan/05-settings-and-docs.md`

`cloudflareworker/` was not edited in Step 5, but `cloudflareworker/worker.js` was already modified in the worktree, so deploy was attempted as required.

### Settings Page Cleanup
- No normal-user input remains for Worker sync address.
- No normal-user input remains for `AUTH_TOKEN`.
- No normal-user input remains for manual `userId`.
- The cloud sync section now shows fixed endpoint `https://sync.sssr.edu.kg`, logged-in username, session expiry, logout, legacy migration status, and authenticated-only manual sync/test/settings controls.
- Guest users see the login/register panel and a local-mode note.
- Legacy migration copy no longer exposes the old secret name in the settings UI; it refers to "旧版云同步配置/旧版云端数据" instead.
- WebDAV backup controls were kept unchanged.

### Onboarding And Sync Button Copy
- Onboarding still offers creating a local ledger, login, invite-code registration, local JSON restore, and local-only use.
- The login/register onboarding copy now says data syncs to the user's private account instead of asking for a Worker URL or legacy credentials.
- The migration progress copy now says it is migrating local and legacy cloud data.
- `CloudSyncButton` now provides status text through `title`/`aria-label`, and the settings page variant displays the label:
  - guest/local mode: data stays on this device
  - authenticated syncing: 正在同步
  - authenticated success: 已同步
  - authenticated error: includes `lastSyncError`
  - pending local changes: shows pending count

### README Updates
- Cloudflare sync now documents fixed endpoint `https://sync.sssr.edu.kg`.
- README documents invite-code registration, username/password login, local IndexedDB session storage, and session-token sync.
- README explains per-user data isolation through D1 session-derived `user_id` and R2 `users/<user_id>/...` keys.
- README keeps guest/local mode and WebDAV backup documentation.
- README documents legacy migration from old `AUTH_TOKEN + userId` settings into the logged-in account.
- Deployment notes now list required bindings `DB`, `SYNC_KV`, `IMAGES_BUCKET`, required secret `REGISTRATION_INVITE_CODE`, and optional `AUTH_TOKEN` only for legacy/admin compatibility.
- Security notes now state the normal UI does not expose Worker address, `AUTH_TOKEN`, or manual `userId` inputs.

### Current User-Visible Flow
- New or guest user can create a ledger and stay local; data remains in the browser IndexedDB and D1 sync is not attempted.
- User can log in or register with an invite code from onboarding or Settings > Cloud sync and backup.
- After login, the existing local data is preserved, queued, and synced into the authenticated private account.
- If legacy sync credentials are detected internally, login triggers best-effort legacy cloud pull and merge before pushing into the new account.
- Manual cloud sync is available only after authentication.
- WebDAV backup remains a separate user-configured backup path.

### Remaining User-Visible Legacy Entrypoints
- No active settings, onboarding, or cloud-sync button UI exposes `AUTH_TOKEN`, `syncEndpoint`, or `syncUserId` as an input.
- README intentionally mentions those names only for deployment, compatibility, and migration documentation.
- Internal migration fields remain in `types.ts`, `constants.ts`, settings normalization, and account takeover code.
- `components/UsageStatsModal.tsx` still contains old `endpoint/token/userId` props, but it is not imported or reachable from `SettingsView.tsx` and has no active user-visible entry.

### Build Result
- Command run: `npm run build`
- Result: passed.
- TypeScript compile, Vite production build, and PWA service worker generation completed successfully.

### Worker Deploy
- Command attempted: `npx wrangler deploy --config cloudflareworker/wrangler.toml`
- Result: failed before upload.
- Wrangler error: non-interactive environment requires `CLOUDFLARE_API_TOKEN`; current environment failed to fetch an auth token with `400 Bad Request`.
- No Worker deploy was completed in Step 5.

### Step 6 Risk Points
- Verify the settings page in guest and authenticated states, especially that manual sync and connection test are authenticated-only.
- Verify the sync button title/visible label across local mode, syncing, pending, success, and error states.
- Verify old settings with `syncEndpoint`, `syncToken`, and `syncUserId` still migrate internally even though the UI no longer exposes those fields.
- Verify the unused `UsageStatsModal` is either intentionally kept unreachable or removed/moved to an explicit admin-only path in a future cleanup.
- Re-run Worker deploy from an environment with `CLOUDFLARE_API_TOKEN` before considering cloud Worker changes released.
