#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/importer"

npm install
npm run derive_data

cd ..
node scripts/compact-treemap.mjs public/treemap
node scripts/derive-developers.mjs public/data
node scripts/derive-highlights.mjs public/data
node scripts/derive-top-bugs.mjs public/data
rm -f public/data/initiatives.json public/cve/lifespan.json
node scripts/derive-security.mjs public
if [ -d importer/chromium ]; then
  node importer/dir_metadata.mjs
fi
if command -v "${CHROME_PATH:-google-chrome}" >/dev/null 2>&1; then
  node scripts/og-developer-output.mjs
fi
