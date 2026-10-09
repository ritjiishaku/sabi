import { db } from '../db.js';

/*
 * Fixed-window rate limiter, stored in the database so it holds across every
 * serverless instance (the old in-memory Map was per-process and useless on
 * Vercel). One atomic upsert both increments the bucket and reports its count.
 */
export async function hit(key, limit, windowMs) {
  const now = Date.now();
  const resetAt = now + windowMs;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at < ? THEN ? ELSE rate_limits.reset_at END
       RETURNING count`
    )
    .get(key, resetAt, now, now, resetAt);
  return Number(row?.count ?? 0) > limit;
}
