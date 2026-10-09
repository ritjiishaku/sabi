# PRD — Multi-Client Content CMS (MVP)

**Version:** 0.2 · **Status:** Draft · **Owner:** [Your name/brand]
**Working name:** `<CMS_NAME>` (env-configurable `BRAND_NAME`)
**Reference/integration client:** Gift by VF (https://vf-gift-shop.vercel.app)

---

## 1. Problem & goal

Client websites (starting with **Gift by VF**, a bespoke-gifts storefront) currently
manage content in a Google Sheet. That works for one site but doesn't scale into a
product: no per-client accounts, no API-first design, no way to onboard other sites.

**Goal:** a self-hosted **SaaS-style CMS** that:
1. Gives each client their own login to manage their site's content
2. Exposes a **read-only REST API** any website can consume (Gift by VF is the first)
3. Is owned and operated by me, with clients onboarded by invitation

**Non-goals for MVP:** payments/subscriptions/billing, self-service signup, white-label
per-client theming, file uploads (image URLs only), analytics, multi-user roles per client.

---

## 2. Users

| Role | Capabilities |
|---|---|
| **Owner** (me) | Create/pause client sites and logins; full access to all data |
| **Client** (e.g. Gift by VF owner) | Log in; manage only their own site's content |
| **Visitor** (subscriber website) | Reads content via the public API (no auth) |

---

## 3. Tech decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js + Express | Single process, no build step |
| Database | SQLite (`better-sqlite3`, WAL mode) | Zero-ops, one file, portable to VPS later |
| Admin UI | Vanilla HTML/JS/CSS served by Express | No framework/build; matches existing stack |
| Auth | bcrypt password hash + HMAC-signed HttpOnly cookie | Stateless, no session store |
| Hosting (MVP) | Local machine (`npm start`), free | Migrate to VPS/free tier unchanged later |
| Images | URL field (Google Drive / direct links) | Same flow as today; uploads later |
| Deployment (post-MVP) | Ubuntu VPS + Caddy/nginx + PM2 + nightly SQLite backup | Predictable, cheap |

---

## 4. Data model

All content tables carry `site_id` (tenant isolation) from day one.

- **`sites`** — `id, slug, name, allowed_origin, is_active, created_at`
- **`users`** — `id, site_id (NULL = owner), email, password_hash, role ('owner'|'client'), created_at`
- **Content (per site):**
  - **`settings`** — `key, value` (site title, brand, hero copy, whatsapp_number,
    section labels, `category_*_image_url` keys — see §7.3)
  - **`products`** — `name, description, image_url, video_url, price, category,
    subcategory, product_type, occasion, material, size, turnaround, delivery_notes,
    payment_terms, sales_caption, icon, is_visible, display_order, featured, in_stock,
    stock_label`
  - **`sales_reps`** — `rep_id, name, commission_rate, is_active`
  - **`payouts`** — `rep_id, product, order_amount, commission, status, date`
  - **`testimonials`** — `quote, name, source, rating, display_order, is_visible`
  - **`portfolio`** — `image_url, caption, wide, display_order, is_visible`
  - **`why_us`** — `icon, title, description, display_order, is_visible`
  - **`how_to_order`** — `title, description, display_order, is_visible`
  - **`faqs`** — `question, answer, display_order, is_visible`

**Conventions:** `display_order` sorts blanks last; `is_visible` toggles rows; `featured`
promotes products; `in_stock`/`stock_label` drive Sold-Out states — mirroring the current
Google Sheet contract exactly.

---

## 5. API specification

### 5.1 Public read API (subscriber websites)

| Endpoint | Returns |
|---|---|
| `GET /api/v1/sites/:siteSlug/content/:collection` | `[{…}]` — array of row objects |
| `GET /api/v1/sites/:siteSlug/products/:slug` | Single product object (share/OG pages) |

`collection` ∈ `products | settings | sales_reps | payouts | testimonials | portfolio |
why_us | how_to_order | faqs`

- **CORS:** reflect only the site's registered `allowed_origin`
- **Caching:** `Cache-Control: public, max-age=60`
- **Inactive site:** `403 { error: "subscription_inactive" }` — consumers fall back to
  their own stale cache; content is never deleted
- **Hard contract rules:**
  1. **Every value is a string** (`"TRUE"`, `"25000"`, `""`) — consumers use string
     comparisons: `is_visible` hides on `false`/`0`; `featured` is true on `true/1/yes`;
     `in_stock` is sold-out on `false/0/no`; `wide` on `true`; payout `status` paid only
     on `paid`. JSON booleans/nulls/numbers must never leak through.
  2. **Field names exactly match** current sheet headers (`image_url`, `display_order`,
     `rep_id`…) — missing/renamed fields silently blank out content (no errors thrown).
  3. **All values arrive trimmed strings** (CSV-parse equivalent: headers normalized
     `trim → lowercase → non-alphanumerics removed to _`; cells `String().trim()`).

### 5.2 Admin API (session required)

- `POST /api/admin/login` · `POST /api/admin/logout` · `GET /api/admin/me`
- CRUD: `GET|POST /api/admin/:collection` and `GET|PUT|DELETE /api/admin/:collection/:id`
  — client role middleware-scoped to their own `site_id`
- Owner-only: `POST /api/admin/clients` (create site + login),
  `PUT /api/admin/clients/:id` (rename, re-CORS, activate/pause)

---

## 6. Admin UI

1. **Login** — branded (email + password)
2. **Owner dashboard** — clients table; create client (site slug, name, allowed origin,
   email, password); pause/activate; view integration links
3. **Client dashboard** — section list, each opening list + add/edit/delete forms:
   - **Settings:** known-keys dropdown + inputs (a typo'd key silently reverts the site
     to hardcoded defaults — the dropdown prevents this)
   - **Products:** reorder, visibility/featured/stock toggles, image preview,
     **duplicate-name warning** (see §7.6 slug collision)
   - **Sales Reps / Payouts / Testimonials / Portfolio / Why Us / How to Order / FAQs**
4. Image fields: URL + live preview; Google Drive links supported (site converts
   `drive.google.com/file/d/<id>` → `https://lh3.googleusercontent.com/d/<id>`)

---

## 7. Gift by VF — required capabilities (compatibility checklist)

The MVP is **not done** until the CMS can serve every feature below with zero visual or
behavioral regression. Verified in milestone 3 against localhost.

### 7.1 Content sections the storefront renders
Products (search/filter/occasion/price-range/sort, four category collections, featured
badges), Testimonials (first 6 shown, "see more" expands), Portfolio gallery (incl.
`wide` tiles), Why Us, How to Order, FAQs, Site Settings (hero, section labels,
footer). Empty `How to Order` must be able to return **0 rows** — the site then renders
its 5 hardcoded fallback steps; an empty FAQ/Portfolio/Testimonials list hides the
section entirely (requires `[]`, not `null`/error).

### 7.2 Sales-rep system (depends on `sales_reps` + `payouts`)
- Visitors arriving with `?ref=<rep_id>` validate against **active** reps
  (`is_active`/`is_visible`, hidden on `false`/`0` — note: `no` is *not* inactive here)
- Referral stored 30 days, appended to WhatsApp order messages (uses rep `name`)
- `reps.html` login by `rep_id` (case-insensitive), commission estimates from
  `commission_rate` (e.g. `"10"` / `"10%"`), payout table rows: `rep_id, product,
  order_amount, commission, status ('paid' = Paid, else Pending), date` (date rendered
  verbatim, never parsed)

### 7.3 Settings keys the site reads (all optional — missing key = hardcoded default)
`whatsapp_number` (digits only), `site_title`, `brand_name`, `brand_accent`,
`hero_image_url`, `hero_label/title/desc`, `products_label/title/desc`,
`featured_label/title`, `why_label/title/desc`, `testimonials_label/title`,
`portfolio_label/title`, `howto_label/title`, `faq_label/title`, `footer_text`,
`commission_rule`, and the four taxonomy covers: `category_picture_enlargement_image_url`,
`category_customized_jewelry_image_url`, `category_brand_signages_image_url`,
`category_more_to_love_image_url`.
A key is applied only when key **and** value are both non-empty.

### 7.4 WhatsApp ordering (revenue-critical)
Order messages build from `product.name` + `product.price` + rep `name` → `wa.me` link
using `whatsapp_number`. `price` must parse as a plain number (optional `NGN`/`₦` prefix,
commas allowed): unparseable prices (e.g. `"₦20,000 - ₦30,000"`) vanish from price
filters/sorts and lose structured-data offers. Admin should validate price as numeric.

### 7.5 Category taxonomy (client-side, stays out of CMS)
`js/product-taxonomy.json` defines **exactly 4 categories** with aliases; products match
via `category` (+ explicit `subcategory`/`product_type` overrides, keyword fallbacks).
CMS must pass `category`, `subcategory`, `product_type` through untouched; product cards
fall back to a `"Custom"` badge when category is blank.

### 7.6 Slug & deep links
Share links, JSON-LD URLs, rep links and `/product/:slug` all derive from
`slugify(name)` (lowercase, non-alphanum → `-`, ≤60 chars). The serverless product page
dedupes by **lowercased name**; numeric slugs fall back to `display_order`. Renaming a
product breaks its old shared link (acceptable) — but **duplicate names collide**:
admin must warn. Missing product → friendly redirect page, never a 404.

### 7.7 Share/OG pages (server-side consumer)
`/api/product/[slug].js` needs from the CMS: `name, price, description, image_url,
in_stock, is_visible, display_order` (+ site settings for WhatsApp/site name — its
current hardcoded constants get replaced by settings values). Response HTML is cached
`max-age=600, s-maxage=3600` — product edits may take up to 1h to appear in shares;
keep or reduce, but document the behavior.

### 7.8 Caching & refresh contract
Site caches each collection in localStorage for **60s**; `?refresh=1` bypasses; on API
failure the site serves its stale cache rather than erroring (except first load →
error message). The CMS's 60s `max-age` + `403` for inactive sites must stay compatible
with this (never return partial/HTML error bodies as `200`).

### 7.9 Dedupe semantics
Storefront dedupes rows on `name|title|caption|question + price + image_url` (blank
fields collapse identical titles); serverless dedupes products by name alone. Import and
admin validation should prevent exact-duplicate rows carried over from the sheet.

### 7.10 Field-level rendering notes
- `icon` values map to a fixed icon set (unknown → star fallback)
- `rating` = integer 0–5 (blank → "No rating"); `commission_rate` numeric with `%`
- `occasion` = comma-separated list (pills built from tokens)
- `video_url` supports YouTube/Drive-preview/`.mp4`/`.webm`; a video pasted into
  `image_url` is reinterpreted as the card video — preserve this leniency
- `stock_label` customizes the Sold-Out badge text (default `Sold Out`)
- `sales_caption` used only by rep pitch cards

---

## 8. Subscriber integration (Gift by VF reference implementation)

Connecting any site requires **two constants** (`CMS_BASE`, `SITE_SLUG`) plus:

1. `js/shared.js` — `fetchTab()` calls
   `GET /api/v1/sites/:slug/content/:collection` (map existing tab-name constants →
   collections); keep the 60s localStorage cache, `?refresh=1` bypass, stale-cache
   fallback, and `[]`-on-empty behavior identical
2. `api/settings.js` (serverless) — fetch `content/settings`, return `[{key,value}]`
3. `api/product/[slug].js` (serverless) — fetch `content/products`; replace hardcoded
   `WHATSAPP_NUMBER` / `SITE_NAME` constants with settings values
4. `admin.html` — add a "Content (CMS)" card linking to the CMS
5. Bump `?v=` asset versions on deploy (repo convention) — note `public/` is a build
   artifact (`npm run build` re-copies `index/reps/admin/css/js`), so edit root files

**Migration:** `import-from-sheet.mjs` reads the live Google Sheet CSVs (gviz/export
URLs), normalizes headers identically to `parseCSV`, seeds all 9 tabs for site
`gifts-by-vf`. Idempotent (clears site rows first). Runs pre-flight validation: price
numeric, unique names/slugs, settings keys from §7.3, rep `rep_id` uniqueness.
The sheet is retained untouched as a backup until production is verified
(revert plan: restore the old `fetchTab`).

---

## 9. Security & non-functional

- bcrypt passwords; rate-limited login; HMAC secret + owner credentials via env vars —
  **no secrets in the repo**
- HTTPS (Caddy/nginx) in deployment; per-site CORS; HttpOnly/SameSite session cookie
- Client scoping enforced server-side (never trust the UI)
- Pausing a site disables reads only — content is never deleted
- Nightly encrypted SQLite backup off-box from the moment it's deployed
- Health endpoint (`/health`) and structured request logging for uptime checks
- Local-first: the product is **offline until deployed** — do not tell a client it's
  live until it is

---

## 10. Milestones (risk-ordered)

| # | Deliverable | Gate |
|---|---|---|
| 1 | App skeleton, schema, migrations, login/roles | Owner + client can log in |
| 2 | Public read API + sheet import script + validation report | Import produces all 9 collections, warnings reviewed |
| 3 | **Contract verification against Gift by VF (localhost)** | Storefront, search/filters/sort, featured/sold-out, testimonials/portfolio/FAQ/why-us/how-to, referral flow + rep banner, `reps.html` login + commission + payouts, WhatsApp messages, `/product/:slug` share page, `?p=` deep links, `?refresh=1` |
| 4 | Admin CRUD API + client dashboard | Client can edit all 9 sections with validation |
| 5 | Owner dashboard (create/pause clients) | Full onboarding flow works end-to-end |
| 6 | Gift by VF integration (production) | Live site serves from CMS; `?refresh=1` verified; sheet kept as backup |
| 7 | READMEs for both projects | New site connects with just 2 constants |

**Out of scope (later):** VPS/free-tier deploy automation, subscriptions + payment
gateway (Paystack/Flutterwave — Stripe unavailable in NG), self-service signup,
file uploads, white-labeling, analytics, product rename/slug-redirect map.

---

## 11. Success criteria

- Gift by VF renders **identically** with the CMS as source: every §7 behavior verified
  against the checklist, sheet removed from the critical path (kept as backup)
- A second site can be onboarded (create client → import/enter content → 2 constants)
  in under an hour with no code changes beyond those constants
- No content silently disappears: field names and string types match the contract
- Owner can pause a client and their site degrades gracefully (stale cache, no errors)
- Re-running the import is safe (idempotent) and reports contract violations up front
