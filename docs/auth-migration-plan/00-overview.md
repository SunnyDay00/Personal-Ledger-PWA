# Step 0: Overall Auth Migration Overview

## Goal
Create the decision-complete implementation map for upgrading Personal Ledger PWA from manual `AUTH_TOKEN + userId` cloud sync to fixed-domain login-based multi-user sync.

The fixed sync endpoint is:

```text
https://sync.sssr.edu.kg
```

## Context
The current application is local-first. Local data is stored in IndexedDB through Dexie, and optional Cloudflare sync is configured by entering a Worker endpoint, `AUTH_TOKEN`, and `syncUserId` in the app.

The target architecture keeps local-first behavior and offline use, but changes cloud sync so each authenticated account has private isolated data:

- Guest/local mode remains available without login.
- Registration is limited to fixed small-scale users through an invite code.
- Login returns a session token.
- The frontend uses the fixed endpoint `https://sync.sssr.edu.kg`.
- The frontend must not expose or ask normal users for the Worker global `AUTH_TOKEN`.
- The Worker derives `user_id` from the authenticated session, not from frontend query parameters.
- Existing old data is migrated into the first logged-in account instead of being discarded.

## Files To Inspect
- `README.md`
- `types.ts`
- `constants.ts`
- `contexts/AppContext.tsx`
- `services/db.ts`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `components/CloudSyncButton.tsx`
- `cloudflareworker/worker.js`
- `cloudflareworker/wrangler.toml`

## Files To Change
This overview file changes no runtime code. Follow the step files in order:

1. `01-worker-auth.md`
2. `02-worker-sync-isolation.md`
3. `03-frontend-auth-ui.md`
4. `04-frontend-sync-migration.md`
5. `05-settings-and-docs.md`
6. `06-final-verification.md`

## Implementation Details
- Do not skip steps. Later steps assume earlier database tables, Worker auth helpers, and frontend session types exist.
- Use Cloudflare Worker + D1 for auth state. Do not add a separate backend service.
- Keep WebDAV backup behavior separate from account login unless a later explicit requirement changes it.
- Keep JSON/CSV import and export working for both guest mode and authenticated mode.
- Do not implement shared or family ledgers in this migration. All account data is private per user.
- Treat `https://sync.sssr.edu.kg` as the only production sync endpoint exposed to users.
- Keep the old `AUTH_TOKEN + syncUserId` path only as a controlled migration/admin compatibility path where explicitly required by the migration step.

## Acceptance Criteria
- The repository contains all step files in `docs/auth-migration-plan/`.
- Each step file is self-contained enough that a new AI coding window can inspect it and execute that step without needing prior chat history.
- Every step states goal, context, files to inspect, files to change, implementation details, acceptance criteria, commands, and do-not rules.
- The plan preserves existing local-first behavior while introducing authenticated multi-user sync.

## Commands
For this planning step only:

```bash
git status --short
```

Runtime implementation steps will provide their own commands.

## Do Not
- Do not change application runtime behavior in this overview step.
- Do not remove existing local data migration code.
- Do not remove WebDAV backup.
- Do not document the future login behavior in `README.md` as if it already exists before implementing it.

## Handoff To Step 1

### Current Repository Status
- Current branch status checked with `git status --short --branch`: `main...origin/main`.
- The auth migration plan files under `docs/auth-migration-plan/` are currently untracked in git, including `00-overview.md` through `06-final-verification.md`.
- No runtime source files were changed in Step 0. `cloudflareworker/` was inspected only by file listing and was not modified.
- Key project structure confirmed:
  - Frontend entry/config: `App.tsx`, `index.tsx`, `constants.ts`, `types.ts`, `vite.config.ts`, `package.json`
  - App state and data services: `contexts/AppContext.tsx`, `services/db.ts`, `services/d1Sync.ts`, `services/imageService.ts`, `services/webdav.ts`
  - User-facing sync/settings UI: `components/OnboardingView.tsx`, `components/SettingsView.tsx`, `components/CloudSyncButton.tsx`, `components/Layout.tsx`
  - Worker side: `cloudflareworker/worker.js`, `cloudflareworker/wrangler.toml`

### Confirmed Step Order And Dependencies
- Step 1 `01-worker-auth.md`: add Worker auth tables, password hashing, sessions, and `/auth/*` routes while keeping existing sync behavior.
- Step 2 `02-worker-sync-isolation.md`: depends on Step 1 session helpers and changes sync/image ownership to authenticated user isolation.
- Step 3 `03-frontend-auth-ui.md`: depends on Steps 1 and 2 so the frontend can call fixed-domain session auth and authenticated sync.
- Step 4 `04-frontend-sync-migration.md`: depends on Step 3 session wiring and Step 2 legacy/admin compatibility path if old cloud data must be pulled.
- Step 5 `05-settings-and-docs.md`: depends on Steps 1 through 4 being implemented so settings and README describe actual behavior only.
- Step 6 `06-final-verification.md`: depends on all previous steps and should verify build, auth, isolation, migration, logout, and documentation.
- The fixed production sync endpoint for this migration is `https://sync.sssr.edu.kg`. Do not expose an editable normal-user sync endpoint in later steps.

### Files Step 1 Must Read
- `AGENTS.md`
- `docs/auth-migration-plan/00-overview.md`
- `docs/auth-migration-plan/01-worker-auth.md`
- `cloudflareworker/worker.js`
- `cloudflareworker/wrangler.toml`
- `README.md`

### Scope Step 1 Should Not Modify
- Do not modify frontend UI or frontend sync call sites in Step 1: `components/`, `contexts/`, `services/d1Sync.ts`, `services/imageService.ts`, `types.ts`, or `constants.ts`.
- Do not implement Step 2 sync ownership isolation yet.
- Do not remove the old `AUTH_TOKEN` compatibility path yet.
- Do not change WebDAV backup behavior.
- Do not edit `README.md` unless Step 1 actually changes runtime Worker behavior in the same turn; if it does, keep README limited to implemented behavior only.

### Risks And Notes
- `REGISTRATION_INVITE_CODE` must exist as a Worker secret before deployed registration can succeed.
- Step 1 modifies `cloudflareworker/`; per `AGENTS.md`, deploy with `npx wrangler deploy --config cloudflareworker/wrangler.toml` after the change when possible.
- Step 1 must keep `/health` public and avoid breaking existing `/sync/*`, `/image/*`, `/usage`, and WebDAV proxy behavior because frontend changes are intentionally delayed until Step 3.
- Passwords must use WebCrypto PBKDF2-SHA-256 with per-user salt and stored hashes only; do not store password-equivalent values.
- Session tokens must be opaque random values; store only their SHA-256 hashes in D1.
- Several later-step Chinese UI strings in the plan files appear mojibake in the current docs. Later implementation should use the existing app language/style and avoid copying garbled text directly into UI.
