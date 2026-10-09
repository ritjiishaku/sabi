import bcrypt from 'bcryptjs';
import { db } from '../server/db.js';
import { config } from '../server/config.js';
import { migrate } from '../server/migrate.js';

/*
 * (Re)set the owner login.
 *
 * `npm run migrate` seeds the owner from OWNER_EMAIL / OWNER_PASSWORD, but only
 * once — it never overwrites an existing owner. So this is how you recover a
 * lost password or rotate the owner credentials.
 *
 *   node scripts/reset-owner.mjs                     # use .env OWNER_EMAIL/OWNER_PASSWORD
 *   node scripts/reset-owner.mjs <email> <password>  # explicit
 *
 * Resetting invalidates every existing session.
 */

async function main() {
  await migrate();

  const email = (process.argv[2] || config.ownerEmail || '').trim().toLowerCase();
  const password = process.argv[3] || config.ownerPassword || '';

  if (!email || !password) {
    console.error('[owner] set OWNER_EMAIL/OWNER_PASSWORD in .env, or pass <email> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[owner] password must be at least 8 characters');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 10);
  const owner = await db.prepare("SELECT id FROM users WHERE role = 'owner'").get();

  if (owner) {
    await db.prepare("UPDATE users SET email = ?, password_hash = ?, session_version = session_version + 1 WHERE id = ?")
      .run(email, hash, owner.id);
    console.log(`[owner] updated owner login -> ${email} (all sessions invalidated)`);
  } else {
    await db.prepare("INSERT INTO users (site_id, email, password_hash, role) VALUES (NULL, ?, ?, 'owner')")
      .run(email, hash);
    console.log(`[owner] created owner login -> ${email}`);
  }
  await db.close();
}

main().catch((e) => {
  console.error(`[owner] ERROR: ${e.message}`);
  process.exit(1);
});
