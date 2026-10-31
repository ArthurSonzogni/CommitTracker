export interface PrunedTreemapNode {
  name: string;
  id: number;
  area: number;
  color: number;
  clickable: boolean;
  metrics: Record<string, number>;
  children?: PrunedTreemapNode[];
}

interface InternalTreeNode {
  name: string;
  id: number;
  subtreeEnd: number;
  raw?: any[];
  children?: InternalTreeNode[];
}

interface TreeIndex {
  root: InternalTreeNode;
  rawRoot?: any;
  numNodes: number;
  parentId: Int32Array;
  subtreeEnd: Int32Array;
  excludeFlags: Uint8Array | null;
  isCompact: boolean;
}

interface MetricStore {
  kind: "latest" | "compact" | "legacy";
  rows?: number[][];
  legacy?: Record<string, [number, number][]>;
}

const TEST_NAME_RE = /test|mock|example/i;
const MAX_FULL_TREE_CACHE = 2;
const MAX_FULL_METRIC_CACHE = 12;

const datesCache = new Map<string, Promise<number[]>>();
const latestTreeCache = new Map<string, Promise<TreeIndex | null>>();
const fullTreeCache = new Map<string, Promise<TreeIndex | null>>();
const resolvedFullTreeRepos = new Set<string>();
const latestMetricCache = new Map<string, Promise<MetricStore | null>>();
const fullMetricCache = new Map<string, Promise<MetricStore | null>>();
const historySeriesCache = new Map<string, number[]>();

let activeTreeIndex: TreeIndex | null = null;
let accumScopeKey = "";
const metricsAccumulation = new Map<string, Float64Array>();
let areaById = new Float64Array(0);
let colorById = new Float64Array(0);
let areaColorKey = "";

function lruGetOrSet<T>(
  cache: Map<string, Promise<T | null>>,
  key: string,
  maxEntries: number,
  factory: () => Promise<T | null>,
): Promise<T | null> {
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  while (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  const pending = factory().then((val) => {
    if (val === null) cache.delete(key);
    return val;
  }).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  return pending;
}

function evictLatestRepoCaches(repo: string) {
  latestTreeCache.delete(repo);
  const prefix = `${repo}/`;
  for (const key of Array.from(latestMetricCache.keys())) {
    if (key.startsWith(prefix)) {
      latestMetricCache.delete(key);
    }
  }
}

async function fetchJson(url: string) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type");
    if (response.ok && contentType && contentType.includes("application/json")) {
      return await response.json();
    }
  } catch (e) {
    console.error(`Error fetching ${url}`, e);
  }
  return null;
}

function getDatesMs(repo: string): Promise<number[]> {
  let pending = datesCache.get(repo);
  if (!pending) {
    pending = (async () => {
      const json = await fetchJson(`/treemap/${repo}/dates.json`);
      if (!Array.isArray(json)) {
        datesCache.delete(repo);
        return [];
      }
      return json.map((d: string) => new Date(d).getTime());
    })();
    datesCache.set(repo, pending);
  }
  return pending;
}

