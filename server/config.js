import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv(path.join(root, '.env'));

const env = process.env;

function required(name, fallback) {
  const v = env[name] ?? fallback;
  if (!v) {
    console.error(`[config] Missing required env var: ${name} (see .env.example)`);
    process.exit(1);
  }
  return v;
}

export const config = {
  root,
  port: parseInt(env.PORT || '3000', 10),
  brandName: env.BRAND_NAME || 'Sabi CMS',
  dbPath: path.resolve(root, env.DB_PATH || './data/cms.db'),
  tursoUrl: env.TURSO_DATABASE_URL || '',
  tursoAuthToken: env.TURSO_AUTH_TOKEN || '',
  hmacSecret: required('HMAC_SECRET'),
  ownerEmail: env.OWNER_EMAIL || '',
  ownerPassword: env.OWNER_PASSWORD || '',
  sessionTtlMs: 1000 * 60 * 60 * 12,
  isProd: env.NODE_ENV === 'production',
  sheetId: env.SHEET_ID || '',
  sheetSiteSlug: env.SHEET_SITE_SLUG || 'gifts-by-vf',
};

export function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.hmacSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySigned(token) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', config.hmacSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
