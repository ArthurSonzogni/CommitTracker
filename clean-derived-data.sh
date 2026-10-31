#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/public/data"

find . -mindepth 2 -maxdepth 2 ! -name 'emails' ! -name 'emails.json' -exec rm -rf {} +
find . -mindepth 1 -maxdepth 1 \( -type d -empty -o -type f ! -name 'repositories.json' ! -name '.nojekyll' \) -delete
