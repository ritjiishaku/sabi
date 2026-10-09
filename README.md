# Sabi CMS

A self-hosted, multi-client content CMS with a read-only REST API. Each client
gets a login to manage their own site's content; any website consumes that
content through a stable, string-only JSON contract. The first integration is
**Gift by VF**. See [`PRD.md`](./PRD.md) for the full product spec and
[`DESIGN.md`](./DESIGN.md) for the design-token system.

- **Runtime:** Node.js + Express, no build step
- **Database:** SQLite (`better-sqlite3`, WAL)
- **Admin UI:** vanilla HTML/CSS/JS served by Express
- **Auth:** bcrypt password hashes + HMAC-signed HttpOnly session cookie

Docs: [`PRD.md`](./PRD.md) · [`DESIGN.md`](./DESIGN.md) ·
[`docs/DEPLOY.md`](./docs/DEPLOY.md) (VPS runbook) ·
[`docs/INTEGRATION.md`](./docs/INTEGRATION.md) (connect a site).

## Requirements

- Node.js 20 LTS (18+ works; global `fetch` is required)
- A C toolchain for `better-sqlite3` native build (`python3`, `make`, `g++`)

## Quick start

```bash
npm install
cp .env.example .env
```

Generate a session secret and put it in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set `HMAC_SECRET`, `OWNER_EMAIL` and `OWNER_PASSWORD` in `.env`, then:

```bash
npm start
```

Open <http://localhost:3000/admin/login.html> and sign in as the owner. The
landing page is at <http://localhost:3000/>. The schema and the owner account
are created automatically on first boot (`npm run migrate` does the same
without starting the server).

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `3000` | HTTP listen port |
| `DB_PATH` | no | `./data/cms.db` | SQLite file path |
| `BRAND_NAME` | no | `Sabi CMS` | Brand shown in the UI and `/health` |
| `HMAC_SECRET` | **yes** | — | Signs session cookies (long random string) |
| `OWNER_EMAIL` | yes¹ | — | Owner bootstrap login |
| `OWNER_PASSWORD` | yes¹ | — | Owner bootstrap password |
| `SHEET_ID` | import only | — | Google Sheet id for `npm run import` |
| `SHEET_SITE_SLUG` | import only | `gifts-by-vf` | Site to seed from the sheet |
| `BACKUP_DIR` | no | `./backups` | Where `npm run backup` writes snapshots |
| `BACKUP_KEEP` | no | `14` | Snapshots to retain |
| `BACKUP_PASSPHRASE` | no | — | Encrypt snapshots (AES-256-GCM) — set in prod |

¹ Required on first run to seed the owner; the account is persisted after that.

## npm scripts

| Script | What it does |
|---|---|
| `npm start` | Run the CMS |
| `npm run migrate` | Create/upgrade the schema and seed the owner |
| `npm run import` | Import all 9 collections from the Google Sheet (idempotent) |
| `npm run smoke` | End-to-end suite; imports `scripts/fixtures/` by default (isolated DB, port 3999) |
| `npm run contract` | Self-contained PRD §7 contract checks, no network (port 3998) |
| `npm run backup` | Encrypted SQLite snapshot with retention (`scripts/backup.mjs`) |

## Project layout

```
server/
  app.js            Express app: routes, static, error handling
  config.js         .env loading + typed config
  db.js             better-sqlite3 connection (WAL, foreign keys)
  migrate.js        schema DDL + owner bootstrap
  collections.js    single source of truth for collections, fields, settings keys
  lib/              auth, normalize, slugify, validate, ratelimit
  routes/
    public.js       read-only API (CORS, caching, inactive → 403)
    admin.js        auth, owner client management, generic CRUD
public/             admin UI + landing page (served at / and /admin)
scripts/            import-from-sheet.mjs · smoke.mjs · contract.mjs · backup.mjs
deploy/             Caddyfile · ecosystem.config.cjs · systemd backup units
docs/               DEPLOY.md (VPS runbook) · INTEGRATION.md (connect a site)
```

## Public read API

