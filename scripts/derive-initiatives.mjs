// Derives strategic migration burn-downs, CWE memory-safety mitigation ROI,
// and CVE vulnerability dwell-time / decomposed SLA analytics from existing
// public/treemap/chromium/ and public/cve/data.json datasets.
//
// Usage: node scripts/derive-initiatives.mjs [publicDir=public]
//
// Writes:
//   - <publicDir>/data/initiatives.json
//   - <publicDir>/cve/lifespan.json

import fs from 'fs';
import path from 'path';

const publicDir = process.argv[2] || 'public';
const treemapDir = path.join(publicDir, 'treemap', 'chromium');
const cveFile = path.join(publicDir, 'cve', 'data.json');
const releasesFile = path.resolve('utils/chrome-releases.json');
const yamlFile = path.resolve('treemap/chromium.yaml');

const DAY_MS = 24 * 60 * 60 * 1000;

function decodeHtmlEntities(text) {
  return String(text || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function parseYamlDescriptions(filePath) {
  const out = new Map();
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    const nameMatch = line.match(/^- name:\s*"?([^"]+)"?\s*$/);
    if (nameMatch) {
      if (cur?.file) out.set(cur.file, cur);
      cur = { name: nameMatch[1].trim(), description: '' };
      continue;
    }
    if (!cur) continue;
    const descMatch = line.match(/^\s+description:\s*"?(.+?)"?\s*$/);
    if (descMatch) cur.description = descMatch[1].trim();
    const fileMatch = line.match(/^\s+file:\s*(\S+)\s*$/);
    if (fileMatch) cur.file = fileMatch[1].trim();
  }
  if (cur?.file) out.set(cur.file, cur);
  return out;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedValues[base + 1] ?? sortedValues[base];
  return sortedValues[base] + rest * (next - sortedValues[base]);
}

function round1(val) {
  return val == null || !Number.isFinite(val) ? null : Math.round(val * 10) / 10;
}

function round2(val) {
  return val == null || !Number.isFinite(val) ? null : Math.round(val * 100) / 100;
}

// -----------------------------------------------------------------------------
// 1. Load & index Chromium compact treemap
// -----------------------------------------------------------------------------
const yamlMeta = parseYamlDescriptions(yamlFile);
const datesIso = JSON.parse(fs.readFileSync(path.join(treemapDir, 'dates.json'), 'utf8'));
const datesMs = datesIso.map((d) => new Date(d).getTime());
const lastIdx = datesIso.length - 1;
const latestDate = datesIso[lastIdx].slice(0, 10);

