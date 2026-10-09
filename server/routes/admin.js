import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { COLLECTIONS, isCollection, COLLECTION_NAMES, SETTINGS_KEY_GROUPS, SETTINGS_KEYS } from '../collections.js';
import {
  createSession, clearCookie, requireAuth, requireOwner,
  verifyPassword, hashPassword, sessionCookie,
} from '../lib/auth.js';
import { hit } from '../lib/ratelimit.js';
import { sanitizeRow, validateRow, hasErrors } from '../lib/validate.js';
import { cell } from '../lib/normalize.js';

export const adminRouter = Router();

function userById(id) {
  return db.prepare('SELECT id, site_id, email, role FROM users WHERE id = ?').get(id);
}

/* ----------------------------- auth ----------------------------- */

adminRouter.post('/login', async (req, res) => {
  const email = cell(req.body?.email).toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'email_password_required' });

  const ip = req.ip || 'unknown';
  if (await hit(`login:${ip}:${email}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_attempts', retry_after_minutes: 15 });
  }

  const user = await db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  if (user.role === 'client') {
    const site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(user.site_id);
    if (site && !site.is_active) return res.status(403).json({ error: 'subscription_inactive' });
  }

  res.set('Set-Cookie', sessionCookie(createSession(user)));
  res.json({ id: user.id, email: user.email, role: user.role, site_id: user.site_id ?? null });
});

adminRouter.post('/logout', (req, res) => {
  res.set('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

adminRouter.post('/change-password', requireAuth, async (req, res) => {
  const current = String(req.body?.current_password ?? '');
  const next = String(req.body?.new_password ?? '');
  if (!current || !next) return res.status(400).json({ error: 'current_and_new_required' });
  if (next.length < 8) return res.status(400).json({ error: 'password_too_short' });

  const ip = req.ip || 'unknown';
  if (await hit(`chpw:${ip}:${req.session.uid}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_attempts', retry_after_minutes: 15 });
  }

  const user = await db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.session.uid);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  if (!verifyPassword(current, user.password_hash)) return res.status(401).json({ error: 'invalid_password' });

  await db.prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?').run(hashPassword(next), user.id);
  const fresh = await db.prepare('SELECT id, site_id, email, role, session_version FROM users WHERE id = ?').get(user.id);
  res.set('Set-Cookie', sessionCookie(createSession(fresh)));
  res.json({ ok: true });
});

adminRouter.get('/me', requireAuth, async (req, res) => {
  const user = await userById(req.session.uid);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  let site = null;
  if (user.site_id) site = await db.prepare('SELECT id, slug, name, allowed_origin, is_active FROM sites WHERE id = ?').get(user.site_id);
  res.json({ ...user, site });
});

adminRouter.get('/meta', requireAuth, async (req, res) => {
  const user = await userById(req.session.uid);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  res.json({
    brand: config.brandName,
    role: user.role,
    collections: COLLECTION_NAMES.map((name) => ({
      name,
      label: COLLECTIONS[name].label,
      kind: COLLECTIONS[name].kind,
      fields: COLLECTIONS[name].fields,
    })),
    settingsGroups: SETTINGS_KEY_GROUPS,
    settingsKeys: SETTINGS_KEYS,
  });
});

/* --------------------------- owner: clients --------------------------- */

adminRouter.get('/clients', requireAuth, requireOwner, async (req, res) => {
  const sites = await db.prepare('SELECT * FROM sites ORDER BY id').all();
  const out = await Promise.all(sites.map(async (s) => ({
    ...s,
    is_active: s.is_active ? 'TRUE' : 'FALSE',
    client_email: (await db.prepare('SELECT email FROM users WHERE site_id = ? AND role = ?').get(s.id, 'client'))?.email ?? '',
    product_count: (await db.prepare('SELECT COUNT(*) AS n FROM products WHERE site_id = ?').get(s.id)).n,
  })));
  res.json(out);
});

