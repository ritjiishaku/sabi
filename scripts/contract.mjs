import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { slugify } from '../server/lib/slugify.js';

/*
 * PRD §7 contract verification harness (M3).
 *
 * Unlike scripts/smoke.mjs this suite is fully self-contained: it seeds
 * deterministic fixtures through the admin API instead of importing the live
 * Google Sheet, so it can run offline and pins the exact storefront contract
 * (PRD §7.1–7.9). It answers one question for every rule: would Gift by VF
 * render byte-for-byte the same from the CMS as it does from the sheet?
 */

const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const CONTRACT_DB = path.join(config.root, 'data', 'contract.db');
const ORIGIN = 'https://contract.example.com';
const SLUG = 'contract-test';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(pathname, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await reqOnce(pathname, opts);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw lastErr;
}

async function reqOnce(pathname, { method = 'GET', body, origin, cookie, base = BASE } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { res, json, text };
}

function cookieOf(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) if (c.startsWith('sabi_session=')) return c.split(';')[0];
  return null;
}

function allStrings(value) {
  if (Array.isArray(value)) return value.every(allStrings);
  if (value && typeof value === 'object') return Object.values(value).every(allStrings);
  return typeof value === 'string';
}

function isJson(res) {
  return /application\/json/i.test(res.headers.get('content-type') || '');
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    (function poll() {
      fetch(`${BASE}/health`)
        .then((r) => (r.ok ? resolve() : Promise.reject(new Error('bad health'))))
        .catch(() => {
          if (Date.now() > deadline) reject(new Error('server did not start'));
          else setTimeout(poll, 250);
        });
    })();
  });
}

/* ------------------------------ suite ------------------------------ */

