// Offline Chromium DIR_METADATA + Cross-Dataset Joiner.
//
// Parses all DIR_METADATA and COMMON_METADATA files in a Chromium checkout,
// resolves mixins and directory-tree inheritance, and joins Component-space
// and Team-space against CommitTracker's static datasets in public/:
//   - public/cve/data.json (CVEs, VRP rewards, severities, CWEs)
//   - public/fuzz-test/data.json (FUZZ_TEST & libFuzzer targets)
//   - public/treemap/chromium/ (files, LoC, language mix, memory-safety & debt)
//   - public/commit_rates/chromium/ (2,048 hash buckets of weekly velocity)
//   - public/accretion/chromium/directories.json (code age, churn, bus factor)
//
// Emits: public/data/chromium/components.json (<800 KB compact format)
//
// Usage:
//   node importer/dir_metadata.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CHROMIUM_DIR = process.env.CHROMIUM_DIR || path.join(__dirname, 'chromium');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(REPO_ROOT, 'public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'data', 'chromium', 'components.json');

const CONFIG_START_DATE = new Date('2018-01-01T00:00:00Z');
const CVE_START_YEAR = 2016;
const CVE_END_YEAR = 2026;

// Known Chromium components whose primary source lives in a separate git
// submodule tracked independently by CommitTracker.
const SUBMODULE_COMPONENTS = {
  'Blink>JavaScript': { repo: 'v8', label: 'V8 JavaScript Engine' },
  'Blink>JavaScript>Compiler': { repo: 'v8', label: 'V8 Compiler (TurboFan / Maglev)' },
  'Blink>JavaScript>Runtime': { repo: 'v8', label: 'V8 Runtime' },
  'Blink>JavaScript>GarbageCollection': { repo: 'v8', label: 'V8 Garbage Collector' },
  'Blink>JavaScript>WebAssembly': { repo: 'v8', label: 'V8 WebAssembly' },
  'Blink>JavaScript>API': { repo: 'v8', label: 'V8 API' },
  'Blink>JavaScript>Internationalization': { repo: 'v8', label: 'V8 Intl' },
  'Internals>GPU>ANGLE': { repo: 'angle', label: 'ANGLE Graphics Layer' },
  'Internals>GPU>Dawn': { repo: 'dawn', label: 'Dawn WebGPU' },
  'Internals>Skia': { repo: 'skia', label: 'Skia 2D Graphics' },
  'Blink>WebRTC': { repo: 'webrtc', label: 'WebRTC' },
  'Internals>Plugins>PDF': { repo: 'pdfium', label: 'PDFium' },
};

function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function stripComments(text) {
  return text
    .split('\n')
    .map((line) => {
      let inStr = false;
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i - 1] !== '\\') inStr = !inStr;
        if (ch === '#' && !inStr) break;
        out += ch;
      }
      return out;
    })
    .join('\n');
}

function stripNamedBlocks(src, blockName) {
  const re = new RegExp(`\\b${blockName}\\s*:?\\s*\\{`, 'g');
  let out = '';
  let last = 0;
  let match;
  while ((match = re.exec(src)) !== null) {
    out += src.slice(last, match.index);
    let depth = 1;
    let idx = match.index + match[0].length;
    while (idx < src.length && depth > 0) {
      if (src[idx] === '{') depth++;
      else if (src[idx] === '}') depth--;
      idx++;
    }
    last = idx;
    re.lastIndex = idx;
  }
  out += src.slice(last);
  return out;
}

function extractBlock(src, blockName) {
  const re = new RegExp(`\\b${blockName}\\s*:?\\s*\\{`);
  const match = re.exec(src);
  if (!match) return null;
  let depth = 1;
  let idx = match.index + match[0].length;
  const start = idx;
  while (idx < src.length && depth > 0) {
    if (src[idx] === '{') depth++;
    else if (src[idx] === '}') depth--;
    idx++;
  }
  return src.slice(start, idx - 1);
}

function parseMetadataTextProto(text) {
  const cleaned = stripComments(text);
  const top = stripNamedBlocks(cleaned, 'overrides');

  const res = { mixins: [] };
  for (const m of top.matchAll(/\bmixins\s*:\s*"([^"]+)"/g)) {
    res.mixins.push(m[1].trim());
  }

  const teamMatch = top.match(/(?:^|\s)team_email\s*:\s*"([^"]+)"/);
  if (teamMatch) res.team_email = teamMatch[1].trim().toLowerCase();

  const osMatch = top.match(/(?:^|\s)os\s*:\s*([A-Z0-9_]+)/);
  if (osMatch) res.os = osMatch[1].trim();

  const mono = extractBlock(top, 'monorail');
  if (mono) {
    const cm = mono.match(/\bcomponent\s*:\s*"([^"]+)"/);
    if (cm) res.component = cm[1].trim();
    const pm = mono.match(/\bproject\s*:\s*"([^"]+)"/);
    if (pm) res.project = pm[1].trim();
  }

  const bugPub = extractBlock(top, 'buganizer_public');
  if (bugPub) {
    const idm = bugPub.match(/\bcomponent_id\s*:\s*(\d+)/);
    if (idm) res.buganizer_public_id = Number(idm[1]);
  }

  const bugPriv = extractBlock(top, 'buganizer');
  if (bugPriv) {
    const idm = bugPriv.match(/\bcomponent_id\s*:\s*(\d+)/);
    if (idm) res.buganizer_id = Number(idm[1]);
  }

  return res;
}

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

function classifyLangByExt(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.mojom')) return 'mojom';
  if (lower.endsWith('.java') || lower.endsWith('.kt')) return 'javaKt';
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx')
  ) {
    return 'jsTs';
  }
  if (
    lower.endsWith('.c') ||
    lower.endsWith('.cc') ||
    lower.endsWith('.cpp') ||
    lower.endsWith('.cxx') ||
    lower.endsWith('.h') ||
    lower.endsWith('.hh') ||
    lower.endsWith('.hpp') ||
    lower.endsWith('.hxx') ||
    lower.endsWith('.mm') ||
    lower.endsWith('.m') ||
    lower.endsWith('.inc')
  ) {
    return 'cpp';
  }
  return 'other';
}

function nearestResolvedDir(dirPath, resolvedMap) {
  let cur = dirPath || '.';
  while (true) {
    if (resolvedMap.has(cur)) return cur;
    if (cur === '.' || cur === '') return resolvedMap.has('.') ? '.' : null;
    const parent = path.posix.dirname(cur);
    cur = parent === '/' ? '.' : parent;
  }
}

