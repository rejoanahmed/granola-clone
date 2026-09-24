#!/usr/bin/env bash
# Run the Maestro flows under apps/native/.maestro against the iOS simulator.
#
#   scripts/maestro.sh smoke        # flows tagged `smoke`
#   scripts/maestro.sh              # every flow the workspace config lists
#
# Needs the dev client installed on the simulator and Metro serving on :8081 — `bun run e2e:ios`
# does both and stays in the foreground, so run this from a second terminal.
#
# The simulator is named by UDID, never by "booted": another agent may be driving a second
# simulator or a physical iPhone, and a flow that picks whichever device answers first can clear
# the state of the wrong one. Override with IOS_SIMULATOR_UDID.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UDID="${IOS_SIMULATOR_UDID:-351547D8-BD3B-4418-AB30-8568D8FFB8F3}"
MAESTRO="${MAESTRO:-$(command -v maestro || echo "$HOME/.maestro/bin/maestro")}"
APP_ID="${APP_ID:-com.rejoan.gcnotes}"
# The API the phase-3 flows reset, seed and read sign-in codes from, and the Metro the dev client
# loads. Both overridable for the port workaround in docs/plan/BLOCKERS.md.
API_URL="${API_URL:-http://localhost:3001}"
DEV_SERVER_URL="${DEV_SERVER_URL:-http://localhost:8081}"
TAG="${1:-}"

if [[ ! -x "$MAESTRO" ]]; then
  echo "maestro not found — install it (curl -Ls https://get.maestro.mobile.dev | bash) or set MAESTRO." >&2
  exit 1
fi

# A dev client with no Metro behind it sits on its launcher screen, and the flow then fails on a
# missing testID three minutes later. Say so now instead.
if ! curl -fsS --max-time 2 "$DEV_SERVER_URL/status" 2>/dev/null | grep -q running; then
  echo "Metro is not answering on $DEV_SERVER_URL — start it with \`bun run e2e:ios\` (or \`bun run dev:native\`)." >&2
  exit 1
fi

# The harness secret is a local secret, so it is read from the file wrangler reads it from rather
# than repeated here. Flows that never touch the API (smoke) run without it.
E2E_SECRET="${E2E_SECRET:-}"
DEV_VARS="$ROOT/apps/api/.dev.vars"
if [[ -z "$E2E_SECRET" && -f "$DEV_VARS" ]]; then
  E2E_SECRET="$(sed -n 's/^E2E_SECRET="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$DEV_VARS" | tail -1)"
fi

args=(--device "$UDID" test -e "APP_ID=$APP_ID" -e "API_URL=$API_URL" -e "DEV_SERVER_URL=$DEV_SERVER_URL" -e "E2E_SECRET=$E2E_SECRET")
if [[ -n "$TAG" ]]; then
  args+=(--include-tags "$TAG")
fi

exec "$MAESTRO" "${args[@]}" "$ROOT/apps/native/.maestro"
