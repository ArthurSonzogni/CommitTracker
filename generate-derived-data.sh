#!/bin/bash
cd importer

yarn install
node project_to_organizations.mjs
node project_to_usernames.mjs
node summary.mjs
