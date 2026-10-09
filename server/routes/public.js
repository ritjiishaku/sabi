import { Router } from 'express';
import { db } from '../db.js';
import { COLLECTIONS, isCollection } from '../collections.js';
import { stringifyRow } from '../lib/normalize.js';
import { slugify } from '../lib/slugify.js';

export const publicRouter = Router();

publicRouter.use('/sites/:siteSlug', (req, res, next) => {
  const site = db.prepare('SELECT * FROM sites WHERE slug = ?').get(req.params.siteSlug);
  if (!site) return res.status(404).json({ error: 'site_not_found' });
  if (!site.is_active) {
    res.set('Cache-Control', 'no-store');
    return res.status(403).json({ error: 'subscription_inactive' });
  }
  req.site = site;
  next();
});

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = req.site.allowed_origin;
  res.set('Vary', 'Origin');
  if (origin && allowed && origin === allowed) {
    res.set('Access-Control-Allow-Origin', allowed);
  }
}

publicRouter.options('/sites/:siteSlug/*splat', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE slug = ?').get(req.params.siteSlug);
  if (!site || !site.is_active) return res.sendStatus(403);
  const origin = req.headers.origin;
  if (origin && site.allowed_origin && origin !== site.allowed_origin) {
    return res.sendStatus(403);
  }
  if (origin && site.allowed_origin) res.set('Access-Control-Allow-Origin', site.allowed_origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '600');
  res.sendStatus(204);
});

const ORDER_BY = '(display_order IS NULL), display_order, id';

publicRouter.get('/sites/:siteSlug/content/:collection', (req, res) => {
  const { collection } = req.params;
  if (!isCollection(collection)) return res.status(404).json({ error: 'unknown_collection' });
  applyCors(req, res);
  res.set('Cache-Control', 'public, max-age=60');

  const col = COLLECTIONS[collection];
  let rows;
  if (col.kind === 'kv') {
    rows = db
      .prepare(`SELECT key, value FROM ${col.table} WHERE site_id = ? ORDER BY key`)
      .all(req.site.id)
      .map((r) => stringifyRow(r, ['key', 'value']));
  } else {
    const cols = col.publicColumns.join(', ');
    const order = col.publicColumns.includes('display_order') ? ` ORDER BY ${ORDER_BY}` : '';
    rows = db
      .prepare(`SELECT ${cols} FROM ${col.table} WHERE site_id = ?${order}`)
      .all(req.site.id)
      .map((r) => stringifyRow(r, col.publicColumns));
  }
  res.json(rows);
});

publicRouter.get('/sites/:siteSlug/products/:slug', (req, res) => {
  applyCors(req, res);
  res.set('Cache-Control', 'public, max-age=60');

  const col = COLLECTIONS.products;
  const rows = db
    .prepare(
      `SELECT ${col.publicColumns.join(', ')} FROM ${col.table}
       WHERE site_id = ? ORDER BY ${ORDER_BY}`
    )
    .all(req.site.id);

  const { slug } = req.params;
  const numeric = /^\d+$/.test(slug) ? parseInt(slug, 10) : null;

  let match = null;
  const seen = new Set();
  for (const row of rows) {
    const nameKey = String(row.name ?? '').toLowerCase();
    const rowSlug = slugify(row.name);
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);
    if (rowSlug === slug || (numeric !== null && Number(row.display_order) === numeric)) {
      match = row;
      break;
    }
  }

  if (!match) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.status(404).json({ error: 'not_found' });
  }
  res.json(stringifyRow(match, col.publicColumns));
});