function findClosestDateIdx(targetMs) {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < datesMs.length; i++) {
    const diff = Math.abs(datesMs[i] - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

const idx90d = findClosestDateIdx(datesMs[lastIdx] - 90 * DAY_MS);
const idx180d = findClosestDateIdx(datesMs[lastIdx] - 180 * DAY_MS);
const idx365d = findClosestDateIdx(datesMs[lastIdx] - 365 * DAY_MS);
const actualDays90d = Math.max(1, (datesMs[lastIdx] - datesMs[idx90d]) / DAY_MS);
const actualDays180d = Math.max(1, (datesMs[lastIdx] - datesMs[idx180d]) / DAY_MS);
const actualDays365d = Math.max(1, (datesMs[lastIdx] - datesMs[idx365d]) / DAY_MS);

const compactTree = JSON.parse(
  fs.readFileSync(path.join(treemapDir, 'file_index.compact.json'), 'utf8'),
);

const TEST_RE = /test|mock|example/i;
let numNodes = 0;
const countWalk = (node) => {
  numNodes++;
  if (typeof node !== 'string') {
    for (let i = 1; i < node.length; i++) countWalk(node[i]);
  }
};
countWalk(compactTree);

// Flags: bit 1 = test, bit 2 = vendored third_party (excluding blink/webkit).
const excludeFlags = new Uint8Array(numNodes);
// Each node maps to a meaningful subsystem directory bucket (depth 2, or depth 3
// for third_party/blink/*, or depth 1 for root-level/small dirs).
const bucketNames = [];
const bucketSegments = [];
const bucketMap = new Map();
const nodeBucket = new Int32Array(numNodes).fill(-1);

function getBucketId(segments) {
  if (!segments.length) return -1;
  const key = segments.join('/');
  let id = bucketMap.get(key);
  if (id === undefined) {
    id = bucketNames.length;
    bucketMap.set(key, id);
    bucketNames.push(key);
    bucketSegments.push([...segments]);
  }
  return id;
}

let walkId = 0;
function indexTree(node, tpParent, inhFlags, dirSegments) {
  const id = walkId++;
  const isFile = typeof node === 'string';
  const name = isFile ? node : node[0];
  let flags = inhFlags;
  if (id > 0 && name) {
    if ((flags & 1) === 0 && TEST_RE.test(name)) flags |= 1;
    const lower = name.toLowerCase();
    if (tpParent && lower !== 'blink' && lower !== 'webkit') flags |= 2;
  }
  excludeFlags[id] = flags;

  const curDirs = !isFile && id > 0 ? [...dirSegments, name] : dirSegments;
  // Determine blocker directory bucket (depth 3 for third_party/blink/X, else depth 2).
  let bSegs = curDirs;
  if (curDirs.length >= 3 && curDirs[0] === 'third_party' && curDirs[1].toLowerCase() === 'blink') {
    bSegs = curDirs.slice(0, 3);
  } else if (curDirs.length >= 2) {
    bSegs = curDirs.slice(0, 2);
  } else if (curDirs.length === 1) {
    bSegs = curDirs.slice(0, 1);
  } else if (isFile && id > 0) {
    bSegs = ['(root)'];
  }
  nodeBucket[id] = getBucketId(bSegs);

  if (!isFile) {
    const nextTp = id > 0 ? name.toLowerCase() === 'third_party' : false;
    for (let i = 1; i < node.length; i++) {
      indexTree(node[i], nextTp, flags, curDirs);
    }
  }
}
indexTree(compactTree, false, 0, []);

const metricCache = new Map();
function loadCompactMetric(metric) {
  if (!metricCache.has(metric)) {
    const file = path.join(treemapDir, 'metrics', `${metric}.compact.json`);
    metricCache.set(metric, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return metricCache.get(metric);
}

// Computes full root time series AND per-bucket values at latest & 90d-ago.
function computeMetricStats(metric, mask = 2) {
  const rows = loadCompactMetric(metric);
  const diffSeries = new Float64Array(datesIso.length);
  const bucketCur = new Float64Array(bucketNames.length);
  const bucket90d = new Float64Array(bucketNames.length);

  let id = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    id += row[0];
    if (mask && (excludeFlags[id] & mask) !== 0) continue;

    let d = 0;
    let val = 0;
    let valAt90d = 0;
    let passed90d = false;
    for (let i = 1; i < row.length; i += 2) {
      d += row[i];
      if (!passed90d && d > idx90d) {
        valAt90d = val;
        passed90d = true;
      }
      if (d < datesIso.length) {
        diffSeries[d] += row[i + 1];
      }
      val += row[i + 1];
    }
    if (!passed90d) valAt90d = val;

    const bId = nodeBucket[id];
    if (bId >= 0) {
      if (val !== 0) bucketCur[bId] += val;
      if (valAt90d !== 0) bucket90d[bId] += valAt90d;
    }
  }

  const series = new Float64Array(datesIso.length);
  let acc = 0;
  for (let i = 0; i < datesIso.length; i++) {
    acc += diffSeries[i];
    series[i] = acc;
  }
  return { series, bucketCur, bucket90d };
}

function buildTreemapUrl({ color, size, excludeTp = true, excludeTest = false, start, pathSegs }) {
  const params = new URLSearchParams();
  params.set('field_color', color.join(','));
  params.set('field_size', size.join(','));
  params.set('repositories', 'chromium');
  if (pathSegs && pathSegs.length && pathSegs[0] !== '(root)') {
    params.set('path', pathSegs.join(','));
  }
  if (start) {
    params.set('dates', `${start},${latestDate}`);
  }
  if (excludeTp) params.set('exclude_third_party', '1');
  if (excludeTest) params.set('exclude_test', '1');
  params.set('history_size', '1');
  return `/treemap?${params.toString()}`;
}

// Strategic horizontal initiatives definition.
// mask: 2 = exclude third_party (except Blink), 3 = exclude third_party + tests.
const INITIATIVE_SPECS = [
  {
    id: 'spanification_files',
    name: 'Spanification: File Opt-Outs',
    category: 'Memory Safety',
    kind: 'burndown',
    legacyMetric: 'lines_unsafe_buffer_usage',
    sizeMetrics: ['line'],
    unit: 'lines',
    mask: 2,
    start: '2024-01-01',
    description:
      'First-party C++ lines still opted out of -Wunsafe-buffer-usage file-level checks.',
  },
  {
    id: 'spanification_todo',
    name: 'Spanification: UNSAFE_TODO(...)',
    category: 'Memory Safety',
    kind: 'burndown',
    legacyMetric: 'unsafe_todo',
    modernMetric: 'base_span',
    sizeMetrics: ['line'],
    unit: 'call sites',
    mask: 2,
    start: '2024-08-01',
    description:
      'Granular UNSAFE_TODO(...) pointer-arithmetic call sites awaiting bounds-checked base::span rewrite.',
  },
  {
    id: 'unsafe_libc',
    name: 'Unsafe libc Memory Calls',
    category: 'Memory Safety',
    kind: 'burndown',
    legacyMetric: 'unsafe_libc',
    sizeMetrics: ['line'],
    unit: 'calls',
    mask: 2,
    start: '2020-01-01',
    description:
      'Raw memcpy, memmove, memset, memcmp, strcpy, and sprintf calls in first-party C++.',
  },
  {
    id: 'miracleptr_dangling',
    name: 'MiraclePtr: DanglingUntriaged',
    category: 'Memory Safety',
    kind: 'burndown',
    legacyMetric: 'dangling_untriaged',
    sizeMetrics: ['raw_ptr', 'raw_ref'],
    unit: 'pointers',
    mask: 2,
    start: '2022-01-01',
    description:
      'Pre-existing dangling raw_ptr<T> fields marked DanglingUntriaged awaiting ownership fix.',
  },
  {
    id: 'miracleptr_exclusion',
    name: 'MiraclePtr: RAW_PTR_EXCLUSION',
    category: 'Memory Safety',
    kind: 'burndown',
    legacyMetric: 'raw_ptr_exclusion',
    sizeMetrics: ['raw_ptr', 'raw_ptr_exclusion'],
    unit: 'exclusions',
    mask: 2,
    start: '2022-01-01',
    description:
      'Raw C++ class pointer fields explicitly exempted from MiraclePtr BackupRefPtr protection.',
  },
  {
    id: 'miracleptr_adoption',
    name: 'MiraclePtr: raw_ptr & raw_ref',
    category: 'Memory Safety',
    kind: 'adoption',
    modernMetrics: ['raw_ptr', 'raw_ref'],
    sizeMetrics: ['file'],
    unit: 'fields',
    mask: 2,
    start: '2021-06-01',
    description:
      'Total first-party raw_ptr<T> and raw_ref<T> smart pointer fields protecting heap memory against UAF.',
  },
  {
    id: 'rust_first_party',
    name: 'First-Party Rust Adoption',
    category: 'Memory Safety',
    kind: 'adoption',
    modernMetrics: ['rust_file'],
    sizeMetrics: ['rust_file', 'file'],
    unit: 'files',
    mask: 2,
    start: '2022-06-01',
    description:
      'First-party Rust (*.rs) source files in Chromium (excluding vendored third_party/rust crates).',
  },
  {
    id: 'webui_lit',
    name: 'WebUI: Polymer → CrLitElement',
    category: 'UI & Languages',
    kind: 'paired',
    legacyMetric: 'polymer_element',
    modernMetric: 'lit_element',
    sizeMetrics: ['polymer_element', 'lit_element'],
    unit: 'elements',
    mask: 2,
    start: '2023-06-01',
    description:
      'WebUI components migrated from PolymerElement to lightweight CrLitElement.',
  },
  {
    id: 'webui_typescript',
    name: 'Production JS → TypeScript',
    category: 'UI & Languages',
    kind: 'paired',
    legacyMetric: 'javascript_file',
    modernMetric: 'typescript_file',
    sizeMetrics: ['javascript_file', 'typescript_file'],
    unit: 'files',
    mask: 3, // Exclude third_party & web_tests so production JS->TS is accurate.
    start: '2021-01-01',
    description:
      'First-party non-test JavaScript files migrated to statically-typed TypeScript.',
  },
  {
    id: 'android_kotlin',
    name: 'Android: Java → Kotlin',
    category: 'UI & Languages',
    kind: 'paired',
    legacyMetric: 'java_file',
    modernMetric: 'kotlin_file',
    sizeMetrics: ['java_file', 'kotlin_file'],
    unit: 'files',
    mask: 2,
    start: '2022-01-01',
    description:
      'First-party Android Java files vs Kotlin files in Chromium.',
  },
  {
    id: 'browser_modularization',
    name: 'Browser Modularization',
    category: 'Architecture & APIs',
    kind: 'burndown',
    legacyMetric: 'browser_modularization',
    sizeMetrics: ['file'],
    unit: 'usages',
    mask: 2,
    start: '2024-01-01',
    description:
      'Monolithic BrowserWithTestWindowTest / TestBrowserWindow couplings blocking //chrome/browser modularization.',
  },
  {
    id: 'legacy_ipc',
    name: 'Legacy IPC → Mojo',
    category: 'Architecture & APIs',
    kind: 'burndown',
    legacyMetric: 'legacy_ipc',
    modernMetric: 'mojom_file',
    sizeMetrics: ['line'],
    unit: 'messages',
    mask: 2,
    start: '2018-01-01',
    description:
      'Legacy IPC_MESSAGE_ROUTED / IPC_MESSAGE_CONTROL macros retired in favor of typed Mojo interfaces.',
  },
  {
    id: 'cxx_modernization_optional',
    name: 'absl::optional → std::optional',
    category: 'Architecture & APIs',
    kind: 'paired',
    legacyMetric: 'absl_optional',
    modernMetric: 'std_optional',
    sizeMetrics: ['absl_optional', 'std_optional'],
    unit: 'occurrences',
    mask: 2,
    start: '2023-06-01',
    description:
      'Migration from absl::optional to C++17 std::optional across first-party C++.',
  },
  {
    id: 'cxx_modernization_string_view',
    name: 'base::StringPiece → std::string_view',
    category: 'Architecture & APIs',
    kind: 'paired',
    legacyMetric: 'string_piece',
    modernMetric: 'string_view',
    sizeMetrics: ['string_piece', 'string_view'],
    unit: 'occurrences',
    mask: 2,
    start: '2023-01-01',
    description:
      'Migration from base::StringPiece to standard std::string_view.',
  },
  {
    id: 'dcheck_to_check',
    name: 'Invariant Hardening: DCHECK → CHECK',
    category: 'Code Health & Tests',
    kind: 'paired',
    legacyMetric: 'dcheck',
    modernMetric: 'check',
    sizeMetrics: ['check', 'dcheck'],
    unit: 'assertions',
    mask: 2,
    start: '2020-01-01',
    description:
      'Production-enforced CHECK() share vs debug-only DCHECK() assertions per Chrome C++ invariant guidelines.',
  },
  {
    id: 'disabled_tests',
    name: 'Disabled C++ Tests (DISABLED_)',
    category: 'Code Health & Tests',
    kind: 'burndown',
    legacyMetric: 'disabled_tests',
    modernMetric: 'tests',
    sizeMetrics: ['tests', 'disabled_tests'],
    unit: 'disabled tests',
    mask: 2,
    start: '2020-01-01',
    description:
      'Lines matching DISABLED_ in C++ test suites (out of total TEST / IN_PROC_BROWSER_TEST cases).',
  },
];

// Keep dates from 2018-01-01 onward for compact chart series (~130 points).
const chartStartIdx = datesIso.findIndex((d) => d >= '2018-01-01');
const chartDates = datesIso.slice(chartStartIdx).map((d) => d.slice(0, 10));

const initiatives = INITIATIVE_SPECS.map((spec) => {
  const excludeTp = (spec.mask & 2) !== 0;
  const excludeTest = (spec.mask & 1) !== 0;

  let debtSeries = null;
  let modernSeries = null;
  let debtBucketsCur = null;
  let debtBuckets90d = null;
  let denomBucketsCur = new Float64Array(bucketNames.length);

  for (const sm of spec.sizeMetrics) {
    const st = computeMetricStats(sm, spec.mask);
    for (let b = 0; b < bucketNames.length; b++) denomBucketsCur[b] += st.bucketCur[b];
  }

  if (spec.kind === 'adoption') {
    modernSeries = new Float64Array(datesIso.length);
    debtBucketsCur = new Float64Array(bucketNames.length);
    debtBuckets90d = new Float64Array(bucketNames.length);
    for (const m of spec.modernMetrics) {
      const st = computeMetricStats(m, spec.mask);
      for (let i = 0; i < datesIso.length; i++) modernSeries[i] += st.series[i];
      for (let b = 0; b < bucketNames.length; b++) {
        debtBucketsCur[b] += st.bucketCur[b];
        debtBuckets90d[b] += st.bucket90d[b];
      }
    }
  } else {
    const leg = computeMetricStats(spec.legacyMetric, spec.mask);
    debtSeries = leg.series;
    debtBucketsCur = leg.bucketCur;
    debtBuckets90d = leg.bucket90d;
    if (spec.modernMetric) {
      modernSeries = computeMetricStats(spec.modernMetric, spec.mask).series;
    }
  }

  const startFilterMs = spec.start ? new Date(spec.start).getTime() : 0;

  if (spec.kind === 'adoption') {
    const cur = Math.round(modernSeries[lastIdx]);
    let peak = 0;
    let peakDate = datesIso[0].slice(0, 10);
    for (let i = 0; i < datesIso.length; i++) {
      if (modernSeries[i] >= peak) {
        peak = Math.round(modernSeries[i]);
        peakDate = datesIso[i].slice(0, 10);
      }
    }
    const delta90d = Math.round(cur - modernSeries[idx90d]);
    const delta365d = Math.round(cur - modernSeries[idx365d]);
    const vel90d = round2(delta90d / actualDays90d);

    const topDirs = [];
    for (let b = 0; b < bucketNames.length; b++) {
      const c = Math.round(debtBucketsCur[b]);
      if (c <= 0) continue;
      topDirs.push({
        path: bucketNames[b],
        count: c,
        sharePct: cur > 0 ? round1((c / cur) * 100) : 0,
        delta90d: Math.round(c - debtBuckets90d[b]),
        treemapUrl: buildTreemapUrl({
          color: spec.modernMetrics,
          size: spec.sizeMetrics,
          excludeTp,
          excludeTest,
          start: spec.start,
          pathSegs: bucketSegments[b],
        }),
      });
    }
    topDirs.sort((a, b) => b.count - a.count);

    const series = [];
    for (let i = chartStartIdx; i < datesIso.length; i++) {
      series.push([
        datesIso[i].slice(0, 10),
        Math.round(modernSeries[i]),
        peak > 0 ? round1((modernSeries[i] / peak) * 100) : 0,
      ]);
    }

    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      kind: spec.kind,
      unit: spec.unit,
      description: spec.description,
      start: spec.start,
      treemapUrl: buildTreemapUrl({
        color: spec.modernMetrics,
        size: spec.sizeMetrics,
        excludeTp,
        excludeTest,
        start: spec.start,
      }),
      remainingDebt: null,
      modernCurrent: cur,
      peakDebt: peak,
      peakDate,
      completionPct: null,
      delta90d,
      delta365d,
      velocityPerDay90d: vel90d,
      etaDate: null,
      etaDays: null,
      status: 'Growing Adoption',
      blockerLabel: 'Top Adopting Subsystems',
      topBlockers: topDirs.slice(0, 6),
      series,
    };
  }

  // Paired or Burndown initiative
  const remCur = Math.round(debtSeries[lastIdx]);
  const modCur = modernSeries ? Math.round(modernSeries[lastIdx]) : null;

  // Find peak debt within relevant era (from start - 180d or all history if higher).
  let peakDebt = 0;
  let peakIdx = 0;
  for (let i = 0; i < datesIso.length; i++) {
    if (spec.id === 'spanification_todo' && datesMs[i] < startFilterMs) continue;
    if (debtSeries[i] >= peakDebt) {
      peakDebt = Math.round(debtSeries[i]);
      peakIdx = i;
    }
  }
  const peakDate = datesIso[peakIdx].slice(0, 10);

  let completionPct = 0;
  if (spec.kind === 'paired') {
    const tot = remCur + (modCur || 0);
    completionPct = tot > 0 ? round2((modCur / tot) * 100) : 0;
  } else {
    completionPct = peakDebt > 0 ? round2(((peakDebt - remCur) / peakDebt) * 100) : 100;
  }

  const delta90d = Math.round(remCur - debtSeries[idx90d]);
  const delta180d = Math.round(remCur - debtSeries[idx180d]);
  const delta365d = Math.round(remCur - debtSeries[idx365d]);
  const vel90d = delta90d / actualDays90d;
  const vel180d = delta180d / actualDays180d;

  // Projected ETA when debt is shrinking over trailing 90d (fallback 180d).
  let etaDays = null;
  let etaDate = null;
  if (remCur === 0) {
    etaDays = 0;
    etaDate = 'Done';
  } else {
    const burnPerDay = vel90d < -0.02 ? -vel90d : vel180d < -0.02 ? -vel180d : 0;
    if (burnPerDay > 0) {
      const days = Math.ceil(remCur / burnPerDay);
      if (days <= 365 * 12) {
        etaDays = days;
        etaDate = new Date(datesMs[lastIdx] + days * DAY_MS).toISOString().slice(0, 10);
      }
    }
  }

  let status = 'Active Burn-Down';
  if (remCur === 0 || completionPct >= 99.9) status = 'Completed';
  else if (completionPct >= 90) status = 'Near Complete';
  else if (completionPct < 2) status = 'Early Stage';
  else if (delta90d > 0 && delta365d >= 0) status = 'Accumulating';
  else if (delta90d >= 0) status = 'Plateaued';

  const colorForLink =
    spec.kind === 'paired' && spec.modernMetric ? [spec.modernMetric] : [spec.legacyMetric];

  const topBlockers = [];
  for (let b = 0; b < bucketNames.length; b++) {
    const c = Math.round(debtBucketsCur[b]);
    if (c <= 0) continue;
    topBlockers.push({
      path: bucketNames[b],
      count: c,
      sharePct: remCur > 0 ? round1((c / remCur) * 100) : 0,
      delta90d: Math.round(c - debtBuckets90d[b]),
      treemapUrl: buildTreemapUrl({
        color: [spec.legacyMetric],
        size: spec.sizeMetrics,
        excludeTp,
        excludeTest,
        start: spec.start,
        pathSegs: bucketSegments[b],
      }),
    });
  }
  topBlockers.sort((a, b) => b.count - a.count);

  const series = [];
  for (let i = chartStartIdx; i < datesIso.length; i++) {
    const rem = Math.round(debtSeries[i]);
    let pct = 0;
    if (spec.kind === 'paired' && modernSeries) {
      const mod = modernSeries[i];
      pct = rem + mod > 0 ? round2((mod / (rem + mod)) * 100) : 0;
    } else {
      pct = peakDebt > 0 ? round2(Math.max(0, ((peakDebt - rem) / peakDebt) * 100)) : 100;
    }
    series.push([
      datesIso[i].slice(0, 10),
      rem,
      pct,
      modernSeries ? Math.round(modernSeries[i]) : null,
    ]);
  }

  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    kind: spec.kind,
    unit: spec.unit,
    description: spec.description || yamlMeta.get(spec.legacyMetric)?.description || '',
    start: spec.start,
    treemapUrl: buildTreemapUrl({
      color: colorForLink,
      size: spec.sizeMetrics,
      excludeTp,
      excludeTest,
      start: spec.start,
    }),
    remainingDebt: remCur,
    modernCurrent: modCur,
    peakDebt,
    peakDate,
    completionPct,
    delta90d,
    delta365d,
    velocityPerDay90d: round2(vel90d),
    etaDate,
    etaDays,
    status,
    blockerLabel: 'Top 5 Remaining Blocker Directories',
    topBlockers: topBlockers.slice(0, 5),
    series,
  };
});

// -----------------------------------------------------------------------------
// 2. Load CVEs -> CWE Mitigation ROI + CVE Dwell-Time & Decomposed SLA
// -----------------------------------------------------------------------------
const rawCves = JSON.parse(fs.readFileSync(cveFile, 'utf8'));
const cves = (Array.isArray(rawCves) ? rawCves : Object.values(rawCves)).filter((c) => c?.id);
const chromeReleases = JSON.parse(fs.readFileSync(releasesFile, 'utf8'));
const releaseMilestonesSorted = Object.keys(chromeReleases)
  .map(Number)
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

function countShippedMilestonesBetween(foundMilestone, fixedMilestone) {
  if (fixedMilestone <= foundMilestone) return 0;
  let cnt = 0;
  for (const m of releaseMilestonesSorted) {
    if (m > foundMilestone && m <= fixedMilestone) cnt++;
  }
  return cnt || fixedMilestone - foundMilestone;
}

function classifyCwe(cve) {
  const id = String(cve.cweId || '').replace(/^CWE-/i, '').trim();
  const text = `${cve.problem || ''} ${(cve.description || '').slice(0, 140)}`.toLowerCase();
  if (
    id === '416' ||
    id === '415' ||
    /use[- ]after[- ]free|double free|object lifecycle/.test(text)
  ) {
    return 'uaf';
  }
  if (
    ['787', '125', '119', '120', '122', '190', '788'].includes(id) ||
    /out[- ]of[- ]bounds|buffer overflow|heap[- ]based buffer|stack buffer overflow|integer overflow|memory corruption/.test(
      text,
    )
  ) {
    return 'oob';
  }
  if (id === '843' || /type confusion/.test(text)) {
    return 'type_confusion';
  }
  return 'other';
}

function isRendererOrJit(cve) {
  const comps = (cve.components || []).map(decodeHtmlEntities).join(' ');
  const desc = String(cve.description || '').slice(0, 150);
  return (
    /\bV8\b|Blink>/i.test(comps) ||
    /\bin V8\b|\bin Blink\b|\bin WebKit\b|\bin Turbolev\b|\bin Maglev\b|\bin Turboshaft\b/i.test(
      desc,
    )
  );
}

// Helper for end-of-period treemap mitigation values
const rawPtrStats = computeMetricStats('raw_ptr', 2);
const rawRefStats = computeMetricStats('raw_ref', 2);
const baseSpanStats = computeMetricStats('base_span', 2);
const ubuLinesStats = computeMetricStats('lines_unsafe_buffer_usage', 2);
const unsafeTodoStats = computeMetricStats('unsafe_todo', 2);
const rustFpStats = computeMetricStats('rust_file', 2);
const danglingStats = computeMetricStats('dangling_untriaged', 2);

function mitigationSnapshotAt(isoDateEnd) {
  const targetMs = new Date(isoDateEnd).getTime();
  let idx = 0;
  for (let i = 0; i < datesMs.length; i++) {
    if (datesMs[i] <= targetMs) idx = i;
  }
  return {
    rawPtrTotal: Math.round(rawPtrStats.series[idx] + rawRefStats.series[idx]),
    baseSpan: Math.round(baseSpanStats.series[idx]),
    unsafeBufferLines: Math.round(ubuLinesStats.series[idx]),
    unsafeTodo: Math.round(unsafeTodoStats.series[idx]),
    rustFilesFirstParty: Math.round(rustFpStats.series[idx]),
    danglingUntriaged: Math.round(danglingStats.series[idx]),
  };
}

function emptyRoiBucket() {
  return {
    total: 0,
    uaf: 0,
    uafBrowser: 0,
    uafRenderer: 0,
    oob: 0,
    typeConfusion: 0,
    other: 0,
    vrpUsd: 0,
    uafUsd: 0,
    uafBrowserUsd: 0,
    oobUsd: 0,
    typeConfusionUsd: 0,
    otherUsd: 0,
  };
}

const roiYearlyMap = new Map();
const roiQuarterlyMap = new Map();
for (let y = 2018; y <= 2026; y++) {
  roiYearlyMap.set(String(y), {
    year: String(y),
    vrp: emptyRoiBucket(),
    all: emptyRoiBucket(),
    mitigations: mitigationSnapshotAt(y === 2026 ? `${latestDate}T23:59:59Z` : `${y}-12-31T23:59:59Z`),
  });
}

function addCveToRoiBucket(bucket, cls, renderer, reward) {
  bucket.total++;
  bucket.vrpUsd += reward;
  if (cls === 'uaf') {
    bucket.uaf++;
    bucket.uafUsd += reward;
    if (renderer) {
      bucket.uafRenderer++;
    } else {
      bucket.uafBrowser++;
      bucket.uafBrowserUsd += reward;
    }
  } else if (cls === 'oob') {
    bucket.oob++;
    bucket.oobUsd += reward;
  } else if (cls === 'type_confusion') {
    bucket.typeConfusion++;
    bucket.typeConfusionUsd += reward;
  } else {
    bucket.other++;
    bucket.otherUsd += reward;
  }
}

// Lifespan & SLA accumulators
const allDwellMilestones = [];
const allDwellDays = [];
const allEngFixDays = [];
const allBranchMergeDays = [];
const allReleaseRolloutDays = [];
const allCommitToBetaDays = [];
const allCommitToStableDays = [];
const allCommitToExtendedDays = [];
const allBugToStableDays = [];

const DWELL_BUCKETS = [
  { key: '0', label: '0 milestones (Same release)', min: 0, max: 0 },
  { key: '1-2', label: '1–2 milestones (~1–2 mos)', min: 1, max: 2 },
  { key: '3-6', label: '3–6 milestones (~3–6 mos)', min: 3, max: 6 },
  { key: '7-12', label: '7–12 milestones (~6–12 mos)', min: 7, max: 12 },
  { key: '13-24', label: '13–24 milestones (1–2 yrs)', min: 13, max: 24 },
  { key: '25-48', label: '25–48 milestones (2–4 yrs)', min: 25, max: 48 },
  { key: '49+', label: '49+ milestones (4+ yrs)', min: 49, max: Infinity },
];

const dwellHistogram = DWELL_BUCKETS.map((b) => ({
  key: b.key,
  label: b.label,
  total: 0,
  vrpUsd: 0,
  bySeverity: { Critical: 0, High: 0, Medium: 0, Low: 0, Other: 0 },
}));

function makeStatsAcc() {
  return {
    count: 0,
    vrpCount: 0,
    vrpUsd: 0,
    dwellM: [],
    dwellD: [],
    sameMilestone: 0,
    ancient2Yr: 0,
    engFixD: [],
    branchMergeD: [],
    releaseRolloutD: [],
    commitToBetaD: [],
    commitToStableD: [],
    commitToExtendedD: [],
    bugToStableD: [],
    deadlineExceeded: 0,
    securityCodeYellow: 0,
    ltsMerged: 0,
    ltsDelayedOrRejected: 0,
    v8Postmortem: 0,
    fixReverts: 0,
  };
}

const lifespanByYear = new Map();
for (let y = 2016; y <= 2026; y++) {
  lifespanByYear.set(String(y), makeStatsAcc());
}
const lifespanByYearVrp = new Map();
for (let y = 2016; y <= 2026; y++) {
  lifespanByYearVrp.set(String(y), makeStatsAcc());
}

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const lifespanBySeverity = new Map(SEVERITIES.map((s) => [s, makeStatsAcc()]));
const lifespanByComponent = new Map();

const SLA_TAG_DEFS = [
  {
    id: 'Deadline-Exceeded',
    label: 'Deadline-Exceeded',
    description: 'Security fix or merge exceeded Chrome severity SLO deadline.',
    match: (labels) => labels.some((l) => l === 'Deadline-Exceeded'),
  },
  {
    id: 'Fix-Reverted',
    label: 'Security Fix Reverted',
    description: 'At least one landed security fix CL had to be reverted before relanding.',
    match: (_labels, hasRevert) => hasRevert,
  },
  {
    id: 'LTS-Merge-Merged',
    label: 'LTS-Merge-Merged-*',
    description: 'Vulnerability backported to ChromeOS / Enterprise Long-Term Support channel.',
    match: (labels) => labels.some((l) => /^LTS-(Merge-)?Merged/i.test(l)),
  },
  {
    id: 'Via-Wizard-Security',
    label: 'Via-Wizard-Security',
    description: 'External researcher submission triaged through the structured Security Wizard.',
    match: (labels) => labels.some((l) => l === 'Via-Wizard-Security'),
  },
  {
    id: 'v8-postmortem',
    label: 'v8-postmortem',
    description: 'Flagged for V8 security postmortem & systemic fuzzer/invariant follow-up.',
    match: (labels) => labels.some((l) => /^v8-postmortem$/i.test(l)),
  },
  {
    id: 'Nag',
    label: 'SLA Nag Escalation',
    description: 'Automated sheriffbot SLA nag triggered on approaching/overdue security bug.',
    match: (labels) => labels.some((l) => l === 'Nag'),
  },
  {
    id: 'LTS-Merge-Friction',
    label: 'LTS-Merge Delayed / Rejected / Failed',
    description: 'Backport to LTS hit merge conflict, stability rejection, or delay.',
    match: (labels) =>
      labels.some((l) => /^LTS-(Merge-(Rejected|Delayed)|Security-Failed)/i.test(l)),
  },
  {
    id: 'Security-CodeYellow',
    label: 'Security-CodeYellow',
    description: 'Subsystem placed under executive Security Code Yellow remediation.',
    match: (labels) => labels.some((l) => l === 'Security-CodeYellow'),
  },
  {
    id: 'Audit-IPC',
    label: 'Audit-IPC',
    description: 'Discovered or audited during targeted privileged Mojo IPC security review.',
    match: (labels) => labels.some((l) => l === 'Audit-IPC'),
  },
];

const slaTagStats = new Map(
  SLA_TAG_DEFS.map((d) => [
    d.id,
    {
      id: d.id,
      label: d.label,
      description: d.description,
      count: 0,
      vrpUsd: 0,
      fixDays: [],
      dwellMilestones: [],
      examples: [],
    },
  ]),
);

const longestLivedCandidates = [];

function normalizeSeverity(sev) {
  const s = String(sev || '').trim();
  if (SEVERITIES.includes(s)) return s;
  return 'Other';
}

function recordIntoAcc(
  acc,
  {
    reward,
    dwellM,
    dwellD,
    engFixD,
    branchMergeD,
    releaseRolloutD,
    commitToBetaD,
    commitToStableD,
    commitToExtendedD,
    bugToStableD,
    hasDeadlineExceeded,
    hasCodeYellow,
    hasLtsMerged,
    hasLtsFriction,
    hasV8Postmortem,
    hasRevert,
  },
) {
  acc.count++;
  if (reward > 0) acc.vrpCount++;
  acc.vrpUsd += reward;
  if (dwellM !== null) {
    acc.dwellM.push(dwellM);
    if (dwellM === 0) acc.sameMilestone++;
    if (dwellM >= 25) acc.ancient2Yr++;
  }
  if (dwellD !== null) acc.dwellD.push(dwellD);
  if (engFixD !== null) acc.engFixD.push(engFixD);
  if (branchMergeD !== null) acc.branchMergeD.push(branchMergeD);
  if (releaseRolloutD !== null) acc.releaseRolloutD.push(releaseRolloutD);
  if (commitToBetaD !== null) acc.commitToBetaD.push(commitToBetaD);
  if (commitToStableD !== null) acc.commitToStableD.push(commitToStableD);
  if (commitToExtendedD !== null) acc.commitToExtendedD.push(commitToExtendedD);
  if (bugToStableD !== null) acc.bugToStableD.push(bugToStableD);
  if (hasDeadlineExceeded) acc.deadlineExceeded++;
  if (hasCodeYellow) acc.securityCodeYellow++;
  if (hasLtsMerged) acc.ltsMerged++;
  if (hasLtsFriction) acc.ltsDelayedOrRejected++;
  if (hasV8Postmortem) acc.v8Postmortem++;
  if (hasRevert) acc.fixReverts++;
}

for (const cve of cves) {
  const pubDate = cve.published ? new Date(cve.published) : null;
  const pubYear =
    pubDate && !Number.isNaN(pubDate.getTime())
      ? String(pubDate.getUTCFullYear())
      : String(cve.id).split('-')[0];
  const pubQuarter =
    pubDate && !Number.isNaN(pubDate.getTime())
      ? `${pubDate.getUTCFullYear()}Q${Math.floor(pubDate.getUTCMonth() / 3) + 1}`
      : null;

  const reward = Number(cve.vrp_reward) > 0 ? Number(cve.vrp_reward) : 0;
  const sev = normalizeSeverity(cve.severity);
  const cweClass = classifyCwe(cve);
  const renderer = isRendererOrJit(cve);
  const decodedComponents = (cve.components || []).map(decodeHtmlEntities).filter(Boolean);
  const labels = Array.isArray(cve.chromium_labels) ? cve.chromium_labels : [];

  // ROI aggregation (2018..2026)
  if (roiYearlyMap.has(pubYear)) {
    const row = roiYearlyMap.get(pubYear);
    addCveToRoiBucket(row.all, cweClass, renderer, reward);
    if (reward > 0) {
      addCveToRoiBucket(row.vrp, cweClass, renderer, reward);
    }
  }
  if (pubQuarter && pubYear >= '2020' && pubYear <= '2026') {
    if (!roiQuarterlyMap.has(pubQuarter)) {
      const [yStr, qStr] = pubQuarter.split('Q');
      const endMonth = Number(qStr) * 3;
      const quarterEndIso =
        pubQuarter === '2026Q4'
          ? `${latestDate}T23:59:59Z`
          : new Date(Date.UTC(Number(yStr), endMonth, 0, 23, 59, 59)).toISOString();
      roiQuarterlyMap.set(pubQuarter, {
        quarter: pubQuarter,
        vrp: emptyRoiBucket(),
        all: emptyRoiBucket(),
        mitigations: mitigationSnapshotAt(quarterEndIso),
      });
    }
    const qRow = roiQuarterlyMap.get(pubQuarter);
    addCveToRoiBucket(qRow.all, cweClass, renderer, reward);
    if (reward > 0) addCveToRoiBucket(qRow.vrp, cweClass, renderer, reward);
  }

  // Dwell-Time calculation: found_in -> version_fixed
  let dwellM = null;
  let dwellD = null;
  const fiNum = cve.found_in ? parseInt(String(cve.found_in).replace(/^M/i, ''), 10) : NaN;
  const vfNum = cve.version_fixed ? parseInt(String(cve.version_fixed).split('.')[0], 10) : NaN;
  if (Number.isFinite(fiNum) && Number.isFinite(vfNum) && fiNum > 0 && vfNum >= fiNum) {
    dwellM = countShippedMilestonesBetween(fiNum, vfNum);
    allDwellMilestones.push(dwellM);

    const foundReleaseStr = chromeReleases[String(fiNum)];
    const fixedDateMs = cve.version_dates?.stable
      ? Date.parse(cve.version_dates.stable)
      : chromeReleases[String(vfNum)]
        ? Date.parse(chromeReleases[String(vfNum)])
        : NaN;
    const foundDateMs = foundReleaseStr ? Date.parse(foundReleaseStr) : NaN;
    if (Number.isFinite(foundDateMs) && Number.isFinite(fixedDateMs)) {
      dwellD = Math.max(0, Math.round((fixedDateMs - foundDateMs) / DAY_MS));
      allDwellDays.push(dwellD);
    }

    const histBucket = DWELL_BUCKETS.findIndex((b) => dwellM >= b.min && dwellM <= b.max);
    if (histBucket >= 0) {
      dwellHistogram[histBucket].total++;
      dwellHistogram[histBucket].vrpUsd += reward;
      dwellHistogram[histBucket].bySeverity[sev] =
        (dwellHistogram[histBucket].bySeverity[sev] || 0) + 1;
    }

    if ((sev === 'Critical' || sev === 'High') && dwellM >= 24) {
      longestLivedCandidates.push({
        id: cve.id,
        title: cve.title || (cve.description || '').slice(0, 120),
        severity: sev,
        foundIn: `M${fiNum}`,
        versionFixed: cve.version_fixed,
        milestones: dwellM,
        dwellDays: dwellD,
        vrpReward: reward,
        component: decodedComponents[0] || 'Unknown',
        year: pubYear,
      });
    }
  }

  // Decomposed Fix Pipeline: bug_date -> fix commit -> beta -> stable -> extended
  const commitList = cve.commits
    ? Object.values(cve.commits).filter((cm) => cm && cm.type === 'commit')
    : [];
  const hasRevert = commitList.some((cm) => /^Revert\b/i.test(cm.title || ''));
  const nonRevertDates = commitList
    .filter((cm) => !/^Revert\b/i.test(cm.title || ''))
    .map((cm) => Date.parse(cm.date))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const allCommitDates = commitList
    .map((cm) => Date.parse(cm.date))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const effectiveCommitDates = nonRevertDates.length ? nonRevertDates : allCommitDates;

  const bugMs = cve.bug_date ? Date.parse(cve.bug_date) : NaN;
  const betaMs = cve.version_dates?.beta ? Date.parse(cve.version_dates.beta) : NaN;
  const stableMs = cve.version_dates?.stable ? Date.parse(cve.version_dates.stable) : NaN;
  const extendedMs = cve.version_dates?.extended ? Date.parse(cve.version_dates.extended) : NaN;

  // Exclude culprit-introducing commits that predate bug filing by >2 days.
  const postBugCommits = Number.isFinite(bugMs)
    ? effectiveCommitDates.filter((t) => t >= bugMs - 2 * DAY_MS)
    : effectiveCommitDates;
  const firstFixCommitMs = postBugCommits.length ? postBugCommits[0] : NaN;
  const preStableCommits = Number.isFinite(stableMs)
    ? postBugCommits.filter((t) => t <= stableMs + DAY_MS)
    : postBugCommits;
  const finalFixCommitMs = preStableCommits.length
    ? preStableCommits[preStableCommits.length - 1]
    : firstFixCommitMs;

  let engFixD = null;
  let branchMergeD = null;
  let releaseRolloutD = null;
  let commitToBetaD = null;
  let commitToStableD = null;
  let commitToExtendedD = null;
  let bugToStableD = null;

  if (Number.isFinite(bugMs) && Number.isFinite(firstFixCommitMs)) {
    const d = (firstFixCommitMs - bugMs) / DAY_MS;
    if (d >= -2 && d <= 3650) {
      engFixD = Math.max(0, d);
      allEngFixDays.push(engFixD);
    }
  }
  if (Number.isFinite(firstFixCommitMs) && Number.isFinite(finalFixCommitMs)) {
    const d = (finalFixCommitMs - firstFixCommitMs) / DAY_MS;
    if (d >= 0 && d <= 365) {
      branchMergeD = d;
      allBranchMergeDays.push(branchMergeD);
    }
  }
  if (Number.isFinite(finalFixCommitMs) && Number.isFinite(stableMs)) {
    const d = (stableMs - finalFixCommitMs) / DAY_MS;
    if (d >= -1 && d <= 730) {
      releaseRolloutD = Math.max(0, d);
      allReleaseRolloutDays.push(releaseRolloutD);
    }
  }
  if (Number.isFinite(firstFixCommitMs) && Number.isFinite(betaMs)) {
    const d = (betaMs - firstFixCommitMs) / DAY_MS;
    if (d >= -1 && d <= 365) {
      commitToBetaD = Math.max(0, d);
      allCommitToBetaDays.push(commitToBetaD);
    }
  }
  if (Number.isFinite(firstFixCommitMs) && Number.isFinite(stableMs)) {
    const d = (stableMs - firstFixCommitMs) / DAY_MS;
    if (d >= -1 && d <= 730) {
      commitToStableD = Math.max(0, d);
      allCommitToStableDays.push(commitToStableD);
    }
  }
  if (Number.isFinite(firstFixCommitMs) && Number.isFinite(extendedMs)) {
    const d = (extendedMs - firstFixCommitMs) / DAY_MS;
    if (d >= -1 && d <= 730) {
      commitToExtendedD = Math.max(0, d);
      allCommitToExtendedDays.push(commitToExtendedD);
    }
  }
  if (Number.isFinite(bugMs) && Number.isFinite(stableMs)) {
    const d = (stableMs - bugMs) / DAY_MS;
    if (d >= 0 && d <= 3650) {
      bugToStableD = d;
      allBugToStableDays.push(bugToStableD);
    }
  }

  const hasDeadlineExceeded = labels.includes('Deadline-Exceeded');
  const hasCodeYellow = labels.includes('Security-CodeYellow');
  const hasLtsMerged = labels.some((l) => /^LTS-(Merge-)?Merged/i.test(l));
  const hasLtsFriction = labels.some((l) =>
    /^LTS-(Merge-(Rejected|Delayed)|Security-Failed)/i.test(l),
  );
  const hasV8Postmortem = labels.some((l) => /^v8-postmortem$/i.test(l));

  const payload = {
    reward,
    dwellM,
    dwellD,
    engFixD,
    branchMergeD,
    releaseRolloutD,
    commitToBetaD,
    commitToStableD,
    commitToExtendedD,
    bugToStableD,
    hasDeadlineExceeded,
    hasCodeYellow,
    hasLtsMerged,
    hasLtsFriction,
    hasV8Postmortem,
    hasRevert,
  };

  if (lifespanByYear.has(pubYear)) {
    recordIntoAcc(lifespanByYear.get(pubYear), payload);
    if (reward > 0) recordIntoAcc(lifespanByYearVrp.get(pubYear), payload);
  }
  if (lifespanBySeverity.has(sev)) {
    recordIntoAcc(lifespanBySeverity.get(sev), payload);
  }

  // Roll up depth-2 Buganizer/Monorail components (e.g. Blink>JavaScript, Internals>GPU).
  const compSet = new Set();
  for (const comp of decodedComponents) {
    const parts = comp.split('>').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const key = parts.slice(0, Math.min(2, parts.length)).join('>');
    compSet.add(key);
  }
  for (const compKey of compSet) {
    if (!lifespanByComponent.has(compKey)) {
      lifespanByComponent.set(compKey, makeStatsAcc());
    }
    recordIntoAcc(lifespanByComponent.get(compKey), payload);
  }

  // SLA & Security Labels
  for (const def of SLA_TAG_DEFS) {
    if (def.match(labels, hasRevert)) {
      const st = slaTagStats.get(def.id);
      st.count++;
      st.vrpUsd += reward;
      if (bugToStableD !== null) st.fixDays.push(bugToStableD);
      if (dwellM !== null) st.dwellMilestones.push(dwellM);
      if (st.examples.length < 5 && (sev === 'Critical' || sev === 'High' || reward > 0)) {
        st.examples.push(cve.id);
      }
    }
  }
}

function mean(arr) {
  if (!arr.length) return null;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function finalizeAcc(keyField, keyValue, acc) {
  const dm = [...acc.dwellM].sort((a, b) => a - b);
  const dd = [...acc.dwellD].sort((a, b) => a - b);
  const ef = [...acc.engFixD].sort((a, b) => a - b);
  const bm = [...acc.branchMergeD].sort((a, b) => a - b);
  const rr = [...acc.releaseRolloutD].sort((a, b) => a - b);
  const cb = [...acc.commitToBetaD].sort((a, b) => a - b);
  const cs = [...acc.commitToStableD].sort((a, b) => a - b);
  const ce = [...acc.commitToExtendedD].sort((a, b) => a - b);
  const ts = [...acc.bugToStableD].sort((a, b) => a - b);

  return {
    [keyField]: keyValue,
    count: acc.count,
    vrpCount: acc.vrpCount,
    vrpUsd: acc.vrpUsd,
    withDwellCount: dm.length,
    medianMilestones: round1(quantile(dm, 0.5)),
    p90Milestones: round1(quantile(dm, 0.9)),
    medianDwellDays: round1(quantile(dd, 0.5)),
    p90DwellDays: round1(quantile(dd, 0.9)),
    sameMilestonePct: dm.length ? round1((acc.sameMilestone / dm.length) * 100) : null,
    ancient2YrPct: dm.length ? round1((acc.ancient2Yr / dm.length) * 100) : null,
    withPipelineCount: ef.length,
    medianEngFixDays: round1(quantile(ef, 0.5)),
    p90EngFixDays: round1(quantile(ef, 0.9)),
    meanEngFixDays: round1(mean(ef)),
    medianBranchMergeDays: round1(quantile(bm, 0.5)),
    meanBranchMergeDays: round1(mean(bm)),
    medianReleaseRolloutDays: round1(quantile(rr, 0.5)),
    meanReleaseRolloutDays: round1(mean(rr)),
    medianCommitToBetaDays: round1(quantile(cb, 0.5)),
    medianCommitToStableDays: round1(quantile(cs, 0.5)),
    p90CommitToStableDays: round1(quantile(cs, 0.9)),
    medianCommitToExtendedDays: round1(quantile(ce, 0.5)),
    medianTotalBugToStableDays: round1(quantile(ts, 0.5)),
    p90TotalBugToStableDays: round1(quantile(ts, 0.9)),
    deadlineExceeded: acc.deadlineExceeded,
    deadlineExceededPct: acc.count ? round1((acc.deadlineExceeded / acc.count) * 100) : 0,
    securityCodeYellow: acc.securityCodeYellow,
    ltsMerged: acc.ltsMerged,
    ltsDelayedOrRejected: acc.ltsDelayedOrRejected,
    v8Postmortem: acc.v8Postmortem,
    fixReverts: acc.fixReverts,
    fixRevertPct: acc.count ? round1((acc.fixReverts / acc.count) * 100) : 0,
  };
}

allDwellMilestones.sort((a, b) => a - b);
allDwellDays.sort((a, b) => a - b);
allEngFixDays.sort((a, b) => a - b);
allBranchMergeDays.sort((a, b) => a - b);
allReleaseRolloutDays.sort((a, b) => a - b);
allCommitToBetaDays.sort((a, b) => a - b);
allCommitToStableDays.sort((a, b) => a - b);
allCommitToExtendedDays.sort((a, b) => a - b);
allBugToStableDays.sort((a, b) => a - b);

longestLivedCandidates.sort((a, b) => b.milestones - a.milestones || b.vrpReward - a.vrpReward);

const yearlyAll = [...lifespanByYear.entries()].map(([y, acc]) => finalizeAcc('year', y, acc));
const yearlyVrp = [...lifespanByYearVrp.entries()].map(([y, acc]) => finalizeAcc('year', y, acc));
const bySeverity = SEVERITIES.map((s) => finalizeAcc('severity', s, lifespanBySeverity.get(s)));

const byComponent = [...lifespanByComponent.entries()]
  .map(([comp, acc]) => finalizeAcc('component', comp, acc))
  .filter((row) => row.count >= 15)
  .sort((a, b) => b.count - a.count)
  .slice(0, 35);

const slaLabels = [...slaTagStats.values()]
  .map((st) => {
    const fd = [...st.fixDays].sort((a, b) => a - b);
    const dm = [...st.dwellMilestones].sort((a, b) => a - b);
    return {
      id: st.id,
      label: st.label,
      description: st.description,
      count: st.count,
      shareOfTotalPct: round2((st.count / cves.length) * 100),
      vrpUsd: st.vrpUsd,
      medianBugToStableDays: round1(quantile(fd, 0.5)),
      p90BugToStableDays: round1(quantile(fd, 0.9)),
      medianDwellMilestones: round1(quantile(dm, 0.5)),
      examples: st.examples,
    };
  })
  .sort((a, b) => b.count - a.count);

const initiativesJson = {
  generatedAt: new Date().toISOString(),
  latestDate,
  windowDays: {
    d90: Math.round(actualDays90d),
    d365: Math.round(actualDays365d),
  },
  dates: chartDates,
  initiatives,
  mitigationRoi: {
    note:
      'In 2026 Chrome expanded CNA CVE assignment to internally discovered/fuzzed bugs ($0 VRP). Toggle External (VRP-rewarded) vs All CVEs for apples-to-apples multi-year trends.',
    yearly: [...roiYearlyMap.values()],
    quarterly: [...roiQuarterlyMap.values()].sort((a, b) => a.quarter.localeCompare(b.quarter)),
  },
};

const lifespanJson = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalCves: cves.length,
    withDwellCount: allDwellMilestones.length,
    medianDwellMilestones: round1(quantile(allDwellMilestones, 0.5)),
    p90DwellMilestones: round1(quantile(allDwellMilestones, 0.9)),
    medianDwellDays: round1(quantile(allDwellDays, 0.5)),
    p90DwellDays: round1(quantile(allDwellDays, 0.9)),
    sameMilestonePct: round1(
      (allDwellMilestones.filter((m) => m === 0).length / allDwellMilestones.length) * 100,
    ),
    over1YrDwellPct: round1(
      (allDwellMilestones.filter((m) => m >= 13).length / allDwellMilestones.length) * 100,
    ),
    withPipelineCount: allEngFixDays.length,
    medianEngFixDays: round1(quantile(allEngFixDays, 0.5)),
    p90EngFixDays: round1(quantile(allEngFixDays, 0.9)),
    meanEngFixDays: round1(mean(allEngFixDays)),
    medianBranchMergeDays: round1(quantile(allBranchMergeDays, 0.5)),
    meanBranchMergeDays: round1(mean(allBranchMergeDays)),
    medianReleaseRolloutDays: round1(quantile(allReleaseRolloutDays, 0.5)),
    meanReleaseRolloutDays: round1(mean(allReleaseRolloutDays)),
    medianCommitToBetaDays: round1(quantile(allCommitToBetaDays, 0.5)),
    medianCommitToStableDays: round1(quantile(allCommitToStableDays, 0.5)),
    p90CommitToStableDays: round1(quantile(allCommitToStableDays, 0.9)),
    medianCommitToExtendedDays: round1(quantile(allCommitToExtendedDays, 0.5)),
    medianBugToStableDays: round1(quantile(allBugToStableDays, 0.5)),
    p90BugToStableDays: round1(quantile(allBugToStableDays, 0.9)),
    deadlineExceededCount: slaTagStats.get('Deadline-Exceeded').count,
    securityCodeYellowCount: slaTagStats.get('Security-CodeYellow').count,
    ltsMergedCount: slaTagStats.get('LTS-Merge-Merged').count,
    fixRevertsCount: slaTagStats.get('Fix-Reverted').count,
  },
  dwellHistogram,
  yearlyAll,
  yearlyVrp,
  bySeverity,
  byComponent,
  slaLabels,
  longestLivedCves: longestLivedCandidates.slice(0, 15),
};

