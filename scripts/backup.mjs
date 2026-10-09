import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../server/db.js';
import { config } from '../server/config.js';

/*
 * Nightly backup (PRD §9: "nightly encrypted SQLite backup off-box from the
 * moment it's deployed").
 *
 * Writes a portable SQL dump of the whole database — schema plus data — which
 * works identically against a local SQLite file and a remote Turso database.
 * Optionally encrypts the snapshot with AES-256-GCM when BACKUP_PASSPHRASE is
 * set (strongly recommended before the file leaves the box).
 *
 *   node scripts/backup.mjs                 # create a backup (encrypted if passphrase set)
 *   node scripts/backup.mjs --decrypt FILE  # decrypt a backup to FILE without .enc
 *   node scripts/backup.mjs --decrypt FILE OUT
 *
 * Env:
 *   BACKUP_DIR         where snapshots land       (default: ./backups)
 *   BACKUP_PASSPHRASE  encrypt with this secret    (default: none → plain .sql)
 *   BACKUP_KEEP        snapshots to retain         (default: 14)
 */

const BACKUP_DIR = path.resolve(config.root, process.env.BACKUP_DIR || './backups');
const KEEP = parseInt(process.env.BACKUP_KEEP || '14', 10);
const PASSPHRASE = process.env.BACKUP_PASSPHRASE || '';
const MAGIC = Buffer.from('SAB1', 'ascii');

function log(obj) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event: 'backup', ...obj }));
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function deriveKey(salt) {
  return crypto.scryptSync(PASSPHRASE, salt, 32);
}

function encryptFile(src, dest) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), iv);
  const plaintext = fs.readFileSync(src);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(dest, Buffer.concat([MAGIC, salt, iv, tag, ciphertext]));
  return fs.statSync(dest).size;
}

function decryptFile(src, dest) {
  const buf = fs.readFileSync(src);
  if (buf.length < 4 + 16 + 12 + 16 || !buf.subarray(0, 4).equals(MAGIC)) {
    throw new Error('not a Sabi encrypted backup (bad header)');
  }
  const salt = buf.subarray(4, 20);
  const iv = buf.subarray(20, 32);
  const tag = buf.subarray(32, 48);
  const ciphertext = buf.subarray(48);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(salt), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(dest, plain);
  return plain.length;
}

function prune(dir, keep) {
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('cms-') && (f.endsWith('.sql') || f.endsWith('.sql.enc')))
    .sort();
  const stale = files.slice(0, Math.max(0, files.length - keep));
  for (const f of stale) fs.rmSync(path.join(dir, f), { force: true });
  return stale.length;
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function dumpSql(destination) {
  const objects = await db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END, name`
    )
    .all();

  const parts = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;'];
  for (const obj of objects) {
    parts.push(`${obj.sql};`);
    if (obj.type === 'table') {
      const rows = await db.prepare(`SELECT * FROM "${obj.name}"`).all();
      for (const row of rows) {
        const cols = Object.keys(row);
        const values = cols.map((c) => sqlLiteral(row[c]));
        parts.push(`INSERT INTO "${obj.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`);
      }
    }
  }
  parts.push('COMMIT;');
  fs.writeFileSync(destination, `${parts.join('\n')}\n`);
}

async function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const base = `cms-${stamp()}.sql`;
  const tmp = path.join(BACKUP_DIR, `${base}.tmp`);
  const out = path.join(BACKUP_DIR, PASSPHRASE ? `${base}.enc` : base);

  await dumpSql(tmp);
  let size;
  if (PASSPHRASE) {
    size = encryptFile(tmp, out);
    fs.rmSync(tmp, { force: true });
  } else {
    fs.renameSync(tmp, out);
    size = fs.statSync(out).size;
  }

  const removed = prune(BACKUP_DIR, KEEP);
  log({ file: path.relative(config.root, out), bytes: size, encrypted: !!PASSPHRASE, source: db.isRemote ? 'turso' : 'local', removed_old: removed, keep: KEEP });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === '--decrypt') {
    const src = rest[0];
    if (!src) throw new Error('usage: node scripts/backup.mjs --decrypt <file> [out]');
    if (!PASSPHRASE) throw new Error('set BACKUP_PASSPHRASE to decrypt');
    const dest = rest[1] || src.replace(/\.enc$/, '');
    const bytes = decryptFile(src, dest);
    log({ decrypted: dest, bytes });
    return;
  }
  await backup();
  await db.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(JSON.stringify({ t: new Date().toISOString(), event: 'backup', error: e.message }));
    process.exit(1);
  });
