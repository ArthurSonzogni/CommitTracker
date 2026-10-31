// Derives the 5 Chrome Security Hardening pillars across Chromium, ANGLE,
// PDFium, Dawn, Skia, and WebRTC from compact treemap histories and CVE data:
//   1. Spanification (-Wunsafe-buffer-usage coverage across 6 repos + UNSAFE_TODO fixes)
//   2. MiraclePtr (UAF share over time, raw_ptr/raw_ref across 6 repos, RAW_PTR_EXCLUSION)
//   3. Dangling Pointers (DanglingUntriaged burn-down over time)
//   4. Rust Adoption (first-party *.rs files across repos)
//   5. Invariant Hardening (DCHECK vs CHECK)
//
// Usage: node scripts/derive-security.mjs [publicDir=public]
// Writes: <publicDir>/data/security.json

import fs from 'fs';
import path from 'path';

const publicDir = process.argv[2] || 'public';
const cveFile = path.join(publicDir, 'cve', 'data.json');

const DAY_MS = 24 * 60 * 60 * 1000;

const TARGET_REPOS = [
  { id: 'chromium', label: 'Chrome', fullName: 'Chromium', color: 'var(--series-1)', skipTools: true },
  { id: 'angle', label: 'ANGLE', fullName: 'ANGLE', color: 'var(--series-7)', skipTools: true },
  { id: 'pdfium', label: 'PDFium', fullName: 'PDFium', color: 'var(--series-2)', skipTools: false },
  { id: 'dawn', label: 'Dawn', fullName: 'Dawn', color: 'var(--series-3)', skipTools: true },
  { id: 'skia', label: 'Skia', fullName: 'Skia', color: 'var(--series-8)', skipTools: false },
  { id: 'webrtc', label: 'WebRTC', fullName: 'WebRTC', color: 'var(--series-5)', skipTools: false },
];

// Node exclusion bitflags:
// - FLAG_TOOLS (1): top-level tools/ directory, skipped by warn_unsafe_buffer_usage_lines.py
//   and ':!tools/*' grep rules in treemap/*.yaml.
// - FLAG_THIRD_PARTY (2): vendored third_party/ subtrees (keeping third_party/blink & WebKit).
const FLAG_TOOLS = 1;
const FLAG_THIRD_PARTY = 2;
const MASK_FIRST_PARTY_CPP = FLAG_TOOLS | FLAG_THIRD_PARTY;
const MASK_ALL_CPP = FLAG_TOOLS;
const MASK_FIRST_PARTY_FILES = FLAG_THIRD_PARTY;

function round1(val) {
  return val == null || !Number.isFinite(val) ? null : Math.round(val * 10) / 10;
}

