# Rebeca — geradoresdepalpites.com.br

Production web application for Cloudflare Worker `geradorrebeca`. The legacy Android source at the repository root is independent and remains available.

Visitors register with name and Brazilian mobile number and immediately receive a 90-day browser session. No password, payment or approval is required. The gold dashboard preserves the existing three generation modes, partner/group links and local generation history.

## Data and access

- D1 binding `DB`, dedicated database `geradorrebeca-cadastros`.
- `customers`: unique normalized phone, first submitted name, creation timestamp and privacy notice version.
- `sessions`: SHA-256 token digest, customer ID, name supplied in that browser and expiry. The random token is stored only in a Secure/HttpOnly/SameSite cookie.
- Name and phone are self-declared; registration is not verification of identity or phone ownership. Repeating a phone does not overwrite or reveal the previous name. Do not add sensitive account information or account recovery without independent verification.
- There is no public customer list/export API. Database administration requires the owner's authenticated Cloudflare account. Registration does not authorize outbound promotional messages.
- `/painel` and `/api/session` require a valid session. HTML and API responses are not cached. The replacement service worker removes the legacy offline cache and does not cache private data.
- Daily hashed connection buckets limit registration attempts to 20 per day. Expired sessions and buckets are removed on registration. No raw IP is saved.

## Verification

Node 24+ provides the SQLite test adapter. It executes the real migration and SQL, in memory only:

```sh
node --test web/worker.test.mjs
node web/browser-check.mjs /path/to/installed/playwright-core
wrangler deploy --dry-run --config web/wrangler.jsonc
```

Browser verification uses installed Chrome, a temporary local HTTP server, fictional input and an in-memory database. It checks registration, persistence, the secure session, all generator modes (20/25/1000 numbers), navigation, history, profile, logout and responsive widths. Screenshots are ignored under `web/qa-output`.

## Deployment

Use the owner's authenticated Wrangler; never add credentials to this repository:

```sh
wrangler d1 migrations apply geradorrebeca-cadastros --remote --config web/wrangler.jsonc
wrangler deploy --config web/wrangler.jsonc
```

The existing Cloudflare domain route remains `geradoresdepalpites.com.br`. The configuration retains existing variables; the only new resource binding is this dedicated D1 database. This change does not use the Caim/Mark billing or WhatsApp services.

Baseline for rollback: Worker version `a6221721-9dd9-4fda-9dde-83c0a8052ad4` (static site before registration). Rolling back to it restores the old public generator and removes the registration gate. Keep the D1 database intact so existing registrations are retained for a later forward deployment.

After publication, verify the landing page and public assets, the unauthenticated session response (401), redirect protection of `/painel`, the new service worker and the remote table structure. Do not generate real customer messages or payment requests to test this site.