function formatDateIdx(datesMs: number[], targetMs: number): number {
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < datesMs.length; i++) {
    const diff = Math.abs(datesMs[i] - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function buildTreeIndexFromCompact(compact: any): TreeIndex {
  let cap = 65536;
  let parentId = new Int32Array(cap);
  let subtreeEnd = new Int32Array(cap);
  let nextId = 0;

  const grow = () => {
    cap *= 2;
    const nextParent = new Int32Array(cap);
    nextParent.set(parentId);
    parentId = nextParent;
    const nextEnd = new Int32Array(cap);
    nextEnd.set(subtreeEnd);
    subtreeEnd = nextEnd;
  };

  const indexWalk = (node: any, pId: number) => {
    const id = nextId++;
    if (id >= cap) grow();
    parentId[id] = pId;
    if (typeof node === "string") {
      subtreeEnd[id] = id + 1;
      return;
    }
    for (let i = 1; i < node.length; i++) {
      const c = node[i];
      if (typeof c === "string") {
        const cid = nextId++;
        if (cid >= cap) grow();
        parentId[cid] = id;
        subtreeEnd[cid] = cid + 1;
      } else {
        indexWalk(c, id);
      }
    }
    subtreeEnd[id] = nextId;
  };

  indexWalk(compact, -1);

  const root: InternalTreeNode = typeof compact === "string"
    ? { name: compact, id: 0, subtreeEnd: 1 }
    : { name: compact[0], id: 0, subtreeEnd: nextId, raw: compact };

  return {
    root,
    rawRoot: compact,
    numNodes: nextId,
    parentId: parentId.subarray(0, nextId),
    subtreeEnd: subtreeEnd.subarray(0, nextId),
    excludeFlags: null,
    isCompact: true,
  };
}

function buildTreeIndexFromLegacy(rawRoot: any): TreeIndex {
  let maxId = 0;
  const findMax = (n: any) => {
    if (n.id > maxId) maxId = n.id;
    for (const c of n.children || []) findMax(c);
  };
  findMax(rawRoot);
  const numNodes = maxId + 1;
  const parentId = new Int32Array(numNodes).fill(-1);
  const subtreeEnd = new Int32Array(numNodes);
  let nextId = 0;

  const convert = (n: any, pId: number): InternalTreeNode => {
    const id = n.id;
    if (id + 1 > nextId) nextId = id + 1;
    parentId[id] = pId;
    if (!n.children || n.children.length === 0) {
      subtreeEnd[id] = nextId;
      return { name: n.name, id, subtreeEnd: nextId };
    }
    const children = n.children.map((c: any) => convert(c, id));
    subtreeEnd[id] = nextId;
    return { name: n.name, id, subtreeEnd: nextId, children };
  };

  const root = convert(rawRoot, -1);
  return {
    root,
    numNodes,
    parentId,
    subtreeEnd,
    excludeFlags: null,
    isCompact: false,
  };
}

function ensureChildren(treeIndex: TreeIndex, node: InternalTreeNode): InternalTreeNode[] | undefined {
  if (node.children) return node.children;
  const raw = node.raw;
  if (!raw || raw.length <= 1) return undefined;
  const se = treeIndex.subtreeEnd;
  const len = raw.length - 1;
  const children = new Array<InternalTreeNode>(len);
  let childId = node.id + 1;
  for (let i = 0; i < len; i++) {
    const item = raw[i + 1];
    const end = se[childId];
    children[i] = typeof item === "string"
      ? { name: item, id: childId, subtreeEnd: end }
      : { name: item[0], id: childId, subtreeEnd: end, raw: item };
    childId = end;
  }
  node.children = children;
  node.raw = undefined;
  return children;
}

// Blink lives in third_party/blink (and third_party/WebKit before April 2018),
// so excluding third-party code keeps both.
function isBlinkDir(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "blink" || lower === "webkit";
}

function ensureExcludeFlags(treeIndex: TreeIndex) {
  if (treeIndex.excludeFlags) return;
  const flags = new Uint8Array(treeIndex.numNodes);

  if (treeIndex.isCompact && treeIndex.rawRoot) {
    const se = treeIndex.subtreeEnd;
    const walkCompact = (node: any, id: number, tpParent: boolean, inh: number) => {
      const name: string = typeof node === "string" ? node : node[0];
      let f = inh;
      if (id > 0 && name) {
        if ((f & 1) === 0 && TEST_NAME_RE.test(name)) f |= 1;
        if (tpParent && !isBlinkDir(name)) f |= 2;
      }
      if (typeof node === "string") {
        flags[id] = f;
        return;
      }
      const end = se[id];
      if (f === 3) {
        flags.fill(3, id, end);
        return;
      }
      flags[id] = f;
      const nextTp = name.length === 11 && name.toLowerCase() === "third_party";
      let cid = id + 1;
      for (let i = 1; i < node.length; i++) {
        const c = node[i];
        const cEnd = se[cid];
        if (typeof c === "string") {
          let cf = f;
          if ((cf & 1) === 0 && TEST_NAME_RE.test(c)) cf |= 1;
          if (nextTp && !isBlinkDir(c)) cf |= 2;
          flags[cid] = cf;
        } else {
          walkCompact(c, cid, nextTp, f);
        }
        cid = cEnd;
      }
    };
    walkCompact(treeIndex.rawRoot, 0, false, 0);
  } else {
    const walkLegacy = (node: InternalTreeNode, tpParent: boolean, inh: number) => {
      let f = inh;
      if (node.id > 0 && node.name) {
        if ((f & 1) === 0 && TEST_NAME_RE.test(node.name)) f |= 1;
        if (tpParent && !isBlinkDir(node.name)) f |= 2;
      }
      flags[node.id] = f;
      if (node.children) {
        const nextTp = node.name?.toLowerCase() === "third_party";
        for (let i = 0; i < node.children.length; i++) {
          walkLegacy(node.children[i], nextTp, f);
        }
      }
    };
    walkLegacy(treeIndex.root, false, 0);
  }

  treeIndex.excludeFlags = flags;
}

function getLatestTreeIndex(repo: string): Promise<TreeIndex | null> {
  return lruGetOrSet(latestTreeCache, repo, 4, async () => {
    const index = await fetchJson(`/treemap/${repo}/file_index.latest.json`);
    return index ? buildTreeIndexFromCompact(index) : null;
  });
}

function getFullTreeIndex(repo: string): Promise<TreeIndex | null> {
  const existing = fullTreeCache.get(repo);
  if (existing) {
    fullTreeCache.delete(repo);
    fullTreeCache.set(repo, existing);
    return existing;
  }
  while (fullTreeCache.size >= MAX_FULL_TREE_CACHE) {
    const oldest = fullTreeCache.keys().next().value;
    if (oldest === undefined) break;
    fullTreeCache.delete(oldest);
    resolvedFullTreeRepos.delete(oldest);
  }
  const pending = (async () => {
    const compact = await fetchJson(`/treemap/${repo}/file_index.compact.json`);
    const tree = compact
      ? buildTreeIndexFromCompact(compact)
      : (() => null)();
    if (tree) {
      resolvedFullTreeRepos.add(repo);
      evictLatestRepoCaches(repo);
      return tree;
    }
    const legacy = await fetchJson(`/treemap/${repo}/file_index.json`);
    if (legacy) {
      const legacyTree = buildTreeIndexFromLegacy(legacy);
      resolvedFullTreeRepos.add(repo);
      evictLatestRepoCaches(repo);
      return legacyTree;
    }
    fullTreeCache.delete(repo);
    return null;
  })().catch((err) => {
    fullTreeCache.delete(repo);
    resolvedFullTreeRepos.delete(repo);
    throw err;
  });
  fullTreeCache.set(repo, pending);
  return pending;
}

function getLatestMetric(repo: string, field: string): Promise<MetricStore | null> {
  const key = `${repo}/${field}`;
  return lruGetOrSet(latestMetricCache, key, 16, async () => {
    const rows = await fetchJson(`/treemap/${repo}/metrics/${field}.latest.json`);
    return rows ? { kind: "latest", rows } : null;
  });
}

function getFullMetric(repo: string, field: string, isCompact: boolean): Promise<MetricStore | null> {
  const key = `${repo}/${field}/${isCompact ? "c" : "l"}`;
  return lruGetOrSet(fullMetricCache, key, MAX_FULL_METRIC_CACHE, async () => {
    if (isCompact) {
      const rows = await fetchJson(`/treemap/${repo}/metrics/${field}.compact.json`);
      return rows ? { kind: "compact", rows } : null;
    }
    const legacy = await fetchJson(`/treemap/${repo}/metrics/${field}.json`);
    return legacy ? { kind: "legacy", legacy } : null;
  });
}

function isExcluded(treeIndex: TreeIndex, id: number, mask: number): boolean {
  if (!mask || !treeIndex.excludeFlags) return false;
  return (treeIndex.excludeFlags[id] & mask) !== 0;
}

function hasVisibleChildren(treeIndex: TreeIndex, node: InternalTreeNode, mask: number): boolean {
  const flags = treeIndex.excludeFlags;
  if (node.children) {
    if (!mask || !flags) return node.children.length > 0;
    for (let i = 0; i < node.children.length; i++) {
      if ((flags[node.children[i].id] & mask) === 0) return true;
    }
    return false;
  }
  if (!node.raw || node.raw.length <= 1) return false;
  if (!mask || !flags) return true;
  const se = treeIndex.subtreeEnd;
  let cid = node.id + 1;
  while (cid < node.subtreeEnd) {
    if ((flags[cid] & mask) === 0) return true;
    cid = se[cid];
  }
  return false;
}

function getTreeNodeFromPath(treeIndex: TreeIndex, pathArr: string[], mask: number): InternalTreeNode {
  let cur = treeIndex.root;
  for (const name of pathArr || []) {
    const children = ensureChildren(treeIndex, cur);
    const next = children?.find((c) => c.name === name && !isExcluded(treeIndex, c.id, mask));
    if (!next) break;
    cur = next;
  }
  return cur;
}

function accumulateFields(
  scopeKey: string,
  treeIndex: TreeIndex,
  metrics: Record<string, MetricStore>,
  dateId: number,
  mask: number,
  fieldSize: string[],
  fieldColor: string[],
) {
  const numNodes = treeIndex.numNodes;
  const parentId = treeIndex.parentId;
  if (mask) ensureExcludeFlags(treeIndex);
  const flags = treeIndex.excludeFlags;

  if (activeTreeIndex !== treeIndex || accumScopeKey !== scopeKey) {
    activeTreeIndex = treeIndex;
    accumScopeKey = scopeKey;
    metricsAccumulation.clear();
    areaColorKey = "";
  }

  for (const field in metrics) {
    if (metricsAccumulation.has(field)) continue;

    const store = metrics[field];
    const acc = new Float64Array(numNodes);

    if (store.kind === "latest" && store.rows) {
      const rows = store.rows;
      let id = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        id += row[0];
        if (mask && flags && (flags[id] & mask) !== 0) continue;
        acc[id] = row[1];
      }
    } else if (store.kind === "compact" && store.rows) {
      const rows = store.rows;
      let id = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        id += row[0];
        if (mask && flags && (flags[id] & mask) !== 0) continue;
        let d = 0;
        let val = 0;
        for (let i = 1; i < row.length; i += 2) {
          d += row[i];
          if (d > dateId) break;
          val += row[i + 1];
        }
        acc[id] = val;
      }
    } else if (store.kind === "legacy" && store.legacy) {
      for (const fileId in store.legacy) {
        const id = Number(fileId);
        if (mask && flags && (flags[id] & mask) !== 0) continue;
        const hist = store.legacy[fileId];
        let val = 0;
        for (let i = 0; i < hist.length; i++) {
          if (hist[i][0] <= dateId) val = hist[i][1];
          else break;
        }
        acc[id] = val;
      }
    }

    if (treeIndex.isCompact) {
      for (let i = numNodes - 1; i > 0; i--) {
        const v = acc[i];
        if (v !== 0) {
          acc[parentId[i]] += v;
        }
      }
    } else {
      const accWalk = (entry: InternalTreeNode) => {
        if (!entry.children) return;
        for (const child of entry.children) {
          accWalk(child);
          acc[entry.id] += acc[child.id];
        }
      };
      accWalk(treeIndex.root);
    }

    metricsAccumulation.set(field, acc);
  }

  const nextAreaColorKey = `${scopeKey}|${fieldSize.join(",")}|${fieldColor.join(",")}`;
  if (areaColorKey !== nextAreaColorKey || areaById.length !== numNodes) {
    if (areaById.length !== numNodes) areaById = new Float64Array(numNodes);
    else areaById.fill(0);
    if (colorById.length !== numNodes) colorById = new Float64Array(numNodes);
    else colorById.fill(0);

    const effSize = fieldSize.length ? fieldSize : fieldColor;
    const effColor = fieldColor.length ? fieldColor : fieldSize;

    for (const field of effSize) {
      const acc = metricsAccumulation.get(field);
      if (acc) {
        for (let i = 0; i < numNodes; i++) areaById[i] += acc[i];
      }
    }
    for (const field of effColor) {
      const acc = metricsAccumulation.get(field);
      if (acc) {
        for (let i = 0; i < numNodes; i++) colorById[i] += acc[i];
      }
    }
    areaColorKey = nextAreaColorKey;
  }
}