function round2(val) {
  return val == null || !Number.isFinite(val) ? null : Math.round(val * 100) / 100;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function isBlinkDir(name) {
  const lower = name.toLowerCase();
  return lower === 'blink' || lower === 'webkit';
}

function buildTreemapUrl({
  repo,
  color,
  size,
  excludeTp = true,
  start,
  latestDate,
  pathSegs,
  historySize = true,
}) {
  const params = new URLSearchParams();
  params.set('field_color', color.join(','));
  params.set('field_size', size.join(','));
  params.set('repositories', repo);
  if (pathSegs && pathSegs.length && pathSegs[0] !== '(root)') {
    params.set('path', pathSegs.join(','));
  }
  if (start && latestDate) {
    params.set('dates', `${start},${latestDate}`);
  }
  if (excludeTp) params.set('exclude_third_party', '1');
  if (historySize) params.set('history_size', '1');
  return `/treemap?${params.toString()}`;
}

function loadRepoContext(spec) {
  const repoDir = path.join(publicDir, 'treemap', spec.id);
  const datesPath = path.join(repoDir, 'dates.json');
  const treePath = path.join(repoDir, 'file_index.compact.json');
  if (!fs.existsSync(datesPath) || !fs.existsSync(treePath)) {
    return null;
  }

  const datesIso = JSON.parse(fs.readFileSync(datesPath, 'utf8'));
  const datesMs = datesIso.map((d) => new Date(d).getTime());
  const lastIdx = datesIso.length - 1;
  const latestDate = datesIso[lastIdx].slice(0, 10);

  // Deduplicate same-day snapshots by keeping the latest index per YYYY-MM-DD.
  const dedupIndices = [];
  for (let i = 0; i < datesIso.length; i++) {
    const day = datesIso[i].slice(0, 10);
    if (dedupIndices.length && datesIso[dedupIndices[dedupIndices.length - 1]].slice(0, 10) === day) {
      dedupIndices[dedupIndices.length - 1] = i;
    } else {
      dedupIndices.push(i);
    }
  }

  const findClosestIdx = (targetMs) => {
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
  };

  const idx90d = findClosestIdx(datesMs[lastIdx] - 90 * DAY_MS);
  const idx180d = findClosestIdx(datesMs[lastIdx] - 180 * DAY_MS);
  const idx365d = findClosestIdx(datesMs[lastIdx] - 365 * DAY_MS);
  const actualDays90d = Math.max(1, (datesMs[lastIdx] - datesMs[idx90d]) / DAY_MS);
  const actualDays180d = Math.max(1, (datesMs[lastIdx] - datesMs[idx180d]) / DAY_MS);
  const actualDays365d = Math.max(1, (datesMs[lastIdx] - datesMs[idx365d]) / DAY_MS);

  const compactTree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  let numNodes = 0;
  const countWalk = (node) => {
    numNodes++;
    if (typeof node !== 'string') {
      for (let i = 1; i < node.length; i++) countWalk(node[i]);
    }
  };
  countWalk(compactTree);

  const excludeFlags = new Uint8Array(numNodes);
  const bucketNames = [];
  const bucketSegments = [];
  const bucketMap = new Map();
  const nodeBucket = new Int32Array(numNodes).fill(-1);

  const getBucketId = (segments) => {
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
  };

  let walkId = 0;
  const indexTree = (node, depth, tpParent, inhFlags, dirSegments) => {
    const id = walkId++;
    const isFile = typeof node === 'string';
    const name = isFile ? node : node[0];
    let flags = inhFlags;
    if (id > 0 && name) {
      if (spec.skipTools && depth === 1 && name === 'tools') flags |= FLAG_TOOLS;
      if (tpParent && !isBlinkDir(name)) flags |= FLAG_THIRD_PARTY;
      if (depth === 2 && dirSegments[0] === 'bazel' && name === 'external') {
        flags |= FLAG_THIRD_PARTY;
      }
    }
    excludeFlags[id] = flags;

    const curDirs = !isFile && id > 0 ? [...dirSegments, name] : dirSegments;
    let bSegs = curDirs;
    if (curDirs.length >= 3 && curDirs[0] === 'third_party' && isBlinkDir(curDirs[1])) {
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
      const nextTp = id > 0 && name.toLowerCase() === 'third_party';
      for (let i = 1; i < node.length; i++) {
        indexTree(node[i], depth + 1, nextTp, flags, curDirs);
      }
    }
  };
  indexTree(compactTree, 0, false, 0, []);

  return {
    ...spec,
    repoDir,
    datesIso,
    datesMs,
    dedupIndices,
    lastIdx,
    latestDate,
    idx90d,
    idx180d,
    idx365d,
    actualDays90d,
    actualDays180d,
    actualDays365d,
    excludeFlags,
    bucketNames,
    bucketSegments,
    nodeBucket,
    rawMetricCache: new Map(),
    computedCache: new Map(),
  };
}

function loadRawMetric(ctx, metric) {
  if (!ctx.rawMetricCache.has(metric)) {
    const file = path.join(ctx.repoDir, 'metrics', `${metric}.compact.json`);
    ctx.rawMetricCache.set(
      metric,
      fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
    );
  }
  return ctx.rawMetricCache.get(metric);
}

function computeMetric(ctx, metric, mask = MASK_FIRST_PARTY_CPP) {
  const cacheKey = `${metric}:${mask}`;
  if (ctx.computedCache.has(cacheKey)) {
    return ctx.computedCache.get(cacheKey);
  }
  const rows = loadRawMetric(ctx, metric);
  const len = ctx.datesIso.length;
  const series = new Float64Array(len);
  const bucketCur = new Float64Array(ctx.bucketNames.length);
  const bucket90d = new Float64Array(ctx.bucketNames.length);

  if (!rows) {
    const empty = { exists: false, series, bucketCur, bucket90d };
    ctx.computedCache.set(cacheKey, empty);
    return empty;
  }

  const diffSeries = new Float64Array(len);
  const { excludeFlags, nodeBucket, idx90d } = ctx;

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
      if (d < len) {
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

  let acc = 0;
  for (let i = 0; i < len; i++) {
    acc += diffSeries[i];
    series[i] = acc;
  }

  const res = { exists: true, series, bucketCur, bucket90d };
  ctx.computedCache.set(cacheKey, res);
  return res;
}

// Sample a repo's step-function series at an arbitrary timestamp (ms).
function sampleSeriesAt(ctx, series, targetMs) {
  const { datesMs } = ctx;
  if (!datesMs.length || targetMs < datesMs[0] - 7 * DAY_MS) return 0;
  let lo = 0;
  let hi = datesMs.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (datesMs[mid] <= targetMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return series[ans];
}

function computeEtaFromSeries(curRem, delta90d, days90d, delta180d, days180d, baseMs) {
  if (curRem <= 0) {
    return { etaDays: 0, etaDate: 'Done' };
  }
  const vel90 = delta90d / days90d;
  const vel180 = delta180d / days180d;
  const burnPerDay = vel90 < -0.02 ? -vel90 : vel180 < -0.02 ? -vel180 : 0;
  if (burnPerDay <= 0) return { etaDays: null, etaDate: null };
  const days = Math.ceil(curRem / burnPerDay);
  if (days > 365 * 12) return { etaDays: null, etaDate: null };
  return {
    etaDays: days,
    etaDate: new Date(baseMs + days * DAY_MS).toISOString().slice(0, 10),
  };
}

// -----------------------------------------------------------------------------
// Load all available target repositories
// -----------------------------------------------------------------------------
const repoContexts = TARGET_REPOS.map(loadRepoContext).filter(Boolean);
const chromiumCtx = repoContexts.find((c) => c.id === 'chromium') || repoContexts[0];
if (!chromiumCtx) {
  throw new Error(`No compact treemap data found under ${path.join(publicDir, 'treemap')}`);
}

// Canonical timeline from 2019-01-01 onward using Chromium's deduplicated dates,
// plus the newest snapshot date across all 6 repos so totals align with per-repo current.
const canonIndices = chromiumCtx.dedupIndices.filter(
  (idx) => chromiumCtx.datesIso[idx] >= '2019-01-01',
);
const canonDates = canonIndices.map((idx) => chromiumCtx.datesIso[idx].slice(0, 10));
const canonMs = canonIndices.map((idx) => chromiumCtx.datesMs[idx]);

let maxRepoMs = chromiumCtx.datesMs[chromiumCtx.lastIdx];
let maxRepoDate = chromiumCtx.latestDate;
for (const ctx of repoContexts) {
  const m = ctx.datesMs[ctx.lastIdx];
  if (m > maxRepoMs) {
    maxRepoMs = m;
    maxRepoDate = ctx.latestDate;
  }
}
if (maxRepoDate > canonDates[canonDates.length - 1]) {
  canonDates.push(maxRepoDate);
  canonMs.push(maxRepoMs);
}

const latestDate = canonDates[canonDates.length - 1];
const latestMs = canonMs[canonMs.length - 1];

function findClosestCanonIdx(targetMs) {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < canonMs.length; i++) {
    const diff = Math.abs(canonMs[i] - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

const canonLastIdx = canonMs.length - 1;
const canonIdx90d = findClosestCanonIdx(canonMs[canonLastIdx] - 90 * DAY_MS);
const canonIdx180d = findClosestCanonIdx(canonMs[canonLastIdx] - 180 * DAY_MS);
const canonIdx365d = findClosestCanonIdx(canonMs[canonLastIdx] - 365 * DAY_MS);
const canonDays90d = Math.max(1, (canonMs[canonLastIdx] - canonMs[canonIdx90d]) / DAY_MS);
const canonDays180d = Math.max(1, (canonMs[canonLastIdx] - canonMs[canonIdx180d]) / DAY_MS);
const canonDays365d = Math.max(1, (canonMs[canonLastIdx] - canonMs[canonIdx365d]) / DAY_MS);

// -----------------------------------------------------------------------------
// SECTION 1: Spanification (-Wunsafe-buffer-usage coverage + UNSAFE_TODO fixes)
// -----------------------------------------------------------------------------
function buildSpanificationScope(scopeKey, mask, excludeTp) {
  const repos = [];
  const allUncoveredDirs = [];

  let aggTotalLines = 0;
  let aggCoveredLines = 0;
  let aggUncoveredLines = 0;
  let aggTotalLines90d = 0;
  let aggCoveredLines90d = 0;
  let aggAllowFiles = 0;
  let aggAllowDelta90d = 0;
  let aggUnsafeBuffers = 0;
  let aggTodo = 0;
  let aggTodoDelta90d = 0;

  for (const ctx of repoContexts) {
    const lineSt = computeMetric(ctx, 'line', mask);
    const ubuSt = computeMetric(ctx, 'lines_unsafe_buffer_usage', mask);
    const allowSt = computeMetric(ctx, 'allow_unsafe_buffers', mask);
    const ubSt = computeMetric(ctx, 'unsafe_buffers', mask);
    const todoSt = computeMetric(ctx, 'unsafe_todo', mask);

    const covAt = (idx) => {
      const tot = Math.max(0, Math.round(lineSt.series[idx]));
      const uncov = ubuSt.exists
        ? Math.min(tot, Math.max(0, Math.round(ubuSt.series[idx])))
        : tot;
      const cov = Math.max(0, tot - uncov);
      const pct = tot > 0 ? round2((cov / tot) * 100) : 0;
      return { tot, uncov, cov, pct };
    };

    const cur = covAt(ctx.lastIdx);
    const prev90 = covAt(ctx.idx90d);
    const prev365 = covAt(ctx.idx365d);

    const allowCur = Math.round(allowSt.series[ctx.lastIdx]);
    const allowDelta90d = Math.round(allowCur - allowSt.series[ctx.idx90d]);
    const ubCur = Math.round(ubSt.series[ctx.lastIdx]);
    const todoCur = Math.round(todoSt.series[ctx.lastIdx]);
    const todoDelta90d = Math.round(todoCur - todoSt.series[ctx.idx90d]);

    aggTotalLines += cur.tot;
    aggCoveredLines += cur.cov;
    aggUncoveredLines += cur.uncov;
    aggTotalLines90d += prev90.tot;
    aggCoveredLines90d += prev90.cov;
    aggAllowFiles += allowCur;
    aggAllowDelta90d += allowDelta90d;
    aggUnsafeBuffers += ubCur;
    aggTodo += todoCur;
    aggTodoDelta90d += todoDelta90d;

    const repoDirs = [];
    if (ubuSt.exists) {
      for (let b = 0; b < ctx.bucketNames.length; b++) {
        const uncovB = Math.round(ubuSt.bucketCur[b]);
        if (uncovB <= 0) continue;
        const totB = Math.max(uncovB, Math.round(lineSt.bucketCur[b]));
        const entry = {
          repo: ctx.id,
          repoLabel: ctx.label,
          repoColor: ctx.color,
          path: ctx.bucketNames[b],
          uncoveredLines: uncovB,
          totalLines: totB,
          sharePct: cur.uncov > 0 ? round1((uncovB / cur.uncov) * 100) : 0,
          delta90d: Math.round(uncovB - ubuSt.bucket90d[b]),
          treemapUrl: buildTreemapUrl({
            repo: ctx.id,
            color: ['lines_unsafe_buffer_usage'],
            size: ['line'],
            excludeTp,
            start: '2024-01-01',
            latestDate: ctx.latestDate,
            pathSegs: ctx.bucketSegments[b],
          }),
        };
        repoDirs.push(entry);
        allUncoveredDirs.push(entry);
      }
      repoDirs.sort((a, b) => b.uncoveredLines - a.uncoveredLines);
    }

    const series = [];
    for (const idx of ctx.dedupIndices) {
      const dateStr = ctx.datesIso[idx].slice(0, 10);
      if (dateStr < '2023-06-01') continue;
      const snap = covAt(idx);
      series.push([dateStr, snap.pct, snap.uncov, snap.tot]);
    }

    repos.push({
      repo: ctx.id,
      label: ctx.label,
      fullName: ctx.fullName,
      color: ctx.color,
      latestDate: ctx.latestDate,
      hasMetric: ubuSt.exists,
      totalLines: cur.tot,
      coveredLines: cur.cov,
      uncoveredLines: cur.uncov,
      coveragePct: cur.pct,
      coverageDelta90dPct: round2(cur.pct - prev90.pct),
      coverageDelta365dPct: round2(cur.pct - prev365.pct),
      uncoveredDelta90d: cur.uncov - prev90.uncov,
      allowUnsafeBuffersFiles: allowCur,
      allowDelta90d,
      unsafeBuffersCalls: ubCur,
      unsafeTodoCount: todoCur,
      unsafeTodoDelta90d: todoDelta90d,
      treemapUrl: buildTreemapUrl({
        repo: ctx.id,
        color: ubuSt.exists ? ['lines_unsafe_buffer_usage'] : ['line'],
        size: ['line'],
        excludeTp,
        start: '2024-01-01',
        latestDate: ctx.latestDate,
      }),
      allowTreemapUrl: allowSt.exists
        ? buildTreemapUrl({
            repo: ctx.id,
            color: ['allow_unsafe_buffers'],
            size: ['file'],
            excludeTp,
            start: '2024-01-01',
            latestDate: ctx.latestDate,
          })
        : null,
      todoTreemapUrl: todoSt.exists
        ? buildTreemapUrl({
            repo: ctx.id,
            color: ['unsafe_todo'],
            size: ['line'],
            excludeTp,
            start: '2024-08-01',
            latestDate: ctx.latestDate,
          })
        : null,
      topUncoveredDirs: repoDirs.slice(0, 5),
      series,
    });
  }

  allUncoveredDirs.sort((a, b) => b.uncoveredLines - a.uncoveredLines);
  const aggCovPct = aggTotalLines > 0 ? round2((aggCoveredLines / aggTotalLines) * 100) : 0;
  const aggCovPct90d =
    aggTotalLines90d > 0 ? round2((aggCoveredLines90d / aggTotalLines90d) * 100) : 0;

  return {
    scope: scopeKey,
    totals: {
      totalLines: aggTotalLines,
      coveredLines: aggCoveredLines,
      uncoveredLines: aggUncoveredLines,
      coveragePct: aggCovPct,
      coverageDelta90dPct: round2(aggCovPct - aggCovPct90d),
      allowUnsafeBuffersFiles: aggAllowFiles,
      allowDelta90d: aggAllowDelta90d,
      unsafeBuffersCalls: aggUnsafeBuffers,
      unsafeTodoCount: aggTodo,
      unsafeTodoDelta90d: aggTodoDelta90d,
    },
    repos,
    topUncoveredDirs: allUncoveredDirs.slice(0, 8),
  };
}

const spanFirstParty = buildSpanificationScope('first_party', MASK_FIRST_PARTY_CPP, true);
const spanAll = buildSpanificationScope('all', MASK_ALL_CPP, false);

// UNSAFE_TODO burn-down across all 6 repositories (first-party scope)
const unsafeTodoRepos = [];
const unsafeTodoDirs = [];
const totalTodoCanon = new Float64Array(canonMs.length);
const totalBaseSpanCanon = new Float64Array(canonMs.length);

for (const ctx of repoContexts) {
  const todoSt = computeMetric(ctx, 'unsafe_todo', MASK_FIRST_PARTY_CPP);
  const spanSt = computeMetric(ctx, 'base_span', MASK_FIRST_PARTY_CPP);

  for (let c = 0; c < canonMs.length; c++) {
    totalTodoCanon[c] += sampleSeriesAt(ctx, todoSt.series, canonMs[c]);
    totalBaseSpanCanon[c] += sampleSeriesAt(ctx, spanSt.series, canonMs[c]);
  }

  const cur = Math.round(todoSt.series[ctx.lastIdx]);
  let peak = 0;
  let peakDate = ctx.datesIso[0].slice(0, 10);
  for (let i = 0; i < ctx.datesIso.length; i++) {
    if (ctx.datesIso[i] < '2024-06-01') continue;
    if (todoSt.series[i] >= peak) {
      peak = Math.round(todoSt.series[i]);
      peakDate = ctx.datesIso[i].slice(0, 10);
    }
  }
  const delta90d = Math.round(cur - todoSt.series[ctx.idx90d]);
  const delta180d = Math.round(cur - todoSt.series[ctx.idx180d]);
  const delta365d = Math.round(cur - todoSt.series[ctx.idx365d]);
  const { etaDays, etaDate } = computeEtaFromSeries(
    cur,
    delta90d,
    ctx.actualDays90d,
    delta180d,
    ctx.actualDays180d,
    ctx.datesMs[ctx.lastIdx],
  );

  for (let b = 0; b < ctx.bucketNames.length; b++) {
    const cnt = Math.round(todoSt.bucketCur[b]);
    if (cnt <= 0) continue;
    unsafeTodoDirs.push({
      repo: ctx.id,
      repoLabel: ctx.label,
      repoColor: ctx.color,
      path: ctx.bucketNames[b],
      count: cnt,
      delta90d: Math.round(cnt - todoSt.bucket90d[b]),
      treemapUrl: buildTreemapUrl({
        repo: ctx.id,
        color: ['unsafe_todo'],
        size: ['line'],
        excludeTp: true,
        start: '2024-08-01',
        latestDate: ctx.latestDate,
        pathSegs: ctx.bucketSegments[b],
      }),
    });
  }

  const series = [];
  for (const idx of ctx.dedupIndices) {
    const dStr = ctx.datesIso[idx].slice(0, 10);
    if (dStr < '2024-06-01') continue;
    series.push([dStr, Math.round(todoSt.series[idx])]);
  }

  unsafeTodoRepos.push({
    repo: ctx.id,
    label: ctx.label,
    color: ctx.color,
    hasMetric: todoSt.exists,
    current: cur,
    peak,
    peakDate,
    fixedFromPeak: Math.max(0, peak - cur),
    burnPct: peak > 0 ? round1(((peak - cur) / peak) * 100) : 0,
    delta90d,
    delta365d,
    velocityPerDay90d: round2(delta90d / ctx.actualDays90d),
    etaDate,
    etaDays,
    treemapUrl: todoSt.exists
      ? buildTreemapUrl({
          repo: ctx.id,
          color: ['unsafe_todo'],
          size: ['line'],
          excludeTp: true,
          start: '2024-08-01',
          latestDate: ctx.latestDate,
        })
      : null,
    series,
  });
}

const totalTodoCur = Math.round(totalTodoCanon[canonLastIdx]);
let totalTodoPeak = 0;
let totalTodoPeakDate = canonDates[0];
for (let i = 0; i < canonDates.length; i++) {
  if (canonDates[i] < '2024-06-01') continue;
  const v = Math.round(totalTodoCanon[i]);
  if (v >= totalTodoPeak) {
    totalTodoPeak = v;
    totalTodoPeakDate = canonDates[i];
  }
}
const totalTodoDelta90d = Math.round(totalTodoCur - totalTodoCanon[canonIdx90d]);
const totalTodoDelta180d = Math.round(totalTodoCur - totalTodoCanon[canonIdx180d]);
const totalTodoDelta365d = Math.round(totalTodoCur - totalTodoCanon[canonIdx365d]);
const totalTodoEta = computeEtaFromSeries(
  totalTodoCur,
  totalTodoDelta90d,
  canonDays90d,
  totalTodoDelta180d,
  canonDays180d,
  latestMs,
);

const totalBaseSpanCur = Math.round(totalBaseSpanCanon[canonLastIdx]);
const totalBaseSpanDelta90d = Math.round(totalBaseSpanCur - totalBaseSpanCanon[canonIdx90d]);

unsafeTodoDirs.sort((a, b) => b.count - a.count);
for (const d of unsafeTodoDirs) {
  d.sharePct = totalTodoCur > 0 ? round1((d.count / totalTodoCur) * 100) : 0;
}

const unsafeTodoTotalSeries = [];
for (let i = 0; i < canonDates.length; i++) {
  if (canonDates[i] < '2024-06-01') continue;
  unsafeTodoTotalSeries.push([
    canonDates[i],
    Math.round(totalTodoCanon[i]),
    Math.round(totalBaseSpanCanon[i]),
  ]);
}

// -----------------------------------------------------------------------------
// SECTION 2: MiraclePtr (UAF share over time, raw_ptr/raw_ref across 6 repos, RAW_PTR_EXCLUSION)
// -----------------------------------------------------------------------------
const rawPtrRepos = [];
const rawPtrTopDirs = [];
const totalRawPtrCanon = new Float64Array(canonMs.length);
const totalRawRefCanon = new Float64Array(canonMs.length);

const exclusionRepos = [];
const exclusionDirs = [];
const totalExclusionCanon = new Float64Array(canonMs.length);

let aggRawPtr = 0;
let aggRawRef = 0;
let aggRawPtr90d = 0;
let aggRawRef90d = 0;
let aggRawPtr365d = 0;
let aggRawRef365d = 0;
let aggMiracleCppLines = 0;

for (const ctx of repoContexts) {
  const rpSt = computeMetric(ctx, 'raw_ptr', MASK_FIRST_PARTY_CPP);
  const rrSt = computeMetric(ctx, 'raw_ref', MASK_FIRST_PARTY_CPP);
  const exSt = computeMetric(ctx, 'raw_ptr_exclusion', MASK_FIRST_PARTY_CPP);
  const lnSt = computeMetric(ctx, 'line', MASK_FIRST_PARTY_CPP);

  for (let c = 0; c < canonMs.length; c++) {
    totalRawPtrCanon[c] += sampleSeriesAt(ctx, rpSt.series, canonMs[c]);
    totalRawRefCanon[c] += sampleSeriesAt(ctx, rrSt.series, canonMs[c]);
    totalExclusionCanon[c] += sampleSeriesAt(ctx, exSt.series, canonMs[c]);
  }

  const rpCur = Math.round(rpSt.series[ctx.lastIdx]);
  const rrCur = Math.round(rrSt.series[ctx.lastIdx]);
  const totCur = rpCur + rrCur;
  const cppCur = Math.max(0, Math.round(lnSt.series[ctx.lastIdx]));
  const exCur = Math.round(exSt.series[ctx.lastIdx]);

  const rp90 = Math.round(rpSt.series[ctx.idx90d]);
  const rr90 = Math.round(rrSt.series[ctx.idx90d]);
  const rp365 = Math.round(rpSt.series[ctx.idx365d]);
  const rr365 = Math.round(rrSt.series[ctx.idx365d]);

  aggRawPtr += rpCur;
  aggRawRef += rrCur;
  aggRawPtr90d += rp90;
  aggRawRef90d += rr90;
  aggRawPtr365d += rp365;
  aggRawRef365d += rr365;
  aggMiracleCppLines += cppCur;

  for (let b = 0; b < ctx.bucketNames.length; b++) {
    const cnt = Math.round(rpSt.bucketCur[b] + rrSt.bucketCur[b]);
    if (cnt > 0) {
      rawPtrTopDirs.push({
        repo: ctx.id,
        repoLabel: ctx.label,
        repoColor: ctx.color,
        path: ctx.bucketNames[b],
        count: cnt,
        delta90d: Math.round(cnt - (rpSt.bucket90d[b] + rrSt.bucket90d[b])),
        treemapUrl: buildTreemapUrl({
          repo: ctx.id,
          color: ['raw_ptr', 'raw_ref'],
          size: ['file'],
          excludeTp: true,
          start: '2021-06-01',
          latestDate: ctx.latestDate,
          pathSegs: ctx.bucketSegments[b],
        }),
      });
    }

    const exB = Math.round(exSt.bucketCur[b]);
    if (exB > 0) {
      exclusionDirs.push({
        repo: ctx.id,
        repoLabel: ctx.label,
        repoColor: ctx.color,
        path: ctx.bucketNames[b],
        count: exB,
        delta90d: Math.round(exB - exSt.bucket90d[b]),
        treemapUrl: buildTreemapUrl({
          repo: ctx.id,
          color: ['raw_ptr_exclusion'],
          size: rpSt.exists ? ['raw_ptr', 'raw_ptr_exclusion'] : ['line'],
          excludeTp: true,
          start: '2022-01-01',
          latestDate: ctx.latestDate,
          pathSegs: ctx.bucketSegments[b],
        }),
      });
    }
  }

  const rpSeries = [];
  for (const idx of ctx.dedupIndices) {
    const dStr = ctx.datesIso[idx].slice(0, 10);
    if (dStr < '2021-01-01') continue;
    const a = Math.round(rpSt.series[idx]);
    const b = Math.round(rrSt.series[idx]);
    rpSeries.push([dStr, a, b, a + b]);
  }

  rawPtrRepos.push({
    repo: ctx.id,
    label: ctx.label,
    fullName: ctx.fullName,
    color: ctx.color,
    hasMetric: rpSt.exists || rrSt.exists,
    rawPtr: rpCur,
    rawRef: rrCur,
    total: totCur,
    cppLines: cppCur,
    densityPer10kLines: cppCur > 0 ? round1((totCur / cppCur) * 10000) : 0,
    rawPtrDelta90d: rpCur - rp90,
    rawRefDelta90d: rrCur - rr90,
    delta90d: totCur - (rp90 + rr90),
    delta365d: totCur - (rp365 + rr365),
    rawPtrExclusion: exCur,
    treemapUrl:
      rpSt.exists || rrSt.exists
        ? buildTreemapUrl({
            repo: ctx.id,
            color: rpSt.exists && rrSt.exists ? ['raw_ptr', 'raw_ref'] : ['raw_ptr'],
            size: ['file'],
            excludeTp: true,
            start: '2021-06-01',
            latestDate: ctx.latestDate,
          })
        : null,
    series: rpSeries,
  });

  // RAW_PTR_EXCLUSION per-repo
  let exPeak = 0;
  let exPeakDate = ctx.datesIso[0].slice(0, 10);
  for (let i = 0; i < ctx.datesIso.length; i++) {
    if (exSt.series[i] >= exPeak) {
      exPeak = Math.round(exSt.series[i]);
      exPeakDate = ctx.datesIso[i].slice(0, 10);
    }
  }
  const exSeries = [];
  for (const idx of ctx.dedupIndices) {
    const dStr = ctx.datesIso[idx].slice(0, 10);
    if (dStr < '2022-01-01') continue;
    exSeries.push([dStr, Math.round(exSt.series[idx])]);
  }
  exclusionRepos.push({
    repo: ctx.id,
    label: ctx.label,
    color: ctx.color,
    hasMetric: exSt.exists,
    current: exCur,
    peak: exPeak,
    peakDate: exPeakDate,
    burnPct: exPeak > 0 ? round1(((exPeak - exCur) / exPeak) * 100) : 0,
    delta90d: Math.round(exCur - exSt.series[ctx.idx90d]),
    delta365d: Math.round(exCur - exSt.series[ctx.idx365d]),
    treemapUrl: exSt.exists
      ? buildTreemapUrl({
          repo: ctx.id,
          color: ['raw_ptr_exclusion'],
          size: rpSt.exists ? ['raw_ptr', 'raw_ptr_exclusion'] : ['line'],
          excludeTp: true,
          start: '2022-01-01',
          latestDate: ctx.latestDate,
        })
      : null,
    series: exSeries,
  });
}

const aggMiracleTotal = aggRawPtr + aggRawRef;
rawPtrTopDirs.sort((a, b) => b.count - a.count);
for (const d of rawPtrTopDirs) {
  d.sharePct = aggMiracleTotal > 0 ? round1((d.count / aggMiracleTotal) * 100) : 0;
}

const totalExCur = Math.round(totalExclusionCanon[canonLastIdx]);
let totalExPeak = 0;
let totalExPeakDate = canonDates[0];
for (let i = 0; i < canonDates.length; i++) {
  const v = Math.round(totalExclusionCanon[i]);
  if (v >= totalExPeak) {
    totalExPeak = v;
    totalExPeakDate = canonDates[i];
  }
}
const totalExDelta90d = Math.round(totalExCur - totalExclusionCanon[canonIdx90d]);
const totalExDelta180d = Math.round(totalExCur - totalExclusionCanon[canonIdx180d]);
const totalExDelta365d = Math.round(totalExCur - totalExclusionCanon[canonIdx365d]);
const totalExEta = computeEtaFromSeries(
  totalExCur,
  totalExDelta90d,
  canonDays90d,
  totalExDelta180d,
  canonDays180d,
  latestMs,
);

exclusionDirs.sort((a, b) => b.count - a.count);
for (const d of exclusionDirs) {
  d.sharePct = totalExCur > 0 ? round1((d.count / totalExCur) * 100) : 0;
}

const exclusionTotalSeries = [];
for (let i = 0; i < canonDates.length; i++) {
  if (canonDates[i] < '2022-01-01') continue;
  exclusionTotalSeries.push([canonDates[i], Math.round(totalExclusionCanon[i])]);
}

// UAF Share Over Time from CVE dataset
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

function emptyUafBucket() {
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
    uafRendererUsd: 0,
    oobUsd: 0,
  };
}

function addCveToBucket(bucket, cls, renderer, reward) {
  bucket.total++;
  bucket.vrpUsd += reward;
  if (cls === 'uaf') {
    bucket.uaf++;
    bucket.uafUsd += reward;
    if (renderer) {
      bucket.uafRenderer++;
      bucket.uafRendererUsd += reward;
    } else {
      bucket.uafBrowser++;
      bucket.uafBrowserUsd += reward;
    }
  } else if (cls === 'oob') {
    bucket.oob++;
    bucket.oobUsd += reward;
  } else if (cls === 'type_confusion') {
    bucket.typeConfusion++;
  } else {
    bucket.other++;
  }
}

function rawPtrTotalAtIso(isoEnd) {
  const targetMs = new Date(isoEnd).getTime();
  let sum = 0;
  for (const ctx of repoContexts) {
    const rp = computeMetric(ctx, 'raw_ptr', MASK_FIRST_PARTY_CPP);
    const rr = computeMetric(ctx, 'raw_ref', MASK_FIRST_PARTY_CPP);
    sum += sampleSeriesAt(ctx, rp.series, targetMs) + sampleSeriesAt(ctx, rr.series, targetMs);
  }
  return Math.round(sum);
}

const rawCves = JSON.parse(fs.readFileSync(cveFile, 'utf8'));
const cves = (Array.isArray(rawCves) ? rawCves : Object.values(rawCves)).filter((c) => c?.id);

const uafYearlyMap = new Map();
const uafQuarterlyMap = new Map();
for (let y = 2018; y <= 2026; y++) {
  const isoEnd = y === 2026 ? `${latestDate}T23:59:59Z` : `${y}-12-31T23:59:59Z`;
  uafYearlyMap.set(String(y), {
    period: String(y),
    vrp: emptyUafBucket(),
    all: emptyUafBucket(),
    rawPtrTotal: rawPtrTotalAtIso(isoEnd),
  });
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
  const cls = classifyCwe(cve);
  const renderer = isRendererOrJit(cve);

  if (uafYearlyMap.has(pubYear)) {
    const row = uafYearlyMap.get(pubYear);
    addCveToBucket(row.all, cls, renderer, reward);
    if (reward > 0) addCveToBucket(row.vrp, cls, renderer, reward);
  }
  if (pubQuarter && pubYear >= '2020' && pubYear <= '2026') {
    if (!uafQuarterlyMap.has(pubQuarter)) {
      const [yStr, qStr] = pubQuarter.split('Q');
      const endMonth = Number(qStr) * 3;
      const qEndIso =
        pubQuarter === '2026Q4'
          ? `${latestDate}T23:59:59Z`
          : new Date(Date.UTC(Number(yStr), endMonth, 0, 23, 59, 59)).toISOString();
      uafQuarterlyMap.set(pubQuarter, {
        period: pubQuarter,
        vrp: emptyUafBucket(),
        all: emptyUafBucket(),
        rawPtrTotal: rawPtrTotalAtIso(qEndIso),
      });
    }
    const qRow = uafQuarterlyMap.get(pubQuarter);
    addCveToBucket(qRow.all, cls, renderer, reward);
    if (reward > 0) addCveToBucket(qRow.vrp, cls, renderer, reward);
  }
}

const uafYearly = [...uafYearlyMap.values()];
const uafQuarterly = [...uafQuarterlyMap.values()].sort((a, b) => a.period.localeCompare(b.period));
const yr2022 = uafYearlyMap.get('2022')?.vrp;
const yr2025 = uafYearlyMap.get('2025')?.vrp;
const yr2026 = uafYearlyMap.get('2026')?.vrp;

// -----------------------------------------------------------------------------
// SECTION 3: Dangling Pointers (DanglingUntriaged over time)
// -----------------------------------------------------------------------------
const danglingRepos = [];
const danglingDirs = [];
const totalDanglingCanon = new Float64Array(canonMs.length);

for (const ctx of repoContexts) {
  const dgSt = computeMetric(ctx, 'dangling_untriaged', MASK_FIRST_PARTY_CPP);
  const rpSt = computeMetric(ctx, 'raw_ptr', MASK_FIRST_PARTY_CPP);

  for (let c = 0; c < canonMs.length; c++) {
    totalDanglingCanon[c] += sampleSeriesAt(ctx, dgSt.series, canonMs[c]);
  }

  const cur = Math.round(dgSt.series[ctx.lastIdx]);
  let peak = 0;
  let peakDate = ctx.datesIso[0].slice(0, 10);
  for (let i = 0; i < ctx.datesIso.length; i++) {
    if (dgSt.series[i] >= peak) {
      peak = Math.round(dgSt.series[i]);
      peakDate = ctx.datesIso[i].slice(0, 10);
    }
  }

  for (let b = 0; b < ctx.bucketNames.length; b++) {
    const cnt = Math.round(dgSt.bucketCur[b]);
    if (cnt <= 0) continue;
    danglingDirs.push({
      repo: ctx.id,
      repoLabel: ctx.label,
      repoColor: ctx.color,
      path: ctx.bucketNames[b],
      count: cnt,
      delta90d: Math.round(cnt - dgSt.bucket90d[b]),
      treemapUrl: buildTreemapUrl({
        repo: ctx.id,
        color: ['dangling_untriaged'],
        size: rpSt.exists ? ['raw_ptr', 'raw_ref'] : ['file'],
        excludeTp: true,
        start: '2022-01-01',
        latestDate: ctx.latestDate,
        pathSegs: ctx.bucketSegments[b],
      }),
    });
  }

  const series = [];
  for (const idx of ctx.dedupIndices) {
    const dStr = ctx.datesIso[idx].slice(0, 10);
    if (dStr < '2022-01-01') continue;
    series.push([dStr, Math.round(dgSt.series[idx])]);
  }

  danglingRepos.push({
    repo: ctx.id,
    label: ctx.label,
    color: ctx.color,
    hasMetric: dgSt.exists,
    current: cur,
    peak,
    peakDate,
    fixedFromPeak: Math.max(0, peak - cur),
    burnPct: peak > 0 ? round1(((peak - cur) / peak) * 100) : 0,
    delta90d: Math.round(cur - dgSt.series[ctx.idx90d]),
    delta365d: Math.round(cur - dgSt.series[ctx.idx365d]),
    treemapUrl: dgSt.exists
      ? buildTreemapUrl({
          repo: ctx.id,
          color: ['dangling_untriaged'],
          size: rpSt.exists ? ['raw_ptr', 'raw_ref'] : ['file'],
          excludeTp: true,
          start: '2022-01-01',
          latestDate: ctx.latestDate,
        })
      : null,
    series,
  });
}

const totalDanglingCur = Math.round(totalDanglingCanon[canonLastIdx]);
let totalDanglingPeak = 0;
let totalDanglingPeakDate = canonDates[0];
for (let i = 0; i < canonDates.length; i++) {
  const v = Math.round(totalDanglingCanon[i]);
  if (v >= totalDanglingPeak) {
    totalDanglingPeak = v;
    totalDanglingPeakDate = canonDates[i];
  }
}
const totalDanglingDelta90d = Math.round(totalDanglingCur - totalDanglingCanon[canonIdx90d]);
const totalDanglingDelta180d = Math.round(totalDanglingCur - totalDanglingCanon[canonIdx180d]);
const totalDanglingDelta365d = Math.round(totalDanglingCur - totalDanglingCanon[canonIdx365d]);
const totalDanglingEta = computeEtaFromSeries(
  totalDanglingCur,
  totalDanglingDelta90d,
  canonDays90d,
  totalDanglingDelta180d,
  canonDays180d,
  latestMs,
);

danglingDirs.sort((a, b) => b.count - a.count);
for (const d of danglingDirs) {
  d.sharePct = totalDanglingCur > 0 ? round1((d.count / totalDanglingCur) * 100) : 0;
}

const danglingTotalSeries = [];
for (let i = 0; i < canonDates.length; i++) {
  if (canonDates[i] < '2022-01-01') continue;
  danglingTotalSeries.push([canonDates[i], Math.round(totalDanglingCanon[i])]);
}

// -----------------------------------------------------------------------------
// SECTION 4: Rust Adoption (First-party *.rs files across repos)
// -----------------------------------------------------------------------------
const rustRepos = [];
const rustDirs = [];
const totalRustCanon = new Float64Array(canonMs.length);

for (const ctx of repoContexts) {
  const rsSt = computeMetric(ctx, 'rust_file', MASK_FIRST_PARTY_FILES);

  for (let c = 0; c < canonMs.length; c++) {
    totalRustCanon[c] += sampleSeriesAt(ctx, rsSt.series, canonMs[c]);
  }

  const cur = Math.round(rsSt.series[ctx.lastIdx]);
  const delta90d = Math.round(cur - rsSt.series[ctx.idx90d]);
  const delta365d = Math.round(cur - rsSt.series[ctx.idx365d]);

  for (let b = 0; b < ctx.bucketNames.length; b++) {
    const cnt = Math.round(rsSt.bucketCur[b]);
    if (cnt <= 0) continue;
    rustDirs.push({
      repo: ctx.id,
      repoLabel: ctx.label,
      repoColor: ctx.color,
      path: ctx.bucketNames[b],
      count: cnt,
      delta90d: Math.round(cnt - rsSt.bucket90d[b]),
      treemapUrl: buildTreemapUrl({
        repo: ctx.id,
        color: ['rust_file'],
        size: ['rust_file', 'file'],
        excludeTp: true,
        start: '2022-01-01',
        latestDate: ctx.latestDate,
        pathSegs: ctx.bucketSegments[b],
      }),
    });
  }

  const series = [];
  for (const idx of ctx.dedupIndices) {
    const dStr = ctx.datesIso[idx].slice(0, 10);
    if (dStr < '2021-06-01') continue;
    series.push([dStr, Math.round(rsSt.series[idx])]);
  }

  rustRepos.push({
    repo: ctx.id,
    label: ctx.label,
    color: ctx.color,
    hasMetric: rsSt.exists,
    current: cur,
    delta90d,
    delta365d,
    treemapUrl: rsSt.exists
      ? buildTreemapUrl({
          repo: ctx.id,
          color: ['rust_file'],
          size: ['rust_file', 'file'],
          excludeTp: true,
          start: '2022-01-01',
          latestDate: ctx.latestDate,
        })
      : null,
    series,
  });
}

const totalRustCur = Math.round(totalRustCanon[canonLastIdx]);
const totalRustDelta90d = Math.round(totalRustCur - totalRustCanon[canonIdx90d]);
const totalRustDelta365d = Math.round(totalRustCur - totalRustCanon[canonIdx365d]);

rustDirs.sort((a, b) => b.count - a.count);
for (const d of rustDirs) {
  d.sharePct = totalRustCur > 0 ? round1((d.count / totalRustCur) * 100) : 0;
}

const rustTotalSeries = [];
for (let i = 0; i < canonDates.length; i++) {
  if (canonDates[i] < '2021-06-01') continue;
  rustTotalSeries.push([canonDates[i], Math.round(totalRustCanon[i])]);
}

// -----------------------------------------------------------------------------
// SECTION 5: Invariant Hardening (DCHECK vs CHECK)
// -----------------------------------------------------------------------------
const checkRepos = [];
const dcheckTopDirs = [];
const checkTopDirs = [];
const totalCheckCanon = new Float64Array(canonMs.length);
const totalDcheckCanon = new Float64Array(canonMs.length);

for (const ctx of repoContexts) {
  const ckSt = computeMetric(ctx, 'check', MASK_FIRST_PARTY_CPP);
  const dcSt = computeMetric(ctx, 'dcheck', MASK_FIRST_PARTY_CPP);
  if (!ckSt.exists && !dcSt.exists) continue;

  for (let c = 0; c < canonMs.length; c++) {
    totalCheckCanon[c] += sampleSeriesAt(ctx, ckSt.series, canonMs[c]);
    totalDcheckCanon[c] += sampleSeriesAt(ctx, dcSt.series, canonMs[c]);
  }

  const ckCur = Math.round(ckSt.series[ctx.lastIdx]);
  const dcCur = Math.round(dcSt.series[ctx.lastIdx]);
  const totCur = ckCur + dcCur;
  const shareCur = totCur > 0 ? round2((ckCur / totCur) * 100) : 0;

  let dcPeak = 0;
  let dcPeakDate = ctx.datesIso[0].slice(0, 10);
  for (let i = 0; i < ctx.datesIso.length; i++) {
    if (dcSt.series[i] >= dcPeak) {
      dcPeak = Math.round(dcSt.series[i]);
      dcPeakDate = ctx.datesIso[i].slice(0, 10);
    }
  }

  for (let b = 0; b < ctx.bucketNames.length; b++) {
    const ckB = Math.round(ckSt.bucketCur[b]);
    const dcB = Math.round(dcSt.bucketCur[b]);
    const totB = ckB + dcB;
    if (totB <= 0) continue;
    const item = {
      repo: ctx.id,
      repoLabel: ctx.label,
      repoColor: ctx.color,
      path: ctx.bucketNames[b],
      checkCount: ckB,
      dcheckCount: dcB,
      checkSharePct: round1((ckB / totB) * 100),
      checkDelta90d: Math.round(ckB - ckSt.bucket90d[b]),
      dcheckDelta90d: Math.round(dcB - dcSt.bucket90d[b]),
      treemapUrl: buildTreemapUrl({
        repo: ctx.id,
        color: ['check'],
        size: ['check', 'dcheck'],
        excludeTp: true,
        start: '2020-01-01',
        latestDate: ctx.latestDate,
        pathSegs: ctx.bucketSegments[b],
      }),
    };
    if (dcB > 0) dcheckTopDirs.push(item);
    if (ckB > 0) checkTopDirs.push(item);
  }

  const series = [];
  for (const idx of ctx.dedupIndices) {
    const dStr = ctx.datesIso[idx].slice(0, 10);
    if (dStr < '2019-01-01') continue;
    const ck = Math.round(ckSt.series[idx]);
    const dc = Math.round(dcSt.series[idx]);
    const sh = ck + dc > 0 ? round2((ck / (ck + dc)) * 100) : 0;
    series.push([dStr, ck, dc, sh]);
  }

  checkRepos.push({
    repo: ctx.id,
    label: ctx.label,
    color: ctx.color,
    checkCurrent: ckCur,
    dcheckCurrent: dcCur,
    totalAssertions: totCur,
    checkSharePct: shareCur,
    dcheckPeak: dcPeak,
    dcheckPeakDate: dcPeakDate,
    checkDelta90d: Math.round(ckCur - ckSt.series[ctx.idx90d]),
    dcheckDelta90d: Math.round(dcCur - dcSt.series[ctx.idx90d]),
    checkDelta365d: Math.round(ckCur - ckSt.series[ctx.idx365d]),
    dcheckDelta365d: Math.round(dcCur - dcSt.series[ctx.idx365d]),
    treemapUrl: buildTreemapUrl({
      repo: ctx.id,
      color: ['check'],
      size: ['check', 'dcheck'],
      excludeTp: true,
      start: '2020-01-01',
      latestDate: ctx.latestDate,
    }),
    series,
  });
}

const totalCheckCur = Math.round(totalCheckCanon[canonLastIdx]);
const totalDcheckCur = Math.round(totalDcheckCanon[canonLastIdx]);
const totalAssertCur = totalCheckCur + totalDcheckCur;
const totalCheckSharePct = totalAssertCur > 0 ? round2((totalCheckCur / totalAssertCur) * 100) : 0;

let totalDcheckPeak = 0;
let totalDcheckPeakDate = canonDates[0];
for (let i = 0; i < canonDates.length; i++) {
  const v = Math.round(totalDcheckCanon[i]);
  if (v >= totalDcheckPeak) {
    totalDcheckPeak = v;
    totalDcheckPeakDate = canonDates[i];
  }
}

const idx2022 = canonDates.findIndex((d) => d >= '2022-01-01');
const checkShare2022Pct =
  idx2022 >= 0 && totalCheckCanon[idx2022] + totalDcheckCanon[idx2022] > 0
    ? round1(
        (totalCheckCanon[idx2022] / (totalCheckCanon[idx2022] + totalDcheckCanon[idx2022])) * 100,
      )
    : 0;

dcheckTopDirs.sort((a, b) => b.dcheckCount - a.dcheckCount);
checkTopDirs.sort((a, b) => b.checkCount - a.checkCount);
for (const d of dcheckTopDirs) {
  d.dcheckShareOfTotalPct = totalDcheckCur > 0 ? round1((d.dcheckCount / totalDcheckCur) * 100) : 0;
}
for (const d of checkTopDirs) {
  d.checkShareOfTotalPct = totalCheckCur > 0 ? round1((d.checkCount / totalCheckCur) * 100) : 0;
}

const checksTotalSeries = [];
for (let i = 0; i < canonDates.length; i++) {
  const ck = Math.round(totalCheckCanon[i]);
  const dc = Math.round(totalDcheckCanon[i]);
  const sh = ck + dc > 0 ? round2((ck / (ck + dc)) * 100) : 0;
  checksTotalSeries.push([canonDates[i], ck, dc, sh]);
}

// -----------------------------------------------------------------------------
// Assemble & write public/data/security.json
// -----------------------------------------------------------------------------
const securityPayload = {
  generatedAt: new Date().toISOString(),
  latestDate,
  windowDays: {
    d90: Math.round(canonDays90d),
    d365: Math.round(canonDays365d),
  },
  repositories: repoContexts.map((c) => ({
    id: c.id,
    label: c.label,
    fullName: c.fullName,
    color: c.color,
    latestDate: c.latestDate,
  })),
  spanification: {
    scopes: {
      first_party: spanFirstParty,
      all: spanAll,
    },
    unsafeTodo: {
      totals: {
        current: totalTodoCur,
        peak: totalTodoPeak,
        peakDate: totalTodoPeakDate,
        fixedFromPeak: Math.max(0, totalTodoPeak - totalTodoCur),
        burnPct:
          totalTodoPeak > 0
            ? round1(((totalTodoPeak - totalTodoCur) / totalTodoPeak) * 100)
            : 0,
        delta90d: totalTodoDelta90d,
        delta365d: totalTodoDelta365d,
        velocityPerDay90d: round2(totalTodoDelta90d / canonDays90d),
        etaDate: totalTodoEta.etaDate,
        etaDays: totalTodoEta.etaDays,
        baseSpanCurrent: totalBaseSpanCur,
        baseSpanDelta90d: totalBaseSpanDelta90d,
      },
      totalSeries: unsafeTodoTotalSeries,
      repos: unsafeTodoRepos,
      topDirs: unsafeTodoDirs.slice(0, 10),
    },
  },
  miraclePtr: {
    uafRoi: {
      note:
        'In 2026 Chrome expanded CNA CVE assignment to internally discovered/fuzzed bugs ($0 VRP). External VRP-rewarded CVEs give an apples-to-apples multi-year comparison.',
      highlights: {
        browserUafShare2022Pct: yr2022?.total
          ? round1((yr2022.uafBrowser / yr2022.total) * 100)
          : 0,
        browserUafShare2025Pct: yr2025?.total
          ? round1((yr2025.uafBrowser / yr2025.total) * 100)
          : 0,
        browserUafShare2026Pct: yr2026?.total
          ? round1((yr2026.uafBrowser / yr2026.total) * 100)
          : 0,
        totalUafShare2022Pct: yr2022?.total ? round1((yr2022.uaf / yr2022.total) * 100) : 0,
        totalUafShare2026Pct: yr2026?.total ? round1((yr2026.uaf / yr2026.total) * 100) : 0,
        browserUafCount2022: yr2022?.uafBrowser ?? 0,
        browserUafCount2025: yr2025?.uafBrowser ?? 0,
        browserUafUsd2022: yr2022?.uafBrowserUsd ?? 0,
      },
      yearly: uafYearly,
      quarterly: uafQuarterly,
    },
    adoption: {
      totals: {
        rawPtr: aggRawPtr,
        rawRef: aggRawRef,
        total: aggMiracleTotal,
        cppLines: aggMiracleCppLines,
        densityPer10kLines:
          aggMiracleCppLines > 0 ? round1((aggMiracleTotal / aggMiracleCppLines) * 10000) : 0,
        delta90d: aggMiracleTotal - (aggRawPtr90d + aggRawRef90d),
        delta365d: aggMiracleTotal - (aggRawPtr365d + aggRawRef365d),
      },
      repos: rawPtrRepos,
      topDirs: rawPtrTopDirs.slice(0, 8),
    },
    exclusion: {
      totals: {
        current: totalExCur,
        peak: totalExPeak,
        peakDate: totalExPeakDate,
        fixedFromPeak: Math.max(0, totalExPeak - totalExCur),
        burnPct: totalExPeak > 0 ? round1(((totalExPeak - totalExCur) / totalExPeak) * 100) : 0,
        delta90d: totalExDelta90d,
        delta365d: totalExDelta365d,
        etaDate: totalExEta.etaDate,
        etaDays: totalExEta.etaDays,
      },
      totalSeries: exclusionTotalSeries,
      repos: exclusionRepos,
      topDirs: exclusionDirs.slice(0, 10),
    },
  },
  danglingPointers: {
    totals: {
      current: totalDanglingCur,
      peak: totalDanglingPeak,
      peakDate: totalDanglingPeakDate,
      fixedFromPeak: Math.max(0, totalDanglingPeak - totalDanglingCur),
      burnPct:
        totalDanglingPeak > 0
          ? round1(((totalDanglingPeak - totalDanglingCur) / totalDanglingPeak) * 100)
          : 0,
      delta90d: totalDanglingDelta90d,
      delta365d: totalDanglingDelta365d,
      velocityPerDay90d: round2(totalDanglingDelta90d / canonDays90d),
      etaDate: totalDanglingEta.etaDate,
      etaDays: totalDanglingEta.etaDays,
    },
    totalSeries: danglingTotalSeries,
    repos: danglingRepos,
    topDirs: danglingDirs.slice(0, 10),
  },
  rust: {
    totals: {
      current: totalRustCur,
      delta90d: totalRustDelta90d,
      delta365d: totalRustDelta365d,
      velocityPerWeek90d: round1((totalRustDelta90d / canonDays90d) * 7),
    },
    totalSeries: rustTotalSeries,
    repos: rustRepos,
    topDirs: rustDirs.slice(0, 10),
  },
  invariantHardening: {
    totals: {
      checkCurrent: totalCheckCur,
      dcheckCurrent: totalDcheckCur,
      totalAssertions: totalAssertCur,
      checkSharePct: totalCheckSharePct,
      checkShare2022Pct,
      dcheckPeak: totalDcheckPeak,
      dcheckPeakDate: totalDcheckPeakDate,
      dcheckBurnPct:
        totalDcheckPeak > 0
          ? round1(((totalDcheckPeak - totalDcheckCur) / totalDcheckPeak) * 100)
          : 0,
      checkDelta90d: Math.round(totalCheckCur - totalCheckCanon[canonIdx90d]),
      dcheckDelta90d: Math.round(totalDcheckCur - totalDcheckCanon[canonIdx90d]),
      checkDelta365d: Math.round(totalCheckCur - totalCheckCanon[canonIdx365d]),
      dcheckDelta365d: Math.round(totalDcheckCur - totalDcheckCanon[canonIdx365d]),
    },
    totalSeries: checksTotalSeries,
    repos: checkRepos,
    topDcheckDirs: dcheckTopDirs.slice(0, 10),
    topCheckDirs: checkTopDirs.slice(0, 10),
  },
};

const outPath = path.join(publicDir, 'data', 'security.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(securityPayload));

console.log(`\n=== Security Hardening Summary (${latestDate}, ${repoContexts.length} repos) ===`);
console.table(
  spanFirstParty.repos.map((r) => ({
    Repo: r.label,
    '1P Cov %': `${r.coveragePct}%`,
    '1P C++ Lines': r.totalLines.toLocaleString(),
    'Uncovered 1P': r.uncoveredLines.toLocaleString(),
    allow_unsafe: r.allowUnsafeBuffersFiles.toLocaleString(),
    UNSAFE_TODO: r.unsafeTodoCount.toLocaleString(),
    'raw_ptr+ref': (
      rawPtrRepos.find((x) => x.repo === r.repo)?.total ?? 0
    ).toLocaleString(),
    RAW_PTR_EXCL: (
      exclusionRepos.find((x) => x.repo === r.repo)?.current ?? 0
    ).toLocaleString(),
    Dangling: (
      danglingRepos.find((x) => x.repo === r.repo)?.current ?? 0
    ).toLocaleString(),
    '1P .rs': (rustRepos.find((x) => x.repo === r.repo)?.current ?? 0).toLocaleString(),
  })),
);
console.log(
  `UNSAFE_TODO: ${totalTodoCur.toLocaleString()} / peak ${totalTodoPeak.toLocaleString()} (${securityPayload.spanification.unsafeTodo.totals.burnPct}% burned, 90d ${totalTodoDelta90d}, ETA ${totalTodoEta.etaDate})`,
);
console.log(
  `MiraclePtr: ${aggMiracleTotal.toLocaleString()} ptrs | RAW_PTR_EXCLUSION: ${totalExCur.toLocaleString()} (peak ${totalExPeak.toLocaleString()}, 90d ${totalExDelta90d}) | Browser VRP UAF: ${securityPayload.miraclePtr.uafRoi.highlights.browserUafShare2022Pct}% (2022) -> ${securityPayload.miraclePtr.uafRoi.highlights.browserUafShare2026Pct}% (2026)`,
);
console.log(
  `DanglingUntriaged: ${totalDanglingCur.toLocaleString()} / peak ${totalDanglingPeak.toLocaleString()} (${securityPayload.danglingPointers.totals.burnPct}% burned, 90d ${totalDanglingDelta90d})`,
);
console.log(
  `Rust 1P: ${totalRustCur.toLocaleString()} .rs files (90d +${totalRustDelta90d}) | Checks: ${totalCheckSharePct}% CHECK (${totalCheckCur.toLocaleString()} CHECK vs ${totalDcheckCur.toLocaleString()} DCHECK)`,
);
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
