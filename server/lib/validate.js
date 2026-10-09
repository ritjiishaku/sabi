import { COLLECTIONS, SETTINGS_KEYS } from '../collections.js';
import { cell, normalizeToggle, parsePrice } from './normalize.js';

const TOGGLES = new Set(['is_visible', 'featured', 'in_stock', 'wide', 'is_active']);

export function sanitizeRow(collection, input) {
  const col = COLLECTIONS[collection];
  const out = {};
  if (col.kind === 'kv') {
    out.key = cell(input.key);
    out.value = cell(input.value);
    return out;
  }
  for (const f of col.fields) {
    if (!(f.name in input)) continue;
    if (f.type === 'toggle') {
      out[f.name] = normalizeToggle(input[f.name]);
    } else if (f.name === 'display_order') {
      const v = cell(input[f.name]);
      if (v === '') continue;
      const n = parseInt(v, 10);
      out[f.name] = Number.isFinite(n) ? String(n) : v;
    } else {
      out[f.name] = cell(input[f.name]);
    }
  }
  return out;
}

export async function validateRow(collection, data, { db, siteId, excludeId = null }) {
  const col = COLLECTIONS[collection];
  const errors = {};
  const warnings = [];

  if (col.kind === 'kv') {
    if (!data.key) errors.key = 'Key is required';
    else if (!SETTINGS_KEYS.includes(data.key)) {
      errors.key = `"${data.key}" is not a known settings key — it would silently be ignored by the site`;
    }
    if (data.key && !data.value) warnings.push('Empty value — the key is stored but the site keeps its default until a value is set');
    return { errors, warnings };
  }

  for (const f of col.fields) {
    if (f.required && !(data[f.name] ?? '').trim()) errors[f.name] = `${f.label} is required`;
  }

  if (collection === 'products' && data.price) {
    if (parsePrice(data.price) === null) {
      errors.price = `Price must be a plain number (optional ₦/NGN prefix, commas allowed) — got "${data.price}". Unparseable prices vanish from price filters and sorts on the storefront.`;
    }
  }

  if (collection === 'testimonials' && data.rating) {
    const r = Number(data.rating);
    if (!Number.isInteger(r) || r < 0 || r > 5) errors.rating = 'Rating must be an integer 0–5';
  }

  if (collection === 'sales_reps' && data.commission_rate && data.commission_rate.trim()) {
    if (!/^-?\d+(\.\d+)?\s*%?$/.test(data.commission_rate.trim())) {
      warnings.push(`Commission rate "${data.commission_rate}" is not numeric — storefront expects e.g. "10" or "10%"`);
    }
  }

  if (collection === 'sales_reps' && data.rep_id) {
    const clash = await db
      .prepare(`SELECT id FROM ${col.table} WHERE site_id = ? AND lower(rep_id) = lower(?) AND id != ?`)
      .get(siteId, data.rep_id, excludeId ?? -1);
    if (clash) errors.rep_id = `Rep ID "${data.rep_id}" already exists for this site`;
  }

  if (collection === 'products' && data.name) {
    const clash = await db
      .prepare(`SELECT id FROM ${col.table} WHERE site_id = ? AND lower(name) = lower(?) AND id != ?`)
      .get(siteId, data.name, excludeId ?? -1);
    if (clash) {
      warnings.push(`Duplicate product name "${data.name}" — share links (/product/:slug) derive from the name, so duplicates collide`);
    }
  }

  // Exact-duplicate rows (same dedupeKey) — advisory, matching the importer's dedupe rule.
  // Skipped where a hard uniqueness constraint already applies (uniqueBy) or where a
  // dedicated message exists (products above), and for kv settings (UNIQUE(site_id,key)).
  if (col.kind !== 'kv' && collection !== 'products' && !(col.uniqueBy?.length) && col.dedupeKey?.length) {
    const conds = col.dedupeKey.map((k) => `COALESCE(${k}, '') = ?`).join(' AND ');
    const vals = col.dedupeKey.map((k) => data[k] ?? '');
    const clash = await db
      .prepare(`SELECT id FROM ${col.table} WHERE site_id = ? AND ${conds} AND id != ?`)
      .get(siteId, ...vals, excludeId ?? -1);
    if (clash) {
      warnings.push(`An identical ${col.label} row already exists (same ${col.dedupeKey.join(' + ')}) — the storefront dedupes these, so it would not display twice`);
    }
  }

  return { errors, warnings };
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}
