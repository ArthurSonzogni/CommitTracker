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
//
// file_index.latest.json, metrics/<metric>.latest.json
//   A snapshot of the last date, much smaller, to show the treemap before the
//   whole history is loaded. The tree keeps only the nodes with a value at
//   the last date, in any metric, with their own preorder ids. The metrics
//   are [[id_delta, value], ...], for the nonzero values.

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

  // The nodes with a value at the last date, and their own preorder ids.
  const metricsDir = path.join(repoDir, 'metrics');
  const metricFiles = fs.readdirSync(metricsDir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.compact.json') &&
      !file.endsWith('.latest.json'));
  const lastDate = JSON.parse(fs.readFileSync(path.join(repoDir, 'dates.json'), 'utf8')).length - 1;
  const lastValue = values => {
    let out = 0;
    for (const [date, value] of values) {
      if (date <= lastDate) {
        out = value;
      }
    }
    return out;
  };
  const alive = new Set();
  for (const file of metricFiles) {
    const metric = JSON.parse(fs.readFileSync(path.join(metricsDir, file), 'utf8'));
    for (const [id, values] of Object.entries(metric)) {
      if (lastValue(values) != 0) {
        alive.add(Number(id));
      }
    }
  }
  const latestIds = new Map();
  const latest = node => {
    if (!node.children) {
      if (!alive.has(node.id)) {
        return null;
      }
      latestIds.set(node.id, latestIds.size);
      return node.name;
    }
    const id = latestIds.size;
    latestIds.set(node.id, id);
    const children = node.children.map(latest).filter(child => child !== null);
    if (children.length == 0 && !alive.has(node.id) && node !== tree) {
      // Its descendants are all dropped already: its id is the last one, and
      // freeing it keeps the preorder numbering.
      latestIds.delete(node.id);
      return null;
    }
    return [node.name, ...children];
  };
  fs.writeFileSync(path.join(repoDir, 'file_index.latest.json'), JSON.stringify(latest(tree)));

  for (const file of metricFiles) {
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

    let previousLatestId = 0;
    const latestOut = Object.entries(metric)
      .filter(([id]) => latestIds.has(Number(id)))
      .map(([id, values]) => [latestIds.get(Number(id)), lastValue(values)])
      .filter(([, value]) => value != 0)
      .sort((a, b) => a[0] - b[0])
      .map(([id, value]) => {
        const row = [id - previousLatestId, value];
        previousLatestId = id;
        return row;
      });
    fs.writeFileSync(
      path.join(metricsDir, file.replace(/\.json$/, '.latest.json')),
      JSON.stringify(latestOut));
  }
  console.log(`Compacted treemap data of ${repo}`);
}
