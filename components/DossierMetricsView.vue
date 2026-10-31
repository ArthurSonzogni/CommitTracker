<template>
  <div class="dossier-metrics">
    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-head">
          <UiIcon name="source-commit" size="small" class="kpi-icon" />
          <span>12m Commit Velocity</span>
        </div>
        <div class="kpi-value">{{ fmtInt(commits.last12m) }}</div>
        <div class="kpi-sub">
          <span v-if="yoyDelta !== null" :class="['delta-pill', yoyDelta >= 0 ? 'is-up' : 'is-down']">
            {{ yoyDelta >= 0 ? "+" : "" }}{{ yoyDelta }}% YoY
          </span>
          <span>{{ fmtInt(commits.all) }} commits since 2018</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-head">
          <UiIcon name="code-tags" size="small" class="kpi-icon" />
          <span>Code Footprint</span>
        </div>
        <div class="kpi-value">{{ fmtLoc(code.lines) }}</div>
        <div class="kpi-sub">
          <span>{{ fmtInt(code.files) }} files · {{ fmtInt(ownedDirCount) }} dirs ({{ rootCount }} {{ rootCount === 1 ? "root" : "roots" }})</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-head">
          <UiIcon name="currency-usd" size="small" class="kpi-icon" />
          <span>CVEs &amp; VRP Rewards</span>
        </div>
        <div class="kpi-value">{{ fmtUsd(cves.vrpTotal) }}</div>
        <div class="kpi-sub">
          <span>{{ fmtInt(cves.total) }} CVEs ({{ cves.recent24m }} in 24m)</span>
          <span v-if="cves.vrpMax > 0">· max {{ fmtUsd(cves.vrpMax) }}</span>
        </div>
      </div>

      <div class="kpi-card" :class="{ 'is-risk': isHighVrpUnfuzzed }">
        <div class="kpi-head">
          <UiIcon name="bug" size="small" class="kpi-icon" />
          <span>Fuzzing Coverage</span>
        </div>
        <div class="kpi-value">{{ fmtInt(fuzzers.count) }}</div>
        <div class="kpi-sub">
          <template v-if="fuzzers.count > 0">
            <span>{{ fuzzers.fuzzTests }} FUZZ_TEST · {{ fuzzers.fuzzTargets }} targets</span>
          </template>
          <template v-else-if="code.langs.cpp >= 5000">
            <span class="risk-text">0 fuzzers across {{ fmtLoc(code.langs.cpp) }} C++</span>
          </template>
          <template v-else>
            <span>No registered fuzz targets</span>
          </template>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-head">
          <UiIcon name="memory" size="small" class="kpi-icon" />
          <span>Memory Safety &amp; Ptr</span>
        </div>
        <div class="kpi-value">{{ fmtInt(code.unsafeBuffers) }} <small>unsafe_buffers</small></div>
        <div class="kpi-sub">
          <span>{{ fmtInt(code.rawPtr) }} raw_ptr · {{ fmtInt(code.dangling) }} dangling</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-head">
          <UiIcon name="layers" size="small" class="kpi-icon" />
          <span>Survivorship &amp; Health</span>
        </div>
        <template v-if="accretion">
          <div class="kpi-value">{{ accretion.medianAge }}y <small>median age</small></div>
          <div class="kpi-sub">
            <span class="status-chip">{{ accretion.label }}</span>
            <span>bus factor {{ accretion.busFactor }} · {{ Math.round(accretion.reviewedCoverage * 100) }}% reviewed</span>
          </div>
        </template>
        <template v-else>
          <div class="kpi-value">{{ fmtInt(code.tests) }} <small>tests</small></div>
          <div class="kpi-sub">
            <span>{{ fmtInt(code.disabledTests) }} DISABLED_ · {{ fmtInt(code.todos) }} TODOs</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Dual Trend Charts: Quarterly Commits + Annual CVEs/VRP -->
    <div class="charts-grid">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">Commit Velocity (Quarterly)</h2>
            <p class="panel-subtitle">
              {{ quarterLabels[0] || "2018Q1" }} – {{ quarterLabels[quarterLabels.length - 1] || "2026Q3" }}
              · Peak {{ fmtInt(maxQuarterCommits) }}/quarter
            </p>
          </div>
          <NuxtLink
            v-if="primaryRoot"
            class="mini-action"
            :to="`/commit-rates?repository=chromium&path=${encodeURIComponent(primaryRoot)}`">
            Commit rates
            <UiIcon name="arrow-right" size="small" />
          </NuxtLink>
        </div>

        <div v-if="commits.all > 0 && quarterBars.length" class="svg-chart-wrap">
          <svg viewBox="0 0 520 150" class="trend-svg" role="img" aria-label="Quarterly commits chart">
            <line x1="0" y1="126" x2="520" y2="126" class="axis-line" />
            <g v-for="(bar, idx) in quarterBars" :key="bar.label">
              <rect
                :x="bar.x"
                :y="bar.y"
                :width="bar.w"
                :height="bar.h"
                rx="2"
                class="commit-bar">
                <title>{{ bar.label }}: {{ fmtInt(bar.value) }} commits</title>
              </rect>
              <text
                v-if="idx % 8 === 0 || (idx === quarterBars.length - 1 && idx % 8 >= 4)"
                :x="idx === 0 ? bar.x : idx === quarterBars.length - 1 ? bar.x + bar.w : bar.x + bar.w / 2"
                y="143"
                :text-anchor="idx === 0 ? 'start' : idx === quarterBars.length - 1 ? 'end' : 'middle'"
                class="axis-label">
                {{ bar.label.slice(0, 4) }}
              </text>
            </g>
          </svg>
        </div>
        <div v-else class="empty-chart">
          No direct commits in <code>chromium.git</code> since 2018 (check submodule or child components).
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">Security &amp; VRP History</h2>
            <p class="panel-subtitle">
              {{ fmtInt(cves.total) }} CVEs · {{ fmtUsd(cves.vrpTotal) }} VRP ({{ fmtUsd(cves.vrpRecent24m) }} in last 24m)
            </p>
          </div>
          <NuxtLink
            v-if="cveFilterComponent"
            class="mini-action"
            :to="`/cve/list?component=${encodeURIComponent(cveFilterComponent)}`">
            All CVEs
            <UiIcon name="arrow-right" size="small" />
          </NuxtLink>
        </div>

        <template v-if="cves.total > 0">
          <div class="svg-chart-wrap">
            <svg viewBox="0 0 520 130" class="trend-svg" role="img" aria-label="Annual CVE count and VRP chart">
              <line x1="0" y1="106" x2="520" y2="106" class="axis-line" />
              <g v-for="bar in cveYearBars" :key="bar.year">
                <rect
                  :x="bar.x"
                  :y="bar.y"
                  :width="bar.w"
                  :height="bar.h"
                  rx="2.5"
                  :class="['cve-bar', { 'has-vrp': bar.vrp > 0 }]">
                  <title>{{ bar.year }}: {{ bar.count }} CVEs · {{ fmtUsd(bar.vrp) }} VRP</title>
                </rect>
                <text
                  v-if="bar.count > 0"
                  :x="bar.x + bar.w / 2"
                  :y="Math.max(11, bar.y - 4)"
                  text-anchor="middle"
                  class="bar-val-label">
                  {{ bar.count }}
                </text>
                <text
                  :x="bar.x + bar.w / 2"
                  y="123"
                  text-anchor="middle"
                  class="axis-label">
                  ’{{ String(bar.year).slice(2) }}
                </text>
              </g>
            </svg>
          </div>

          <div class="security-breakdown">
            <div class="sev-chips">
              <span v-if="cves.severities.Critical" class="sev-pill is-critical">
                Critical {{ cves.severities.Critical }}
              </span>
              <span v-if="cves.severities.High" class="sev-pill is-high">
                High {{ cves.severities.High }}
              </span>
              <span v-if="cves.severities.Medium" class="sev-pill is-medium">
                Medium {{ cves.severities.Medium }}
              </span>
              <span v-if="cves.severities.Low" class="sev-pill is-low">
                Low {{ cves.severities.Low }}
              </span>
            </div>

            <div v-if="cves.topCwes.length" class="cwe-list">
              <span
                v-for="cwe in cves.topCwes.slice(0, 4)"
                :key="cwe.cweId"
                class="cwe-chip"
                :title="`CWE-${cwe.cweId}: ${cweName(cwe.cweId)} (${fmtUsd(cwe.vrp)})`">
                <strong>CWE-{{ cwe.cweId }}</strong>
                <span>{{ shortCweName(cwe.cweId) }}</span>
                <span class="cwe-count">×{{ cwe.count }}</span>
              </span>
            </div>
          </div>
        </template>
        <div v-else class="empty-chart">
          <UiIcon name="shield-check" class="mr-1" />
          Zero publicly attributed CVEs in CommitTracker's CVE database.
        </div>
      </div>
    </div>

    <!-- Language Mix & Memory Safety / Technical Debt Strip -->
    <div v-if="code.lines > 0" class="panel-card mb-block">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">Language Mix &amp; Memory-Safety Signals</h2>
          <p class="panel-subtitle">
            Latest treemap snapshot across {{ fmtInt(code.files) }} owned files ({{ fmtInt(code.lines) }} lines)
          </p>
        </div>
        <NuxtLink
          v-if="primaryRoot"
          class="mini-action"
          :to="treemapSafetyUrl(primaryRoot)">
          Inspect safety in Treemap
          <UiIcon name="chart-tree" size="small" />
        </NuxtLink>
      </div>

      <div class="lang-bar" role="img" aria-label="Language distribution">
        <div
          v-for="seg in langSegments"
          :key="seg.key"
          class="lang-seg"
          :style="{ width: seg.pct + '%', background: seg.color }"
          :title="`${seg.label}: ${fmtInt(seg.lines)} lines (${seg.pct.toFixed(1)}%)`" />
      </div>

      <div class="lang-legend">
        <div v-for="seg in langSegments" :key="seg.key" class="lang-item">
          <span class="lang-dot" :style="{ background: seg.color }" />
          <span class="lang-name">{{ seg.label }}</span>
          <span class="lang-val">{{ fmtLoc(seg.lines) }} ({{ seg.pct.toFixed(1) }}%)</span>
        </div>
      </div>

      <div class="debt-grid">
        <div class="debt-cell">
          <span class="debt-label"><code>unsafe_buffers</code> files/blocks</span>
          <span class="debt-val" :class="{ 'is-warn': code.unsafeBuffers > 0 }">{{ fmtInt(code.unsafeBuffers) }}</span>
        </div>
        <div class="debt-cell">
          <span class="debt-label">Unsafe buffer usage lines</span>
          <span class="debt-val">{{ fmtInt(code.unsafeBufferLines) }}</span>
        </div>
        <div class="debt-cell">
          <span class="debt-label"><code>raw_ptr</code> / <code>raw_ref</code></span>
          <span class="debt-val">{{ fmtInt(code.rawPtr) }} / {{ fmtInt(code.rawRef) }}</span>
        </div>
        <div class="debt-cell">
          <span class="debt-label"><code>DanglingUntriaged</code></span>
          <span class="debt-val" :class="{ 'is-warn': code.dangling > 0 }">{{ fmtInt(code.dangling) }}</span>
        </div>
        <div class="debt-cell">
          <span class="debt-label">Unsafe libc calls</span>
          <span class="debt-val">{{ fmtInt(code.unsafeLibc) }}</span>
        </div>
        <div class="debt-cell">
          <span class="debt-label"><code>DISABLED_</code> tests / total</span>
          <span class="debt-val">{{ fmtInt(code.disabledTests) }} / {{ fmtInt(code.tests) }}</span>
        </div>
        <div class="debt-cell">
          <span class="debt-label"><code>TODO</code> comments</span>
          <span class="debt-val">{{ fmtInt(code.todos) }}</span>
        </div>
        <div v-if="accretion" class="debt-cell">
          <span class="debt-label">12m fresh / reworked LoC</span>
          <span class="debt-val">{{ fmtLoc(accretion.recent) }} / {{ fmtLoc(accretion.reworked) }}</span>
        </div>
      </div>
    </div>

    <!-- Owned Source Directories with 1-Click Deep Links -->
    <div v-if="roots.length > 0" class="panel-card mb-block">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">Owned Source Directories (<code>DIR_METADATA</code> Roots)</h2>
          <p class="panel-subtitle">
            Showing top {{ roots.length }} of {{ fmtInt(rootCount) }} minimal entry roots
            ({{ fmtInt(dirMetaCount) }} <code>DIR_METADATA</code> files, {{ fmtInt(ownedDirCount) }} total directories with inheritance)
          </p>
        </div>
      </div>

      <div class="table-wrap">
        <table class="dossier-table">
          <thead>
            <tr>
              <th>Directory Path</th>
              <th class="num">Lines</th>
              <th class="num">Files</th>
              <th class="num">12m Commits</th>
              <th class="num">Fuzzers</th>
              <th class="actions-col">1-Click Deep Links</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="root in roots" :key="root.path">
              <td class="path-cell">
                <code>{{ root.path }}</code>
              </td>
              <td class="num mono">{{ fmtInt(root.lines) }}</td>
              <td class="num mono">{{ fmtInt(root.files) }}</td>
              <td class="num mono">{{ fmtInt(root.commits12m) }}</td>
              <td class="num mono">{{ root.fuzzers }}</td>
              <td class="actions-cell">
                <NuxtLink class="deep-link" :to="treemapUrl(root.path)" title="Explore directory in Treemap">
                  <UiIcon name="chart-tree" size="small" />
                  Treemap
                </NuxtLink>
                <NuxtLink class="deep-link" :to="commitRatesUrl(root.path)" title="Weekly commit velocity">
                  <UiIcon name="chart-line" size="small" />
                  Velocity
                </NuxtLink>
                <NuxtLink
                  v-if="root.accretionDir"
                  class="deep-link"
                  :to="accretionUrl(root.accretionDir)"
                  :title="`Code accretion for ${root.accretionDir}`">
                  <UiIcon name="layers" size="small" />
                  Accretion
                </NuxtLink>
                <a
                  class="deep-link"
                  :href="`https://source.chromium.org/chromium/chromium/src/+/main:${root.path}/`"
                  target="_blank"
                  rel="noopener"
                  title="Open in Chromium Code Search">
                  <UiIcon name="open-in-new" size="small" />
                  CS
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Fuzzers Section -->
    <div v-if="fuzzers.count > 0" class="panel-card mb-block">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">Registered Fuzzers ({{ fuzzers.count }})</h2>
          <p class="panel-subtitle">
            {{ fuzzers.fuzzTests }} FuzzTest suites · {{ fuzzers.fuzzTargets }} libFuzzer targets
            (most-specific <code>DIR_METADATA</code> ownership)
          </p>
        </div>
        <NuxtLink class="mini-action" to="/fuzz-test">
          All Chromium fuzzers
          <UiIcon name="arrow-right" size="small" />
        </NuxtLink>
      </div>

      <div class="table-wrap">
        <table class="dossier-table">
          <thead>
            <tr>
              <th>Suite / Target</th>
              <th>Source File</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fz in fuzzers.items" :key="`${fz.file}:${fz.line}:${fz.name}`">
              <td class="mono">
                <a
                  :href="`https://source.chromium.org/chromium/chromium/src/+/main:${fz.file};l=${fz.line}`"
                  target="_blank"
                  rel="noopener">
                  {{ fz.name }}
                </a>
              </td>
              <td><code>{{ fz.file }}:{{ fz.line }}</code></td>
              <td>
                <span :class="['type-badge', fz.type === 'FUZZ_TEST' ? 'is-ft' : 'is-target']">
                  {{ fz.type === "FUZZ_TEST" ? "FUZZ_TEST" : "fuzzer_test" }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import cweCatalog from "~/utils/cwe.json";
import type {
  ComponentAccretionStats,
  ComponentCodeStats,
  ComponentCommitStats,
  ComponentCveStats,
  ComponentFuzzerStats,
  ComponentRootDir,
} from "~/utils/componentsData";

const props = defineProps<{
  code: ComponentCodeStats;
  commits: ComponentCommitStats;
  fuzzers: ComponentFuzzerStats;
  cves: ComponentCveStats;
  accretion: ComponentAccretionStats | null;
  roots: ComponentRootDir[];
  rootCount: number;
  dirMetaCount: number;
  ownedDirCount: number;
  quarterLabels: string[];
  cveFilterComponent?: string;
  isHighVrpUnfuzzed?: boolean;
}>();

const cweDict = cweCatalog as Record<string, string>;

const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const fmtUsd = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
const fmtLoc = (n: number) => {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const yoyDelta = computed<number | null>(() => {
  const prev = props.commits.prev12m;
  const cur = props.commits.last12m;
  if (!prev || prev < 10) return null;
  return Math.round(((cur - prev) / prev) * 100);
});

const primaryRoot = computed(() => props.roots[0]?.path || "");

const maxQuarterCommits = computed(() =>
  Math.max(1, ...(props.commits.quarterly || [0])),
);

const quarterBars = computed(() => {
  const q = props.commits.quarterly || [];
  const labels = props.quarterLabels || [];
  const n = q.length;
  if (!n) return [];
  const maxVal = maxQuarterCommits.value;
  const step = 520 / n;
  const barW = Math.max(2, step - 2.5);
  return q.map((val, i) => {
    const h = val > 0 ? Math.max(2, (val / maxVal) * 114) : 0;
    return {
      label: labels[i] || `Q${i + 1}`,
      value: val,
      x: i * step + 1,
      y: 126 - h,
      w: barW,
      h,
    };
  });
});

const cveYearBars = computed(() => {
  const years = props.cves.byYear || [];
  if (!years.length) return [];
  const maxCnt = Math.max(1, ...years.map((y) => y.count));
  const step = 520 / years.length;
  const barW = Math.max(8, step - 8);
  return years.map((yr, i) => {
    const h = yr.count > 0 ? Math.max(4, (yr.count / maxCnt) * 86) : 0;
    return {
      year: yr.year,
      count: yr.count,
      vrp: yr.vrp,
      x: i * step + (step - barW) / 2,
      y: 106 - h,
      w: barW,
      h,
    };
  });
});

const langSegments = computed(() => {
  const total = Math.max(1, props.code.lines);
  const raw = [
    { key: "cpp", label: "C / C++", lines: props.code.langs.cpp, color: "var(--series-1)" },
    { key: "rust", label: "Rust", lines: props.code.langs.rust, color: "var(--series-2)" },
    { key: "jsTs", label: "TS / JS", lines: props.code.langs.jsTs, color: "var(--series-4)" },
    { key: "javaKt", label: "Java / Kotlin", lines: props.code.langs.javaKt, color: "var(--series-3)" },
    { key: "mojom", label: "Mojom IDL", lines: props.code.langs.mojom, color: "var(--series-7)" },
    { key: "other", label: "Other / Build / Tests", lines: props.code.langs.other, color: "var(--faint)" },
  ].filter((s) => s.lines > 0);
  return raw.map((s) => ({ ...s, pct: (s.lines / total) * 100 }));
});

const cweName = (id: string) => cweDict[id] || "Security weakness";
const shortCweName = (id: string) => {
  const full = cweDict[id];
  if (!full) return "Other";
  if (full.length <= 28) return full;
  if (id === "416") return "Use After Free";
  if (id === "787") return "OOB Write";
  if (id === "125") return "OOB Read";
  if (id === "119") return "Memory Buffer Bounds";
  if (id === "843") return "Type Confusion";
  if (id === "190") return "Integer Overflow";
  if (id === "362") return "Race Condition";
  return full.slice(0, 25) + "…";
};

const toCommaPath = (dir: string) =>
  dir
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join(",");

const treemapUrl = (dir: string) =>
  `/treemap?repositories=chromium&path=${toCommaPath(dir)}&field_color=todo`;
const treemapSafetyUrl = (dir: string) =>
  `/treemap?repositories=chromium&path=${toCommaPath(dir)}&field_color=unsafe_buffers`;
const commitRatesUrl = (dir: string) =>
  `/commit-rates?repository=chromium&path=${encodeURIComponent(dir)}`;
const accretionUrl = (dir: string) =>
  `/accretion?repository=chromium&dir=${encodeURIComponent(dir)}`;
</script>

<style scoped>
.kpi-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 1.25rem;
}

@media (max-width: 960px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-xs);
  padding: 0.95rem 1.05rem;
}

