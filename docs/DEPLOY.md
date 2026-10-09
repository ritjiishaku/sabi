# Deployment runbook

End-to-end procedure for taking Sabi CMS from this repo to a production VPS and
cutting **Gift by VF** over to it. Milestone 6 (PRD §9).

Throughout, replace:

| Placeholder | Meaning | Example |
|---|---|---|
| `cms.example.com` | CMS public hostname | `cms.gifbyvf.com` |
| `/opt/sabi-cms` | install directory | `/opt/sabi-cms` |
| `sabi` | OS service user | `sabi` |

The Node app always listens on `127.0.0.1:3000`; **only Caddy is exposed**.

---

## Fast path (automated)

`deploy/bootstrap.sh` runs steps 1-8 below on a fresh Ubuntu/Debian VPS. The DNS
A record must already point at the server.

```bash
sudo DOMAIN=cms.giftsbyvf.com \
     OWNER_EMAIL=owner@example.com OWNER_PASSWORD='a-strong-password' \
     bash deploy/bootstrap.sh
```

Add `WITH_IMPORT=1` to also seed content from the Google Sheet. It generates
`HMAC_SECRET` and `BACKUP_PASSPHRASE`, keeps any existing `.env`, and is safe to
re-run (it pulls instead of re-cloning). The sections below are the manual
equivalent and the reference for every value.

---

## 0. Prerequisites

- A VPS (1 vCPU / 1 GB RAM is enough) with a public IP and sudo access.
- A DNS **A record** for `cms.example.com` → the VPS IP (or AAAA for IPv6).
- Ports 80 and 443 open to the internet (Caddy needs 80 for TLS issuance).
- Node.js 18+ (20 LTS recommended). `better-sqlite3` builds natively, so a C
  toolchain is required if no prebuilt binary is available.
- The intended production `.env` values on hand (see step 3).

## 1. Base packages

```bash
sudo apt update && sudo apt upgrade -y
# Node 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 git
# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 2. Deploy the code

```bash
sudo useradd --system --home /opt/sabi-cms --shell /usr/sbin/nologin sabi
sudo mkdir -p /opt/sabi-cms && sudo chown sabi:sabi /opt/sabi-cms
sudo -u sabi git clone <repo-url> /opt/sabi-cms
cd /opt/sabi-cms
sudo -u sabi npm ci --omit=dev
sudo -u sabi mkdir -p /opt/sabi-cms/logs
```

## 3. Production `.env`

```bash
sudo -u sabi cp .env.example .env
sudo -u sabi node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
sudo -u sabi editor .env
```

Set, at minimum:

- `NODE_ENV=production` — marks the session cookie `Secure`.
- `PORT=3000`
- `DB_PATH=/opt/sabi-cms/data/cms.db` — absolute, on the persistent disk, writable by `sabi`.
- `HMAC_SECRET` — the fresh random value from above (never the dev secret).
- `OWNER_EMAIL` / `OWNER_PASSWORD` — strong; rotate after first login.
- `BRAND_NAME=Sabi CMS`
- `BACKUP_DIR=/var/backups/sabi-cms` (or an off-box mount)
- `BACKUP_KEEP=14`
- `BACKUP_PASSPHRASE` — long random passphrase; snapshots are AES-256-GCM encrypted.
- `SHEET_ID`, `SHEET_SITE_SLUG=gifts-by-vf` — only needed for imports.

Then lock it down:

```bash
sudo chmod 600 /opt/sabi-cms/.env
```

Verify `.env` is **not** served and not committed (`npm run smoke` checks this).

## 4. Migrate

```bash
cd /opt/sabi-cms
sudo -u sabi npm run migrate
```

This creates the schema and seeds the owner account. Safe to re-run (idempotent,
including column upgrades).

## 5. Seed content (optional, one-time)

If migrating content straight from the Google Sheet:

```bash
sudo -u sabi npm run import
```

Optional dry-run/verification: `sudo -u sabi npm run contract` (no network).

## 6. Process manager (PM2)

```bash
sudo npm install -g pm2
cd /opt/sabi-cms
sudo -u sabi pm2 start deploy/ecosystem.config.cjs
sudo -u sabi pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u sabi --hp /opt/sabi-cms
```

Confirm it is up locally:

```bash
curl -s http://127.0.0.1:3000/health
```

## 7. Reverse proxy (Caddy)

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo editor /etc/caddy/Caddyfile        # replace cms.example.com
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews the TLS certificate automatically. Verify:

```bash
curl -sI https://cms.example.com/health
```

## 8. Backups

```bash
sudo cp deploy/sabi-backup.service deploy/sabi-backup.timer /etc/systemd/system/
sudo editor /etc/systemd/system/sabi-backup.service   # set User / WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now sabi-backup.timer
sudo systemctl list-timers sabi-backup.timer
```

Dry-run and verify an encrypted snapshot restores:

```bash
sudo -u sabi npm run backup
sudo -u sabi node scripts/backup.mjs --decrypt /var/backups/sabi-cms/<file>
```

Keep an **off-box** copy (step 3 `BACKUP_DIR`, or rsync the directory) — a
backup on the same disk is not disaster recovery.

## 9. Create the Gift by VF client

1. Open `https://cms.example.com/admin/login.html` and sign in as owner.
2. **Create client**: slug `gifts-by-vf`, name, the storefront's exact
   `allowed_origin` (e.g. `https://giftbyvf.com`, scheme + host, no path), and a
   client email + strong password. Give those credentials to the client.