async function main() {
  console.log('[contract] preparing isolated DB (data/contract.db)…');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${CONTRACT_DB}${suffix}`, { force: true });

  const server = spawn(process.execPath, [path.join(config.root, 'server', 'app.js')], {
    cwd: config.root,
    env: { ...process.env, PORT: String(PORT), DB_PATH: './data/contract.db' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  server.on('exit', (code, sig) => { serverLog += `\n[SERVER EXITED code=${code} sig=${sig}]\n`; });

  try {
    await waitForServer();

    /* 0. auth + site setup */
    const ownerLogin = await req('/api/admin/login', {
      method: 'POST',
      body: { email: config.ownerEmail, password: config.ownerPassword },
    });
    const ownerCookie = cookieOf(ownerLogin.res);
    check('owner login → session', ownerLogin.res.status === 200 && !!ownerCookie);

    const siteRes = await req('/api/admin/clients', {
      method: 'POST', cookie: ownerCookie,
      body: { slug: SLUG, name: 'Contract Test', allowed_origin: ORIGIN, email: 'client@contract.test', password: 'Password123!' },
    });
    check('create client site → 201', siteRes.res.status === 201, JSON.stringify(siteRes.json));

    const clientLogin = await req('/api/admin/login', {
      method: 'POST', body: { email: 'client@contract.test', password: 'Password123!' },
    });
    const cookie = cookieOf(clientLogin.res);
    check('client login → session', clientLogin.res.status === 200 && !!cookie);

    /* CSRF: cross-origin state-changing admin requests are rejected; absent Origin is allowed */
    const csrf = await req('/api/admin/login', {
      method: 'POST', origin: 'https://evil.example.com',
      body: { email: config.ownerEmail, password: config.ownerPassword },
    });
    check('cross-origin admin POST → 403 csrf_origin_mismatch', csrf.res.status === 403 && csrf.json?.error === 'csrf_origin_mismatch');
    const sameHost = await req('/api/admin/login', {
      method: 'POST', origin: BASE,
      body: { email: config.ownerEmail, password: config.ownerPassword },
    });
    check('same-host Origin admin POST allowed → 200', sameHost.res.status === 200);

    const post = (collection, body) => req(`/api/admin/${collection}`, { method: 'POST', cookie, body });
    const pub = (collection) => req(`/api/v1/sites/${SLUG}/content/${collection}`, { origin: ORIGIN });

    /* 1. empty collections → [] not null/error (PRD §7.1) */
    console.log('\n[1] empty collections return [] (never null/error)');
    const EMPTY_COLLECTIONS = ['products', 'sales_reps', 'payouts', 'testimonials', 'portfolio', 'why_us', 'how_to_order', 'faqs'];
    for (const c of EMPTY_COLLECTIONS) {
      const r = await pub(c);
      check(`${c}: []`, r.res.status === 200 && Array.isArray(r.json) && r.json.length === 0, `status=${r.res.status}`);
    }

    /* 2. settings keys the storefront reads (PRD §7.3) */
    console.log('\n[2] settings key surface (PRD §7.3)');
    const PRD_KEYS = [
      'whatsapp_number', 'site_title', 'brand_name', 'brand_accent', 'hero_image_url',
      'hero_label', 'hero_title', 'hero_desc', 'products_label', 'products_title', 'products_desc',
      'featured_label', 'featured_title', 'why_label', 'why_title', 'why_desc',
      'testimonials_label', 'testimonials_title', 'portfolio_label', 'portfolio_title',
      'howto_label', 'howto_title', 'faq_label', 'faq_title', 'footer_text', 'commission_rule',
      'category_picture_enlargement_image_url', 'category_customized_jewelry_image_url',
      'category_brand_signages_image_url', 'category_more_to_love_image_url',
    ];
    const meta = await req('/api/admin/meta', { cookie: ownerCookie });
    const missingKeys = PRD_KEYS.filter((k) => !(meta.json?.settingsKeys ?? []).includes(k));
    check('all §7.3 keys are accepted settings keys', missingKeys.length === 0, `missing: ${missingKeys.join(', ')}`);

    const badKey = await post('settings', { key: 'not_a_real_key', value: 'x' });
    check('unknown settings key → 400', badKey.res.status === 400 && !!badKey.json?.fields?.key);

    const waKey = await post('settings', { key: 'whatsapp_number', value: '08012345678' });
    check('upsert whatsapp_number → 201', waKey.res.status === 201);
    const settings = await pub('settings');
    const wa = settings.json?.find((r) => r.key === 'whatsapp_number');
    check('settings exposed as {key,value} strings', !!wa && typeof wa.key === 'string' && typeof wa.value === 'string' && wa.value === '08012345678');

    /* 3. products: price, taxonomy, toggles, share fields, ordering */
    console.log('\n[3] products contract (PRD §7.4, §7.5, §7.7)');
    const badPrice = await post('products', { name: 'Range Price', price: '₦20,000 - ₦30,000' });
    check('unparseable range price → 400 fields.price', badPrice.res.status === 400 && !!badPrice.json?.fields?.price);

    const prefixed = await post('products', { name: 'Enlargement Print', price: '₦20,000', category: 'Picture Enlargement', image_url: 'https://example.com/print.jpg', is_visible: 'TRUE', in_stock: 'TRUE' });
    check('₦/comma price accepted → 201', prefixed.res.status === 201);
    check('price passed through verbatim as string', prefixed.json?.row?.price === '₦20,000', `got ${JSON.stringify(prefixed.json?.row?.price)}`);

    await post('products', {
      name: 'Silk Scarf', price: '25000', description: 'Soft silk', category: 'Accessories',
      subcategory: 'Scarves', product_type: 'Gift', image_url: 'https://example.com/scarf.jpg',
      is_visible: 'TRUE', in_stock: 'TRUE', featured: 'yes', display_order: '1',
    });
    const soldOut = await post('products', { name: 'Sold Out Bowl', price: '15000', is_visible: 'TRUE', in_stock: '0', featured: 'no' });
    const hidden = await post('products', { name: 'Hidden Draft', price: '5000', is_visible: 'false' });
    const seventh = await post('products', { name: 'Seventh Item', price: '7000', display_order: '7' });
    const deluxe = await post('products', { name: 'Gift & Co. — Deluxe', price: '9000' });
    await post('products', { name: 'Limited Mug', price: '3000' });
    const dupMug = await post('products', { name: 'limited mug', price: '3000' });

    check('toggle in_stock "0" normalized → "FALSE"', soldOut.json?.row?.in_stock === 'FALSE', `got ${JSON.stringify(soldOut.json?.row?.in_stock)}`);
    check('toggle featured "no" normalized → "FALSE"', soldOut.json?.row?.featured === 'FALSE');
    check('toggle is_visible "false" → "FALSE"', hidden.json?.row?.is_visible === 'FALSE');
    check('toggle featured "yes" normalized → "TRUE"', (await pub('products')).json?.find((r) => r.name === 'Silk Scarf')?.featured === 'TRUE');
    check('case-insensitive duplicate name returns warning', (dupMug.json?.warnings?.length ?? 0) > 0);

    const products = await pub('products');
    const scarf = products.json?.find((r) => r.name === 'Silk Scarf');
    check('category/subcategory/product_type passed through untouched', scarf?.category === 'Accessories' && scarf?.subcategory === 'Scarves' && scarf?.product_type === 'Gift');

    const SHARE_FIELDS = ['name', 'price', 'description', 'image_url', 'in_stock', 'is_visible', 'display_order'];
    check('share/OG fields present on product object', SHARE_FIELDS.every((f) => f in (scarf ?? {})));

    check('display_order blanks sort last', products.json?.[0]?.name === 'Silk Scarf' && products.json?.findIndex((r) => r.name === 'Seventh Item') < products.json?.findIndex((r) => r.display_order === ''));

    /* §7.10 rendering hints are storefront-side — the CMS must pass them through verbatim */
    await post('products', {
      name: 'Occasion Plate', price: '12000', occasion: 'Birthday, Wedding',
      video_url: 'https://youtu.be/abc', stock_label: 'Restocking', sales_caption: 'Grab it', icon: 'gift', is_visible: 'TRUE',
    });
    const richRow = (await pub('products')).json?.find((r) => r.name === 'Occasion Plate');
    check('occasion/video/stock_label/sales_caption/icon pass through verbatim',
      richRow?.occasion === 'Birthday, Wedding' && richRow?.video_url === 'https://youtu.be/abc' &&
      richRow?.stock_label === 'Restocking' && richRow?.sales_caption === 'Grab it' && richRow?.icon === 'gift');
    check('hidden rows are still returned for the storefront to filter', products.json?.some((r) => r.name === 'Hidden Draft' && r.is_visible === 'FALSE'));

    /* 4. slug & deep links (PRD §7.6) */
    console.log('\n[4] slug & deep links (PRD §7.6)');
    check('slugify lowercases + hyphenates', slugify('Gift & Co. — Deluxe') === 'gift-co-deluxe', slugify('Gift & Co. — Deluxe'));
    check('slugify caps length at 60', slugify('x'.repeat(120)).length === 60);

    const bySlug = await req(`/api/v1/sites/${SLUG}/products/silk-scarf`, { origin: ORIGIN });
    check('product by slug → single object', bySlug.res.status === 200 && bySlug.json?.name === 'Silk Scarf' && !Array.isArray(bySlug.json));

    const bySpecial = await req(`/api/v1/sites/${SLUG}/products/${slugify('Gift & Co. — Deluxe')}`, { origin: ORIGIN });
    check('special-character name reachable by slug', bySpecial.res.status === 200 && bySpecial.json?.name === 'Gift & Co. — Deluxe');

    const numeric = await req(`/api/v1/sites/${SLUG}/products/7`, { origin: ORIGIN });
    check('numeric slug falls back to display_order', numeric.res.status === 200 && numeric.json?.name === 'Seventh Item', JSON.stringify(numeric.json));

    const dedupe = await req(`/api/v1/sites/${SLUG}/products/limited-mug`, { origin: ORIGIN });
    check('duplicate names dedupe by lowercase (first wins)', dedupe.res.status === 200 && dedupe.json?.name === 'Limited Mug', JSON.stringify(dedupe.json));

    const missing = await req(`/api/v1/sites/${SLUG}/products/does-not-exist`, { origin: ORIGIN });
    check('missing product → 404 json (never HTML 200)', missing.res.status === 404 && isJson(missing.res) && missing.json?.error === 'not_found');

    /* 5. sales reps + payouts (PRD §7.2) */
    console.log('\n[5] sales reps & payouts (PRD §7.2)');
    const rep = await post('sales_reps', { rep_id: 'REP-1', name: 'Ada', commission_rate: '10%', whatsapp: '08012345678', is_active: 'TRUE' });
    check('rep created → 201', rep.res.status === 201);
    const dupRep = await post('sales_reps', { rep_id: 'rep-1', name: 'Bola', is_active: 'TRUE' });
    check('rep_id uniqueness is case-insensitive → 400', dupRep.res.status === 400 && !!dupRep.json?.fields?.rep_id);

    const reps = await pub('sales_reps');
    const ada = reps.json?.find((r) => r.rep_id === 'REP-1');
    check('rep fields are strings (rep_id,name,commission_rate,is_active)', ['rep_id', 'name', 'commission_rate', 'is_active'].every((f) => typeof ada?.[f] === 'string') && ada.commission_rate === '10%');

    await post('payouts', { rep_id: 'REP-1', product: 'Silk Scarf', order_amount: '25000', commission: '2500', status: 'paid', date: '2026-01-15' });
    const payouts = await pub('payouts');
    check('payout status/date preserved verbatim as strings', payouts.json?.some((p) => p.status === 'paid' && p.date === '2026-01-15'));

    /* 6. other content sections (PRD §7.1) */
    console.log('\n[6] remaining sections (PRD §7.1)');
    await post('testimonials', { name: 'Chi', quote: 'Lovely', source: 'WhatsApp', rating: '5', display_order: '1', is_visible: 'TRUE' });
    const badRating = await post('testimonials', { name: 'X', quote: 'Nice', rating: '9' });
    check('rating 9 → 400', badRating.res.status === 400 && !!badRating.json?.fields?.rating);
    const dupTestimonial = await post('testimonials', { name: 'Chi', quote: 'Lovely', source: 'WhatsApp', rating: '5' });
    check('exact duplicate testimonial → 201 with warning', dupTestimonial.res.status === 201 && (dupTestimonial.json?.warnings?.length ?? 0) > 0);

    await post('portfolio', { image_url: 'https://example.com/wide.jpg', caption: 'Big', wide: 'true', is_visible: 'TRUE' });
    const dupPortfolio = await post('portfolio', { image_url: 'https://example.com/wide.jpg', caption: 'Big' });
    check('exact duplicate portfolio → 201 with warning', dupPortfolio.res.status === 201 && (dupPortfolio.json?.warnings?.length ?? 0) > 0);
    await post('why_us', { title: 'Fast', description: 'Quick turnaround', icon: 'sparkles', display_order: '1', is_visible: 'TRUE' });
    await post('faqs', { question: 'Do you deliver?', answer: 'Yes', display_order: '1', is_visible: 'TRUE' });

    const portfolio = await pub('portfolio');
    check('wide tile passthrough → "TRUE"', portfolio.json?.some((p) => p.wide === 'TRUE'));
    const why = await pub('why_us');
    check('why_us icon passthrough (storefront falls back on unknown)', why.json?.[0]?.icon === 'sparkles');
    const howto = await pub('how_to_order');
    check('unused how_to_order stays [] (site uses fallback steps)', Array.isArray(howto.json) && howto.json.length === 0);

    /* 7. string contract across every collection (PRD §5.1 rule 1) */
    console.log('\n[7] string contract');
    const ALL = ['settings', 'products', 'sales_reps', 'payouts', 'testimonials', 'portfolio', 'why_us', 'how_to_order', 'faqs'];
    let allOk = true;
    for (const c of ALL) {
      const r = await pub(c);
      if (r.res.status !== 200 || !Array.isArray(r.json) || !allStrings(r.json)) allOk = false;
    }
    check('every value in every collection is a string', allOk);

    /* 8. CORS + caching (PRD §5.1, §7.8) */
    console.log('\n[8] CORS & caching');
    const cache = await pub('products');
    check('Cache-Control: public, max-age=60', cache.res.headers.get('cache-control') === 'public, max-age=60');

    const corsOk = await req(`/api/v1/sites/${SLUG}/content/products`, { origin: ORIGIN });
    check('CORS reflects registered origin', corsOk.res.headers.get('access-control-allow-origin') === ORIGIN);
    const corsForeign = await req(`/api/v1/sites/${SLUG}/content/products`, { origin: 'https://evil.example.com' });
    check('CORS ignores unregistered origin', corsForeign.res.headers.get('access-control-allow-origin') === null);
    const preflight = await req(`/api/v1/sites/${SLUG}/content/products`, { method: 'OPTIONS', origin: ORIGIN });
    check('preflight → 204 + ACAO', preflight.res.status === 204 && !!preflight.res.headers.get('access-control-allow-origin'));

    /* 9. inactive site degrades gracefully (PRD §5.1, §7.8) */
    console.log('\n[9] paused site (subscription_inactive)');
    const sites = await req('/api/admin/clients', { cookie: ownerCookie });
    const siteId = sites.json.find((s) => s.slug === SLUG).id;
    await req(`/api/admin/clients/${siteId}`, { method: 'PUT', cookie: ownerCookie, body: { is_active: false } });
    const paused = await req(`/api/v1/sites/${SLUG}/content/products`, { origin: ORIGIN });
    check('paused → 403 subscription_inactive (json)', paused.res.status === 403 && isJson(paused.res) && paused.json?.error === 'subscription_inactive');
    check('paused response is no-store (never cached as 200)', paused.res.headers.get('cache-control') === 'no-store');
    await req(`/api/admin/clients/${siteId}`, { method: 'PUT', cookie: ownerCookie, body: { is_active: true } });
    const resumed = await pub('products');
    check('reactivated → content intact (not deleted)', resumed.res.status === 200 && resumed.json?.length > 0 && resumed.json.some((r) => r.name === 'Silk Scarf'));
  } catch (e) {
    failed++;
    failures.push(`FATAL: ${e.message}`);
    console.error('[contract] fatal:', e);
    console.error('[contract] server log tail:', serverLog.slice(-1200));
  } finally {
    server.kill();
  }

  console.log(`\n[contract] ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('[contract] failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed ? 1 : 0);
}

main();
