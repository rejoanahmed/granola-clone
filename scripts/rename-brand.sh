#!/usr/bin/env bash
# Rename the product (D023), after editing packages/domain/src/Brand.ts.
#
#   scripts/rename-brand.sh <old-slug> <new-slug> <old-bundle-id> <new-bundle-id> ["New Display Name"]
#   scripts/rename-brand.sh kothanote kothanote com.rovierr.kothanote com.rejoanahmed.kothanote "Kothanote"
#
# Brand.ts is what the code reads. This script rewrites the copies that cannot import it: Maestro's
# `appId`s, app.json's static fields, the wrangler resource names (`<slug>-server`, `<slug>-db`, …)
# and the selfhost script's. It edits tracked files only, prints what it changed, and commits
# nothing. Run it BEFORE the first App Store upload: a new bundle id is a new app.
#
# An owner who already deployed under the old slug keeps their old resources; their next
# `bun run selfhost` creates new ones beside them (the data does not move). Rename before release.
set -euo pipefail
[[ $# -ge 4 ]] || { sed -n '2,13p' "$0"; exit 2; }
OLD_SLUG="$1" NEW_SLUG="$2" OLD_ID="$3" NEW_ID="$4" NEW_NAME="${5:-}"
[[ "$NEW_SLUG" =~ ^[a-z][a-z0-9]{1,30}$ ]] || { echo "slug must be lowercase letters and digits" >&2; exit 2; }
[[ "$NEW_ID" =~ ^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$ ]] || { echo "bundle id looks wrong" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
grep -q "\"$NEW_SLUG\"" packages/domain/src/Brand.ts || {
  echo "Edit packages/domain/src/Brand.ts first (slug \"$NEW_SLUG\")." >&2
  exit 1
}

mapfile -t FILES < <(git ls-files apps/native/.maestro apps/native/app.json apps/api/wrangler.jsonc scripts/selfhost.sh apps/api/src/worker.ts SELF-HOSTING.md)
for f in "${FILES[@]}"; do
  before="$(cat "$f")"
  sed -i.bak \
    -e "s/${OLD_ID//./\\.}/$NEW_ID/g" \
    -e "s/\\b$OLD_SLUG-\\(server\\|db\\|audio\\|generation\\|transcription\\|api\\)/$NEW_SLUG-\\1/g" \
    -e "s/\"$OLD_SLUG\"/\"$NEW_SLUG\"/g" \
    -e "s#$OLD_SLUG://#$NEW_SLUG://#g" \
    "$f"
  rm -f "$f.bak"
  [[ "$before" != "$(cat "$f")" ]] && echo "  rewrote $f"
done
if [[ -n "$NEW_NAME" ]]; then
  sed -i.bak "s/\"name\": \"[^\"]*\"/\"name\": \"$NEW_NAME\"/" apps/native/app.json && rm -f apps/native/app.json.bak
fi
echo "Done. Review with git diff, then bun run check."
