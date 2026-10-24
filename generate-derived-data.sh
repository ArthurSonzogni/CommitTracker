#!/bin/bash
cd importer

npm install
npm run derive_data
node cleanup_organizations.mjs

cd ..
node scripts/compact-treemap.mjs public/treemap
