#!/usr/bin/env bash
#
# Sabi CMS — one-shot VPS bootstrap (Ubuntu/Debian).
#
# Automates docs/DEPLOY.md steps 1-8: base packages, Node 20, Caddy, the OS
# service user, the code, a generated production .env, migration, PM2, the
# reverse proxy and the backup timer. Safe to re-run (it keeps an existing
# .env and pulls instead of re-cloning).
#
#   sudo DOMAIN=cms.giftsbyvf.com \
#        OWNER_EMAIL=owner@example.com OWNER_PASSWORD='a-strong-password' \
#        bash deploy/bootstrap.sh
#
# Optional environment:
#   REPO_URL      git remote          (default https://github.com/ritjiishaku/sabi.git)
#   APP_DIR       install directory   (default /opt/sabi-cms)
#   APP_USER      OS service user     (default sabi)
#   DOMAIN        public hostname     (default cms.giftsbyvf.com)
#   BRAND_NAME    product name        (default Sabi CMS)
#   WITH_IMPORT=1 also run `npm run import` from the Google Sheet
#
# Prerequisites: a DNS A record for $DOMAIN -> this server, and ports 80/443
# open (Caddy needs 80 for ACME/Let's Encrypt issuance).

set -euo pipefail

DOMAIN="${DOMAIN:-cms.giftsbyvf.com}"
REPO_URL="${REPO_URL:-https://github.com/ritjiishaku/sabi.git}"
APP_DIR="${APP_DIR:-/opt/sabi-cms}"
APP_USER="${APP_USER:-sabi}"
BRAND_NAME="${BRAND_NAME:-Sabi CMS}"
SHEET_ID="${SHEET_ID:-1N3_A0mPYkbTZ1ZeC3b_-KdrgV84jPRfyfYwEqzIwNB4}"
SHEET_SITE_SLUG="${SHEET_SITE_SLUG:-gifts-by-vf}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
gen_secret() { node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"; }

[ "$(id -u)" -eq 0 ] || die "run as root: sudo bash deploy/bootstrap.sh"
[ -n "${OWNER_EMAIL:-}" ] || die "set OWNER_EMAIL in the environment"

log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl gnupg ca-certificates git build-essential python3

log "Node.js 20 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

log "Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

log "Service user + app directory"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Code"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi
sudo -u "$APP_USER" npm --prefix "$APP_DIR" ci --omit=dev

log "Environment"
ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  log "Keeping existing $ENV_FILE"
else
  OWNER_PASSWORD="${OWNER_PASSWORD:-$(gen_secret)}"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
DB_PATH=$APP_DIR/data/cms.db
BRAND_NAME=$BRAND_NAME
HMAC_SECRET=$(gen_secret)
OWNER_EMAIL=$OWNER_EMAIL
OWNER_PASSWORD=$OWNER_PASSWORD
SHEET_ID=$SHEET_ID
SHEET_SITE_SLUG=$SHEET_SITE_SLUG
BACKUP_DIR=/var/backups/sabi-cms
BACKUP_KEEP=14
BACKUP_PASSPHRASE=$(gen_secret)
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  printf '\n\033[1;33mOwner login:\033[0m %s\n\033[1;33mPassword:\033[0m %s\n(rotate it after the first login)\n' \
    "$OWNER_EMAIL" "$OWNER_PASSWORD"
fi

log "Migrate (creates schema + seeds the owner)"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run migrate"

log "Runtime directories"
sudo -u "$APP_USER" mkdir -p "$APP_DIR/logs"
mkdir -p /var/backups/sabi-cms
chown -R "$APP_USER:$APP_USER" /var/backups/sabi-cms

log "PM2"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pm2 start deploy/ecosystem.config.cjs && pm2 save"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" >/dev/null

log "Caddy reverse proxy for $DOMAIN"
install -m 0644 "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
sed -i -E "s/^[[:space:]]*[a-zA-Z0-9._-]+[[:space:]]*\{/${DOMAIN} {/" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

log "Nightly encrypted backups"
sed -e "s|/opt/sabi-cms|$APP_DIR|g" -e "s/User=sabi/User=$APP_USER/" \
  "$APP_DIR/deploy/sabi-backup.service" > /etc/systemd/system/sabi-backup.service
install -m 0644 "$APP_DIR/deploy/sabi-backup.timer" /etc/systemd/system/sabi-backup.timer
systemctl daemon-reload
systemctl enable --now sabi-backup.timer

if [ "${WITH_IMPORT:-0}" = "1" ]; then
  log "Import content from the Google Sheet"
  sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run import"
fi

log "Health checks"
sleep 2
curl -fsS "http://127.0.0.1:3000/health" && echo
curl -fsSI "https://$DOMAIN/health" | head -n1 || true

cat <<EOF

Bootstrap complete.

  1. Log in:  https://$DOMAIN/admin/login.html
  2. Create the client: slug "$SHEET_SITE_SLUG",
     allowed_origin "https://vf-gift-shop.vercel.app".
  3. Seed/verify content, then merge the storefront branch "cms-integration".
EOF
