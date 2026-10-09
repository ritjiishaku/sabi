import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { config } from './config.js';

/*
 * Data access layer, backed by libSQL.
 *
 *   - production / Vercel : a remote Turso database  (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)
 *   - local / dev / tests : a SQLite file             (DB_PATH), same client, `file:` URL
 *
 * The surface deliberately mirrors better-sqlite3 — db.prepare(sql).get/all/run,
 * db.exec, db.transaction — so call sites read the same, but every method is async.
 */

const usingRemote = Boolean(config.tursoUrl);
// libSQL wants a forward-slash file URL; Windows paths arrive with backslashes.
const url = usingRemote ? config.tursoUrl : `file:${config.dbPath.replace(/\\/g, '/')}`;

// The local SQLite file's directory must exist before the client opens it.
if (!usingRemote) fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const client = createClient({
  url,
  authToken: config.tursoAuthToken || undefined,
});

function args(list) {
  return (list ?? []).map((v) => (v === undefined ? null : v));
}

async function select(sql, list) {
  const rs = await client.execute({ sql, args: args(list) });
  return rs.rows;
}

async function run(sql, list) {
  const rs = await client.execute({ sql, args: args(list) });
  return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) };
}

export const db = {
  isRemote: usingRemote,

  prepare(sql) {
    return {
      get: (...a) => select(sql, a).then((rows) => rows[0]),
      all: (...a) => select(sql, a),
      run: (...a) => run(sql, a),
    };
  },

  exec: (sql) => client.executeMultiple(sql),

  batch: (statements) =>
    client.batch(statements.map((s) => ({ sql: s.sql, args: args(s.args) })), 'write'),

  // Interactive write transaction. `fn` receives a scoped { get, all, run }.
  async transaction(fn) {
    const tx = await client.transaction('write');
    const scoped = {
      get: (sql, ...a) => tx.execute({ sql, args: args(a) }).then((r) => r.rows[0]),
      all: (sql, ...a) => tx.execute({ sql, args: args(a) }).then((r) => r.rows),
      run: (sql, ...a) =>
        tx.execute({ sql, args: args(a) }).then((r) => ({
          changes: r.rowsAffected,
          lastInsertRowid: Number(r.lastInsertRowid ?? 0),
        })),
    };
    try {
      const out = await fn(scoped);
      await tx.commit();
      return out;
    } catch (err) {
      try { await tx.rollback(); } catch { /* already closed */ }
      throw err;
    }
  },

  close: () => client.close(),
};