adminRouter.post('/clients', requireAuth, requireOwner, async (req, res) => {
  const slug = cell(req.body?.slug).toLowerCase();
  const name = cell(req.body?.name);
  const allowed_origin = cell(req.body?.allowed_origin);
  const email = cell(req.body?.email).toLowerCase();
  const password = String(req.body?.password ?? '');

  const errors = {};
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.slug = 'Slug must be lowercase letters, digits and dashes';
  if (!name) errors.name = 'Site name is required';
  if (!allowed_origin) errors.allowed_origin = 'Allowed origin is required (e.g. https://vf-gift-shop.vercel.app)';
  else if (!/^https?:\/\/[^/\s]+$/.test(allowed_origin)) errors.allowed_origin = 'Origin must be scheme+host only, no trailing slash (e.g. https://example.com)';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Valid email is required';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (await db.prepare('SELECT id FROM sites WHERE slug = ?').get(slug)) errors.slug = `A site with slug "${slug}" already exists`;
  if (await db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) errors.email = `A user with email "${email}" already exists`;
  if (hasErrors(errors)) return res.status(400).json({ error: 'validation_failed', fields: errors });

  const siteId = await db.transaction(async (t) => {
    const site = await t.run('INSERT INTO sites (slug, name, allowed_origin, is_active) VALUES (?, ?, ?, 1)', slug, name, allowed_origin);
    await t.run('INSERT INTO users (site_id, email, password_hash, role) VALUES (?, ?, ?, ?)', site.lastInsertRowid, email, hashPassword(password), 'client');
    return site.lastInsertRowid;
  });
  res.status(201).json({ ok: true, site: await db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) });
});