.kpi-card.is-risk {
  background: var(--tag-danger-bg);
  border-color: color-mix(in srgb, var(--tag-danger-ink) 35%, var(--line));
}

.kpi-head {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 0.8rem;
  font-weight: 600;
  gap: 0.4rem;
  letter-spacing: 0.01em;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.kpi-icon {
  color: var(--accent);
}

.kpi-value {
  color: var(--ink);
  font-size: 1.55rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.2;
}

.kpi-value small {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 500;
}

.kpi-sub {
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.risk-text {
  color: var(--tag-danger-ink);
  font-weight: 600;
}

.delta-pill {
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.05rem 0.45rem;
}

.delta-pill.is-up {
  background: var(--tag-success-bg);
  color: var(--tag-success-ink);
}

.delta-pill.is-down {
  background: var(--surface-sunken);
  color: var(--muted);
}

.status-chip {
  background: var(--accent-soft);
  border-radius: 999px;
  color: var(--accent-ink);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.05rem 0.45rem;
}

.charts-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  margin-bottom: 1.25rem;
}

.mb-block {
  margin-bottom: 1.25rem;
}

.panel-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-xs);
  padding: 1.1rem 1.2rem;
}

.panel-head {
  align-items: flex-start;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  margin-bottom: 0.85rem;
}