No auth. Values are **always strings** (PRD §5.1) so consumers can do simple
string comparisons.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/sites/:siteSlug/content/:collection` | array of row objects |
| `GET /api/v1/sites/:siteSlug/products/:slug` | single product (share/OG pages) |

`collection` ∈ `products | settings | sales_reps | payouts | testimonials |
portfolio | why_us | how_to_order | faqs`.

- **CORS:** reflects only the site's registered `allowed_origin`
- **Caching:** `Cache-Control: public, max-age=60`
- **Paused site:** `403 { "error": "subscription_inactive" }` with `no-store`;
  content is never deleted
- **Missing product:** `404 { "error": "not_found" }` (never an HTML 200)

## Admin UI

- **Login** — branded email + password
- **Owner dashboard** — clients table; create client (slug, name, allowed
  origin, email, password); pause/activate; open any client's content
- **Client dashboard** — one card per collection with list + add/edit/delete,
  reordering, toggles, image previews, and the known-keys settings form
- Light/dark theme toggle (follows the OS by default, persisted per browser)

## Connecting a subscriber site

A site needs only two constants:

```
CMS_BASE  = https://cms.example.com     # this server
SITE_SLUG = gifts-by-vf                  # the client's slug
```

Then fetch content, e.g.:

```
GET {CMS_BASE}/api/v1/sites/{SITE_SLUG}/content/products
```

See PRD §8 for the full Gift by VF integration steps (localStorage cache,
`?refresh=1` bypass, `[]`-on-empty behavior, serverless `settings.js` and
`product/[slug].js`), or follow [`docs/INTEGRATION.md`](./docs/INTEGRATION.md),
which includes ready-to-adapt snippets.

## Importing from the Google Sheet

`npm run import` reads every tab via gviz CSV, normalizes headers, seeds the
site, and reports duplicates/warnings. It is **idempotent** (clears the site's
rows first) and runs pre-flight validation (price numeric, unique names/slugs,
settings keys, rep-id uniqueness). Fix flagged rows in the admin UI.

## Testing

```bash
npm run contract   # 55 checks: PRD §7 data contract, no network required
npm run smoke      # 68 checks end-to-end; sheet import runs against local fixtures by default
```

Both run against isolated databases and their own ports, so they never touch
`data/cms.db`.

`npm run smoke` imports the CSV fixtures in `scripts/fixtures/` through the real
importer (parse → normalize → dedupe → validate), so it is deterministic and
offline. To exercise the importer against the live sheet instead:

```bash
SMOKE_LIVE=1 npm run smoke      # bash
$env:SMOKE_LIVE=1; npm run smoke # PowerShell
```

## Deployment

Milestone 6 ships the pieces needed for a VPS; see [`deploy/`](./deploy) and the
step-by-step [`docs/DEPLOY.md`](./docs/DEPLOY.md) runbook (provision → env →
migrate → PM2 → Caddy → backups → cutover → rollback).

1. **Reverse proxy** — `deploy/Caddyfile` (edit the domain). Caddy provisions TLS.
2. **Process manager** — `pm2 start deploy/ecosystem.config.cjs` then
   `pm2 save && pm2 startup`. Runs `server/app.js` on `127.0.0.1:3000`.
3. **Nightly backups** — install `deploy/sabi-backup.{service,timer}` and
   `systemctl enable --now sabi-backup.timer`. Point `BACKUP_DIR` off-box.
4. **Pause/hardening** — a paused client disables reads only; content stays.

### Production `.env` checklist

- [ ] `NODE_ENV=production` — marks session cookies `Secure`
- [ ] `HMAC_SECRET` — fresh, long, random; **not** the dev value
- [ ] `OWNER_EMAIL` / `OWNER_PASSWORD` — strong; rotate after first login
- [ ] `DB_PATH` → an absolute path on a persistent disk (WAL needs write access)
- [ ] `BACKUP_PASSPHRASE` — set so off-box snapshots are encrypted
- [ ] `BACKUP_DIR` — a directory outside the app that leaves the box
- [ ] `.env` is **not** committed and not served (verified by `npm run smoke`)
- [ ] `BRAND_NAME` and each client's `allowed_origin` are correct

## Security notes

- No secrets in the repo; everything sensitive comes from `.env`
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production
- Login and password-change are rate-limited per IP/email
- State-changing admin requests reject cross-origin callers (CSRF Origin check);
  changing a password invalidates every existing session
- Client scoping is enforced server-side — the UI is never trusted

## Status

MVP (PRD milestones 1–5) plus deployment assets and docs (M6 assets, M7). Open
items are external: the Gift by VF production cutover and running the §7 contract
suite against the live storefront (both need the `vf-gift-shop` repo + a VPS). This
is local-first until then — **do not** tell a client it is live until it is deployed.