function formatUsd(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

async function main() {
  const tStart = Date.now();
  console.log(`[dir_metadata] Scanning Chromium checkout: ${CHROMIUM_DIR}`);

  if (!fs.existsSync(CHROMIUM_DIR)) {
    throw new Error(`Chromium checkout not found at ${CHROMIUM_DIR}`);
  }

  // ---------------------------------------------------------------------------
  // 1. Discover & parse all DIR_METADATA + resolve COMMON_METADATA mixins
  // ---------------------------------------------------------------------------
  const dirMetaFiles = new Map();
  function walkChromium(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkChromium(full);
      } else if (entry.name === 'DIR_METADATA') {
        const relDir = path.relative(CHROMIUM_DIR, dir).replace(/\\/g, '/') || '.';
        dirMetaFiles.set(relDir, full);
      }
    }
  }
  walkChromium(CHROMIUM_DIR);

  const mixinCache = new Map();
  let totalMixinEdges = 0;

  function resolveMixin(mixinRef, stack = new Set()) {
    if (mixinCache.has(mixinRef)) return mixinCache.get(mixinRef);
    if (stack.has(mixinRef)) return {};
    stack.add(mixinRef);
    const relPath = mixinRef.replace(/^\/\//, '');
    const fullPath = path.join(CHROMIUM_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[dir_metadata] Missing mixin file: ${mixinRef}`);
      mixinCache.set(mixinRef, {});
      return {};
    }
    const parsed = parseMetadataTextProto(fs.readFileSync(fullPath, 'utf8'));
    let merged = {};
    for (const sub of parsed.mixins) {
      totalMixinEdges++;
      merged = { ...merged, ...resolveMixin(sub, stack) };
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (k !== 'mixins' && v !== undefined) merged[k] = v;
    }
    mixinCache.set(mixinRef, merged);
    return merged;
  }

  const sortedMetaDirs = [...dirMetaFiles.keys()].sort((a, b) => {
    if (a === '.') return -1;
    if (b === '.') return 1;
    const da = a.split('/').length;
    const db = b.split('/').length;
    return da !== db ? da - db : a.localeCompare(b);
  });

  const resolvedDirs = new Map();
  for (const dir of sortedMetaDirs) {
    const parsed = parseMetadataTextProto(fs.readFileSync(dirMetaFiles.get(dir), 'utf8'));
    totalMixinEdges += parsed.mixins.length;

    let inherited = {};
    if (dir !== '.') {
      const parentDir = path.posix.dirname(dir);
      const ancDir = nearestResolvedDir(parentDir === '/' ? '.' : parentDir, resolvedDirs);
      if (ancDir && resolvedDirs.has(ancDir)) {
        inherited = { ...resolvedDirs.get(ancDir) };
      }
    }

    let fromMixins = {};
    for (const mx of parsed.mixins) {
      fromMixins = { ...fromMixins, ...resolveMixin(mx) };
    }

    const own = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k !== 'mixins' && v !== undefined) own[k] = v;
    }

    resolvedDirs.set(dir, { ...inherited, ...fromMixins, ...own });
  }

  // Backfill Buganizer-only DIR_METADATA entries that share a Buganizer component_id
  // with an existing named Monorail component.
  const bugPublicToComponent = new Map();
  const bugPrivateToComponent = new Map();
  for (const meta of resolvedDirs.values()) {
    if (meta.component) {
      if (meta.buganizer_public_id && !bugPublicToComponent.has(meta.buganizer_public_id)) {
        bugPublicToComponent.set(meta.buganizer_public_id, meta.component);
      }
      if (meta.buganizer_id && !bugPrivateToComponent.has(meta.buganizer_id)) {
        bugPrivateToComponent.set(meta.buganizer_id, meta.component);
      }
    }
  }

  let backfilledViaBuganizer = 0;
  let synthesizedBuganizerOnly = 0;
  for (const [, meta] of resolvedDirs.entries()) {
    if (!meta.component) {
      const mapped =
        (meta.buganizer_public_id && bugPublicToComponent.get(meta.buganizer_public_id)) ||
        (meta.buganizer_id && bugPrivateToComponent.get(meta.buganizer_id));
      if (mapped) {
        meta.component = mapped;
        backfilledViaBuganizer++;
      } else if (meta.buganizer_public_id || meta.buganizer_id) {
        const id = meta.buganizer_public_id || meta.buganizer_id;
        meta.component = `Buganizer>${id}`;
        meta.buganizerOnly = true;
        synthesizedBuganizerOnly++;
      }
    }
  }

  for (const dir of sortedMetaDirs) {
    if (dir === '.') continue;
    const meta = resolvedDirs.get(dir);
    if (!meta.component) {
      const parentDir = path.posix.dirname(dir);
      const ancDir = nearestResolvedDir(parentDir === '/' ? '.' : parentDir, resolvedDirs);
      if (ancDir && resolvedDirs.get(ancDir)?.component) {
        meta.component = resolvedDirs.get(ancDir).component;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Initialize Component & Team accumulators
  // ---------------------------------------------------------------------------
  const componentsMap = new Map();
  const teamsMap = new Map();

  function createCodeStats() {
    return {
      files: 0,
      lines: 0,
      langs: { cpp: 0, rust: 0, jsTs: 0, javaKt: 0, mojom: 0, other: 0 },
      rawPtr: 0,
      rawRef: 0,
      dangling: 0,
      unsafeBuffers: 0,
      unsafeBufferLines: 0,
      unsafeLibc: 0,
      unsafeTodo: 0,
      disabledTests: 0,
      tests: 0,
      todos: 0,
    };
  }

  function createCveStats() {
    return {
      total: 0,
      recent24m: 0,
      vrpTotal: 0,
      vrpRecent24m: 0,
      vrpCount: 0,
      vrpMax: 0,
      severities: [0, 0, 0, 0], // [Critical, High, Medium, Low]
      cweMap: new Map(),
      byYear: Array.from({ length: CVE_END_YEAR - CVE_START_YEAR + 1 }, () => [0, 0]),
    };
  }

  function ensureComponent(name, inDirMetadata = true) {
    if (!componentsMap.has(name)) {
      componentsMap.set(name, {
        name,
        inDirMetadata,
        submodule: SUBMODULE_COMPONENTS[name] || null,
        teamFileWeights: new Map(),
        teamsSet: new Set(),
        osSet: new Set(),
        bugPublicSet: new Set(),
        bugPrivateSet: new Set(),
        dirMetaDirs: [],
        minimalRoots: [],
        ownedTreemapDirs: 0,
        code: createCodeStats(),
        fuzzers: [],
        cves: createCveStats(),
        weeklyCommits: [],
        accretionDirs: [],
      });
    } else if (inDirMetadata) {
      componentsMap.get(name).inDirMetadata = true;
    }
    return componentsMap.get(name);
  }

  function ensureTeam(email) {
    if (!teamsMap.has(email)) {
      teamsMap.set(email, {
        email,
        componentsSet: new Set(),
        componentFileWeights: new Map(),
        osSet: new Set(),
        bugPublicSet: new Set(),
        bugPrivateSet: new Set(),
        dirMetaDirs: [],
        minimalRoots: [],
        ownedTreemapDirs: 0,
        code: createCodeStats(),
        fuzzers: [],
        cves: createCveStats(),
        seenCveIds: new Set(),
        weeklyCommits: [],
        accretionDirs: [],
      });
    }
    return teamsMap.get(email);
  }

  for (const dir of sortedMetaDirs) {
    const meta = resolvedDirs.get(dir);
    const parentAncDir =
      dir === '.'
        ? null
        : nearestResolvedDir(
            path.posix.dirname(dir) === '/' ? '.' : path.posix.dirname(dir),
            resolvedDirs,
          );
    const parentMeta = parentAncDir ? resolvedDirs.get(parentAncDir) : null;

    if (meta.component) {
      const comp = ensureComponent(meta.component, true);
      comp.dirMetaDirs.push(dir);
      if (!parentMeta || parentMeta.component !== meta.component) {
        comp.minimalRoots.push(dir);
      }
      if (meta.team_email) comp.teamsSet.add(meta.team_email);
      if (meta.os) comp.osSet.add(meta.os);
      if (meta.buganizer_public_id) comp.bugPublicSet.add(meta.buganizer_public_id);
      if (meta.buganizer_id) comp.bugPrivateSet.add(meta.buganizer_id);
    }

    if (meta.team_email) {
      const team = ensureTeam(meta.team_email);
      team.dirMetaDirs.push(dir);
      if (!parentMeta || parentMeta.team_email !== meta.team_email) {
        team.minimalRoots.push(dir);
      }
      if (meta.component) team.componentsSet.add(meta.component);
      if (meta.os) team.osSet.add(meta.os);
      if (meta.buganizer_public_id) team.bugPublicSet.add(meta.buganizer_public_id);
      if (meta.buganizer_id) team.bugPrivateSet.add(meta.buganizer_id);
    }
  }

  const rootStats = new Map();
  function getRootStat(dir) {
    let s = rootStats.get(dir);
    if (!s) {
      s = { lines: 0, files: 0, commits12m: 0, fuzzers: 0 };
      rootStats.set(dir, s);
    }
    return s;
  }

  function findMinimalComponentRoot(dir, componentName) {
    let cur = dir;
    let best = dir;
    while (cur !== '.' && cur !== '') {
      const parent = path.posix.dirname(cur) === '/' ? '.' : path.posix.dirname(cur);
      const anc = nearestResolvedDir(parent, resolvedDirs);
      if (anc && resolvedDirs.get(anc)?.component === componentName) {
        best = anc;
        cur = anc;
      } else {
        break;
      }
    }
    return best;
  }

  function findMinimalTeamRoot(dir, teamEmail) {
    let cur = dir;
    let best = dir;
    while (cur !== '.' && cur !== '') {
      const parent = path.posix.dirname(cur) === '/' ? '.' : path.posix.dirname(cur);
      const anc = nearestResolvedDir(parent, resolvedDirs);
      if (anc && resolvedDirs.get(anc)?.team_email === teamEmail) {
        best = anc;
        cur = anc;
      } else {
        break;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // 3. Join Treemap Code & Safety Metrics (public/treemap/chromium/*.latest.json)
  // ---------------------------------------------------------------------------
  console.log('[dir_metadata] Joining treemap latest snapshot...');
  const treemapDir = path.join(PUBLIC_DIR, 'treemap', 'chromium');
  const latestTree = JSON.parse(
    fs.readFileSync(path.join(treemapDir, 'file_index.latest.json'), 'utf8'),
  );

  const leafNodeMeta = new Map();
  let nextLatestId = 0;

  const depth3TotalLines = new Map();
  const depth3CompLines = new Map();
  const depth3TeamLines = new Map();

  function walkTreemapNode(node, currentDir) {
    const id = nextLatestId++;
    if (Array.isArray(node)) {
      const name = node[0];
      const nextDir =
        name === '/' || name === ''
          ? '.'
          : currentDir === '.'
            ? name
            : `${currentDir}/${name}`;

      if (nextDir !== '.') {
        const anc = nearestResolvedDir(nextDir, resolvedDirs);
        const meta = anc ? resolvedDirs.get(anc) : null;
        if (meta?.component) ensureComponent(meta.component).ownedTreemapDirs++;
        if (meta?.team_email) ensureTeam(meta.team_email).ownedTreemapDirs++;
      }

      for (let i = 1; i < node.length; i++) {
        walkTreemapNode(node[i], nextDir);
      }
    } else {
      const filename = node;
      const anc = nearestResolvedDir(currentDir, resolvedDirs);
      const meta = anc ? resolvedDirs.get(anc) : null;
      const lang = classifyLangByExt(filename);

      const parts = currentDir === '.' ? [] : currentDir.split('/');
      const prefixes = [];
      for (let d = 1; d <= Math.min(3, parts.length); d++) {
        prefixes.push(parts.slice(0, d).join('/'));
      }

      leafNodeMeta.set(id, {
        metaDir: anc,
        meta,
        lang,
        compRoot: meta?.component ? findMinimalComponentRoot(anc, meta.component) : null,
        teamRoot: meta?.team_email ? findMinimalTeamRoot(anc, meta.team_email) : null,
        prefixes,
      });
    }
  }
  walkTreemapNode(latestTree, '.');

  function loadLatestMetricMap(metricName) {
    const file = path.join(treemapDir, 'metrics', `${metricName}.latest.json`);
    if (!fs.existsSync(file)) return new Map();
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = new Map();
    let id = 0;
    for (const [delta, val] of rows) {
      id += delta;
      out.set(id, val);
    }
    return out;
  }

  const metricMaps = {
    file: loadLatestMetricMap('file'),
    line: loadLatestMetricMap('line'),
    rawPtr: loadLatestMetricMap('raw_ptr'),
    rawRef: loadLatestMetricMap('raw_ref'),
    dangling: loadLatestMetricMap('dangling_untriaged'),
    unsafeBuffers: loadLatestMetricMap('unsafe_buffers'),
    unsafeBufferLines: loadLatestMetricMap('lines_unsafe_buffer_usage'),
    unsafeLibc: loadLatestMetricMap('unsafe_libc'),
    unsafeTodo: loadLatestMetricMap('unsafe_todo'),
    disabledTests: loadLatestMetricMap('disabled_tests'),
    tests: loadLatestMetricMap('tests'),
    todos: loadLatestMetricMap('todo'),
  };

  for (const [id, info] of leafNodeMeta.entries()) {
    const filesVal = metricMaps.file.get(id) || 0;
    const linesVal = metricMaps.line.get(id) || 0;
    const rawPtr = metricMaps.rawPtr.get(id) || 0;
    const rawRef = metricMaps.rawRef.get(id) || 0;
    const dangling = metricMaps.dangling.get(id) || 0;
    const unsafeBuffers = metricMaps.unsafeBuffers.get(id) || 0;
    const unsafeBufferLines = metricMaps.unsafeBufferLines.get(id) || 0;
    const unsafeLibc = metricMaps.unsafeLibc.get(id) || 0;
    const unsafeTodo = metricMaps.unsafeTodo.get(id) || 0;
    const disabledTests = metricMaps.disabledTests.get(id) || 0;
    const tests = metricMaps.tests.get(id) || 0;
    const todos = metricMaps.todos.get(id) || 0;

    for (const p of info.prefixes) {
      depth3TotalLines.set(p, (depth3TotalLines.get(p) || 0) + linesVal);
      if (info.meta?.component) {
        const k = `${p}\0${info.meta.component}`;
        depth3CompLines.set(k, (depth3CompLines.get(k) || 0) + linesVal);
      }
      if (info.meta?.team_email) {
        const tk = `${p}\0${info.meta.team_email}`;
        depth3TeamLines.set(tk, (depth3TeamLines.get(tk) || 0) + linesVal);
      }
    }

    if (info.compRoot) {
      const rs = getRootStat(info.compRoot);
      rs.files += filesVal;
      rs.lines += linesVal;
    }
    if (info.teamRoot && info.teamRoot !== info.compRoot) {
      const trs = getRootStat(info.teamRoot);
      trs.files += filesVal;
      trs.lines += linesVal;
    }

    const targets = [];
    if (info.meta?.component) {
      const comp = ensureComponent(info.meta.component);
      targets.push(comp.code);
      if (info.meta.team_email) {
        comp.teamFileWeights.set(
          info.meta.team_email,
          (comp.teamFileWeights.get(info.meta.team_email) || 0) + linesVal,
        );
      }
    }
    if (info.meta?.team_email) {
      const team = ensureTeam(info.meta.team_email);
      targets.push(team.code);
      if (info.meta.component) {
        team.componentFileWeights.set(
          info.meta.component,
          (team.componentFileWeights.get(info.meta.component) || 0) + linesVal,
        );
      }
    }

    for (const code of targets) {
      code.files += filesVal;
      code.lines += linesVal;
      code.langs[info.lang] += linesVal;
      code.rawPtr += rawPtr;
      code.rawRef += rawRef;
      code.dangling += dangling;
      code.unsafeBuffers += unsafeBuffers;
      code.unsafeBufferLines += unsafeBufferLines;
      code.unsafeLibc += unsafeLibc;
      code.unsafeTodo += unsafeTodo;
      code.disabledTests += disabledTests;
      code.tests += tests;
      code.todos += todos;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Join Fuzzers (public/fuzz-test/data.json)
  // ---------------------------------------------------------------------------
  console.log('[dir_metadata] Joining fuzzers...');
  const fuzzRaw = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'fuzz-test', 'data.json'), 'utf8'),
  );
  const allFuzzers = Array.isArray(fuzzRaw) ? fuzzRaw : Object.values(fuzzRaw);

  let matchedFuzzers = 0;
  for (const fz of allFuzzers) {
    if (!fz?.file) continue;
    const fzDir = path.posix.dirname(fz.file) === '/' ? '.' : path.posix.dirname(fz.file);
    const anc = nearestResolvedDir(fzDir, resolvedDirs);
    const meta = anc ? resolvedDirs.get(anc) : null;
    if (!meta) continue;

    // [suiteOrFn, file, line, isFuzzTest(1|0)]
    const compactFuzzer = [
      fz.suite_name || fz.function || path.posix.basename(fz.file),
      fz.file,
      fz.line || 1,
      fz.type === 'FUZZ_TEST' ? 1 : 0,
    ];

    if (meta.component) {
      matchedFuzzers++;
      const comp = ensureComponent(meta.component);
      comp.fuzzers.push(compactFuzzer);
      const cRoot = findMinimalComponentRoot(anc, meta.component);
      getRootStat(cRoot).fuzzers++;
    }
    if (meta.team_email) {
      const team = ensureTeam(meta.team_email);
      team.fuzzers.push(compactFuzzer);
      const tRoot = findMinimalTeamRoot(anc, meta.team_email);
      if (tRoot !== (meta.component ? findMinimalComponentRoot(anc, meta.component) : null)) {
        getRootStat(tRoot).fuzzers++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Join CVEs & VRP Rewards (public/cve/data.json)
  // ---------------------------------------------------------------------------
  console.log('[dir_metadata] Joining CVEs & VRP rewards...');
  const cvesRaw = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'cve', 'data.json'), 'utf8'),
  );
  const cveList = Array.isArray(cvesRaw) ? cvesRaw : Object.values(cvesRaw);

  let maxCveTs = 0;
  for (const cve of cveList) {
    const t = Date.parse(cve.published || cve.bug_date || '');
    if (!Number.isNaN(t) && t > maxCveTs) maxCveTs = t;
  }
  const cutoff24mTs = maxCveTs - 730 * 24 * 60 * 60 * 1000;

  function addCveToStats(stats, cve, reward, isRecent24m, yearIdx) {
    stats.total++;
    if (isRecent24m) stats.recent24m++;
    if (reward > 0) {
      stats.vrpTotal += reward;
      stats.vrpCount++;
      if (reward > stats.vrpMax) stats.vrpMax = reward;
      if (isRecent24m) stats.vrpRecent24m += reward;
    }
    const sev = cve.severity;
    if (sev === 'Critical') stats.severities[0]++;
    else if (sev === 'High') stats.severities[1]++;
    else if (sev === 'Medium') stats.severities[2]++;
    else if (sev === 'Low') stats.severities[3]++;

    if (cve.cweId) {
      const prev = stats.cweMap.get(cve.cweId) || [0, 0];
      prev[0]++;
      prev[1] += reward;
      stats.cweMap.set(cve.cweId, prev);
    }
    if (yearIdx >= 0 && yearIdx < stats.byYear.length) {
      stats.byYear[yearIdx][0]++;
      stats.byYear[yearIdx][1] += reward;
    }
  }

  const rawCveCountsByComp = new Map();
  for (const cve of cveList) {
    if (!cve?.id || !Array.isArray(cve.components)) continue;
    const decodedSet = new Set(cve.components.map(decodeHtmlEntities).filter(Boolean));
    for (const compName of decodedSet) {
      rawCveCountsByComp.set(compName, (rawCveCountsByComp.get(compName) || 0) + 1);
    }
  }

  const dirMetaComponentNames = [...componentsMap.keys()];
  for (const subName of Object.keys(SUBMODULE_COMPONENTS)) {
    if (!componentsMap.has(subName) && (rawCveCountsByComp.get(subName) || 0) > 0) {
      ensureComponent(subName, false);
    }
  }
  for (const [compName, cnt] of rawCveCountsByComp.entries()) {
    if (!componentsMap.has(compName)) {
      const hasDirMetaChild = dirMetaComponentNames.some((c) => c.startsWith(compName + '>'));
      if (hasDirMetaChild || cnt >= 15) {
        ensureComponent(compName, false);
      }
    }
  }

  let matchedCveLinks = 0;
  for (const cve of cveList) {
    if (!cve?.id || !Array.isArray(cve.components)) continue;
    const reward = Number(cve.vrp_reward) > 0 ? Number(cve.vrp_reward) : 0;
    const ts = Date.parse(cve.published || cve.bug_date || '');
    const isRecent24m = !Number.isNaN(ts) && ts >= cutoff24mTs;
    const pubYear = Number((cve.published || cve.bug_date || '').slice(0, 4));
    const yearIdx = !Number.isNaN(pubYear) ? pubYear - CVE_START_YEAR : -1;

    const decodedSet = new Set(cve.components.map(decodeHtmlEntities).filter(Boolean));
    for (const compName of decodedSet) {
      const comp = componentsMap.get(compName);
      if (!comp) continue;
      matchedCveLinks++;
      addCveToStats(comp.cves, cve, reward, isRecent24m, yearIdx);

      for (const teamEmail of comp.teamsSet) {
        const team = teamsMap.get(teamEmail);
        if (team && !team.seenCveIds.has(cve.id)) {
          team.seenCveIds.add(cve.id);
          addCveToStats(team.cves, cve, reward, isRecent24m, yearIdx);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Join Commit Velocity from 2,048 hash buckets (public/commit_rates/chromium)
  // ---------------------------------------------------------------------------
  console.log('[dir_metadata] Loading 2,048 commit_rates hash buckets...');
  const commitRatesDir = path.join(PUBLIC_DIR, 'commit_rates', 'chromium');
  const crRates = new Map();
  const crChildren = new Map();

  function ingestRateBucket(jsonObj) {
    for (const [dirPath, childrenObj] of Object.entries(jsonObj)) {
      let set = crChildren.get(dirPath);
      if (!set) {
        set = new Set();
        crChildren.set(dirPath, set);
      }
      for (const [childName, entry] of Object.entries(childrenObj)) {
        set.add(childName);
        const fullPath =
          dirPath === '.' || dirPath === '' ? childName : `${dirPath}/${childName}`;
        crRates.set(fullPath, decompressRates(entry.r));
      }
    }
  }

  const crFiles = fs.readdirSync(commitRatesDir);
  for (const f of crFiles) {
    if (f === 'buckets.json' || f === 'total.json') continue;
    if (!f.endsWith('.json')) continue;
    ingestRateBucket(JSON.parse(fs.readFileSync(path.join(commitRatesDir, f), 'utf8')));
  }

  const totalWeekly = JSON.parse(
    fs.readFileSync(path.join(commitRatesDir, 'total.json'), 'utf8'),
  );
  const numWeeks = Array.isArray(totalWeekly) ? totalWeekly.length : 0;
  const endFullWeek = Math.max(0, numWeeks - 1);
  const start12m = Math.max(0, endFullWeek - 52);
  const startPrev12m = Math.max(0, start12m - 52);

  const hasCompOverrideBelow = new Set(['.']);
  const hasTeamOverrideBelow = new Set(['.']);

  for (const dir of sortedMetaDirs) {
    if (dir === '.') continue;
    const meta = resolvedDirs.get(dir);
    const parentDir = path.posix.dirname(dir) === '/' ? '.' : path.posix.dirname(dir);
    const ancDir = nearestResolvedDir(parentDir, resolvedDirs);
    const parentMeta = ancDir ? resolvedDirs.get(ancDir) : null;

    if (meta?.component !== parentMeta?.component) {
      let cur = parentDir;
      while (true) {
        hasCompOverrideBelow.add(cur);
        if (cur === '.' || cur === '') break;
        cur = path.posix.dirname(cur) === '/' ? '.' : path.posix.dirname(cur);
      }
    }
    if (meta?.team_email !== parentMeta?.team_email) {
      let cur = parentDir;
      while (true) {
        hasTeamOverrideBelow.add(cur);
        if (cur === '.' || cur === '') break;
        cur = path.posix.dirname(cur) === '/' ? '.' : path.posix.dirname(cur);
      }
    }
  }

  function addWeeklyInto(dest, src) {
    if (!src || src.length === 0) return;
    while (dest.length < src.length) dest.push(0);
    for (let i = 0; i < src.length; i++) {
      dest[i] += src[i];
    }
  }

  function sumWindow(rates, fromIdx, toIdx) {
    if (!rates || rates.length === 0) return 0;
    let sum = 0;
    const hi = Math.min(rates.length, toIdx);
    for (let i = fromIdx; i < hi; i++) sum += rates[i];
    return sum;
  }

  // Bottom-up directory-rate clamped velocity:
  // Stops at pure subtrees (zero overrides below), and for mixed directories
  // clamps each owner's summed child rates by the directory's own deduplicated
  // weekly commit count so multi-file commits inside mixed dirs are never inflated!
  const rootClamped12m = new Map();

  function computeClampedWeeklyByOwner(nodePath, inheritedMetaDir, ownerField, hasOverrideSet, recordRoot12m = false) {
    const ownMetaDir = resolvedDirs.has(nodePath) ? nodePath : inheritedMetaDir;
    const meta = ownMetaDir ? resolvedDirs.get(ownMetaDir) : null;
    const owner = meta ? meta[ownerField] : null;
    const isDir = crChildren.has(nodePath);

    if (!isDir || !hasOverrideSet.has(nodePath)) {
      const out = new Map();
      if (nodePath !== '.' && owner) {
        const r = crRates.get(nodePath);
        if (r && r.length > 0) {
          out.set(owner, r.slice());
          if (recordRoot12m && resolvedDirs.has(nodePath)) {
            rootClamped12m.set(nodePath, sumWindow(r, start12m, endFullWeek));
          }
        }
      }
      return out;
    }

    const agg = new Map();
    const children = crChildren.get(nodePath);
    if (children) {
      for (const childName of children) {
        const childPath = nodePath === '.' ? childName : `${nodePath}/${childName}`;
        const childMap = computeClampedWeeklyByOwner(
          childPath,
          ownMetaDir,
          ownerField,
          hasOverrideSet,
          recordRoot12m,
        );
        for (const [childOwner, childRates] of childMap.entries()) {
          let dest = agg.get(childOwner);
          if (!dest) {
            dest = [];
            agg.set(childOwner, dest);
          }
          addWeeklyInto(dest, childRates);
        }
      }
    }

    const dirRate = nodePath === '.' ? totalWeekly : crRates.get(nodePath);
    if (dirRate && dirRate.length > 0) {
      for (const rates of agg.values()) {
        for (let w = 0; w < rates.length; w++) {
          const cap = w < dirRate.length ? dirRate[w] : 0;
          if (rates[w] > cap) rates[w] = cap;
        }
      }
    }

    if (recordRoot12m && nodePath !== '.' && owner && agg.has(owner) && resolvedDirs.has(nodePath)) {
      rootClamped12m.set(nodePath, sumWindow(agg.get(owner), start12m, endFullWeek));
    }
    return agg;
  }

  const compWeeklyMap = computeClampedWeeklyByOwner(
    '.',
    resolvedDirs.has('.') ? '.' : null,
    'component',
    hasCompOverrideBelow,
    true,
  );
  for (const [compName, rates] of compWeeklyMap.entries()) {
    ensureComponent(compName).weeklyCommits = rates;
  }

  const teamWeeklyMap = computeClampedWeeklyByOwner(
    '.',
    resolvedDirs.has('.') ? '.' : null,
    'team_email',
    hasTeamOverrideBelow,
    false,
  );
  for (const [teamEmail, rates] of teamWeeklyMap.entries()) {
    ensureTeam(teamEmail).weeklyCommits = rates;
  }

  for (const [rootDir, c12m] of rootClamped12m.entries()) {
    getRootStat(rootDir).commits12m = c12m;
  }
  for (const team of teamsMap.values()) {
    for (const r of team.minimalRoots) {
      const rs = getRootStat(r);
      if (rs.commits12m === 0 && crRates.has(r)) {
        rs.commits12m = sumWindow(crRates.get(r), start12m, endFullWeek);
      }
    }
  }

  const weekToQuarterIdx = [];
  const quarterLabels = [];
  const quarterIndexByLabel = new Map();
  for (let w = 0; w < endFullWeek; w++) {
    const d = new Date(CONFIG_START_DATE.getTime() + w * 7 * 24 * 60 * 60 * 1000);
    const yr = d.getUTCFullYear();
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    const label = `${yr}Q${q}`;
    if (!quarterIndexByLabel.has(label)) {
      quarterIndexByLabel.set(label, quarterLabels.length);
      quarterLabels.push(label);
    }
    weekToQuarterIdx[w] = quarterIndexByLabel.get(label);
  }

  function summarizeCommitsTuple(weekly) {
    const limit = Math.min(weekly.length, endFullWeek);
    let all = 0;
    for (let w = 0; w < weekly.length; w++) all += weekly[w] || 0;
    const last12m = sumWindow(weekly, start12m, endFullWeek);
    const prev12m = sumWindow(weekly, startPrev12m, start12m);
    if (all === 0) return [0, 0, 0, []];

    const qSeries = new Array(quarterLabels.length).fill(0);
    for (let w = 0; w < limit; w++) {
      qSeries[weekToQuarterIdx[w]] += weekly[w] || 0;
    }
    return [all, last12m, prev12m, qSeries];
  }

  // ---------------------------------------------------------------------------
  // 7. Join Accretion & Survivorship (public/accretion/chromium/directories.json)
  // ---------------------------------------------------------------------------
  console.log('[dir_metadata] Joining accretion & survivorship...');
  const accretionFile = path.join(PUBLIC_DIR, 'accretion', 'chromium', 'directories.json');
  const accretionRaw = fs.existsSync(accretionFile)
    ? JSON.parse(fs.readFileSync(accretionFile, 'utf8'))
    : [];
  const accretionPathSet = new Set(accretionRaw.map((d) => d.path));

  for (const acc of accretionRaw) {
    const d = acc.path;
    const anc = nearestResolvedDir(d, resolvedDirs);
    const meta = anc ? resolvedDirs.get(anc) : null;
    if (!meta) continue;

    const totalTreemap = depth3TotalLines.get(d) || 0;
    if (meta.component) {
      const compLines = depth3CompLines.get(`${d}\0${meta.component}`) || 0;
      const share = totalTreemap > 0 ? compLines / totalTreemap : 1;
      if (share >= 0.55) {
        ensureComponent(meta.component).accretionDirs.push(acc);
      }
    }
    if (meta.team_email) {
      const tLines = depth3TeamLines.get(`${d}\0${meta.team_email}`) || 0;
      const share = totalTreemap > 0 ? tLines / totalTreemap : 1;
      if (share >= 0.55) {
        ensureTeam(meta.team_email).accretionDirs.push(acc);
      }
    }
  }

  // Returns compact tuple:
  // [lines, recent, yearAgo, reworked, medianAge, reviewedCoverage, busFactor, busFactorReviewed, authors, label, dirs]
  function rollupAccretionTuple(accDirs) {
    if (!accDirs || accDirs.length === 0) return null;
    const sorted = [...accDirs].sort((a, b) => a.path.length - b.path.length);
    const selected = [];
    for (const item of sorted) {
      if (!selected.some((anc) => item.path.startsWith(anc.path + '/'))) {
        selected.push(item);
      }
    }
    let lines = 0;
    let recent = 0;
    let yearAgo = 0;
    let reworked = 0;
    let ageWeighted = 0;
    let revWeighted = 0;
    let maxBusFactor = 0;
    let maxBusFactorReviewed = 0;
    let maxAuthors = 0;
    for (const item of selected) {
      const l = item.lines || 0;
      lines += l;
      recent += item.recent || 0;
      yearAgo += item.year_ago || 0;
      reworked += item.reworked || 0;
      ageWeighted += (item.median_age || 0) * l;
      revWeighted += (item.reviewed_coverage || 0) * l;
      if ((item.bus_factor || 0) > maxBusFactor) maxBusFactor = item.bus_factor;
      if ((item.bus_factor_reviewed || 0) > maxBusFactorReviewed) {
        maxBusFactorReviewed = item.bus_factor_reviewed;
      }
      if ((item.authors || 0) > maxAuthors) maxAuthors = item.authors;
    }
    if (lines === 0) return null;
    const primary = [...selected].sort((a, b) => (b.lines || 0) - (a.lines || 0))[0];
    return [
      lines,
      recent,
      yearAgo,
      reworked,
      Number((ageWeighted / lines).toFixed(1)),
      Number((revWeighted / lines).toFixed(3)),
      maxBusFactor,
      maxBusFactorReviewed,
      maxAuthors,
      primary.label || 'Growing',
      selected.slice(0, 4).map((d) => d.path),
    ];
  }

  function findAccretionDeepLink(dirPath) {
    if (!dirPath || dirPath === '.') return '';
    if (accretionPathSet.has(dirPath)) return dirPath;
    const parts = dirPath.split('/');
    for (let d = Math.min(3, parts.length); d >= 1; d--) {
      const cand = parts.slice(0, d).join('/');
      if (accretionPathSet.has(cand)) return cand;
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // 8. Serialize compact JSON (< 800 KB target)
  // ---------------------------------------------------------------------------
  // Code tuple:
  // [files, lines, cpp, rust, jsTs, javaKt, mojom, other, rawPtr, rawRef, dangling, unsafeBuffers, unsafeBufferLines, unsafeLibc, unsafeTodo, disabledTests, tests, todos]
  function packCode(c) {
    if (c.files === 0 && c.lines === 0) return null;
    return [
      c.files,
      c.lines,
      c.langs.cpp,
      c.langs.rust,
      c.langs.jsTs,
      c.langs.javaKt,
      c.langs.mojom,
      c.langs.other,
      c.rawPtr,
      c.rawRef,
      c.dangling,
      c.unsafeBuffers,
      c.unsafeBufferLines,
      c.unsafeLibc,
      c.unsafeTodo,
      c.disabledTests,
      c.tests,
      c.todos,
    ];
  }

  // CVE tuple (null if total === 0):
  // [total, recent24m, vrpTotal, vrpRecent24m, vrpCount, vrpMax, severities[4], topCwes, byYear]
  function packCves(c) {
    if (c.total === 0) return null;
    const topCwes = [...c.cweMap.entries()]
      .sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1])
      .slice(0, 5)
      .map(([cweId, [count, vrp]]) => [cweId, count, Math.round(vrp)]);
    const byYear = c.byYear.map(([cnt, vrp]) => [cnt, Math.round(vrp)]);
    return [
      c.total,
      c.recent24m,
      Math.round(c.vrpTotal),
      Math.round(c.vrpRecent24m),
      c.vrpCount,
      Math.round(c.vrpMax),
      c.severities,
      topCwes,
      byYear,
    ];
  }

  function packRoots(roots, limit = 12) {
    return [...roots]
      .map((r) => {
        const s = getRootStat(r);
        const acc = findAccretionDeepLink(r);
        return {
          path: r,
          lines: s.lines,
          files: s.files,
          commits12m: s.commits12m,
          fuzzers: s.fuzzers,
          acc: acc === r ? '=' : acc,
        };
      })
      .sort((a, b) => b.lines - a.lines || b.commits12m - a.commits12m || a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((r) => (r.acc ? [r.path, r.lines, r.files, r.commits12m, r.fuzzers, r.acc] : [r.path, r.lines, r.files, r.commits12m, r.fuzzers]));
  }

  function packFuzzers(list, limit = 10) {
    if (!list || list.length === 0) return null;
    const ft = list.filter((f) => f[3] === 1).length;
    return [list.length, ft, list.length - ft, list.slice(0, limit)];
  }

  const serializedComponents = [];
  const richComponentsForLog = [];

  for (const comp of componentsMap.values()) {
    const sortedTeams = [...comp.teamsSet].sort(
      (a, b) => (comp.teamFileWeights.get(b) || 0) - (comp.teamFileWeights.get(a) || 0) || a.localeCompare(b),
    );
    const cm = summarizeCommitsTuple(comp.weeklyCommits);
    const cv = packCves(comp.cves);
    const ac = rollupAccretionTuple(comp.accretionDirs);
    const fz = packFuzzers(comp.fuzzers, 12);

    const compactObj = {
      n: comp.name,
      ...(comp.inDirMetadata ? { dm: 1 } : {}),
      ...(comp.submodule ? { sub: [comp.submodule.repo, comp.submodule.label] } : {}),
      ...(sortedTeams.length ? { t: sortedTeams } : {}),
      ...(comp.osSet.size ? { os: [...comp.osSet].sort() } : {}),
      ...(comp.bugPublicSet.size ? { bp: [...comp.bugPublicSet].sort((a, b) => a - b) } : {}),
      ...(comp.bugPrivateSet.size ? { bi: [...comp.bugPrivateSet].sort((a, b) => a - b) } : {}),
      dc: [comp.dirMetaDirs.length, comp.minimalRoots.length, comp.ownedTreemapDirs],
      ...(comp.minimalRoots.length ? { r: packRoots(comp.minimalRoots, 14) } : {}),
      ...(packCode(comp.code) ? { c: packCode(comp.code) } : {}),
      ...(cm[0] > 0 ? { m: cm } : {}),
      ...(fz ? { f: fz } : {}),
      ...(cv ? { v: cv } : {}),
      ...(ac ? { a: ac } : {}),
    };
    serializedComponents.push(compactObj);

    richComponentsForLog.push({
      name: comp.name,
      inDirMetadata: comp.inDirMetadata,
      submodule: comp.submodule,
      teams: sortedTeams,
      code: comp.code,
      commits: { all: cm[0], last12m: cm[1], prev12m: cm[2] },
      fuzzersCount: comp.fuzzers.length,
      cves: comp.cves,
    });
  }

  serializedComponents.sort(
    (a, b) => (b.c?.[1] || 0) - (a.c?.[1] || 0) || (b.v?.[2] || 0) - (a.v?.[2] || 0) || a.n.localeCompare(b.n),
  );

  const serializedTeams = [];
  for (const team of teamsMap.values()) {
    const sortedComps = [...team.componentsSet].sort(
      (a, b) =>
        (team.componentFileWeights.get(b) || 0) - (team.componentFileWeights.get(a) || 0) ||
        a.localeCompare(b),
    );
    const cm = summarizeCommitsTuple(team.weeklyCommits);
    const cv = packCves(team.cves);
    const ac = rollupAccretionTuple(team.accretionDirs);
    const fz = packFuzzers(team.fuzzers, 10);

    serializedTeams.push({
      e: team.email,
      ...(sortedComps.length ? { cp: sortedComps } : {}),
      ...(team.osSet.size ? { os: [...team.osSet].sort() } : {}),
      ...(team.bugPublicSet.size ? { bp: [...team.bugPublicSet].sort((a, b) => a - b) } : {}),
      ...(team.bugPrivateSet.size ? { bi: [...team.bugPrivateSet].sort((a, b) => a - b) } : {}),
      dc: [team.dirMetaDirs.length, team.minimalRoots.length, team.ownedTreemapDirs],
      ...(team.minimalRoots.length ? { r: packRoots(team.minimalRoots, 14) } : {}),
      ...(packCode(team.code) ? { c: packCode(team.code) } : {}),
      ...(cm[0] > 0 ? { m: cm } : {}),
      ...(fz ? { f: fz } : {}),
      ...(cv ? { v: cv } : {}),
      ...(ac ? { a: ac } : {}),
    });
  }

  serializedTeams.sort(
    (a, b) => (b.c?.[1] || 0) - (a.c?.[1] || 0) || (b.m?.[1] || 0) - (a.m?.[1] || 0) || a.e.localeCompare(b.e),
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    quarterLabels,
    cveStartYear: CVE_START_YEAR,
    cveEndYear: CVE_END_YEAR,
    stats: {
      dirMetadataFiles: dirMetaFiles.size,
      commonMetadataMixins: mixinCache.size,
      mixinEdgesResolved: totalMixinEdges,
      backfilledViaBuganizer,
      synthesizedBuganizerOnly,
      dirMetadataComponents: richComponentsForLog.filter((c) => c.inDirMetadata).length,
      totalComponents: serializedComponents.length,
      uniqueTeams: serializedTeams.length,
      matchedFuzzers,
      totalFuzzers: allFuzzers.length,
      matchedCveLinks,
    },
    components: serializedComponents,
    teams: serializedTeams,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  const jsonStr = JSON.stringify(payload);
  fs.writeFileSync(OUTPUT_FILE, jsonStr);
  const sizeKb = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(1);

  // ---------------------------------------------------------------------------
  // 9. Print Executive Summary Statistics
  // ---------------------------------------------------------------------------
  const dmComps = richComponentsForLog.filter((c) => c.inDirMetadata);
  console.log('\n========================================================================');
  console.log(' CHROMIUM DIR_METADATA + CROSS-DATASET JOIN SUMMARY');
  console.log('========================================================================');
  console.log(`  DIR_METADATA files parsed     : ${dirMetaFiles.size.toLocaleString()}`);
  console.log(`  COMMON_METADATA mixins loaded : ${mixinCache.size.toLocaleString()} (${totalMixinEdges.toLocaleString()} mixin refs resolved)`);
  console.log(`  Buganizer-only dirs resolved  : ${backfilledViaBuganizer} mapped to named components + ${synthesizedBuganizerOnly} standalone`);
  console.log(`  Unique DIR_METADATA components: ${dmComps.length.toLocaleString()} (${serializedComponents.length.toLocaleString()} incl. submodule/CVE components)`);
  console.log(`  Unique team_email owners      : ${serializedTeams.length.toLocaleString()}`);
  console.log(`  Fuzzers mapped to components  : ${matchedFuzzers} / ${allFuzzers.length}`);
  console.log(`  Output file                   : ${OUTPUT_FILE} (${sizeKb} KB)`);
  console.log(`  Elapsed                       : ${((Date.now() - tStart) / 1000).toFixed(2)}s`);

  const topByLoc = [...dmComps].sort((a, b) => b.code.lines - a.code.lines).slice(0, 8);
  console.log('\n--- Top DIR_METADATA Components by Lines of Code ---');
  for (const c of topByLoc) {
    console.log(
      `  ${c.name.padEnd(38)} ${(c.code.lines / 1e6).toFixed(2).padStart(6)}M LoC | ${String(c.code.files).padStart(6)} files | ${String(c.commits.last12m).padStart(5)} commits/12m | ${c.teams[0] || '-'}`,
    );
  }

  const topByCommits = [...dmComps].sort((a, b) => b.commits.last12m - a.commits.last12m).slice(0, 8);
  console.log('\n--- Top DIR_METADATA Components by Trailing 12m Commits ---');
  for (const c of topByCommits) {
    console.log(
      `  ${c.name.padEnd(38)} ${String(c.commits.last12m).padStart(6)} commits/12m | ${String(c.commits.all).padStart(7)} since 2018 | ${(c.code.lines / 1e3).toFixed(0).padStart(6)}k LoC`,
    );
  }

  const topByVrp = [...richComponentsForLog].sort((a, b) => b.cves.vrpTotal - a.cves.vrpTotal).slice(0, 8);
  console.log('\n--- Top Components by Total VRP Rewards ($) & CVEs ---');
  for (const c of topByVrp) {
    console.log(
      `  ${c.name.padEnd(38)} ${formatUsd(c.cves.vrpTotal).padStart(11)} | ${String(c.cves.total).padStart(4)} CVEs (${String(c.cves.recent24m).padStart(3)} in 24m) | ${String(c.fuzzersCount).padStart(3)} fuzzers${c.submodule ? ` [${c.submodule.repo}]` : ''}`,
    );
  }

  const unfuzzedCpp = [...dmComps]
    .filter((c) => c.fuzzersCount === 0 && c.code.langs.cpp >= 10000)
    .sort((a, b) => b.cves.vrpTotal - a.cves.vrpTotal || b.code.langs.cpp - a.code.langs.cpp);
  console.log('\n--- High-VRP Unfuzzed C++ Components (0 fuzzers, >=10k C++ LoC, sorted by VRP $) ---');
  for (const c of unfuzzedCpp.slice(0, 10)) {
    console.log(
      `  ${c.name.padEnd(38)} ${formatUsd(c.cves.vrpTotal).padStart(10)} VRP | ${String(c.cves.total).padStart(3)} CVEs | ${(c.code.langs.cpp / 1e3).toFixed(1).padStart(6)}k C++ LoC | ${String(c.code.unsafeBuffers).padStart(4)} unsafe_buffers`,
    );
  }

  const largestUnfuzzedCpp = [...dmComps]
    .filter((c) => c.fuzzersCount === 0)
    .sort((a, b) => b.code.langs.cpp - a.code.langs.cpp)
    .slice(0, 8);
  console.log('\n--- Largest Unfuzzed C++ Components by C++ LoC (0 fuzzers) ---');
  for (const c of largestUnfuzzedCpp) {
    console.log(
      `  ${c.name.padEnd(38)} ${(c.code.langs.cpp / 1e3).toFixed(1).padStart(7)}k C++ LoC | ${formatUsd(c.cves.vrpTotal).padStart(9)} VRP | ${String(c.cves.total).padStart(3)} CVEs | ${c.teams[0] || '-'}`,
    );
  }
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('[dir_metadata] FATAL:', err);
  process.exit(1);
});
