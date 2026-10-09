import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const SMOKE_DB = path.join(config.root, 'data', 'smoke.db');
const ORIGIN = 'https://smoke-test.example.com';

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

function runImport() {
  return spawnSync(process.execPath, [path.join(config.root, 'scripts', 'import-from-sheet.mjs')], {
    cwd: config.root,
    env: {
      ...process.env,
      SHEET_SITE_SLUG: 'smoke-test',
      DB_PATH: './data/smoke.db',
      // Offline by default (local fixtures); set SMOKE_LIVE=1 to hit the real sheet.
      SHEET_FIXTURES: process.env.SMOKE_LIVE ? '' : './scripts/fixtures',
    },
    encoding: 'utf8',
    timeout: 60000,
  });
}

function importDetail(r) {
  return JSON.stringify({ status: r.status, signal: r.signal, error: String(r.error || ''), out: (r.stdout || '').slice(-200), err: (r.stderr || '').slice(-200) });
}

/* ------------------------------ suite ------------------------------ */

async function main() {
  console.log('[smoke] preparing isolated DB (data/smoke.db)…');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${SMOKE_DB}${suffix}`, { force: true });

  const server = spawn(process.execPath, [path.join(config.root, 'server', 'app.js')], {
    cwd: config.root,
    env: { ...process.env, PORT: String(PORT), DB_PATH: './data/smoke.db' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  server.on('exit', (code, sig) => { serverLog += `\n[SERVER EXITED code=${code} sig=${sig}]\n`; });

  try {
    await waitForServer();

    /* 1. health */
    console.log('\n[1] health & boot');
    const health = await req('/health');
    check('GET /health → 200', health.res.status === 200 && health.json.status === 'ok');

    /* 2. auth */
    console.log('\n[2] auth');
    const badLogin = await req('/api/admin/login', { method: 'POST', body: { email: config.ownerEmail, password: 'wrong-password' } });
    check('wrong password → 401', badLogin.res.status === 401);

    const login = await req('/api/admin/login', { method: 'POST', body: { email: config.ownerEmail, password: config.ownerPassword } });
    const ownerCookie = cookieOf(login.res);
    check('owner login → 200 + session cookie', login.res.status === 200 && !!ownerCookie);

    const me = await req('/api/admin/me', { cookie: ownerCookie });
    check('/me → owner role', me.json?.role === 'owner');

    const meta = await req('/api/admin/meta', { cookie: ownerCookie });
    check('/meta → 9 collections', meta.json?.collections?.length === 9);
    check('/meta → 4 category-card settings groups', meta.json?.settingsGroups?.some((g) => g.key === 'category_cards'));

    const noAuth = await req('/api/admin/meta');
    check('unauthenticated /meta → 401', noAuth.res.status === 401);

    const csrf = await req('/api/admin/login', {
      method: 'POST', origin: 'https://evil.example.com',
      body: { email: config.ownerEmail, password: config.ownerPassword },
    });
    check('cross-origin admin POST → 403 csrf_origin_mismatch', csrf.res.status === 403 && csrf.json?.error === 'csrf_origin_mismatch');

    /* 3. owner creates two clients */
    console.log('\n[3] multi-tenancy');
    const siteA = await req('/api/admin/clients', {
      method: 'POST', cookie: ownerCookie,
      body: { slug: 'smoke-test', name: 'Smoke Site', allowed_origin: ORIGIN, email: 'a@smoke.test', password: 'Password123!' },
    });
    check('create client A → 201', siteA.res.status === 201, JSON.stringify(siteA.json));
    const siteB = await req('/api/admin/clients', {
      method: 'POST', cookie: ownerCookie,
      body: { slug: 'other-site', name: 'Other Site', allowed_origin: 'https://other.example.com', email: 'b@smoke.test', password: 'Password123!' },
    });
    check('create client B → 201', siteB.res.status === 201);

    const clientLogin = await req('/api/admin/login', { method: 'POST', body: { email: 'a@smoke.test', password: 'Password123!' } });
    const clientCookie = cookieOf(clientLogin.res);
    check('client login → session', clientLogin.res.status === 200 && !!clientCookie);

    /* client writes a product */
    const createProduct = await req('/api/admin/products', {
      method: 'POST', cookie: clientCookie,
      body: { name: 'Smoke Widget', price: '25000', description: 'Test product', is_visible: 'TRUE', featured: 'FALSE', in_stock: 'TRUE', display_order: '1' },
    });
    check('client creates product → 201', createProduct.res.status === 201, JSON.stringify(createProduct.json));
    const productAId = createProduct.json?.id;

    const productInB = await req('/api/admin/products?site=2', {
      method: 'POST', cookie: ownerCookie,
      body: { name: 'B Only Product', price: '1000', is_visible: 'TRUE', display_order: '1' },
    });
    check('owner creates product in site B', productInB.res.status === 201);
    const crossWrite = await req(`/api/admin/products/${productInB.json?.id}`, { method: 'PUT', cookie: clientCookie, body: { name: 'hacked' } });
    check('client cannot edit site B row → 404', crossWrite.res.status === 404);
    const crossList = await req(`/api/admin/products?site=${productInB.json ? 2 : 1}`, { cookie: clientCookie });
    check('client list forced to own site (site A rows only)', Array.isArray(crossList.json) && crossList.json.every((r) => r.name !== 'B Only Product'));

    /* owner edits another site's content via ?site (owner content management UI) */
    const ownerEdit = await req(`/api/admin/products/${productInB.json?.id}?site=2`, {
      method: 'PUT', cookie: ownerCookie, body: { name: 'B Only Product v2', price: '1500' },
    });
    check('owner edits site B content via ?site → 200', ownerEdit.res.status === 200 && ownerEdit.json?.row?.name === 'B Only Product v2');
    const ownerSettings = await req('/api/admin/settings?site=2', {
      method: 'POST', cookie: ownerCookie, body: { key: 'whatsapp_number', value: '08012345678' },
    });
    check('owner upserts site B settings via ?site → 201', ownerSettings.res.status === 201);
    const ownerSettingsPublic = await req('/api/v1/sites/other-site/content/settings');
    check('site B settings visible on site B public API', (ownerSettingsPublic.json ?? []).some((r) => r.key === 'whatsapp_number' && r.value === '08012345678'));

    /* 4. validation */
    console.log('\n[4] validation');
    const badPrice = await req('/api/admin/products', {
      method: 'POST', cookie: clientCookie,
      body: { name: 'Bad Price', price: '₦20,000 - ₦30,000' },
    });
    check('unparseable price → 400 with fields.price', badPrice.res.status === 400 && !!badPrice.json?.fields?.price);

    const dupName = await req('/api/admin/products', {
      method: 'POST', cookie: clientCookie,
      body: { name: 'Smoke Widget', price: '1000' },
    });
    check('duplicate name → 200 with warning (advisory)', dupName.res.status === 201 && (dupName.json?.warnings?.length ?? 0) > 0);

    const badKey = await req('/api/admin/settings', {
      method: 'POST', cookie: clientCookie,
      body: { key: 'totally_made_up_key', value: 'x' },
    });
    check('unknown settings key → 400', badKey.res.status === 400 && !!badKey.json?.fields?.key);

    const goodKey = await req('/api/admin/settings', {
      method: 'POST', cookie: clientCookie,
      body: { key: 'category_customized_jewelry_image_url', value: 'https://example.com/jewelry.jpg' },
    });
    check('category card key → upsert 201', goodKey.res.status === 201);

    const badRating = await req('/api/admin/testimonials', {
      method: 'POST', cookie: clientCookie,
      body: { name: 'X', quote: 'Nice', rating: '9' },
    });
    check('rating 9 → 400', badRating.res.status === 400 && !!badRating.json?.fields?.rating);

    const badRep = await req('/api/admin/sales_reps', {
      method: 'POST', cookie: clientCookie,
      body: { rep_id: 'REP001', name: 'One', is_active: 'TRUE' },
    });
    check('rep created → 201', badRep.res.status === 201);
    const dupRep = await req('/api/admin/sales_reps', {
      method: 'POST', cookie: clientCookie,
      body: { rep_id: 'rep001', name: 'Two', is_active: 'TRUE' },
    });
    check('duplicate rep_id (case-insensitive) → 400', dupRep.res.status === 400 && !!dupRep.json?.fields?.rep_id);

    const whyA = await req('/api/admin/why_us', {
      method: 'POST', cookie: clientCookie,
      body: { title: 'Smoke Only Reliable', is_visible: 'TRUE' },
    });
    const dupWhy = await req('/api/admin/why_us', {
      method: 'POST', cookie: clientCookie,
      body: { title: 'Smoke Only Reliable', is_visible: 'TRUE' },
    });
    check('exact duplicate why_us → 201 with warning', whyA.res.status === 201 && dupWhy.res.status === 201 && (dupWhy.json?.warnings?.length ?? 0) > 0);

    /* 5. public contract */
    console.log('\n[5] public API contract');
    const collections = ['settings', 'products', 'sales_reps', 'payouts', 'testimonials', 'portfolio', 'why_us', 'how_to_order', 'faqs'];
    for (const c of collections) {
      const r = await req(`/api/v1/sites/smoke-test/content/${c}`, { origin: ORIGIN });
      check(`${c}: 200 array, all values are strings`, r.res.status === 200 && Array.isArray(r.json) && allStrings(r.json), `status=${r.res.status}`);
    }

    const empty = await req('/api/v1/sites/smoke-test/content/payouts', { origin: ORIGIN });
    check('empty collection → [] (not null/error)', Array.isArray(empty.json) && empty.json.length === 0);

    const noCache = await req('/api/v1/sites/smoke-test/content/products');
    check('Cache-Control: public, max-age=60', noCache.res.headers.get('cache-control') === 'public, max-age=60');

    const corsOk = await req('/api/v1/sites/smoke-test/content/products', { origin: ORIGIN });
    check('CORS reflects registered origin', corsOk.res.headers.get('access-control-allow-origin') === ORIGIN);
    const corsBad = await req('/api/v1/sites/smoke-test/content/products', { origin: 'https://evil.example.com' });
    check('CORS ignores foreign origin', corsBad.res.headers.get('access-control-allow-origin') === null);

    const preflight = await req('/api/v1/sites/smoke-test/content/products', { method: 'OPTIONS', origin: ORIGIN });
    check('preflight → 204 + allow headers', preflight.res.status === 204 && !!preflight.res.headers.get('access-control-allow-origin'));

    const unknownColl = await req('/api/v1/sites/smoke-test/content/nope');
    check('unknown collection → 404', unknownColl.res.status === 404);
    const unknownSite = await req('/api/v1/sites/ghost/content/products');
    check('unknown site → 404', unknownSite.res.status === 404);

    const single = await req('/api/v1/sites/smoke-test/products/smoke-widget');
    check('product by slug → 200', single.res.status === 200 && single.json?.name === 'Smoke Widget');
    const missingProduct = await req('/api/v1/sites/smoke-test/products/nope-nope');
    check('missing product → 404 json (never HTML 200)', missingProduct.res.status === 404 && missingProduct.json?.error === 'not_found');

    /* pause site → 403, restore */
    const sites = await req('/api/admin/clients', { cookie: ownerCookie });
    const siteAId = sites.json.find((s) => s.slug === 'smoke-test').id;
    await req(`/api/admin/clients/${siteAId}`, { method: 'PUT', cookie: ownerCookie, body: { is_active: false } });
    const pausedRead = await req('/api/v1/sites/smoke-test/content/products', { origin: ORIGIN });
    check('paused site → 403 subscription_inactive', pausedRead.res.status === 403 && pausedRead.json?.error === 'subscription_inactive');
    await req(`/api/admin/clients/${siteAId}`, { method: 'PUT', cookie: ownerCookie, body: { is_active: true } });
    const resumed = await req('/api/v1/sites/smoke-test/content/products');
    check('site reactivated → 200', resumed.res.status === 200);

    /* 6. settings surface via public API */
    console.log('\n[6] settings');
    const settings = await req('/api/v1/sites/smoke-test/content/settings');
    const catCard = settings.json?.find((r) => r.key === 'category_customized_jewelry_image_url');
    check('category card setting readable as {key,value} strings', !!catCard && typeof catCard.key === 'string' && typeof catCard.value === 'string');

    /* 6b. change password */
    console.log('\n[6b] change password');
    const noSessPw = await req('/api/admin/change-password', { method: 'POST', body: { current_password: 'x', new_password: 'y' } });
    check('change-password without session → 401', noSessPw.res.status === 401);

    const wrongCur = await req('/api/admin/change-password', {
      method: 'POST', cookie: clientCookie,
      body: { current_password: 'wrong', new_password: 'NewPass456!' },
    });
    check('wrong current password → 401 invalid_password', wrongCur.res.status === 401 && wrongCur.json?.error === 'invalid_password');

    const shortPw = await req('/api/admin/change-password', {
      method: 'POST', cookie: clientCookie,
      body: { current_password: 'Password123!', new_password: 'short' },
    });
    check('short new password → 400 password_too_short', shortPw.res.status === 400 && shortPw.json?.error === 'password_too_short');

    const chpw = await req('/api/admin/change-password', {
      method: 'POST', cookie: clientCookie,
      body: { current_password: 'Password123!', new_password: 'NewPass456!' },
    });
    check('client changes own password → 200', chpw.res.status === 200 && chpw.json?.ok === true);

    const chpwCookie = cookieOf(chpw.res);
    const stale = await req('/api/admin/me', { cookie: clientCookie });
    check('old session invalidated after password change → 401', stale.res.status === 401);
    const current = await req('/api/admin/me', { cookie: chpwCookie });
    check('re-issued session stays valid → 200', chpwCookie && current.res.status === 200);

    const newLogin = await req('/api/admin/login', { method: 'POST', body: { email: 'a@smoke.test', password: 'NewPass456!' } });
    check('login with new password → 200', newLogin.res.status === 200);

    const restorePw = await req('/api/admin/change-password', {
      method: 'POST', cookie: chpwCookie,
      body: { current_password: 'NewPass456!', new_password: 'Password123!' },
    });
    const oldLogin = await req('/api/admin/login', { method: 'POST', body: { email: 'a@smoke.test', password: 'Password123!' } });
    check('restore original password → old login works again', restorePw.res.status === 200 && oldLogin.res.status === 200);

    /* 7. logout (stateless HMAC — server clears the cookie via Max-Age=0; token stays valid until expiry by design) */
    console.log('\n[7] logout');
    const logoutRes = await req('/api/admin/logout', { method: 'POST', cookie: clientCookie });
    const logoutSetCookie = logoutRes.res.headers.getSetCookie?.().join(';') ?? '';
    check('logout sets Max-Age=0 on session cookie', /sabi_session=;.*Max-Age=0/i.test(logoutSetCookie));
    const noCookie = await req('/api/admin/meta');
    check('request without cookie → 401', noCookie.res.status === 401);

    /* 8. rate limit (distinct email bucket) */
    console.log('\n[8] login rate limit');
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await req('/api/admin/login', { method: 'POST', body: { email: 'ratelimit@smoke.test', password: 'nope' } });
      if (r.res.status === 429) { limited = true; break; }
    }
    check('12 bad logins → 429', limited);

    /* 9. import: seed + idempotency (offline fixtures unless SMOKE_LIVE=1) */
    console.log(`\n[9] sheet import (idempotency, source: ${process.env.SMOKE_LIVE ? 'live sheet' : 'fixtures'})`);
    const imp1 = runImport();
    check('import run 1 exits 0', imp1.status === 0, importDetail(imp1));
    const count1 = (await req('/api/v1/sites/smoke-test/content/products')).json?.length ?? 0;
    const imp2 = runImport();
    check('import run 2 exits 0 (idempotent)', imp2.status === 0, importDetail(imp2));
    const count2 = (await req('/api/v1/sites/smoke-test/content/products')).json?.length ?? 0;
    check(`re-import stable (${count1} products)`, count1 === count2 && count1 > 0);

    const allCollections = ['products', 'sales_reps', 'payouts', 'testimonials', 'portfolio', 'why_us', 'how_to_order', 'faqs'];
    let allOk = true;
    for (const c of allCollections) {
      const r = await req(`/api/v1/sites/smoke-test/content/${c}`);
      if (!Array.isArray(r.json) || !allStrings(r.json)) allOk = false;
    }
    check('imported content: every value is a string across all collections', allOk);

    const impReport = `${imp1.stdout}`;
    check('import reports duplicates removed', /duplicates removed/.test(impReport));
    check('import warns on unparseable price', /Price must be a plain number/.test(impReport));

    /* 10. landing + admin static */
    console.log('\n[10] static');
    const landing = await req('/');
    check('GET / → landing page', landing.res.status === 200 && /html/i.test(landing.res.headers.get('content-type') || ''));
    const loginPage = await req('/admin/login.html');
    check('GET /admin/login.html → 200', loginPage.res.status === 200);
    const envLeak = await req('/.env');
    check('.env is NOT served', envLeak.res.status !== 200);
    const dataLeak = await req('/data/cms.db');
    check('database files are NOT served', dataLeak.res.status !== 200);
  } catch (e) {
    failed++;
    failures.push(`FATAL: ${e.message}`);
    console.error('[smoke] fatal:', e);
    console.error('[smoke] server log tail:', serverLog.slice(-1200));
  } finally {
    server.kill();
  }

  console.log(`\n[smoke] ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('[smoke] failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed ? 1 : 0);
}

main();
