#!/usr/bin/env bash
# Applies shim + migrations to a scratch database and runs the SQL tests.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/dbname ./scripts/test-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a scratch Postgres database (it will be reset)}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; create schema public;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f test/sql/shim.sql
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
for f in test/sql/*.test.sql; do
  echo "running $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "SQL tests passed"
