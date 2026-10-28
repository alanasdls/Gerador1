# Rebeca — geradoresdepalpites.com.br

Production web application for Cloudflare Worker `geradorrebeca`. The legacy Android source at the repository root is independent and remains available.

Visitors register with name and Brazilian mobile number and immediately receive a 90-day browser session. No password, payment or approval is required. The gold dashboard includes Delamark's methods with Rebeca branding, except Cruz: Normal/Tiro Seco/Bicho Fechado (1–100 numbers, up to five groups), lines and progressive sums, results, delayed animals, a searchable 25-animal pulling table, dreams and horoscope. Partner/group links and local generation history are preserved.

## Methods and sources

- All `/api/metodos/*` routes require the existing session. Research POSTs also require same-origin requests and are limited to 10 per connection per minute using a hashed bucket.
- Results come from the same public result API as Delamark. Dates, times and Federal/Rio separation are validated; the seventh prize remains three digits.
- Lines and sums use the same latest first prize from the results API, independently of WhatsApp sending. The dedicated bridge reads consistent historical counters and their completion marker, then applies only newer API results in memory. Repeated requests and the collector catching up do not count the same draw twice. A line's delay is the minimum extraction delay of its five groups, measured in the first prize. The screen identifies the source result and next draw.
- Automatic analysis refresh runs every **five minutes**, only while the analysis view and browser tab are visible. Returning early does not make another request. Returning after five minutes refreshes once. Manual refresh and selecting another lottery fetch immediately and restart the five-minute timer. Errors/timeouts preserve explicitly labeled previous analysis and retry on the same interval; a bank change or authentication failure clears it. Historical sum selection stays selected while the current line advances.
- The bridge runs independently on loopback port 8801 and accepts only a fixed lottery list. It reads `delayed_animal_state`, `delayed_processed_draws`, `result_lottery_times` and fixed API endpoints. Concurrent requests for one bank share a calculation. It exposes no credentials, customers, tenant data or database query capability. `REBECA_ANALYSIS_KEY` is a Worker secret; `/etc/rebeca-methods/config.json` holds the matching VPS key. Existing database credentials remain on the VPS. No database writes or message sends occur during analysis.
- `bridge/core.mjs` and `bridge/source.mjs` are pinned copies of the validated Delamark calculation from commit `6e63975`, deployed separately for Rebeca. Incomplete/concurrently updating history or a conflicting baseline suppresses the line instead of showing an incorrect counter. Date rollover is handled in São Paulo time.
- Delayed animals are parsed from Bicho Certo, requiring all 25 groups. These delays are in days, distinct from the extraction-based line ranking.
- Dreams and horoscope reuse Delamark's symbolic reading and random 25-number generation, with public research from Personare, Astrolink and Astrocentro. Sign readings consult Astrolink directly. Dreams search through DuckDuckGo, with the public Personare dream guide and its actual article links as fallback. A general reading is labeled when no specific entry matches. Registration details are never sent to search. If sources are unavailable, the UI reports the failure instead of inventing sources.
- Federal uses the official CAIXA contest API directly in the authenticated Worker through `bridge/federal.mjs`, independently of Rio and the VPS counters. Its dedicated `FEDERAL_HISTORY` KV binding stores public official records shared with Delamark. The verified initial snapshot contains 105 consecutive contests (6112 through 6008), sufficient for all 25 animals' exact first-prize extraction delays. Each request checks the latest official contest and recomputes delays from records; new contests and latest-result corrections are persisted without incrementing counters twice. History gaps are backfilled by previous-contest IDs, at most eight new reads per request, and suppress the line until complete. Only public lottery results are stored. The screen shows contest/date, with no invented time or next-date schedule. A date without a Federal result is not replaced with a Rio result. Retain the KV binding on deployment; no new secret or VPS change is needed. Rollback Worker: `34a81d84-cb2b-44b6-9b36-98e2070f8479`. Do not delete shared KV when rolling back one site.
- Capital (`capital-v3`) is available in Linhas e somas and Resultados. Its 10h/11h/13h/14h/16h/18h/20h/22h V3 source (no 11h on Sundays) is distinct from LT Capital (:40). `bridge/capital.mjs` runs inside the authenticated Worker and reconstructs delays from consecutive V3 first prizes, scanning at most 45 previous days until all 25 animals have appeared. Missing draws suppress the ranking. Complete historical days use a 24-hour memory/Cloudflare cache; the current day is fetched each time. The existing five-minute visible-screen interval applies. There is no separate day-delay source for Capital, so it is not offered under Bichos atrasados. No VPS update, database write, secret or migration is required. Worker rollback before Capital: `b6d7c5d0-e464-4d46-88d1-9393aaa98c03`.
- The pulling table is rendered as searchable text, using the supplied Delamark associations without displaying his branding.

## Data and access