3. Sign in as the client and confirm the collections load.

## 10. Cut over the storefront

In the consumer repo (Gift by VF):

```
CMS_BASE  = https://cms.example.com
SITE_SLUG = gifts-by-vf
```

Point the storefront's content fetches at `{CMS_BASE}/api/v1/sites/{SITE_SLUG}/…`
and deploy. Full integration recipe: [`INTEGRATION.md`](./INTEGRATION.md).

## 11. Live verification

- [ ] `GET https://cms.example.com/api/v1/sites/gifts-by-vf/content/products`
      returns an array; every value is a **string**.
- [ ] Response includes `Cache-Control: public, max-age=60`.
- [ ] CORS reflects only the storefront origin (foreign origin gets no `ACAO`).
- [ ] `?refresh=1` on the storefront bypasses its local cache and shows a fresh
      admin edit within one request.
- [ ] A missing product returns `404 { "error": "not_found" }` (never an HTML 200).
- [ ] Pausing the client (`is_active=false`) makes reads return
      `403 { "error": "subscription_inactive" }` with `no-store`; content is intact
      when re-activated.
- [ ] `https://cms.example.com/.env` and `/data/cms.db` are **not** served.
- [ ] Daily backup timer fired and the encrypted file decrypts cleanly.

## 12. Rollback

- **App regression:** `sudo -u sabi pm2 restart sabi-cms` after
  `git checkout <previous-tag>` + `npm ci --omit=dev`. The SQLite file is
  untouched by deploys.
- **Bad data / content:** restore a snapshot:
  `pm2 stop sabi-cms`, restore `DB_PATH` from a decrypted snapshot
  (`backup.mjs --decrypt`), then `pm2 start sabi-cms`.
- **Storefront-side:** the consumer only reads JSON — revert its `CMS_BASE`
  deploy or ship its previous cached content. No CMS change is required.

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Caddy won't get a cert | DNS not pointing at the VPS, or port 80 blocked | check `dig cms.example.com`, open 80/443 |
| `502` from Caddy | app not running on 127.0.0.1:3000 | `pm2 status`, `pm2 logs sabi-cms` |
| Cookies not `Secure` | `NODE_ENV` not `production` | set it in `.env` and `pm2 restart` |
| CORS blocked on the storefront | `allowed_origin` mismatch (scheme/host/port) | fix it in the owner dashboard |
| `subscription_inactive` unexpectedly | client paused | re-activate in the owner dashboard |
| Backup job fails | `BACKUP_PASSPHRASE`/`BACKUP_DIR` unset or unwritable | check the EnvironmentFile and directory perms |
