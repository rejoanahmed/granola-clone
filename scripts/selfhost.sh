#!/usr/bin/env bash
# Deploy your own server into YOUR Cloudflare account, in one command (D019).
#
#   bun run selfhost                         # first run: create everything, deploy, print the pairing link
#   bun run selfhost -- --language bn        # Bengali meetings: tell the transcriber
#   bun run selfhost -- --transcription elevenlabs --language bn
#                                            # better Bengali with your ElevenLabs key (asked for, or $ELEVENLABS_API_KEY)
#   bun run selfhost -- --llm anthropic      # notes and Ask from Claude with your key ($LLM_API_KEY);
#                                            # claude-haiku-5-5 by default, --llm-model claude-sonnet-5-5 for the best notes
#   bun run selfhost -- --llm openai --llm-model gpt-4.1-mini
#                                            # notes from an OpenAI-compatible endpoint with your key ($LLM_API_KEY)
#   bun run selfhost -- --llm-base-url https://generativelanguage.googleapis.com/v1beta/openai --llm openai --llm-model gemini-3.6-flash
#   bun run selfhost -- --gateway-logs on    # keep prompts and answers in your AI Gateway's logs (off by default)
#   bun run selfhost -- --gateway off        # call AI providers directly instead of through AI Gateway
#   bun run selfhost -- --rotate-token       # new pairing token; every paired phone must pair again
#   bun run selfhost -- --show               # print the server URL and pairing link again
#
# Re-running is safe and is how you update: every resource is created only if missing, migrations
# only move forward, and the choices you made last time are remembered in apps/api/.selfhost.env
# (gitignored; it holds your pairing token, so treat it like a password).
#
# Everything lands in the account `wrangler whoami` shows. Nothing is sent anywhere else: your
# recordings, transcripts and notes live in your D1 database and R2 bucket, and are processed by
# Workers AI in your account (or by the vendor whose key you give it).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/apps/api"
STATE="$API/.selfhost.env"
cd "$API"

WORKER="kothanote-server"
DB_NAME="kothanote-db"
BUCKET="kothanote-audio"
QUEUES=("kothanote-generation-selfhost" "kothanote-transcription-selfhost")

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\n\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}
wr() { bunx wrangler "$@"; }

# ── Remembered choices ────────────────────────────────────────────────────────────────────────
D1_ID=""
OWNER_TOKEN=""
AUTH_SECRET=""
SERVER_URL=""
LANGUAGE="auto"
TRANSCRIPTION="workers-ai"
LLM="workers-ai"
LLM_MODEL=""
LLM_BASE_URL=""
GATEWAY="default"
GATEWAY_LOGS="off"
ACCOUNT_ID=""
if [[ -f "$STATE" ]]; then
  # shellcheck disable=SC1090
  . "$STATE"
fi

ROTATE=0
SHOW=0
SAVED_LLM="$LLM"
MODEL_GIVEN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --language) LANGUAGE="$2"; shift 2 ;;
    --transcription) TRANSCRIPTION="$2"; shift 2 ;;
    --llm) LLM="$2"; shift 2 ;;
    --llm-model) LLM_MODEL="$2"; MODEL_GIVEN=1; shift 2 ;;
    --llm-base-url) LLM_BASE_URL="$2"; MODEL_GIVEN=1; shift 2 ;;
    --gateway) GATEWAY="$2"; shift 2 ;;
    --gateway-logs) GATEWAY_LOGS="$2"; shift 2 ;;
    --rotate-token) ROTATE=1; shift ;;
    --show) SHOW=1; shift ;;
    -h | --help) sed -n '2,24p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# A model remembered for another provider means nothing to this one.
if [[ "$LLM" != "$SAVED_LLM" && "$MODEL_GIVEN" == 0 ]]; then
  LLM_MODEL=""
  LLM_BASE_URL=""
fi