function buildPrunedSubtree(
  treeIndex: TreeIndex,
  pathsToExpand: string[][],
  mask: number,
  allFields: string[],
): PrunedTreemapNode {
  if (mask) ensureExcludeFlags(treeIndex);
  const flags = treeIndex.excludeFlags;
  const expandedSet = new Set<InternalTreeNode>([treeIndex.root]);

  for (const p of pathsToExpand) {
    let cur = treeIndex.root;
    for (const name of p || []) {
      const children = ensureChildren(treeIndex, cur);
      const next = children?.find((c) => c.name === name && (!mask || !flags || (flags[c.id] & mask) === 0));
      if (!next) break;
      expandedSet.add(next);
      cur = next;
    }
  }

  const toPruned = (node: InternalTreeNode): PrunedTreemapNode => {
    const m: Record<string, number> = {};
    for (let i = 0; i < allFields.length; i++) {
      const f = allFields[i];
      m[f] = metricsAccumulation.get(f)?.[node.id] || 0;
    }
    const pruned: PrunedTreemapNode = {
      name: node.name,
      id: node.id,
      area: areaById[node.id] || 0,
      color: colorById[node.id] || 0,
      clickable: hasVisibleChildren(treeIndex, node, mask),
      metrics: m,
    };
    if (expandedSet.has(node)) {
      const children = ensureChildren(treeIndex, node);
      if (children) {
        const out: PrunedTreemapNode[] = [];
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          if (mask && flags && (flags[c.id] & mask) !== 0) continue;
          const area = areaById[c.id] || 0;
          if (area <= 0 && !expandedSet.has(c)) continue;
          out.push(toPruned(c));
        }
        pruned.children = out;
      }
    }
    return pruned;
  };

  return toPruned(treeIndex.root);
}

