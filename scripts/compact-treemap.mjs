// Writes a compact copy of the treemap data, loaded by components/Treemap.vue.
// The original files are kept, as they are part of the public API.
//
// Usage: node scripts/compact-treemap.mjs [dir=public/treemap]
//
// For each repository:
//
// file_index.compact.json
//   The tree, as nested arrays: a directory is [name, ...children], a file is
//   its name. Node ids are the preorder index (the root is 0).
//
// metrics/<metric>.compact.json
//   [[id_delta, date_delta, value_delta, date_delta, value_delta, ...], ...]
//   One row per node, sorted by id. Each delta is relative to the previous
//   row's id, or to the previous date/value of the same row.

import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || 'public/treemap';

for (const repo of fs.readdirSync(dir)) {
  const repoDir = path.join(dir, repo);
  const indexFile = path.join(repoDir, 'file_index.json');
  if (!fs.existsSync(indexFile)) {
    continue;
  }

  // Renumber the nodes in preorder.
  const tree = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const newIds = new Map();
  const compact = node => {
    newIds.set(node.id, newIds.size);
    return node.children
      ? [node.name, ...node.children.map(compact)]
      : node.name;
  };
  const compactTree = compact(tree);
  fs.writeFileSync(path.join(repoDir, 'file_index.compact.json'), JSON.stringify(compactTree));

  const metricsDir = path.join(repoDir, 'metrics');
  for (const file of fs.readdirSync(metricsDir)) {
    if (!file.endsWith('.json') || file.endsWith('.compact.json')) {
      continue;
    }
    const metric = JSON.parse(fs.readFileSync(path.join(metricsDir, file), 'utf8'));
    const rows = Object.entries(metric)
      .filter(([id]) => newIds.has(Number(id)))
      .map(([id, values]) => [newIds.get(Number(id)), values])
      .sort((a, b) => a[0] - b[0]);

    let previousId = 0;
    const out = rows.map(([id, values]) => {
      const row = [id - previousId];
      previousId = id;
      let previousDate = 0;
      let previousValue = 0;
      for (const [date, value] of values) {
        row.push(date - previousDate, value - previousValue);
        previousDate = date;
        previousValue = value;
      }
      return row;
    });
    fs.writeFileSync(
      path.join(metricsDir, file.replace(/\.json$/, '.compact.json')),
      JSON.stringify(out));
  }
  console.log(`Compacted treemap data of ${repo}`);
}
