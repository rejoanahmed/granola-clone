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
TAG="${1:-}"

if [[ ! -x "$MAESTRO" ]]; then
  echo "maestro not found — install it (curl -Ls https://get.maestro.mobile.dev | bash) or set MAESTRO." >&2
  exit 1
fi

# A dev client with no Metro behind it sits on its launcher screen, and the flow then fails on a
# missing testID three minutes later. Say so now instead.
if ! curl -fsS --max-time 2 http://localhost:8081/status 2>/dev/null | grep -q running; then
  echo "Metro is not answering on :8081 — start it with \`bun run e2e:ios\` (or \`bun run dev:native\`)." >&2
  exit 1
fi

args=(--device "$UDID" test -e "APP_ID=$APP_ID")
if [[ -n "$TAG" ]]; then
  args+=(--include-tags "$TAG")
fi

exec "$MAESTRO" "${args[@]}" "$ROOT/apps/native/.maestro"
