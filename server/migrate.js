import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { COLLECTIONS, SETTINGS_KEYS } from './collections.js';
import { config } from './config.js';

const DDL = `
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  allowed_origin TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER REFERENCES sites(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','client')),
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
`;

function columnType(name) {
  if (name === 'display_order') return 'INTEGER';
  return 'TEXT';
}

export async function migrate() {
  await db.exec(DDL);

  /* additive column upgrades for databases created before the column existed */
  const users = await db.prepare('PRAGMA table_info(users)').all();
  if (!users.some((c) => c.name === 'session_version')) {
    await db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
  }

  for (const [name, col] of Object.entries(COLLECTIONS)) {
    const cols = ['id INTEGER PRIMARY KEY AUTOINCREMENT', 'site_id INTEGER NOT NULL REFERENCES sites(id)'];
    if (col.kind === 'kv') {
      cols.push('key TEXT NOT NULL', "value TEXT NOT NULL DEFAULT ''", 'UNIQUE (site_id, key)');
    } else {
      for (const f of col.fields) cols.push(`${f.name} ${columnType(f.name)}`);
    }
    await db.exec(`CREATE TABLE IF NOT EXISTS ${col.table} (
      ${cols.join(',\n      ')}
    );`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_${col.table}_site ON ${col.table}(site_id);`);
  }

  if (config.ownerEmail && config.ownerPassword) {
    const existing = await db.prepare('SELECT id FROM users WHERE role = ?').get('owner');
    if (!existing) {
      const hash = bcrypt.hashSync(config.ownerPassword, 10);
      await db.prepare('INSERT INTO users (site_id, email, password_hash, role) VALUES (NULL, ?, ?, ?)')
        .run(config.ownerEmail, hash, 'owner');
      console.log(`[migrate] seeded owner account: ${config.ownerEmail}`);
    }
  }

  return { collections: Object.keys(COLLECTIONS).length, settingsKeys: SETTINGS_KEYS.length };
}

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  migrate()
    .then((res) => {
      console.log(`[migrate] OK — ${res.collections} collections, ${res.settingsKeys} settings keys`);
      return db.close();
    })
    .catch((e) => {
      console.error(`[migrate] ERROR: ${e.message}`);
      process.exit(1);
    });
}