const outInitiativesPath = path.join(publicDir, 'data', 'initiatives.json');
const outLifespanPath = path.join(publicDir, 'cve', 'lifespan.json');
fs.mkdirSync(path.dirname(outInitiativesPath), { recursive: true });
fs.mkdirSync(path.dirname(outLifespanPath), { recursive: true });
fs.writeFileSync(outInitiativesPath, JSON.stringify(initiativesJson));
fs.writeFileSync(outLifespanPath, JSON.stringify(lifespanJson));

// Console summary table for verification
console.log(`\n=== Strategic Initiatives (${latestDate}) ===`);
console.table(
  initiatives.map((it) => ({
    Initiative: it.name,
    Current:
      it.kind === 'adoption'
        ? `${it.modernCurrent.toLocaleString()} ${it.unit}`
        : `${it.remainingDebt.toLocaleString()} rem${it.modernCurrent != null ? ` / ${it.modernCurrent.toLocaleString()} mod` : ''}`,
    Peak: it.peakDebt.toLocaleString(),
    'Done %': it.completionPct != null ? `${it.completionPct}%` : '—',
    '90d Δ': it.delta90d > 0 ? `+${it.delta90d.toLocaleString()}` : it.delta90d.toLocaleString(),
    ETA: it.etaDate || '—',
    'Top Blocker': it.topBlockers[0]
      ? `${it.topBlockers[0].path} (${it.topBlockers[0].count.toLocaleString()})`
      : '—',
  })),
);

console.log('\n=== CVE Dwell-Time & Decomposed Security SLA Summary ===');
console.log(JSON.stringify(lifespanJson.summary, null, 2));
console.log(
  `Wrote ${outInitiativesPath} (${(fs.statSync(outInitiativesPath).size / 1024).toFixed(1)} KB) and ` +
    `${outLifespanPath} (${(fs.statSync(outLifespanPath).size / 1024).toFixed(1)} KB)`,
);
