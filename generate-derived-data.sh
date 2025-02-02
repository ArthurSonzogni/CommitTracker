#!/bin/bash
cd importer

yarn install
yarn run derive_data
node cleanup_organizations.mjs