.panel-title {
  color: var(--ink);
  font-size: 1.02rem;
  font-weight: 650;
  line-height: 1.3;
  margin: 0;
}

.panel-subtitle {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0.15rem 0 0;
}

.mini-action {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 500;
  gap: 0.25rem;
  padding: 0.3rem 0.6rem;
  text-decoration: none;
  white-space: nowrap;
}

.mini-action:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.svg-chart-wrap {
  width: 100%;
}

.trend-svg {
  display: block;
  height: auto;
  width: 100%;
}

.axis-line {
  stroke: var(--line-strong);
  stroke-width: 1;
}

.commit-bar {
  fill: var(--accent);
  opacity: 0.85;
  transition: opacity 0.12s;
}

.commit-bar:hover {
  opacity: 1;
}

.cve-bar {
  fill: var(--series-4);
  opacity: 0.85;
}

.cve-bar.has-vrp {
  fill: var(--severity-high);
}

.axis-label {
  fill: var(--muted);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.bar-val-label {
  fill: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
}

.empty-chart {
  align-items: center;
  background: var(--surface-sunken);
  border-radius: var(--radius-sm);
  color: var(--muted);
  display: flex;
  font-size: 0.86rem;
  justify-content: center;
  min-height: 92px;
  padding: 1rem;
  text-align: center;
}

.security-breakdown {
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
}

.sev-chips,
.cwe-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.sev-pill {
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.12rem 0.5rem;
}

.sev-pill.is-critical {
  background: color-mix(in srgb, var(--severity-critical) 16%, transparent);
  color: var(--severity-critical);
}

.sev-pill.is-high {
  background: color-mix(in srgb, var(--severity-high) 16%, transparent);
  color: var(--severity-high);
}

.sev-pill.is-medium {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.sev-pill.is-low {
  background: var(--surface-sunken);
  color: var(--muted);
}

.cwe-chip {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.75rem;
  gap: 0.3rem;
  padding: 0.14rem 0.48rem;
}

.cwe-count {
  color: var(--muted);
  font-family: var(--font-mono);
}

.lang-bar {
  background: var(--surface-sunken);
  border-radius: 999px;
  display: flex;
  height: 11px;
  margin-bottom: 0.65rem;
  overflow: hidden;
  width: 100%;
}

.lang-seg {
  height: 100%;
}

.lang-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  margin-bottom: 1rem;
}

.lang-item {
  align-items: center;
  display: inline-flex;
  font-size: 0.82rem;
  gap: 0.35rem;
}

.lang-dot {
  border-radius: 50%;
  height: 8px;
  width: 8px;
}

.lang-name {
  color: var(--ink);
  font-weight: 600;
}

.lang-val {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.debt-grid {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  padding-top: 0.85rem;
}

.debt-cell {
  background: var(--surface-sunken);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  padding: 0.55rem 0.75rem;
}

.debt-label {
  color: var(--muted);
  font-size: 0.76rem;
}

.debt-val {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.98rem;
  font-weight: 650;
  margin-top: 0.1rem;
}

.debt-val.is-warn {
  color: var(--severity-high);
}

.table-wrap {
  overflow-x: auto;
}

.dossier-table {
  border-collapse: collapse;
  font-size: 0.86rem;
  width: 100%;
}

.dossier-table th {
  border-bottom: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.5rem 0.65rem;
  text-align: left;
  text-transform: uppercase;
}

.dossier-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.55rem 0.65rem;
  vertical-align: middle;
}

.dossier-table tr:last-child td {
  border-bottom: none;
}

.dossier-table th.num,
.dossier-table td.num {
  text-align: right;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.path-cell code {
  font-size: 0.82rem;
}

.actions-col {
  text-align: right !important;
}

.actions-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
}

.deep-link {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 500;
  gap: 0.22rem;
  padding: 0.2rem 0.48rem;
  text-decoration: none;
}

.deep-link:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.type-badge {
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.73rem;
  font-weight: 600;
  padding: 0.12rem 0.45rem;
}

.type-badge.is-ft {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.type-badge.is-target {
  background: var(--surface-sunken);
  color: var(--ink-2);
}
</style>
