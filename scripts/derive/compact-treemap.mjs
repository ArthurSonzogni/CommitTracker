// Writes a compact copy of the treemap data, loaded by components/Treemap.vue.
// The original files are kept, as they are part of the public API.
// Also folds commit-rate metrics (commits_30d, commits_1y) from
// public/commit_rates/<repo>/ into the treemap metrics when available.
//
// Usage: node scripts/derive/compact-treemap.mjs [dir=public/treemap]
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

const dir = path.resolve(process.argv[2] || 'public/treemap');
const commitRatesRoot = path.resolve(dir, '..', 'commit_rates');
const COMMIT_RATES_START_MS = Date.parse('2018-01-01T00:00:00Z');
const WEEK_MS = 7 * 86400 * 1000;

function decompressRates(compressed) {
  if (!compressed || compressed.length === 0) return [];
  let maxLen = 0;
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i + 1];
    if (data && data.length) {
      const end = start + data.length;
      if (end > maxLen) maxLen = end;
    }
  }
  const rates = new Array(maxLen).fill(0);
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i + 1];
    if (data) {
      for (let j = 0; j < data.length; j++) {
        rates[start + j] = data[j];
      }
    }
  }
  return rates;
}

function deriveCommitRateMetrics(repo, tree, datesIso) {
  const repoRatesDir = path.join(commitRatesRoot, repo);
  if (!fs.existsSync(repoRatesDir)) return null;

  // Map full relative file path -> original treemap node id.
  const pathToOrigId = new Map();
  const walk = (node, prefix) => {
    const nextPath =
      node.name === '/' || node.name === ''
        ? ''
        : prefix
          ? `${prefix}/${node.name}`
          : node.name;
    if (node.children) {
      for (const child of node.children) walk(child, nextPath);
    } else if (nextPath) {
      pathToOrigId.set(nextPath, node.id);
    }
  };
  walk(tree, '');

  // Precompute week index for each treemap date >= 2018-01-01.
  const dateWeeks = datesIso.map((iso, idx) => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || ms < COMMIT_RATES_START_MS) return null;
    return { idx, week: Math.floor((ms - COMMIT_RATES_START_MS) / WEEK_MS) };
  }).filter(Boolean);
  if (dateWeeks.length === 0) return null;

  const commits30d = {};
  const commits1y = {};

  const jsonFiles = fs
    .readdirSync(repoRatesDir)
    .filter((f) => f.endsWith('.json') && f !== 'buckets.json' && f !== 'total.json');

  for (const filename of jsonFiles) {
    const bucket = JSON.parse(fs.readFileSync(path.join(repoRatesDir, filename), 'utf8'));
    for (const [parentPath, children] of Object.entries(bucket)) {
      for (const [name, entry] of Object.entries(children)) {
        if (entry?.f !== 1) continue;
        const fullPath = parentPath === '.' ? name : `${parentPath}/${name}`;
        const origId = pathToOrigId.get(fullPath);
        if (origId === undefined) continue;

        const rates = decompressRates(entry.r);
        if (rates.length === 0) continue;

        // Prefix sum for O(1) rolling window sums at each treemap snapshot date.
        const len = rates.length;
        const pref = new Int32Array(len + 1);
        for (let i = 0; i < len; i++) {
          pref[i + 1] = pref[i] + rates[i];
        }
        const sumWin = (endWeek, winWeeks) => {
          const hi = Math.min(len, endWeek + 1);
          const lo = Math.max(0, endWeek + 1 - winWeeks);
          return hi > lo ? pref[hi] - pref[lo] : 0;
        };

        const series30d = [];
        const series1y = [];
        let prev30 = 0;
        let prev1y = 0;
        for (const { idx, week } of dateWeeks) {
          const v30 = sumWin(week, 4);
          if (v30 !== prev30) {
            series30d.push([idx, v30]);
            prev30 = v30;
          }
          const v1y = sumWin(week, 52);
          if (v1y !== prev1y) {
            series1y.push([idx, v1y]);
            prev1y = v1y;
          }
        }
        if (series30d.length > 0) commits30d[origId] = series30d;
        if (series1y.length > 0) commits1y[origId] = series1y;
      }
    }
  }

  return { commits_30d: commits30d, commits_1y: commits1y };
}

function writeCompactAndLatest(metricsDir, name, metric, newIds, latestIds, lastValue) {
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
  fs.writeFileSync(path.join(metricsDir, `${name}.compact.json`), JSON.stringify(out));

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
  fs.writeFileSync(path.join(metricsDir, `${name}.latest.json`), JSON.stringify(latestOut));
}

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
  const datesIso = JSON.parse(fs.readFileSync(path.join(repoDir, 'dates.json'), 'utf8'));
  const lastDate = datesIso.length - 1;
  const lastValue = values => {
    let out = 0;
    for (const [date, value] of values) {
      if (date <= lastDate) {
        out = value;
      }
    }
    return out;
  };

  const derivedCommitMetrics = deriveCommitRateMetrics(repo, tree, datesIso);

  const alive = new Set();
  for (const file of metricFiles) {
    const metric = JSON.parse(fs.readFileSync(path.join(metricsDir, file), 'utf8'));
    for (const [id, values] of Object.entries(metric)) {
      if (lastValue(values) != 0) {
        alive.add(Number(id));
      }
    }
  }
  if (derivedCommitMetrics) {
    for (const metric of Object.values(derivedCommitMetrics)) {
      for (const [id, values] of Object.entries(metric)) {
        if (lastValue(values) != 0) {
          alive.add(Number(id));
        }
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
    const name = file.replace(/\.json$/, '');
    writeCompactAndLatest(metricsDir, name, metric, newIds, latestIds, lastValue);
  }

  if (derivedCommitMetrics) {
    const availFile = path.join(repoDir, 'available_metrics.json');
    const avail = fs.existsSync(availFile) ? JSON.parse(fs.readFileSync(availFile, 'utf8')) : [];
    const availSet = new Set(avail);
    for (const [name, metric] of Object.entries(derivedCommitMetrics)) {
      writeCompactAndLatest(metricsDir, name, metric, newIds, latestIds, lastValue);
      availSet.add(name);
    }
    fs.writeFileSync(availFile, JSON.stringify([...availSet]));
  }

  console.log(`Compacted treemap data of ${repo}${derivedCommitMetrics ? ' (+ commit rates)' : ''}`);
}