function computeHistoryForField(
  repo: string,
  treeIndex: TreeIndex,
  metrics: Record<string, MetricStore>,
  numDates: number,
  field: string,
  pathArr: string[],
  mask: number,
): number[] {
  if (numDates === 0) return [];
  const dirNode = getTreeNodeFromPath(treeIndex, pathArr, mask);
  const cacheKey = `${repo}|${field}|${dirNode.id}|${mask}|${numDates}`;
  const cached = historySeriesCache.get(cacheKey);
  if (cached) return cached;

  const store = metrics[field];
  if (!store) return new Array(numDates).fill(0);

  if (mask) ensureExcludeFlags(treeIndex);
  const flags = treeIndex.excludeFlags;
  const diff = new Float64Array(numDates);

  if (store.kind === "compact" && store.rows) {
    const rows = store.rows;
    const startId = dirNode.id;
    const endId = dirNode.subtreeEnd;
    let id = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      id += row[0];
      if (id < startId) continue;
      if (id >= endId) break;
      if (mask && flags && (flags[id] & mask) !== 0) continue;
      let d = 0;
      for (let i = 1; i < row.length; i += 2) {
        d += row[i];
        if (d < numDates) diff[d] += row[i + 1];
      }
    }
  } else if (store.kind === "legacy" && store.legacy) {
    const legacy = store.legacy;
    const walk = (entry: InternalTreeNode) => {
      if (mask && flags && (flags[entry.id] & mask) !== 0) return;
      for (const child of entry.children || []) walk(child);
      const h = legacy[entry.id];
      if (!h) return;
      let prev = 0;
      for (let i = 0; i < h.length; i++) {
        const d = h[i][0];
        const v = h[i][1];
        if (d < numDates) {
          diff[d] += v - prev;
          prev = v;
        }
      }
    };
    walk(dirNode);
  }

  const values = new Array<number>(numDates);
  let sum = 0;
  for (let d = 0; d < numDates; d++) {
    sum += diff[d];
    values[d] = sum;
  }

  if (historySeriesCache.size > 200) historySeriesCache.clear();
  historySeriesCache.set(cacheKey, values);
  return values;
}

