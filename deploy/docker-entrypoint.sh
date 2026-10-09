#!/bin/sh
set -eu

# Fresh persistent volumes mount root-owned. Make the data directory writable by
# the unprivileged app user, then drop privileges before starting the server.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R "${APP_USER:-node}:${APP_USER:-node}" "${DATA_DIR:-/data}"
  exec gosu "${APP_USER:-node}" "$@"
fi

exec "$@"
