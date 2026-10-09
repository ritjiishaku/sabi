import app from '../server/app.js';

/*
 * Vercel serverless entry point.
 *
 * vercel.json rewrites every unmatched path here; Vercel preserves the original
 * URL on the request, so the Express app in server/app.js routes exactly as it
 * does locally (static files under public/ are still served by the CDN first).
 */
export default app;
