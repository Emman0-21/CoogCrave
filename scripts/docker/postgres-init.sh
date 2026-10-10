#!/bin/sh
# Runs once, on the first start of the Docker Postgres volume (docker-entrypoint-initdb.d).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -f /bootstrap/bootstrap-roles.sql
