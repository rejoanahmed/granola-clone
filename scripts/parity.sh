#!/usr/bin/env bash
# Capture the parity screenshots: every flow tagged `parity` (apps/native/.maestro/phase-12/),
# each of which asserts a discovery state's testIDs and copy and then takes `parity-NN-<slug>`.
#
#   bun run parity            # = bash scripts/parity.sh
#
# The shots land in artifacts/parity/<YYYY-MM-DD>/ (gitignored), which is the only place
# docs/parity/REPORT.md is graded from. Needs what scripts/maestro.sh needs: the dev client on the
# simulator, Metro on :8081 and the local API on :3001 with the E2E harness armed.
# Parity compares against every discovery screen, so Metro must run with
# EXPO_PUBLIC_SHOW_UNFINISHED=true: several of those screens are hidden in a release build (D027).
#
# The simulator is named by UDID, never "booted", and this script never names a physical device.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UDID="${IOS_SIMULATOR_UDID:-351547D8-BD3B-4418-AB30-8568D8FFB8F3}"
MAESTRO="${MAESTRO:-$(command -v maestro || echo "$HOME/.maestro/bin/maestro")}"
APP_ID="${APP_ID:-com.rovierr.kothanote}"
API_URL="${API_URL:-http://localhost:3001}"
DEV_SERVER_URL="${DEV_SERVER_URL:-http://localhost:8081}"
FLOWS="$ROOT/apps/native/.maestro"
OUT="$ROOT/artifacts/parity/$(date +%Y-%m-%d)"

if [[ ! -x "$MAESTRO" ]]; then
  echo "maestro not found — install it (curl -Ls https://get.maestro.mobile.dev | bash) or set MAESTRO." >&2
  exit 1
fi

if ! curl -fsS --max-time 2 "$DEV_SERVER_URL/status" 2>/dev/null | grep -q running; then
  echo "Metro is not answering on $DEV_SERVER_URL — start it with \`bun run e2e:ios\` (or \`bun run dev:native\`)." >&2
  exit 1
fi

E2E_SECRET="${E2E_SECRET:-}"
DEV_VARS="$ROOT/apps/api/.dev.vars"
if [[ -z "$E2E_SECRET" && -f "$DEV_VARS" ]]; then
  E2E_SECRET="$(sed -n 's/^E2E_SECRET="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$DEV_VARS" | tail -1)"
fi

# A fresh directory, so a shot left from an earlier run of the same day cannot stand in for one
# this run failed to take.
rm -rf "$OUT"
mkdir -p "$OUT"

# Checked on Maestro 2.8.0: with --test-output-dir set, a relative `takeScreenshot` lands in
# <dir>/<timestamp>/<flow name>/takeScreenshot/, not in the working directory. So the run writes
# into $OUT/maestro (its logs and failure shots too) and the sweep below lifts every parity shot up
# into $OUT. Starting inside $OUT covers a Maestro that resolves against the working directory.
status=0
(
  cd "$OUT"
  "$MAESTRO" --device "$UDID" test \
    -e "APP_ID=$APP_ID" -e "API_URL=$API_URL" -e "DEV_SERVER_URL=$DEV_SERVER_URL" -e "E2E_SECRET=$E2E_SECRET" \
    --include-tags parity --test-output-dir "$OUT/maestro" "$FLOWS"
) || status=$?

find "$OUT/maestro" -name 'parity-*.png' -exec mv -f {} "$OUT/" \; 2>/dev/null || true

expected="$(grep -rhoE 'takeScreenshot: *parity-[A-Za-z0-9-]+' "$FLOWS/phase-12" | sed 's/.*: *//' | sort -u)"
missing=()
while IFS= read -r name; do
  [[ -f "$OUT/$name.png" ]] || missing+=("$name")
done <<<"$expected"

want="$(printf '%s\n' "$expected" | grep -c .)"
have="$(find "$OUT" -maxdepth 1 -name 'parity-*.png' | grep -c . || true)"
echo "parity: $have of $want shots in $OUT"

if ((${#missing[@]} > 0)); then
  echo "parity: missing ${#missing[@]} shot(s):" >&2
  printf '  %s\n' "${missing[@]}" >&2
  status=1
fi
if ((status != 0)); then
  echo "parity: FAILED (a flow failed or a shot is missing)" >&2
fi
exit "$status"