[[ "$LANGUAGE" =~ ^(auto|[a-z]{2,3})$ ]] || die "--language takes an ISO code such as bn or en, or auto"
[[ "$TRANSCRIPTION" =~ ^(workers-ai|elevenlabs)$ ]] || die "--transcription is workers-ai or elevenlabs"
[[ "$LLM" =~ ^(workers-ai|openai|anthropic)$ ]] || die "--llm is workers-ai, anthropic or openai"
[[ "$GATEWAY" =~ ^[a-z0-9][a-z0-9_-]{0,63}$ ]] || die "--gateway is a gateway id (default) or off"
[[ "$GATEWAY_LOGS" =~ ^(on|off)$ ]] || die "--gateway-logs is on or off"
if [[ "$LLM" == "openai" && -z "$LLM_MODEL" ]]; then
  die "--llm openai needs --llm-model (the model id your endpoint expects)"
fi

pairing_link() {
  # The app opens this link and fills both fields; typing them by hand works just as well.
  local enc_url enc_token
  enc_url="$(bun -e 'console.log(encodeURIComponent(process.argv[1]))' "$SERVER_URL")"
  enc_token="$(bun -e 'console.log(encodeURIComponent(process.argv[1]))' "$OWNER_TOKEN")"
  echo "kothanote://connect?server=${enc_url}&token=${enc_token}"
}

show() {
  say "Your server is ready."
  echo "  Server URL:     $SERVER_URL"
  echo "  Pairing token:  $OWNER_TOKEN"
  echo
  echo "  On your iPhone, open the app and enter both, or open this link on the phone:"
  echo "    $(pairing_link)"
  if command -v qrencode >/dev/null 2>&1; then
    echo
    qrencode -t ansiutf8 "$(pairing_link)"
  fi
  echo
  echo "  Keep the token private: it is the password to your notes."
}

if [[ "$SHOW" == 1 ]]; then
  [[ -n "$SERVER_URL" && -n "$OWNER_TOKEN" ]] || die "Nothing deployed yet: run bun run selfhost first."
  show
  exit 0
fi

# ── 1. Which account ──────────────────────────────────────────────────────────────────────────
say "1/7  Checking your Cloudflare login"
if ! WHO="$(wr whoami 2>&1)" || grep -q "not authenticated" <<<"$WHO"; then
  echo "Not logged in. A browser window will open to log in to Cloudflare."
  wr login
  WHO="$(wr whoami 2>&1)"
