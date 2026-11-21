#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${SKIP_NPM_INSTALL:-0}" != "1" ]; then
  (cd "$ROOT_DIR/importer" && npm install)
fi

# Step 1: derive usernames, organizations, and summaries.
(cd "$ROOT_DIR/importer" && node derive_data.mjs)

# Step 2: run independent downstream derivations in parallel.
rm -f "$ROOT_DIR/public/data/initiatives.json" "$ROOT_DIR/public/cve/lifespan.json"

pids=""

(cd "$ROOT_DIR/importer" && node badges.mjs) &
pids="$pids $!"

(
  cd "$ROOT_DIR/importer" && node derive_developer_output.mjs
  if command -v "${CHROME_PATH:-google-chrome}" >/dev/null 2>&1; then
    cd "$ROOT_DIR" && node scripts/og-developer-output.mjs
  fi
) &
pids="$pids $!"

(cd "$ROOT_DIR" && node scripts/compact-treemap.mjs public/treemap) &
pids="$pids $!"

(cd "$ROOT_DIR" && node scripts/derive-developers.mjs public/data) &
pids="$pids $!"

(cd "$ROOT_DIR" && node scripts/derive-highlights.mjs public/data) &
pids="$pids $!"

(cd "$ROOT_DIR" && node scripts/derive-top-bugs.mjs public/data) &
pids="$pids $!"

(cd "$ROOT_DIR" && node scripts/derive-security.mjs public) &
pids="$pids $!"

if [ -d "$ROOT_DIR/importer/chromium" ]; then
  (cd "$ROOT_DIR" && node importer/dir_metadata.mjs) &
  pids="$pids $!"
fi

failed=0
for pid in $pids; do
  wait "$pid" || failed=1
done
if [ "$failed" -ne 0 ]; then
  exit 1
fi
