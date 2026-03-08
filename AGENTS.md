# Project Instructions

## Documentation

- When changing project features, behavior, workflows, deployment steps, or architecture, update `README.md` in the same turn.
- Keep `README.md` aligned with the current implementation. Do not leave functional changes undocumented.

## Cloudflare Worker

- Files under `cloudflareworker/` are the Cloudflare Worker side of this project.
- If `cloudflareworker/` code or configuration is modified, deploy the Worker after the change in the same turn when possible.
- Use the Worker name `personal-ledger-sync`.
- Deploy with:
  - `npx wrangler deploy --config cloudflareworker/wrangler.toml`

## Git

- Git commit messages for this repository must be written in Chinese.
