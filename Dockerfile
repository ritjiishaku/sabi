# syntax=docker/dockerfile:1

# Sabi CMS — container image. Runs on Fly.io, Railway, Render, or any Docker host.
# The SQLite database and backups live on a mounted volume at /data (see fly.toml).

# ---- build stage: compile better-sqlite3 if no prebuilt binary matches ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime stage: slim image, unprivileged user, app + production deps ----
FROM node:22-bookworm-slim AS runtime
# Default the stateful paths at the volume mount so the image runs on any host
# (Fly, Railway, Render, plain docker run) with a single /data volume.
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/cms.db \
    BACKUP_DIR=/data/backups
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data \
 && chown -R node:node /data

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/app.js"]
