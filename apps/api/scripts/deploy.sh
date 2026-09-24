#!/usr/bin/env bash
# Deploy apps/api to one Cloudflare environment: D1 migrations first, then the Worker.
#
#   scripts/deploy.sh check                    # dry-run BOTH deployed environments, upload nothing
#   scripts/deploy.sh dev                      # migrate + deploy gcnotes-api-dev
#   scripts/deploy.sh production               # migrate + deploy gcnotes-api-prod
#   scripts/deploy.sh dev --migrations-only    # D1 only, no Worker
#
# Migrations run BEFORE the Worker because D1 has no rollback — `wrangler d1 migrations` is
# create/list/apply and nothing else. Every migration must therefore be backward-compatible with
# the Worker already running (expand/contract): add the column, deploy the code that writes it,
# drop the old one a release later. In that order a half-finished deploy is a database ahead of
# its code, which serves; the reverse is code reading a column that does not exist.
#
# Ids are substituted, not committed. D1, KV and Flagship ids are account-specific: a real one in
# git points every clone at one person's data. `wrangler.jsonc` carries named placeholders and this script
# rewrites them into a throwaway config from the environment, refusing to run if one is missing or
# malformed.
#
# ── One-time setup per Cloudflare account ────────────────────────────────────────────────────────
#
#   bunx wrangler d1 create gcnotes-db-dev        bunx wrangler d1 create gcnotes-db-prod
#   bunx wrangler kv namespace create gcnotes-tokens-dev
#   bunx wrangler kv namespace create gcnotes-tokens-prod
#   dashboard -> Workers & Pages -> Feature flags: one Flagship app per environment
#
# Every `DEV_*` / `PROD_*` placeholder in wrangler.jsonc wants the matching `EVB_`-prefixed
# variable, in apps/api/.deploy.env (gitignored, loaded below — start from `.deploy.env.example`)
# or, in CI, in the environment. Today that is:
#
#   EVB_DEV_D1_DATABASE_ID=…     EVB_DEV_KV_NAMESPACE_ID=…     EVB_DEV_FLAGSHIP_APP_ID=…
#   EVB_PROD_D1_DATABASE_ID=…    EVB_PROD_KV_NAMESPACE_ID=…    EVB_PROD_FLAGSHIP_APP_ID=…
#
# CI also needs CLOUDFLARE_API_TOKEN (Workers Scripts:Edit + D1:Edit) and CLOUDFLARE_ACCOUNT_ID.
#
# ── Dashboard secrets, per environment ───────────────────────────────────────────────────────────
#
#   dev         BETTER_AUTH_SECRET, BKASH_WEBHOOK_SECRET, E2E_SECRET (32+ chars: dev arms
#               E2E_HARNESS, and the Worker refuses to start without it)
#   production  BETTER_AUTH_SECRET, BKASH_WEBHOOK_SECRET,
#               BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD
#   both, optional  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (set both or neither)
#
# BKASH_WEBHOOK_SECRET is required even in dev's BKASH_MODE=fake: the webhook checks the HMAC
# before it looks anything up, so an unset secret rejects every webhook with a 401. The four
# merchant credentials are required only where BKASH_MODE=live, and `parseConfig` refuses to build
# a container without them — a 500 on the first request rather than an opaque bKash rejection
# inside a real checkout. Set them with `bunx wrangler secret put NAME --env <dev|production>`;
# `keep_vars: true` is what stops a later deploy from pruning them.
set -euo pipefail

API="$(cd "$(dirname "$0")/.." && pwd)"
cd "$API"

MODE="${1:-}"
MIGRATIONS_ONLY=0
if [[ "${2:-}" == "--migrations-only" ]]; then
  MIGRATIONS_ONLY=1
fi

usage() {
  sed -n '2,7p' "$0" >&2
}

if [[ "$MODE" == "check" ]]; then
  # No ids needed: a dry run resolves bindings against the config, uploads nothing, and is the
  # gate worth running on every PR. It checks both environments because the two `env` blocks
  # share nothing — wrangler inherits no bindings into them, so production can be broken while
  # dev is green.
  for target in dev production; do
    echo "── dry run: $target ────────────────────────────────────────────"
    bunx wrangler deploy --dry-run --minify --env "$target"
  done
  exit 0
fi

case "$MODE" in
  dev) PREFIX="DEV" ;;
  production | prod)
    MODE="production"
    PREFIX="PROD"
    ;;
  *)
    usage
    exit 2
    ;;
esac

# A human keeps the ids here; CI has them in the environment already. Not a secrets file — ids are
# not credentials — but account-specific, so it stays out of git.
if [[ -f "$API/.deploy.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$API/.deploy.env"
  set +a
fi

# The tokens are read out of the config rather than listed here, so a binding added to
# wrangler.jsonc tomorrow needs no edit to this script — it needs an EVB_ variable, and says so.
TOKENS="$(grep -oE "\"${PREFIX}_[A-Z0-9_]+\"" "$API/wrangler.jsonc" | tr -d '"' | sort -u)"
if [[ -z "$TOKENS" ]]; then
  echo "No ${PREFIX}_* placeholders in wrangler.jsonc — is the $MODE environment still there?" >&2
  exit 1
fi

# Shape per id kind. A typo'd or still-placeholder id would otherwise fail somewhere inside the
# upload — or, worse, resolve to a real resource belonging to someone else.
pattern_for() {
  case "$1" in
    *_KV_NAMESPACE_ID) echo '^[0-9a-f]{32}$' ;;
    *) echo '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' ;;
  esac
}

config="$(cat "$API/wrangler.jsonc")"
for token in $TOKENS; do
  var="EVB_$token"
  # Two statements, not one `local`: bash 3.2 (what macOS ships) resolves `${!var}` before the
  # assignment to `var` in the same command, and silently yields empty.
  value="${!var:-}"
  pattern="$(pattern_for "$token")"
  if [[ -z "$value" ]]; then
    echo "$var is not set — $MODE cannot be deployed." >&2
    echo "Create the resource and record its id; see the header of $0." >&2
    exit 1
  fi
  if [[ ! "$value" =~ $pattern ]] || [[ "$value" =~ ^[0-]+$ ]]; then
    echo "$var=\"$value\" does not look like a Cloudflare id (expected $pattern)." >&2
    exit 1
  fi
  config="${config//$token/$value}"
done

# Generated beside wrangler.jsonc, never anywhere else: wrangler resolves `main` and
# `migrations_dir` relative to the config file's directory.
GENERATED="$API/.wrangler.deploy.jsonc"
trap 'rm -f "$GENERATED"' EXIT
printf '%s\n' "$config" >"$GENERATED"

echo "── $MODE: D1 migrations (remote) ───────────────────────────────"
# `DB` is the binding, not the database name: one fewer string to keep in sync with the config,
# and no way to point this at a database the Worker does not use.
bunx wrangler d1 migrations apply DB --env "$MODE" --remote --config "$GENERATED"

if [[ "$MIGRATIONS_ONLY" == 1 ]]; then
  echo "── $MODE: migrations only, Worker not deployed ─────────────────"
  exit 0
fi

echo "── $MODE: deploying the Worker ─────────────────────────────────"
bunx wrangler deploy --minify --env "$MODE" --config "$GENERATED"

echo
echo "Rollback, in the order to reach for it:"
echo "  1. flip the Flagship flag that gates the change   (seconds, no deploy)"
echo "  2. bunx wrangler rollback --env $MODE             (seconds; lists recent versions)"
echo "  3. D1 has no rollback — roll forward with a new migration"
