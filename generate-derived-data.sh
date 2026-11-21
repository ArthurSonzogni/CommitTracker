#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ "${SKIP_NPM_INSTALL:-0}" != "1" ]; then
  (cd "$ROOT_DIR/importer" && npm install)
fi

# Step 1: derive usernames, organizations, and summaries.
node scripts/derive/data.mjs

# Step 2: run independent downstream derivations in parallel.
rm -f "$ROOT_DIR/public/data/initiatives.json" "$ROOT_DIR/public/cve/lifespan.json"

pids=""

node scripts/derive/badges.mjs &
pids="$pids $!"

(
  node scripts/derive/developer-output.mjs
  if command -v "${CHROME_PATH:-google-chrome}" >/dev/null 2>&1; then
    node scripts/derive/og-developer-output.mjs
  fi
) &
pids="$pids $!"

node scripts/derive/compact-treemap.mjs public/treemap &
pids="$pids $!"

node scripts/derive/developers.mjs public/data &
pids="$pids $!"

node scripts/derive/highlights.mjs public/data &
pids="$pids $!"

node scripts/derive/top-bugs.mjs public/data &
pids="$pids $!"

node scripts/derive/security.mjs public &
pids="$pids $!"

node scripts/derive/cve-summary.mjs public/cve &
pids="$pids $!"

failed=0
for pid in $pids; do
  wait "$pid" || failed=1
done
if [ "$failed" -ne 0 ]; then
  exit 1
fi
