#!/usr/bin/env bash
# Preflight, then wrangler dev on :3001 with every binding local. The preflight checks exist
# because all three failures look identical once wrangler is running: the Worker starts and 500s
# on the first real request.
# EVB_TUNNEL=1 also opens a quick tunnel and points BKASH_CALLBACK_URL at it — needed only when a
# real device must reach the callback, since bKash redirects the payer's browser, not our Worker.
set -euo pipefail

API="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$API/../.." && pwd)"
MIGRATIONS="$ROOT/packages/db/d1-migrations"
TUNNEL_LOG=""
TUNNEL_PID=""

cleanup() {
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  if [[ -n "$TUNNEL_LOG" ]]; then
    rm -f "$TUNNEL_LOG"
  fi
}
trap cleanup EXIT INT TERM

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
  (cd "$API" && bunx wrangler d1 migrations apply eventsbd-db-dev --local)
fi

CALLBACK_OVERRIDE=()
if [[ "${EVB_TUNNEL:-}" == "1" ]]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "EVB_TUNNEL=1 but cloudflared is not installed — brew install cloudflared" >&2
    exit 1
  fi

  TUNNEL_LOG="$(mktemp)"
  echo "Opening a Cloudflare quick tunnel to http://localhost:3001..."
  cloudflared tunnel --url http://localhost:3001 >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  TUNNEL_URL=""
  for _ in $(seq 1 45); do
    TUNNEL_URL="$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    if [[ -n "$TUNNEL_URL" ]]; then
      break
    fi
    sleep 1
  done

  if [[ -z "$TUNNEL_URL" ]]; then
    echo "Timed out waiting for the tunnel URL. cloudflared said:" >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi

  echo "Tunnel: $TUNNEL_URL"
  # --var overrides wrangler.jsonc for this run only, keeping a URL that changes every restart
  # out of any file.
  CALLBACK_OVERRIDE=(--var "BKASH_CALLBACK_URL:$TUNNEL_URL/payments/bkash/callback")
fi

# --ip 0.0.0.0 is what lets a phone on the same network reach the dev server. Deliberately not
# `exec`: replacing the shell would drop the EXIT trap and orphan the tunnel.
echo "api  ->  http://localhost:3001   (docs: /api/reference)"
cd "$API"
bunx wrangler dev src/worker.ts --local --port 3001 --ip 0.0.0.0 \
  ${CALLBACK_OVERRIDE[@]+"${CALLBACK_OVERRIDE[@]}"}
