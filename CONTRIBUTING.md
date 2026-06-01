# Contributing

Thank you for considering a contribution to Personal Ledger PWA. This project handles personal finance data, so small, focused changes with clear validation are preferred.

## Install Dependencies

Use the lockfile for reproducible installs:

```bash
npm ci
```

For local iterative development, `npm install` is also acceptable:

```bash
npm install
```

## Run The Development Server

```bash
npm run dev
```

The default local URL is:

```text
http://localhost:3000
```

## Build

```bash
npm run build
```

The build output is written to `dist/`.

## Submitting Issues

When opening an issue:

- Describe the problem or requested improvement clearly.
- Include the affected flow, such as local records, WebDAV backup, Cloudflare sync, image attachments, import/export, PWA install, Android, or iOS.
- Include reproduction steps when reporting a bug.
- Use synthetic sample data. Do not attach real ledger exports or screenshots with private finance details.

For security issues, follow [SECURITY.md](SECURITY.md) instead of posting sensitive details publicly.

## Submitting Pull Requests

Before opening a pull request:

- Keep the change focused and avoid unrelated refactors.
- Do not change dependency versions unless the PR is specifically about dependency maintenance.
- Do not change core business logic when the PR is only about documentation, metadata, or repository hygiene.
- Update `README.md` when changing features, behavior, workflows, deployment steps, or architecture.
- Run `npm run build` and include the result in the PR.

## Code Style

- Use TypeScript and React patterns already present in the repository.
- Prefer clear, explicit data handling over broad abstractions.
- Keep UI copy and behavior consistent with the existing app.
- Avoid storing secrets, credentials, or generated private data in source files.
- Do not introduce new dependencies without a clear reason.

## Security-Sensitive Changes

Security-related PRs should explain:

- What data or trust boundary is affected.
- Whether the change affects IndexedDB/local storage, WebDAV credentials, Cloudflare Worker APIs, D1/KV/R2, image attachments, service worker caching, import/export, or logging.
- What manual or automated checks were performed.

Never commit:

- Real ledger data or exported backups.
- WebDAV URLs with private paths, usernames, passwords, or app passwords.
- Cloudflare API tokens, account IDs intended to remain private, database dumps, R2 object data, or Wrangler auth files.
- Session tokens, invite codes, `.env` files, `.dev.vars`, or local debug secrets.
