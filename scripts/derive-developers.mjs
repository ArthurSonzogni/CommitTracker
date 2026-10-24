// Derives a per-developer index from the per-repository summaries, used by the
// developer profile pages (pages/developers/[name].vue).
//
// Usage: node scripts/derive-developers.mjs [dir=public/data]
//
// Writes <dir>/developers/<shard>.json, one file per first character of the
// usernames:
//   {
//     "<username>": {
//       "<repository>": [<commits authored>, <reviews>, <first year>, <last year>],
//       ...
//     },
//     ...
//   }

import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || 'public/data';

// The shard of a username. Kept in sync with pages/developers/[name].vue.
const shardOf = username => {
  const c = username[0].toLowerCase();
  return /[a-z0-9]/.test(c) ? c : '_';
};

const readSummary = (repository, kind) => {
  const file = path.join(dir, repository, `usernames_summary_commit_yearly_${kind}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
};

const developers = {};
const repositories = JSON.parse(fs.readFileSync(path.join(dir, 'repositories.json'), 'utf8'));
for (const { dirname } of repositories) {
  const author = readSummary(dirname, 'author');
  const review = readSummary(dirname, 'review');
  for (const username of new Set([...Object.keys(author), ...Object.keys(review)])) {
    if (!username) {
      continue;
    }
    const years = [
      ...Object.keys(author[username] ?? {}),
      ...Object.keys(review[username] ?? {}),
    ].map(Number);
    const sum = counts => Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
    developers[username] ??= {};
    developers[username][dirname] = [
      sum(author[username]),
      sum(review[username]),
      Math.min(...years),
      Math.max(...years),
    ];
  }
}

const shards = {};
for (const [username, entry] of Object.entries(developers)) {
  (shards[shardOf(username)] ??= {})[username] = entry;
}

const outDir = path.join(dir, 'developers');
fs.mkdirSync(outDir, { recursive: true });
for (const [shard, entries] of Object.entries(shards)) {
  fs.writeFileSync(path.join(outDir, `${shard}.json`), JSON.stringify(entries));
}
console.log(`Derived ${Object.keys(developers).length} developers in ${Object.keys(shards).length} shards`);
