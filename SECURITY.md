# Security Policy

## Supported Versions

Personal Ledger PWA is an early-stage public repository. Security review and fixes are focused on the current `main` branch unless a maintained release branch is explicitly documented later.

| Version | Supported |
| --- | --- |
| Current `main` | Yes |
| Older branches or tags | Best effort |

## Reporting A Vulnerability

Please do not publish sensitive vulnerability details in a public issue.

If GitHub Security Advisories are available for this repository, use a private security advisory so details can be discussed before disclosure. If private advisories are not available, open a public issue with a non-sensitive summary only, such as the affected area and impact category, and avoid including exploit details, credentials, tokens, private URLs, exported ledger data, or screenshots containing personal finance records.

Useful initial report details include:

- Affected area, such as local storage, WebDAV backup, Cloudflare sync, image attachment handling, or PWA caching.
- Expected behavior and observed behavior.
- Whether the issue requires authentication or local device access.
- Minimal reproduction steps without real personal data or secrets.
- Suggested mitigation, if known.

## Security Scope

Security reports are especially useful for:

- Personal finance data confidentiality and integrity.
- IndexedDB and local storage behavior.
- WebDAV credentials and backup/restore flows.
- Cloudflare Worker APIs, authentication, authorization, and session handling.
- D1, KV, and R2 storage isolation.
- Image attachment upload, caching, retrieval, and deletion.
- PWA and service worker cache behavior.
- Import/export flows that could expose sensitive records.
- Logging or error handling that could leak private data.

## Out Of Scope

The following are usually out of scope unless they create a concrete security impact in this project:

- Issues that require a fully compromised user device.
- Generic browser, operating system, or WebDAV provider vulnerabilities.
- Denial-of-service reports without a realistic impact path.
- Reports based only on missing security headers in a local development server.

## Handling Sensitive Data

Do not include real ledger data, production tokens, WebDAV passwords, Cloudflare API tokens, invite codes, session tokens, database dumps, or private attachment images in reports. Use synthetic examples and redact anything sensitive.
