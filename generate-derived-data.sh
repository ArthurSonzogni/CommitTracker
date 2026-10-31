#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/importer"

npm install
npm run derive_data

cd ..
node scripts/compact-treemap.mjs public/treemap
node scripts/derive-developers.mjs public/data
node scripts/derive-highlights.mjs public/data
