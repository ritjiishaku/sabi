# Subscriber integration (Gift by VF reference)

How a website consumes Sabi CMS content. Any site needs **two constants**:

```
CMS_BASE  = https://cms.example.com   # the CMS origin
SITE_SLUG = gifts-by-vf               # the client's slug
```

The CMS is read-only to the site. A site's origin must be registered as its
`allowed_origin` (owner dashboard) or the browser fetch is blocked by CORS.

> The Gift by VF storefront's `public/` directory is a **build artifact**
> (`npm run build` re-copies `index/reps/admin/css/js`). Edit the root source
> files, then bump the `?v=` asset versions on deploy.

---

## 1. Endpoints

| Endpoint | Returns |
|---|---|
| `GET {CMS_BASE}/api/v1/sites/{SITE_SLUG}/content/{collection}` | array of row objects (all values are **strings**) |
| `GET {CMS_BASE}/api/v1/sites/{SITE_SLUG}/products/{slug}` | single product object (share / OG pages) |

`collection` ∈ `products | settings | sales_reps | payouts | testimonials |
portfolio | why_us | how_to_order | faqs`.

Response behavior (PRD §7):

- Every value is a **string** — compare with `===`, parse numbers yourself.
- Missing/empty collection → `[]` (never `null`).
- `Cache-Control: public, max-age=60`.
- Paused site → `403 { "error": "subscription_inactive" }` (**no-store**); content
  is never deleted, so it returns intact after re-activation.
- Unknown product → `404 { "error": "not_found" }` (never an HTML 200).
- Toggles (`is_visible`, `featured`, `in_stock`, `is_active`, `wide`) are
  normalized to `"TRUE"` / `"FALSE"`.

## 2. Tab-name → collection map

The storefront previously read sheet tabs. Map each existing tab constant to its
collection so the rest of the code is unchanged:

| Sheet tab | Collection |
|---|---|
| Products | `products` |
| Reps | `sales_reps` |
| Payouts | `payouts` |
| Testimonials | `testimonials` |
| Portfolio | `portfolio` |
| Why Us | `why_us` |
| How to Order | `how_to_order` |
| FAQs | `faqs` |
| Settings | `settings` |

## 3. `js/shared.js` — `fetchTab()`

Keep the existing cache contract: 60s `localStorage` cache, `?refresh=1` bypass,
stale-cache fallback on network error, and `[]` on empty. Only the URL base
changes.

```js
const CMS_BASE = 'https://cms.example.com';
const SITE_SLUG = 'gifts-by-vf';
const CACHE_TTL = 60 * 1000;

// map old tab names to CMS collections
const COLLECTION = {
  products: 'products',
  reps: 'sales_reps',
  payouts: 'payouts',
  testimonials: 'testimonials',
  portfolio: 'portfolio',
  whyus: 'why_us',
  howto: 'how_to_order',
  faqs: 'faqs',
  settings: 'settings',
};

async function fetchTab(tab, { refresh = false } = {}) {
  const collection = COLLECTION[tab];
  const key = `cms:${SITE_SLUG}:${collection}`;

  if (!refresh) {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const { at, data } = JSON.parse(cached);
      if (Date.now() - at < CACHE_TTL) return data;
    }
  }

  const url = `${CMS_BASE}/api/v1/sites/${SITE_SLUG}/content/${collection}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 403) {
      // client paused — fail soft, stop polling
      return [];
    }
    if (!res.ok) throw new Error(`CMS ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: rows }));
    return rows;
  } catch (err) {
    // stale-cache fallback
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached).data;
    console.warn('[cms] fetch failed', collection, err);
    return [];
  }
}

// ?refresh=1 forces a bypass
const REFRESH = new URLSearchParams(location.search).get('refresh') === '1';
```

Storefront-side helpers that read the old tabs continue to work because
`fetchTab()` still returns an array of plain records.

## 4. `api/settings.js` (serverless)

Return settings as `[{ key, value }]` and derive the WhatsApp number / site name
from them instead of hardcoded constants.

```js
const CMS_BASE = process.env.CMS_BASE || 'https://cms.example.com';
const SITE_SLUG = process.env.SITE_SLUG || 'gifts-by-vf';

export default async function handler(req, res) {
  const r = await fetch(`${CMS_BASE}/api/v1/sites/${SITE_SLUG}/content/settings`);
  const settings = r.ok ? await r.json() : [];
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json(settings); // [{ key, value }]
}
```

## 5. `api/product/[slug].js` (serverless)

Replace hardcoded `WHATSAPP_NUMBER` / `SITE_NAME` with settings values and read
the single product by slug for share/OG pages.

```js
const CMS_BASE = process.env.CMS_BASE || 'https://cms.example.com';
const SITE_SLUG = process.env.SITE_SLUG || 'gifts-by-vf';

async function settings() {
  const r = await fetch(`${CMS_BASE}/api/v1/sites/${SITE_SLUG}/content/settings`);
  const rows = r.ok ? await r.json() : [];
  return Object.fromEntries(rows.map((s) => [s.key, s.value]));
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const cfg = await settings();

  const r = await fetch(`${CMS_BASE}/api/v1/sites/${SITE_SLUG}/products/${encodeURIComponent(slug)}`);
  if (r.status === 404) return res.status(404).send('Not found');
  const product = await r.json();

  const wa = cfg.whatsapp_number || '';
  const site = cfg.site_name || 'Gift by VF';

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    ...product,
    whatsapp_url: `https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${site}, I'm interested in ${product.name}`)}`,
  });
}
```

## 6. `admin.html` — "Content (CMS)" card

Add a link to the CMS admin so the client can manage content:

```html
<a class="card" href="https://cms.example.com/admin/login.html" target="_blank" rel="noopener">
  <h3>Content (CMS)</h3>
  <p>Manage products, testimonials, FAQs and settings.</p>
</a>
```

## 7. Refresh, caching and correctness

- The CMS already sends `Cache-Control: public, max-age=60`. Keep the
  storefront's 60s `localStorage` cache so a page isn't refetching on every view.
- `?refresh=1` must **bypass** the local cache (and ideally the CDN) so an admin
  edit is visible immediately during a demo or support call.
- Never treat a `403 subscription_inactive` as content deletion — show the last
  known content (stale cache) and stop polling.
- Big integers and prices arrive as **strings**; parse with `Number(...)` only at
  the point of formatting.

## 8. Cutover & verification checklist

- [ ] `CMS_BASE` / `SITE_SLUG` set in the storefront environment.
- [ ] Storefront origin registered as the client's `allowed_origin`.
- [ ] Every tab renders from the CMS (products, reps, payouts, testimonials,
      portfolio, why-us, how-to, FAQs, settings).
- [ ] Search / filter / sort, featured, sold-out, share page, `?p=` deep links,
      rep banner, WhatsApp messages all still work.
- [ ] `?refresh=1` shows an admin edit within one request.
- [ ] Missing product → 404 page, not a blank 200.
- [ ] The old sheet is left untouched as a backup until production is verified.
