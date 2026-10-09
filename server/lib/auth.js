import bcrypt from 'bcryptjs';
import { config, signPayload, verifySigned } from '../config.js';
import { db } from '../db.js';

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function sessionCookie(token) {
  const attrs = [
    `sabi_session=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`,
  ];
  if (config.isProd) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie() {
  const attrs = ['sabi_session=;', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (config.isProd) attrs.push('Secure');
  return attrs.join('; ');
}

export function createSession(user) {
  return signPayload({
    uid: user.id,
    site: user.site_id ?? null,
    role: user.role,
    sv: user.session_version ?? 0,
    exp: Date.now() + config.sessionTtlMs,
  });
}

export function getSession(req) {
  const token = parseCookies(req).sabi_session;
  if (!token) return null;
  return verifySigned(token);
}

export async function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  // A password change bumps session_version, retiring every token issued before it.
  const user = await db.prepare('SELECT id, session_version FROM users WHERE id = ?').get(session.uid);
  if (!user || (user.session_version ?? 0) !== (session.sv ?? 0)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.session = session;
  next();
}

export function requireOwner(req, res, next) {
  if (req.session?.role !== 'owner') return res.status(403).json({ error: 'owner_only' });
  next();
}
