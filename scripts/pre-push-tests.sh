#!/usr/bin/env bash
# The pre-push gate: everything CI would run, in the order that fails fastest and cheapest.
# Roughly a minute. Bypass only in an emergency, with --no-verify.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STRAY_TSBUILDINFO=""

cleanup() {
  # `turbo` leaves its daemon and its child processes behind on an interrupt; without this a
  # cancelled push keeps a wrangler or vite process holding :3001 until the next reboot.
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

step() { echo; echo "==> $*"; }

cd "$ROOT"

# Turbo caches type-check, so a green "11 cached" can be reporting on code that no longer exists.
# Purging the build info is what makes this gate mean something.
step "Purging *.tsbuildinfo so type-check cannot be served from cache"
STRAY_TSBUILDINFO="$(find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -print -delete | wc -l | tr -d ' ')"
echo "removed ${STRAY_TSBUILDINFO} file(s)"

step "bun run check (lint + syncpack + architecture + types)"
# TURBO_FORCE reaches the nested `turbo type-check`; a flag on `bun run check` would not, because
# the first command in that chain is ultracite.
TURBO_FORCE=1 bun run check

step "bun run build"
TURBO_FORCE=1 bun run build

step "bun run test"
TURBO_FORCE=1 bun run test

step "All pre-push checks passed"
