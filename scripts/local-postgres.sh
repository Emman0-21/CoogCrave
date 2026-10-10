#!/usr/bin/env bash
# Run a project-local PostgreSQL 16 server without Docker.
#   pnpm db:local:up     initialise (first run), start, and bootstrap roles/databases
#   pnpm db:local:down   stop
# Data lives in .data/postgres (git-ignored). Prefer `docker compose up -d db` if you have Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT/.data/postgres"
RUN_DIR="$ROOT/.data/postgres-run"
LOG_FILE="$ROOT/.data/postgres.log"
PORT="${PGPORT:-5432}"
SUPERUSER_PW="${LOCAL_PG_SUPERUSER_PASSWORD:-postgres}"   # local-only

PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | tail -1)")}"
if [[ ! -x "$PG_BIN/pg_ctl" ]]; then
  echo "PostgreSQL 16 binaries not found. Install PostgreSQL 16 or set PG_BIN." >&2
  exit 1
fi

# PostgreSQL refuses to run as root; in containers run as PG_RUN_AS (default: first non-root login user).
as_pg_user() {
  if [[ "$(id -u)" -eq 0 ]]; then
    local user="${PG_RUN_AS:-$(awk -F: '$3>=999 && $3<65534 {print $1; exit}' /etc/passwd)}"
    runuser -u "$user" -- "$@"
  else
    "$@"
  fi
}

case "${1:-}" in
  up)
    mkdir -p "$DATA_DIR" "$RUN_DIR"
    if [[ "$(id -u)" -eq 0 ]]; then
      chown -R "${PG_RUN_AS:-$(awk -F: '$3>=999 && $3<65534 {print $1; exit}' /etc/passwd)}" "$ROOT/.data"
    fi
    if [[ ! -f "$DATA_DIR/PG_VERSION" ]]; then
      pwfile="$(mktemp)"; echo "$SUPERUSER_PW" > "$pwfile"; chmod 644 "$pwfile"
      as_pg_user "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --pwfile="$pwfile" --auth=scram-sha-256 --encoding=UTF8 --locale=C.UTF-8 >/dev/null
      rm -f "$pwfile"
    fi
    if ! as_pg_user "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      as_pg_user "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -w \
        -o "-p $PORT -k $RUN_DIR -c listen_addresses=localhost" start >/dev/null
    fi
    PGPASSWORD="$SUPERUSER_PW" psql -h localhost -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
      -f "$ROOT/scripts/sql/bootstrap-roles.sql"
    echo "PostgreSQL running on localhost:$PORT (databases: coogcrave_dev, coogcrave_test)"
    ;;
  down)
    as_pg_user "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m fast stop >/dev/null && echo "PostgreSQL stopped"
    ;;
  *)
    echo "usage: $0 up|down" >&2; exit 2 ;;
esac