adminRouter.put('/clients/:id', requireAuth, requireOwner, async (req, res) => {
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'site_not_found' });

  const errors = {};
  const updates = {};
  if ('name' in req.body) {
    const name = cell(req.body.name);
    if (!name) errors.name = 'Site name cannot be empty';
    updates.name = name;
  }
  if ('allowed_origin' in req.body) {
    const origin = cell(req.body.allowed_origin);
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) errors.allowed_origin = 'Origin must be scheme+host only, no trailing slash';
    updates.allowed_origin = origin;
  }
  if ('is_active' in req.body) {
    const v = req.body.is_active;
    updates.is_active = (v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1') ? 1 : 0;
  }
  if ('email' in req.body && cell(req.body.email)) {
    const email = cell(req.body.email).toLowerCase();
    const clash = await db.prepare('SELECT id FROM users WHERE lower(email) = ? AND site_id != ?').get(email, site.id);
    if (clash) errors.email = 'Email already in use';
    updates.email = email;
  }
  if ('password' in req.body && String(req.body.password ?? '')) {
    if (String(req.body.password).length < 8) errors.password = 'Password must be at least 8 characters';
    else updates.password_hash = hashPassword(String(req.body.password));
  }
  if (hasErrors(errors)) return res.status(400).json({ error: 'validation_failed', fields: errors });
  if (!Object.keys(updates).length) return res.json({ ok: true, site: { ...site, is_active: site.is_active ? 'TRUE' : 'FALSE' } });

  const cols = Object.keys(updates);
  const siteCols = cols.filter((c) => c !== 'password_hash' && c !== 'email');
  if (siteCols.length) {
    await db.prepare(`UPDATE sites SET ${siteCols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...siteCols.map((c) => updates[c]), site.id);
  }
  const userCols = cols.filter((c) => c === 'password_hash' || c === 'email');
  if (userCols.length) {
    await db.prepare(`UPDATE users SET ${userCols.map((c) => `${c} = ?`).join(', ')} WHERE site_id = ? AND role = 'client'`)
      .run(...userCols.map((c) => updates[c]), site.id);
  }
  const fresh = await db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
  res.json({ ok: true, site: { ...fresh, is_active: fresh.is_active ? 'TRUE' : 'FALSE' } });
});

/* --------------------------- generic CRUD --------------------------- */

adminRouter.use(requireAuth);

async function resolveSiteId(req, res) {
  if (req.session.site) return req.session.site;
  const q = req.query.site ? parseInt(String(req.query.site), 10) : NaN;
  if (!Number.isFinite(q)) {
    res.status(400).json({ error: 'site_required', message: 'Owner requests must include ?site=<site id>' });
    return null;
  }
  const site = await db.prepare('SELECT id FROM sites WHERE id = ?').get(q);
  if (!site) { res.status(404).json({ error: 'site_not_found' }); return null; }
  return site.id;
}

const ORDER_BY = '(display_order IS NULL), display_order, id';

function listRows(col, siteId) {
  if (col.kind === 'kv') {
    return db.prepare(`SELECT id, key, value FROM ${col.table} WHERE site_id = ? ORDER BY key`).all(siteId);
  }
  const cols = ['id', ...col.fields.map((f) => f.name)].join(', ');
  const order = col.fields.some((f) => f.name === 'display_order') ? ` ORDER BY ${ORDER_BY}` : ' ORDER BY id';
  return db.prepare(`SELECT ${cols} FROM ${col.table} WHERE site_id = ?${order}`).all(siteId);
}

function getRow(col, siteId, id) {
  const cols = col.kind === 'kv'
    ? 'id, key, value'
    : ['id', ...col.fields.map((f) => f.name)].join(', ');
  return db.prepare(`SELECT ${cols} FROM ${col.table} WHERE site_id = ? AND id = ?`).get(siteId, id);
}

adminRouter.get('/:collection', async (req, res) => {
  const { collection } = req.params;
  if (!isCollection(collection)) return res.status(404).json({ error: 'unknown_collection' });
  const siteId = await resolveSiteId(req, res);
  if (siteId === null) return;
  res.json(await listRows(COLLECTIONS[collection], siteId));
});

adminRouter.post('/:collection', async (req, res) => {
  const { collection } = req.params;
  if (!isCollection(collection)) return res.status(404).json({ error: 'unknown_collection' });
  const siteId = await resolveSiteId(req, res);
  if (siteId === null) return;

  const col = COLLECTIONS[collection];
  const data = sanitizeRow(collection, req.body ?? {});
  const { errors, warnings } = await validateRow(collection, data, { db, siteId });
  if (hasErrors(errors)) return res.status(400).json({ error: 'validation_failed', fields: errors, warnings });

  let id;
  if (col.kind === 'kv') {
    await db.prepare(`INSERT INTO ${col.table} (site_id, key, value) VALUES (?, ?, ?)
      ON CONFLICT(site_id, key) DO UPDATE SET value = excluded.value`)
      .run(siteId, data.key, data.value ?? '');
    id = (await db.prepare(`SELECT id FROM ${col.table} WHERE site_id = ? AND key = ?`).get(siteId, data.key)).id;
  } else {
    const names = Object.keys(data);
    if (!names.length) return res.status(400).json({ error: 'empty_row' });
    const placeholders = names.map(() => '?').join(', ');
    id = (await db.prepare(`INSERT INTO ${col.table} (site_id, ${names.join(', ')}) VALUES (?, ${placeholders})`)
      .run(siteId, ...names.map((n) => data[n]))).lastInsertRowid;
  }
  res.status(201).json({ ok: true, id, row: await getRow(col, siteId, id), warnings });
});

adminRouter.get('/:collection/:id', async (req, res) => {
  const { collection } = req.params;
  if (!isCollection(collection)) return res.status(404).json({ error: 'unknown_collection' });
  const siteId = await resolveSiteId(req, res);
  if (siteId === null) return;
  const row = await getRow(COLLECTIONS[collection], siteId, req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

adminRouter.put('/:collection/:id', async (req, res) => {
  const { collection } = req.params;
  if (!isCollection(collection)) return res.status(404).json({ error: 'unknown_collection' });
  const siteId = await resolveSiteId(req, res);
  if (siteId === null) return;

  const col = COLLECTIONS[collection];
  const existing = await getRow(col, siteId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const patch = sanitizeRow(collection, req.body ?? {});
  const data = { ...existing, ...patch };
  delete data.id;
  const { errors, warnings } = await validateRow(collection, data, { db, siteId, excludeId: Number(req.params.id) });
  if (hasErrors(errors)) return res.status(400).json({ error: 'validation_failed', fields: errors, warnings });

  if (col.kind === 'kv') {
    try {
      await db.prepare(`UPDATE ${col.table} SET key = ?, value = ? WHERE site_id = ? AND id = ?`)
        .run(data.key, data.value ?? '', siteId, req.params.id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return res.status(400).json({ error: 'validation_failed', fields: { key: 'This key already exists for this site' } });
      }
      throw e;
    }
  } else {
    const names = Object.keys(data);
    await db.prepare(`UPDATE ${col.table} SET ${names.map((n) => `${n} = ?`).join(', ')} WHERE site_id = ? AND id = ?`)
      .run(...names.map((n) => data[n]), siteId, req.params.id);
  }
  res.json({ ok: true, row: await getRow(col, siteId, req.params.id), warnings });
});

adminRouter.delete('/:collection/:id', async (req, res) => {
  const { collection } = req.params;
  if (!isCollection(collection)) return res.status(404).json({ error: 'unknown_collection' });
  const siteId = await resolveSiteId(req, res);
  if (siteId === null) return;
  const col = COLLECTIONS[collection];
  const existing = await getRow(col, siteId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await db.prepare(`DELETE FROM ${col.table} WHERE site_id = ? AND id = ?`).run(siteId, req.params.id);
  res.json({ ok: true });
});