- D1 binding `DB`, dedicated database `geradorrebeca-cadastros`.
- `customers`: unique normalized phone, first submitted name, creation timestamp and privacy notice version.
- `sessions`: SHA-256 token digest, customer ID, name supplied in that browser and expiry. The random token is stored only in a Secure/HttpOnly/SameSite cookie.
- Name and phone are self-declared; registration is not verification of identity or phone ownership. Repeating a phone does not overwrite or reveal the previous name. Do not add sensitive account information or account recovery without independent verification.
- There is no public customer list/export API. The authorized administrator can view names and phones through the protected `/api/admin/clientes` endpoint. Registration does not authorize outbound promotional messages.
- `/painel` and `/api/session` require a valid session. HTML and API responses are not cached. The replacement service worker removes the legacy offline cache and does not cache private data.
- Daily hashed connection buckets limit registration attempts to 20 per day. Expired sessions and buckets are removed on registration. No raw IP is saved.

## Administrator

The owner assigned phone `5511998909994` to view Rebeca registrations. Ordinary name/phone registration never grants administrative access, even when that number is entered. It only shows a **Clientes cadastrados** menu link to `/administracao`.

The owner receives a random, single-use setup link with the invitation in the URL fragment, not the HTTP request. The administrator enters the authorized phone and creates a 12–128 character password. The server checks the invitation against `REBECA_ADMIN_SETUP_HASH`; an atomic insert prevents the invite from replacing a configured password. Only the invitation digest is stored on the Worker. Never commit or log invitations, passwords or secrets.

Passwords use salted PBKDF2-SHA-256 (100,000 iterations supported by Workers), with an independent HMAC pepper (`REBECA_ADMIN_PEPPER`) stored as a Worker secret. Admin sessions are independent random tokens, hashed in D1, with an eight-hour Secure/HttpOnly/SameSite=Strict cookie. Login and setup are limited to eight attempts per connection per 15 minutes. POSTs enforce same-origin requests. Admin logout, ordinary logout and a new ordinary registration revoke the current administrative session. Do not rotate the pepper after setup without an explicit credential recovery plan.

The private API checks authorization on every request and returns only names and phones, 50 rows per page, with search and no-store headers. The UI clears rows on logout and browser history restoration and does not store contact lists locally. `0002_admin.sql` adds only credentials/session tables; it does not modify customer records. Initial setup and later login are also available directly at `/administracao`, without creating a normal registration.

## Verification

Node 24+ provides the SQLite test adapter. It executes the real migration and SQL, in memory only:

```sh
node --test web/worker.test.mjs web/methods.test.mjs web/admin.test.mjs
node --test web/bridge/core.test.mjs
node --test web/bridge/capital.test.mjs
node --test web/bridge/federal.test.mjs
node web/browser-check.mjs /path/to/installed/playwright-core
node web/analysis-refresh.browser.mjs /path/to/installed/playwright-core
wrangler deploy --dry-run --config web/wrangler.jsonc
```

Browser verification uses installed Chrome, a temporary local HTTP server, fictional input, source fixtures and an in-memory database. It checks registration, persistence, the secure session, all generator modes, all six method pages, copying, navigation, admin setup/login, protected contacts, search, pagination, logout and four responsive widths. Screenshots are ignored under `web/qa-output`. Live sources need a separate smoke check after deployment.

## Deployment

Use the owner's authenticated Wrangler; never add credentials to this repository:

```sh
wrangler d1 migrations apply geradorrebeca-cadastros --remote --config web/wrangler.jsonc
wrangler deploy --config web/wrangler.jsonc
```

The existing Cloudflare domain route remains `geradoresdepalpites.com.br`. The configuration retains existing variables. The methods change requires no migration or customer-data modification. Install the isolated bridge and set `REBECA_ANALYSIS_KEY` before publishing the Worker. The guarded `bridge/install.py` is for the initial installation only; it backs up the Nginx config and adds an exact `/rebeca/historico` route. This change does not restart or modify the Caim/Mark billing or WhatsApp services.

For the API-analysis update, deploy `bridge/core.mjs`, `bridge/source.mjs` and `bridge/server.mjs` into `/opt/rebeca-methods`, back up the previous server and restart only `rebeca-methods`. No new secret is required. `bridge/preview.mjs` validates public analysis values before activation. Worker rollback version: `8eca736c-810d-4404-bb4d-dc911e5b7f6e`; service backup: `/opt/rebeca-methods/releases/before-api-analysis-20261028`. Caim and Delamark deployments are outside this change.

Baseline for methods rollback: Worker version `d9a9f762-f24f-46b2-be8c-2965fb3b5842` (registration and original gold dashboard). Keep the D1 database intact so existing registrations are retained.

Baseline for administrator rollback: `6fcc2d4f-964e-484e-8040-e23a49b00b04` (all methods, no web administrator). Apply migration 0002 and configure both admin secrets before deploying. The administration change does not modify or restart VPS services.

After publication, verify the landing page and public assets, the unauthenticated session response (401), redirect protection of `/painel`, the new service worker and the remote table structure. Do not generate real customer messages or payment requests to test this site.