fi
ACCOUNTS="$(grep -cE '│ [0-9a-f]{32} │' <<<"$WHO" || true)"
if [[ "$ACCOUNTS" -gt 1 && -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "$WHO" | grep -E '│'
  die "Your login can reach several accounts. Choose one: CLOUDFLARE_ACCOUNT_ID=<id> bun run selfhost"
fi
grep -E '│ .* │ [0-9a-f]{32} │' <<<"$WHO" | head -3 || true
# The account id names the AI Gateway URL an outside vendor (Claude, ElevenLabs) is called through.
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(grep -oE '│ [0-9a-f]{32} │' <<<"$WHO" | head -1 | tr -dc '0-9a-f')}"

# ── 2. Database, bucket, queues ───────────────────────────────────────────────────────────────
say "2/7  Creating your database, storage bucket and queues (skipped where they exist)"
if [[ -z "$D1_ID" ]]; then
  D1_ID="$(wr d1 list --json | bun -e '
    const name = process.argv[1];
    const list = JSON.parse(await Bun.stdin.text());
    console.log(list.find((d) => d.name === name)?.uuid ?? "");' "$DB_NAME")"
fi
if [[ -z "$D1_ID" ]]; then
  wr d1 create "$DB_NAME" >/dev/null
  D1_ID="$(wr d1 list --json | bun -e '
    const name = process.argv[1];
    const list = JSON.parse(await Bun.stdin.text());
    console.log(list.find((d) => d.name === name)?.uuid ?? "");' "$DB_NAME")"
fi
[[ "$D1_ID" =~ ^[0-9a-f-]{36}$ ]] || die "Could not create or find the D1 database $DB_NAME."
echo "  D1 database   $DB_NAME ($D1_ID)"

create_if_missing() {
  # Both create commands fail on an existing name; that is the "already there" case, not an error.
  local out
  if out="$("$@" 2>&1)"; then
    return 0
  fi
  grep -qiE "already exists|already own|already taken|11009|10004" <<<"$out" && return 0
  echo "$out" >&2
  if grep -qi "R2" <<<"$out" && grep -qiE "enable|purchase|subscription|10042" <<<"$out"; then
    die "R2 is not enabled on this account yet. Open dash.cloudflare.com -> R2 -> enable it (the free tier is enough, a payment method may be required), then run this again."
  fi
  die "That step failed; the message above says why."
}
create_if_missing wr r2 bucket create "$BUCKET"
echo "  R2 bucket     $BUCKET"
for queue in "${QUEUES[@]}"; do
  create_if_missing wr queues create "$queue"
  echo "  Queue         $queue"
done

# ── 3. Secrets kept from run to run ───────────────────────────────────────────────────────────
random() { bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url"))'; }
if [[ -z "$OWNER_TOKEN" || "$ROTATE" == 1 ]]; then
  OWNER_TOKEN="$(random)"
fi
if [[ -z "$AUTH_SECRET" ]]; then
  AUTH_SECRET="$(random)$(random)"
fi

save_state() {
  umask 077
  cat >"$STATE" <<EOF
# Written by scripts/selfhost.sh. Your server's settings and secrets: never commit or share this.
D1_ID="$D1_ID"
OWNER_TOKEN="$OWNER_TOKEN"
AUTH_SECRET="$AUTH_SECRET"
SERVER_URL="$SERVER_URL"
LANGUAGE="$LANGUAGE"
TRANSCRIPTION="$TRANSCRIPTION"
LLM="$LLM"
LLM_MODEL="$LLM_MODEL"
LLM_BASE_URL="$LLM_BASE_URL"
GATEWAY="$GATEWAY"
GATEWAY_LOGS="$GATEWAY_LOGS"
ACCOUNT_ID="$ACCOUNT_ID"
EOF
}
save_state

# ── 4. The configuration ──────────────────────────────────────────────────────────────────────
say "3/7  Writing your configuration"
GENERATED="$API/.wrangler.selfhost.jsonc"
trap 'rm -f "$GENERATED" "$API/.selfhost.secrets.json"' EXIT
SELFHOST_D1="$D1_ID" LANGUAGE="$LANGUAGE" TRANSCRIPTION="$TRANSCRIPTION" LLM="$LLM" \
  LLM_MODEL="$LLM_MODEL" LLM_BASE_URL="$LLM_BASE_URL" GATEWAY="$GATEWAY" GATEWAY_LOGS="$GATEWAY_LOGS" \
  ACCOUNT_ID="$ACCOUNT_ID" bun -e '
  const fs = require("node:fs");
  const e = process.env;
  const text = fs.readFileSync("wrangler.jsonc", "utf8").replaceAll("SELFHOST_D1_DATABASE_ID", e.SELFHOST_D1);
  // Only the selfhost block is rewritten: split there, edit the tail, join.
  const at = text.indexOf("\"selfhost\": {");
  let tail = text.slice(at);
  const swap = (key, value) => {
    tail = tail.replace(new RegExp(`"${key}": "[^"]*"`), `"${key}": ${JSON.stringify(value)}`);
  };
  swap("TRANSCRIPTION_LANGUAGE", e.LANGUAGE);
  swap("TRANSCRIPTION_MODE", e.TRANSCRIPTION);
  swap("LLM_MODE", e.LLM);
  swap("AI_GATEWAY_ID", e.GATEWAY);
  swap("AI_GATEWAY_LOGS", e.GATEWAY_LOGS);
  const extra = [];
  if (e.LLM_MODEL) extra.push(`"LLM_MODEL": ${JSON.stringify(e.LLM_MODEL)},`);
  if (e.LLM_BASE_URL) extra.push(`"LLM_BASE_URL": ${JSON.stringify(e.LLM_BASE_URL)},`);
  if (e.ACCOUNT_ID) extra.push(`"CF_ACCOUNT_ID": ${JSON.stringify(e.ACCOUNT_ID)},`);
  tail = tail.replace("\"NODE_ENV\": \"production\"", [...extra, "\"NODE_ENV\": \"production\""].join("\n        "));
  fs.writeFileSync(".wrangler.selfhost.jsonc", text.slice(0, at) + tail);
'
echo "  Transcription  $TRANSCRIPTION (language: $LANGUAGE)"
echo "  Notes and Ask  $LLM${LLM_MODEL:+ ($LLM_MODEL)}"
echo "  AI Gateway     $GATEWAY (logs $GATEWAY_LOGS)"

# ── 5. Database tables ────────────────────────────────────────────────────────────────────────
say "4/7  Creating or updating your database tables"
wr d1 migrations apply DB --env selfhost --remote --config "$GENERATED"

# ── 6. The Worker ─────────────────────────────────────────────────────────────────────────────
say "5/7  Deploying your server"
DEPLOY_OUT="$(wr deploy --minify --env selfhost --config "$GENERATED" 2>&1 | tee /dev/stderr)"
URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' <<<"$DEPLOY_OUT" | head -1 || true)"
if [[ -n "$URL" ]]; then
  SERVER_URL="$URL"
fi
[[ -n "$SERVER_URL" ]] || die "Deployed, but could not read the workers.dev address from the output above. Find it under Workers & Pages -> $WORKER in the dashboard, then: SERVER_URL=<it> in $STATE and run --show."
save_state

# ── 7. Secrets on the Worker ──────────────────────────────────────────────────────────────────
say "6/7  Storing your secrets on the server"
ask_key() {
  local name="$1" hint="$2" value="${!1:-}"
  if [[ -z "$value" ]]; then
    printf '  %s (%s), input hidden: ' "$name" "$hint" >&2
    read -rs value
    echo >&2
  fi
  [[ -n "$value" ]] || die "$name is required for this choice."
  printf '%s' "$value"
}
SECRETS_FILE="$API/.selfhost.secrets.json"
{
  printf '{"BETTER_AUTH_SECRET":%s,"OWNER_TOKEN":%s' \
    "$(bun -e 'console.log(JSON.stringify(process.argv[1]))' "$AUTH_SECRET")" \
    "$(bun -e 'console.log(JSON.stringify(process.argv[1]))' "$OWNER_TOKEN")"
  if [[ "$TRANSCRIPTION" == "elevenlabs" ]]; then
    printf ',"ELEVENLABS_API_KEY":%s' "$(bun -e 'console.log(JSON.stringify(process.argv[1]))' "$(ask_key ELEVENLABS_API_KEY 'from elevenlabs.io -> Developers -> API keys')")"
  fi
  if [[ "$LLM" == "openai" || "$LLM" == "anthropic" ]]; then
    printf ',"LLM_API_KEY":%s' "$(bun -e 'console.log(JSON.stringify(process.argv[1]))' "$(ask_key LLM_API_KEY "your $LLM API key")")"
  fi
  printf '}'
} >"$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"
wr secret bulk "$SECRETS_FILE" --env selfhost --config "$GENERATED" >/dev/null
echo "  Stored."

# ── 8. Check ──────────────────────────────────────────────────────────────────────────────────
say "7/7  Checking that it answers"
for _ in $(seq 1 20); do
  if INFO="$(curl -fsS "$SERVER_URL/server" 2>/dev/null)" && grep -q '"auth":"owner"' <<<"$INFO"; then
    echo "  $INFO"
    show
    exit 0
  fi
  sleep 3
done
die "The server did not answer at $SERVER_URL/server yet. A new workers.dev address can take a minute: try curl $SERVER_URL/server, then bun run selfhost -- --show."
