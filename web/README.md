# Rebeca — geradoresdepalpites.com.br

Production web application for Cloudflare Worker `geradorrebeca`. The legacy Android source at the repository root is independent and remains available.

Visitors register with name and Brazilian mobile number and immediately receive a 90-day browser session. No password, payment or approval is required. The gold dashboard includes Delamark's methods with Rebeca branding, except Cruz: Normal/Tiro Seco/Bicho Fechado (1–100 numbers, up to five groups), lines and progressive sums, results, delayed animals, a searchable 25-animal pulling table, dreams and horoscope. Partner/group links and local generation history are preserved.

## Methods and sources

- All `/api/metodos/*` routes require the existing session. Research POSTs also require same-origin requests and are limited to 10 per connection per minute using a hashed bucket.
- Results come from the same public result API as Delamark. Dates, times and Federal/Rio separation are validated; the seventh prize remains three digits.
- Lines use the shared lottery history (`delayed_animal_state`) through the dedicated authenticated `bridge` service, not Mark's publications. The delay of a line is the minimum extraction delay of its five groups, measured in the first prize. Sums display the exact source draw separately.
- The bridge runs independently on loopback port 8801; it accepts only a fixed lottery list and returns five aggregate lines. It exposes no credentials, customers, tenant data or database query capability. `REBECA_ANALYSIS_KEY` is a Worker secret; `/etc/rebeca-methods/config.json` holds the matching VPS key. Existing database credentials remain on the VPS.
- Delayed animals are parsed from Bicho Certo, requiring all 25 groups. These delays are in days, distinct from the extraction-based line ranking.
- Dreams and horoscope reuse Delamark's symbolic reading and random 25-number generation, with public research from Personare, Astrolink and Astrocentro. Sign readings consult Astrolink directly. Dreams search through DuckDuckGo, with the public Personare dream guide and its actual article links as fallback. A general reading is labeled when no specific entry matches. Registration details are never sent to search. If sources are unavailable, the UI reports the failure instead of inventing sources.
- The global source currently has no separate Federal line history; the page explicitly reports that limitation. An empty Federal result day is not replaced with a Rio result.
- The pulling table is rendered as searchable text, using the supplied Delamark associations without displaying his branding.

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
node --test web/worker.test.mjs web/methods.test.mjs
node web/browser-check.mjs /path/to/installed/playwright-core
wrangler deploy --dry-run --config web/wrangler.jsonc
```

Browser verification uses installed Chrome, a temporary local HTTP server, fictional input, source fixtures and an in-memory database. It checks registration, persistence, the secure session, all generator modes, all six method pages, copying, date and lottery changes, navigation, history, profile, logout and four responsive widths. Screenshots are ignored under `web/qa-output`. Live sources need a separate smoke check after deployment.

## Deployment

Use the owner's authenticated Wrangler; never add credentials to this repository:

```sh
wrangler d1 migrations apply geradorrebeca-cadastros --remote --config web/wrangler.jsonc
wrangler deploy --config web/wrangler.jsonc
```

The existing Cloudflare domain route remains `geradoresdepalpites.com.br`. The configuration retains existing variables. The methods change requires no migration or customer-data modification. Install the isolated bridge and set `REBECA_ANALYSIS_KEY` before publishing the Worker. The guarded `bridge/install.py` is for the initial installation only; it backs up the Nginx config and adds an exact `/rebeca/historico` route. This change does not restart or modify the Caim/Mark billing or WhatsApp services.

Baseline for methods rollback: Worker version `d9a9f762-f24f-46b2-be8c-2965fb3b5842` (registration and original gold dashboard). Keep the D1 database intact so existing registrations are retained.

After publication, verify the landing page and public assets, the unauthenticated session response (401), redirect protection of `/painel`, the new service worker and the remote table structure. Do not generate real customer messages or payment requests to test this site.
