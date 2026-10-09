import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { config } from '../server/config.js';
import { COLLECTIONS } from '../server/collections.js';
import { normalizeHeader, cell } from '../server/lib/normalize.js';
import { validateRow } from '../server/lib/validate.js';

const SHEET_ID = process.env.SHEET_ID || config.sheetId;
const SITE_SLUG = process.env.SHEET_SITE_SLUG || config.sheetSiteSlug;
// When set, read tab CSVs from this directory instead of the network — lets the
// whole import path (parse → normalize → dedupe → validate) run offline in tests.
const FIXTURES_DIR = process.env.SHEET_FIXTURES || '';

function fail(msg) {
  console.error(`[import] ERROR: ${msg}`);
  process.exit(1);
}

if (!FIXTURES_DIR && !SHEET_ID) fail('SHEET_ID missing (set in .env)');

/* ------------------------- CSV parsing ------------------------- */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchTab(tabName) {
  let text;
  if (FIXTURES_DIR) {
    const file = path.join(config.root, FIXTURES_DIR, `${tabName}.csv`);
    if (!fs.existsSync(file)) fail(`fixture not found for tab "${tabName}" (${file})`);
    text = fs.readFileSync(file, 'utf8');
  } else {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url);
    if (!res.ok) fail(`fetch "${tabName}" → HTTP ${res.status}`);
    text = await res.text();
    if (/^\s*<!doctype html/i.test(text)) fail(`fetch "${tabName}" returned HTML (is the sheet link/permission correct?)`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCSV(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1)
    .filter((r) => r.some((v) => cell(v) !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = cell(r[i]); });
      return obj;
    });
  return { headers, records };
}

/* ---------------------------- main ---------------------------- */

async function ensureSite() {
  let site = await db.prepare('SELECT * FROM sites WHERE slug = ?').get(SITE_SLUG);
  if (!site) {
    const origin = process.env.SHEET_ORIGIN || 'https://vf-gift-shop.vercel.app';
    const id = (await db.prepare('INSERT INTO sites (slug, name, allowed_origin, is_active) VALUES (?, ?, ?, 1)')
      .run(SITE_SLUG, 'Gift by VF', origin)).lastInsertRowid;
    site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    console.log(`[import] created site "${SITE_SLUG}" (origin: ${origin})`);
  }
  return site;
}

function dedupe(records, columns) {
  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const rec of records) {
    const sig = columns.map((c) => rec[c] ?? '').join('\u0000');
    if (seen.has(sig)) { removed++; continue; }
    seen.add(sig);
    kept.push(rec);
  }
  return { kept, removed };
}

async function main() {
  const site = await ensureSite();
  const report = [];
  let totalImported = 0;
  let totalRemoved = 0;
  let totalWarnings = 0;

  for (const [name, col] of Object.entries(COLLECTIONS)) {
    let headers, records;
    try {
      ({ headers, records } = await fetchTab(col.sheetTab));
    } catch (e) {
      fail(`tab "${col.sheetTab}": ${e.message}`);
    }

    const known = col.kind === 'kv' ? ['key', 'value'] : col.fields.map((f) => f.name);
    const mapped = headers.filter((h) => known.includes(h));
    const unknown = headers.filter((h) => h && !known.includes(h));

    if (col.kind === 'kv' && !mapped.includes('key')) {
      report.push(`[import] ${col.label}: tab "${col.sheetTab}" has no key/value structure — skipped (site uses hardcoded defaults until keys are set in admin)`);
      continue;
    }
    if (!mapped.length) {
      report.push(`[import] ${col.label}: no recognised columns in tab "${col.sheetTab}" — skipped`);
      continue;
    }

    const { kept, removed } = col.kind === 'kv'
      ? { kept: records.filter((r) => cell(r.key) !== ''), removed: 0 }
      : dedupe(records, known);

    // Clear previous rows first so validation (unique/duplicate checks) runs against a clean slate — keeps re-imports idempotent
    await db.prepare(`DELETE FROM ${col.table} WHERE site_id = ?`).run(site.id);

    const warnings = [];
    const insertRows = [];

    for (const rec of kept) {
      const data = {};
      for (const f of known) {
        const v = cell(rec[f]);
        if (f === 'display_order') data[f] = v === '' ? null : (Number.isFinite(parseInt(v, 10)) ? String(parseInt(v, 10)) : v);
        else data[f] = v;
      }
      const { errors, warnings: w } = await validateRow(name, data, { db, siteId: site.id });
      // Downgrade errors to warnings: the sheet is imported as-is (strings), fixes happen in admin
      for (const [field, msg] of Object.entries(errors)) warnings.push(`${col.label}: ${msg}`);
      for (const wmsg of w) warnings.push(`${col.label}: ${wmsg}`);
      insertRows.push(data);
    }

    await db.transaction(async (t) => {
      if (col.kind === 'kv') {
        for (const d of insertRows) {
          await t.run(`INSERT INTO ${col.table} (site_id, key, value) VALUES (?, ?, ?)`, site.id, d.key, d.value ?? '');
        }
      } else if (insertRows.length) {
        const cols = Object.keys(insertRows[0]).filter((c) => insertRows[0][c] !== undefined);
        const sql = `INSERT INTO ${col.table} (site_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`;
        for (const d of insertRows) await t.run(sql, site.id, ...cols.map((c) => d[c] ?? null));
      }
    });

    totalImported += insertRows.length;
    totalRemoved += removed;
    totalWarnings += warnings.length;

    report.push(
      `[import] ${col.label}: ${records.length} rows → ${insertRows.length} imported` +
      (removed ? `, ${removed} exact duplicates removed` : '') +
      (unknown.length ? ` | ignored columns: ${unknown.join(', ')}` : '')
    );
    for (const wmsg of warnings) report.push(`    ⚠ ${wmsg}`);
  }

  console.log(report.join('\n'));
  console.log(`\n[import] DONE — site "${SITE_SLUG}": ${totalImported} rows imported, ${totalRemoved} duplicates removed, ${totalWarnings} warnings`);
  if (totalRemoved || totalWarnings) {
    console.log('[import] Review warnings above (PRD §8: warnings reviewed before go-live).');
  }
}

main().catch((e) => fail(e.stack || e.message));
