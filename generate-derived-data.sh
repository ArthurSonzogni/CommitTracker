#!/bin/bash
cd importer

yarn install
node project_to_usernames.mjs
node project_to_organizations.mjs
node summary.mjs
node cleanup_organizations.mjs