async function ensureFullState(
  repo: string,
  fieldSize: string[],
  fieldColor: string[],
  extraFields: string[],
  dateEndMs: number,
  excludeMask: number,
) {
  const datesMs = await getDatesMs(repo);
  const treeIdx = await getFullTreeIndex(repo);
  if (!treeIdx) return null;

  const allFields = Array.from(new Set([...fieldSize, ...fieldColor, ...extraFields].filter(Boolean)));
  const metricsMap: Record<string, MetricStore> = {};
  await Promise.all(allFields.map(async (f) => {
    const store = await getFullMetric(repo, f, treeIdx.isCompact);
    if (store) metricsMap[f] = store;
  }));

  const dateId = datesMs.length ? formatDateIdx(datesMs, dateEndMs) : 0;
  const scopeKey = `full|${repo}|${dateId}|${excludeMask}`;
  accumulateFields(scopeKey, treeIdx, metricsMap, dateId, excludeMask, fieldSize, fieldColor);

  return { treeIdx, datesMs, metricsMap, dateId, allFields };
}

async function processMessage(msg: any) {
  const { id, type } = msg;

  try {
    if (type === "query") {
      const {
        repo,
        mode,
        fieldColor = [],
        fieldSize = [],
        historyFields = [],
        dateEndMs = Date.now(),
        excludeMask = 0,
        pathsToExpand = null,
        path = [],
      } = msg;

      if (mode === "latest") {
        if (resolvedFullTreeRepos.has(repo)) {
          self.postMessage({ id, result: { ok: false } });
          return;
        }
        const datesMs = await getDatesMs(repo);
        if (datesMs.length === 0 || formatDateIdx(datesMs, dateEndMs) !== datesMs.length - 1) {
          self.postMessage({ id, result: { ok: false } });
          return;
        }
        const treeIdx = await getLatestTreeIndex(repo);
        if (!treeIdx) {
          self.postMessage({ id, result: { ok: false } });
          return;
        }
        const allFields = Array.from(new Set([...fieldSize, ...fieldColor].filter(Boolean)));
        const metricsMap: Record<string, MetricStore> = {};
        await Promise.all(allFields.map(async (f) => {
          const store = await getLatestMetric(repo, f);
          if (store) metricsMap[f] = store;
        }));

        // Start prefetching full tree and metrics in the worker right away.
        getFullTreeIndex(repo).catch(() => {});
        for (const f of allFields) getFullMetric(repo, f, true).catch(() => {});

        const dateId = datesMs.length - 1;
        const scopeKey = `latest|${repo}|${dateId}|${excludeMask}`;
        accumulateFields(scopeKey, treeIdx, metricsMap, dateId, excludeMask, fieldSize, fieldColor);

        const root = pathsToExpand
          ? buildPrunedSubtree(treeIdx, pathsToExpand, excludeMask, allFields)
          : null;
        self.postMessage({
          id,
          result: { ok: true, datesMs, dateId, root, historySeries: {} },
        });
        return;
      }

      const state = await ensureFullState(repo, fieldSize, fieldColor, historyFields, dateEndMs, excludeMask);
      if (!state) {
        self.postMessage({ id, result: { ok: false } });
        return;
      }
      const { treeIdx, datesMs, metricsMap, dateId, allFields } = state;
      const root = pathsToExpand
        ? buildPrunedSubtree(treeIdx, pathsToExpand, excludeMask, allFields)
        : null;
      const historySeries: Record<string, number[]> = {};
      for (const f of historyFields) {
        historySeries[f] = computeHistoryForField(repo, treeIdx, metricsMap, datesMs.length, f, path, excludeMask);
      }
      self.postMessage({
        id,
        result: { ok: true, datesMs, dateId, root, historySeries },
      });
      return;
    }

    if (type === "download") {
      const { repo, kind, fieldSize = [], fieldColor = [], path = [], excludeMask = 0, dateEndMs = Date.now() } = msg;
      const fields = [...new Set([...fieldSize, ...fieldColor].filter(Boolean))];
      const state = await ensureFullState(repo, fieldSize, fieldColor, [], dateEndMs, excludeMask);
      if (!state) {
        self.postMessage({ id, result: null });
        return;
      }
      const { treeIdx, datesMs, metricsMap } = state;

      if (kind === "temporal_json") {
        const out = fields.map((field: string) => {
          const series = computeHistoryForField(repo, treeIdx, metricsMap, datesMs.length, field, path, excludeMask);
          return {
            metric: field,
            values: series.map((count, i) => ({
              date: new Date(datesMs[i]).toISOString(),
              count,
            })),
          };
        });
        self.postMessage({
          id,
          result: { content: JSON.stringify(out, null, 2), filename: "temporal.json", contentType: "application/json" },
        });
        return;
      }

      if (kind === "temporal_csv") {
        const seriesByField = fields.map((field: string) =>
          computeHistoryForField(repo, treeIdx, metricsMap, datesMs.length, field, path, excludeMask),
        );
        let out = "date," + fields.join(",") + "\n";
        for (let i = 0; i < datesMs.length; i++) {
          const row: (string | number)[] = [new Date(datesMs[i]).toISOString().split("T")[0]];
          for (let f = 0; f < fields.length; f++) row.push(seriesByField[f][i]);
          out += row.join(",") + "\n";
        }
        self.postMessage({
          id,
          result: { content: out, filename: "temporal.csv", contentType: "text/csv" },
        });
        return;
      }

      const startNode = getTreeNodeFromPath(treeIdx, path, excludeMask);
      if (kind === "spatial_json") {
        const get = (file: InternalTreeNode): any => {
          if (isExcluded(treeIdx, file.id, excludeMask)) return null;
          const out: any = {};
          let allZero = true;
          for (const field of fields) {
            const v = metricsAccumulation.get(field)?.[file.id] || 0;
            out[field] = v;
            if (v !== 0) allZero = false;
          }
          if (allZero) return null;
          const children = ensureChildren(treeIdx, file);
          if (children) {
            out.children = {};
            for (const child of children) {
              const childOut = get(child);
              if (childOut) out.children[child.name] = childOut;
            }
            if (Object.keys(out.children).length === 0) delete out.children;
          }
          return out;
        };
        self.postMessage({
          id,
          result: { content: JSON.stringify(get(startNode), null, 2), filename: "spatial.json", contentType: "application/json" },
        });
        return;
      }

      if (kind === "spatial_csv") {
        let out = "path," + fields.join(",") + "\n";
        const get = (file: InternalTreeNode, p: string[]) => {
          if (isExcluded(treeIdx, file.id, excludeMask)) return;
          const row: (string | number)[] = [p.join("/") || "/"];
          let allZero = true;
          for (const field of fields) {
            const value = metricsAccumulation.get(field)?.[file.id] || 0;
            row.push(value);
            if (value !== 0) allZero = false;
          }
          if (!allZero) out += row.join(",") + "\n";
          const children = ensureChildren(treeIdx, file);
          for (const child of children || []) {
            get(child, p.concat([child.name]));
          }
        };
        get(startNode, path || []);
        self.postMessage({
          id,
          result: { content: out, filename: "spatial.csv", contentType: "text/csv" },
        });
        return;
      }
    }

    self.postMessage({ id, result: null });
  } catch (err: any) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
}

let messageQueue = Promise.resolve();

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  messageQueue = messageQueue.then(() => processMessage(msg));
};
