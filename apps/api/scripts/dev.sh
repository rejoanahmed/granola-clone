#!/usr/bin/env bash
# Preflight, then wrangler dev on :3001 with every binding local. The preflight checks exist
# because all three failures look identical once wrangler is running: the Worker starts and 500s
# on the first real request.
set -euo pipefail

API="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$API/../.." && pwd)"
MIGRATIONS="$ROOT/packages/db/d1-migrations"

if [[ ! -f "$API/.dev.vars" ]]; then
  echo "Missing apps/api/.dev.vars — creating it from the example." >&2
  cp "$API/.dev.vars.example" "$API/.dev.vars"
  echo "Set BETTER_AUTH_SECRET in it before signing in: openssl rand -base64 32" >&2
fi

# Without migrations every query fails with "no such table", which reads like a binding problem.
if ! compgen -G "$MIGRATIONS"/*.sql >/dev/null; then
  echo "No migrations in packages/db/d1-migrations." >&2
  echo "Run:  bun run db:generate  &&  (cd apps/api && bun run local:db:apply)" >&2
  exit 1
fi

if [[ ! -d "$API/.wrangler/state/v3/d1" ]]; then
  echo "No local D1 state yet — applying migrations." >&2
  (cd "$API" && bunx wrangler d1 migrations apply gcnotes-db-dev --local)
fi

# --ip 0.0.0.0 is what lets a phone on the same network reach the dev server.
echo "api  ->  http://localhost:3001   (docs: /api/reference)"
cd "$API"
exec bunx wrangler dev src/worker.ts --local --port 3001 --ip 0.0.0.0
