import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';

migrate();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

/* structured request logging */
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({
      t: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
    }));
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', brand: config.brandName, time: new Date().toISOString() });
});

/* security headers (dev parity with the Caddyfile in deploy/) */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/* CSRF: state-changing admin requests must not originate from another host.
   Absent Origin/Referer (non-browser clients, tests) is allowed; browsers always
   send Origin on cross-site POSTs, so this blocks classic CSRF without a token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('/api/admin', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next();
  let host;
  try { host = new URL(origin).host; } catch { return res.status(403).json({ error: 'csrf_origin_mismatch' }); }
  if (host !== req.headers.host) return res.status(403).json({ error: 'csrf_origin_mismatch' });
  next();
});

app.use('/api/v1', publicRouter);
app.use('/api/admin', adminRouter);

/* landing page (explicit root route — the repo root is never served) */
app.get('/', (req, res) => res.sendFile(path.join(config.root, 'public', 'index.html')));

/* shared design assets used by the landing page */
app.use('/css', express.static(path.join(config.root, 'public', 'css')));

/* admin UI */
app.use('/admin', express.static(path.join(config.root, 'public')));
app.get('/admin', (req, res) => res.redirect('/admin/login.html'));

/* structured errors */
app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(JSON.stringify({ t: new Date().toISOString(), error: err.message, stack: err.stack }));
  res.status(status).json({ error: status >= 500 ? 'internal_error' : err.message || 'error' });
});

app.listen(config.port, () => {
  console.log(`[${config.brandName}] listening on http://localhost:${config.port} (env: ${process.env.NODE_ENV || 'development'})`);
});
