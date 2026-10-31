<template>
  <div>
    <section class="section pb-4">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">Strategic initiatives</h1>
            <p class="subtitle-text">
              Horizontal engineering migrations, 90-day burn-down velocity, projected completion
              ETAs, remaining blocker directories, and memory-safety CVE return on investment across
              first-party Chromium and Blink.
            </p>
          </div>
          <span v-if="payload" class="snapshot-badge">
            <UiIcon name="clock-outline" size="small" />
            Snapshot {{ payload.latestDate }}
          </span>
        </div>

        <AboutData class="mt-3">
          <p>
            Derived from weekly git-tree snapshots of <code>chromium/src</code>
            (<NuxtLink to="/treemap">Treemap</NuxtLink>) scoped to first-party code and Blink
            (<code>exclude_third_party=1</code>, excluding vendored crates and libraries) and joined
            with <NuxtLink to="/cve/overview">Chromium's CVE database</NuxtLink>.
          </p>
          <ul>
            <li>
              <strong>Completion %:</strong> for paired API replacements
              (<code>modern ÷ (legacy + modern)</code>) or finite debt burn-downs
              (<code>1 − remaining ÷ peak</code>).
            </li>
            <li>
              <strong>Projected ETA:</strong> linear projection from trailing
              {{ payload?.windowDays.d90 || 90 }}-day net burn velocity when debt is actively
              shrinking.
            </li>
            <li>
              <strong>Blocker directories:</strong> top subsystem subtrees holding remaining legacy
              occurrences, with 1-click links into the spatial treemap.
            </li>
          </ul>
        </AboutData>

        <!-- Executive KPI Strip -->
        <div v-if="kpis" class="kpi-grid mt-4">
          <div class="kpi-card">
            <div class="kpi-eyebrow">Spanification (-Wunsafe-buffer-usage)</div>
            <div class="kpi-value">{{ kpis.spanFilePct }}% <span class="kpi-unit">file opt-in</span></div>
            <p class="kpi-detail">
              <strong>{{ fmtInt(kpis.spanTodoRem) }}</strong> <code>UNSAFE_TODO</code> left
              (<strong>{{ fmtSigned(kpis.spanTodoDelta90d) }}</strong> in 90d · ETA
              <code>{{ kpis.spanTodoEta }}</code>)
            </p>
          </div>

          <div class="kpi-card">
            <div class="kpi-eyebrow">MiraclePtr &amp; Browser UAF ROI</div>
            <div class="kpi-value">{{ fmtInt(kpis.rawPtrCount) }} <span class="kpi-unit">smart ptrs</span></div>
            <p class="kpi-detail">
              Browser UAF share of VRP CVEs fell from
              <strong>{{ kpis.uafShare2022 }}%</strong> (2022) to
              <strong>{{ kpis.uafShare2026 }}%</strong> (2026)
            </p>
          </div>

          <div class="kpi-card">
            <div class="kpi-eyebrow">First-Party Rust &amp; base::span</div>
            <div class="kpi-value">{{ fmtInt(kpis.rustFiles) }} <span class="kpi-unit">.rs files</span></div>
            <p class="kpi-detail">
              <strong>{{ fmtSigned(kpis.rustDelta90d) }}</strong> files in 90d ·
              <strong>{{ fmtInt(kpis.baseSpanCount) }}</strong> <code>base::span&lt;T&gt;</code> uses
            </p>
          </div>

          <div class="kpi-card">
            <div class="kpi-eyebrow">Modernization Scorecard</div>
            <div class="kpi-value">{{ kpis.completedOrNear }} / {{ payload?.initiatives.length }} <span class="kpi-unit">≥90% done</span></div>
            <p class="kpi-detail">
              Legacy IPC at <strong>0</strong> remaining; WebUI Lit at
              <strong>{{ kpis.litPct }}%</strong> (ETA <code>{{ kpis.litEta }}</code>)
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 1: Executive Scorecard Table -->
    <section class="section pt-2 pb-5">
      <div class="container">
        <div class="section-toolbar">
          <div>
            <h2 class="title is-4 mb-1">Migration burn-down &amp; adoption scorecard</h2>
            <p class="muted-note">
              Click any row's chevron to inspect the top 5 remaining blocker directories and open
              them in <NuxtLink to="/treemap">Treemap</NuxtLink>.
            </p>
          </div>
          <UiSegmented
            v-model="category"
            aria-label="Filter by category"
            :options="categoryOptions" />
        </div>

        <div v-if="!payload" class="skeleton table-skeleton" aria-hidden="true" />
        <div v-else class="scorecard-wrap">
          <table class="table is-fullwidth is-hoverable scorecard-table">
            <thead>
              <tr>
                <th class="detail-col" aria-label="Expand blockers"></th>
                <th class="is-sortable" @click="toggleSort('name')">
                  <span class="th-wrap">
                    Initiative
                    <UiIcon v-if="sortBy === 'name'" :name="sortAsc ? 'arrow-up' : 'arrow-down'" size="small" />
                  </span>
                </th>
                <th class="is-sortable" @click="toggleSort('completionPct')">
                  <span class="th-wrap">
                    Progress
                    <UiIcon v-if="sortBy === 'completionPct'" :name="sortAsc ? 'arrow-up' : 'arrow-down'" size="small" />
                  </span>
                </th>
                <th class="has-text-right is-sortable" @click="toggleSort('currentSort')">
                  <span class="th-wrap">
                    Current / Remaining
                    <UiIcon v-if="sortBy === 'currentSort'" :name="sortAsc ? 'arrow-up' : 'arrow-down'" size="small" />
                  </span>
                </th>
                <th class="has-text-right is-sortable" @click="toggleSort('delta90d')">
                  <span class="th-wrap">
                    90d Δ
                    <UiIcon v-if="sortBy === 'delta90d'" :name="sortAsc ? 'arrow-up' : 'arrow-down'" size="small" />
                  </span>
                </th>
                <th class="is-sortable" @click="toggleSort('etaDaysSort')">
                  <span class="th-wrap">
                    Projected ETA
                    <UiIcon v-if="sortBy === 'etaDaysSort'" :name="sortAsc ? 'arrow-up' : 'arrow-down'" size="small" />
                  </span>
                </th>
                <th>Top blocker / lead</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in sortedInitiatives" :key="row.id">
                <tr :class="{ 'is-expanded': expandedIds.has(row.id) }">
                  <td class="detail-col">
                    <button
                      v-if="row.topBlockers.length"
                      type="button"
                      class="expand-btn"
                      :aria-expanded="expandedIds.has(row.id)"
                      :aria-label="`Toggle blockers for ${row.name}`"
                      @click="toggleExpand(row.id)">
                      <UiIcon :name="expandedIds.has(row.id) ? 'chevron-down' : 'chevron-right'" size="small" />
                    </button>
                  </td>

                  <td>
                    <div class="init-title-row">
                      <span class="init-name">{{ row.name }}</span>
                      <span class="cat-pill">{{ row.category }}</span>
                      <NuxtLink
                        :to="row.treemapUrl"
                        class="treemap-icon-link"
                        :title="`Open ${row.name} in Treemap`">
                        <UiIcon name="chart-tree" size="small" />
                      </NuxtLink>
                    </div>
                    <p class="init-desc">{{ row.description }}</p>
                  </td>

                  <td class="progress-col">
                    <template v-if="row.completionPct !== null">
                      <div class="progress-cell">
                        <div class="progress-bar-track">
                          <div
                            class="progress-bar-fill"
                            :class="progressTone(row)"
                            :style="{ width: `${Math.min(100, Math.max(0, row.completionPct))}%` }" />
                        </div>
                        <span class="progress-pct">{{ formatPct(row.completionPct) }}%</span>
                      </div>
                    </template>
                    <span v-else class="status-pill is-adoption">
                      <UiIcon name="trending-up" size="small" />
                      Adoption
                    </span>
                  </td>

                  <td class="has-text-right num-cell">
                    <template v-if="row.kind === 'adoption'">
                      <strong>{{ fmtInt(row.modernCurrent || 0) }}</strong>
                      <span class="unit-sub">{{ row.unit }}</span>
                    </template>
                    <template v-else>
                      <strong>{{ fmtInt(row.remainingDebt || 0) }}</strong>
                      <span class="unit-sub">
                        rem · peak {{ fmtCompact(row.peakDebt) }}
                        <template v-if="row.modernCurrent !== null">
                          · {{ fmtCompact(row.modernCurrent) }} modern
                        </template>
                      </span>
                    </template>
                  </td>

                  <td class="has-text-right num-cell">
                    <span class="delta-badge" :class="deltaTone(row)">
                      {{ fmtSigned(row.delta90d) }}
                    </span>
                    <span v-if="row.velocityPerDay90d" class="unit-sub">
                      {{ row.velocityPerDay90d > 0 ? '+' : '' }}{{ row.velocityPerDay90d }}/d
                    </span>
                  </td>

                  <td class="eta-col">
                    <span v-if="row.etaDate === 'Done'" class="status-pill is-done">
                      <UiIcon name="check-circle" size="small" />
                      Done
                    </span>
                    <template v-else-if="row.etaDate">
                      <code class="eta-code">{{ row.etaDate }}</code>
                      <span class="unit-sub">~{{ fmtEtaDuration(row.etaDays) }}</span>
                    </template>
                    <span v-else class="muted-dash">—</span>
                  </td>

                  <td class="blocker-preview-col">
                    <NuxtLink
                      v-if="row.topBlockers[0]"
                      :to="row.topBlockers[0].treemapUrl"
                      class="blocker-chip">
                      <code>{{ row.topBlockers[0].path }}</code>
                      <span class="blocker-chip-count">
                        {{ fmtInt(row.topBlockers[0].count) }} ({{ row.topBlockers[0].sharePct }}%)
                      </span>
                    </NuxtLink>
                    <span v-else class="muted-dash">0 remaining</span>
                  </td>
                </tr>

                <!-- Expandable Top 5 Blockers Row -->
                <tr v-if="expandedIds.has(row.id) && row.topBlockers.length" class="blocker-detail-row">
                  <td colspan="7">
                    <div class="blocker-drawer">
                      <div class="blocker-drawer-head">
                        <strong>{{ row.blockerLabel }}</strong>
                        <NuxtLink :to="row.treemapUrl" class="drawer-treemap-cta">
                          Explore full spatial treemap
                          <UiIcon name="arrow-right" size="small" />
                        </NuxtLink>
                      </div>
                      <div class="blocker-list">
                        <div
                          v-for="(b, idx) in row.topBlockers"
                          :key="b.path"
                          class="blocker-item">
                          <span class="blocker-rank">#{{ idx + 1 }}</span>
                          <NuxtLink :to="b.treemapUrl" class="blocker-path">
                            <code>{{ b.path }}/</code>
                            <UiIcon name="open-in-new" size="small" />
                          </NuxtLink>
                          <div class="blocker-bar-track">
                            <div
                              class="blocker-bar-fill"
                              :style="{ width: `${Math.min(100, b.sharePct)}%` }" />
                          </div>
                          <span class="blocker-stats">
                            <strong>{{ fmtInt(b.count) }}</strong> {{ row.unit }}
                            <span class="blocker-share">({{ b.sharePct }}%)</span>
                          </span>
                          <span
                            class="blocker-delta"
                            :class="
                              row.kind === 'adoption'
                                ? b.delta90d > 0
                                  ? 'is-good'
                                  : ''
                                : b.delta90d < 0
                                  ? 'is-good'
                                  : b.delta90d > 0
                                    ? 'is-warn'
                                    : ''
                            ">
                            90d: {{ fmtSigned(b.delta90d) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Section 2: Interactive Multi-Initiative Historical Curve -->
    <section class="section pt-2 pb-5">
      <div class="container">
        <div class="section-toolbar">
          <div>
            <h2 class="title is-4 mb-1">Historical burn-down &amp; adoption trajectories</h2>
            <p class="muted-note">
              Toggle initiatives below to compare multi-year migration velocity across Chrome
              milestones.
            </p>
          </div>
          <UiSegmented
            v-model="chartMode"
            aria-label="Chart y-axis mode"
            :options="chartModeOptions" />
        </div>

        <div v-if="payload" class="chips mb-3">
          <button
            v-for="init in chartableInitiatives"
            :key="init.id"
            type="button"
            class="chip"
            :class="{ 'is-active': selected.includes(init.id) }"
            @click="toggleChartSeries(init.id)">
            {{ init.name }}
          </button>
        </div>

        <div class="chart-card">
          <div class="line-chart-box">
            <ClientOnly>
              <LineChart
                :data="lineChartData"
                :formatter="lineChartFormatter"
                :milestones="relevantMilestones" />
            </ClientOnly>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 3: Memory-Safety Mitigation ROI (CWE UAF / OOB vs Mitigations) -->
    <section class="section pt-2">
      <div class="container">
        <div class="section-toolbar">
          <div>
            <h2 class="title is-4 mb-1">Memory-safety mitigation ROI: CWE classes vs rollout</h2>
            <p class="muted-note">
              Temporal Use-After-Free (<code>CWE-416</code>, split by Browser/Non-Renderer vs
              Blink/V8) and Spatial Out-of-Bounds (<code>CWE-787/125/119</code>) overlaid with
              <code>raw_ptr</code>, <code>base::span</code>, and first-party Rust adoption.
            </p>
          </div>
          <div class="roi-controls">
            <UiSegmented
              v-model="roiMetric"
              aria-label="CVE metric"
              :options="roiMetricOptions" />
            <UiSegmented
              v-model="roiGranularity"
              aria-label="Time granularity"
              :options="[
                { value: 'yearly', label: 'Yearly' },
                { value: 'quarterly', label: 'Quarterly' },
              ]" />
          </div>
        </div>

        <div v-if="payload" class="cna-callout mb-4">
          <UiIcon name="shield-check" size="small" />
          <span>
            <strong>Methodology note:</strong> {{ payload.mitigationRoi.note }}
            In externally reported VRP bugs, Browser-process UAFs peaked at
            <strong>113 CVEs ($831k) in 2022</strong> before MiraclePtr BackupRefPtr reached Stable,
            dropping to <strong>15 in 2025</strong> and <strong>13.4% share in 2026</strong> (down
            from 39.2% share in 2022).
          </span>
        </div>

        <div class="chart-card">
          <div class="roi-legend">
            <span class="legend-item">
              <span class="swatch" style="background: var(--series-8)" />
              Temporal UAF: Browser / Non-Renderer (MiraclePtr target)
            </span>
            <span class="legend-item">
              <span class="swatch" style="background: var(--series-2)" />
              Temporal UAF: Blink / V8 / Renderer
            </span>
            <span class="legend-item">
              <span class="swatch" style="background: var(--series-4)" />
              Spatial OOB (CWE-787 / 125 / 119)
            </span>
            <span class="legend-item">
              <span class="swatch" style="background: var(--series-7)" />
              Type Confusion (CWE-843)
            </span>
            <span class="legend-item">
              <span class="swatch" style="background: var(--line-strong)" />
              Other CWEs
            </span>
            <span class="legend-item is-line">
              <span class="line-swatch" style="border-color: var(--series-1)" />
              <code>raw_ptr + raw_ref</code> (right axis)
            </span>
            <span class="legend-item is-line">
              <span class="line-swatch is-dashed" style="border-color: var(--series-3)" />
              <code>base::span</code> (right axis)
            </span>
          </div>

          <div ref="roiChartWrap" class="roi-svg-wrap">
            <svg ref="roiSvg" />
            <div v-if="roiHover" class="roi-tooltip" :style="roiTooltipStyle">
              <div class="roi-tt-head">{{ roiHover.period }}</div>
              <div class="roi-tt-row">
                <span>Browser / Non-Renderer UAF:</span>
                <strong>{{ roiHover.uafBrowserText }}</strong>
              </div>
              <div class="roi-tt-row">
                <span>Blink / V8 UAF:</span>
                <strong>{{ roiHover.uafRendererText }}</strong>
              </div>
              <div class="roi-tt-row">
                <span>Spatial OOB:</span>
                <strong>{{ roiHover.oobText }}</strong>
              </div>
              <div class="roi-tt-row">
                <span>Type Confusion:</span>
                <strong>{{ roiHover.tcText }}</strong>
              </div>
              <div class="roi-tt-row">
                <span>Other CWEs:</span>
                <strong>{{ roiHover.otherText }}</strong>
              </div>
              <hr class="roi-tt-sep" />
              <div class="roi-tt-row">
                <span>raw_ptr + raw_ref:</span>
                <strong>{{ fmtInt(roiHover.mitigations.rawPtrTotal) }}</strong>
              </div>
              <div class="roi-tt-row">
                <span>base::span&lt;T&gt;:</span>
                <strong>{{ fmtInt(roiHover.mitigations.baseSpan) }}</strong>
              </div>
              <div class="roi-tt-row">
                <span>1P Rust files:</span>
                <strong>{{ fmtInt(roiHover.mitigations.rustFilesFirstParty) }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Compact Yearly ROI Reference Table -->
        <div v-if="payload" class="scorecard-wrap mt-4">
          <table class="table is-fullwidth is-striped roi-table">
            <thead>
              <tr>
                <th>Year</th>
                <th class="has-text-right">VRP CVEs</th>
                <th class="has-text-right">Browser UAF (VRP)</th>
                <th class="has-text-right">Blink/V8 UAF (VRP)</th>
                <th class="has-text-right">Spatial OOB (VRP)</th>
                <th class="has-text-right">VRP Payout</th>
                <th class="has-text-right">raw_ptr + raw_ref</th>
                <th class="has-text-right">base::span</th>
                <th class="has-text-right">Opted-out Buffer Lines</th>
                <th class="has-text-right">1P Rust Files</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="yr in payload.mitigationRoi.yearly" :key="yr.year">
                <td><strong>{{ yr.year }}</strong></td>
                <td class="has-text-right num-cell">{{ fmtInt(yr.vrp.total) }}</td>
                <td class="has-text-right num-cell">
                  <strong>{{ fmtInt(yr.vrp.uafBrowser) }}</strong>
                  <span class="unit-inline">
                    ({{ yr.vrp.total ? ((yr.vrp.uafBrowser / yr.vrp.total) * 100).toFixed(1) : '0.0' }}%)
                  </span>
                </td>
                <td class="has-text-right num-cell">{{ fmtInt(yr.vrp.uafRenderer) }}</td>
                <td class="has-text-right num-cell">
                  {{ fmtInt(yr.vrp.oob) }}
                  <span class="unit-inline">
                    ({{ yr.vrp.total ? ((yr.vrp.oob / yr.vrp.total) * 100).toFixed(1) : '0.0' }}%)
                  </span>
                </td>
                <td class="has-text-right num-cell">{{ fmtUsd(yr.vrp.vrpUsd) }}</td>
                <td class="has-text-right num-cell">{{ fmtInt(yr.mitigations.rawPtrTotal) }}</td>
                <td class="has-text-right num-cell">{{ fmtInt(yr.mitigations.baseSpan) }}</td>
                <td class="has-text-right num-cell">{{ fmtCompact(yr.mitigations.unsafeBufferLines) }}</td>
                <td class="has-text-right num-cell">{{ fmtInt(yr.mitigations.rustFilesFirstParty) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from 'd3-format';
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft, axisRight } from 'd3-axis';
import { select } from 'd3-selection';
import { line as d3Line, curveMonotoneX } from 'd3-shape';
import milestonesJson from '~/utils/milestones.json';
import { seriesTokens } from '~/utils/palette';
import { useUrlState, urlCodecs } from '~/composables/useUrlState';

interface BlockerEntry {
  path: string;
  count: number;
  sharePct: number;
  delta90d: number;
  treemapUrl: string;
}

interface InitiativeRecord {
  id: string;
  name: string;
  category: string;
  kind: 'paired' | 'burndown' | 'adoption';
  unit: string;
  description: string;
  start?: string;
  treemapUrl: string;
  remainingDebt: number | null;
  modernCurrent: number | null;
  peakDebt: number;
  peakDate: string;
  completionPct: number | null;
  delta90d: number;
  delta365d: number;
  velocityPerDay90d: number;
  etaDate: string | null;
  etaDays: number | null;
  status: string;
  blockerLabel: string;
  topBlockers: BlockerEntry[];
  series: Array<[string, number, number, number | null]>;
}

interface RoiBucket {
  total: number;
  uaf: number;
  uafBrowser: number;
  uafRenderer: number;
  oob: number;
  typeConfusion: number;
  other: number;
  vrpUsd: number;
  uafUsd: number;
  uafBrowserUsd: number;
  oobUsd: number;
  typeConfusionUsd: number;
  otherUsd: number;
}

interface MitigationSnapshot {
  rawPtrTotal: number;
  baseSpan: number;
  unsafeBufferLines: number;
  unsafeTodo: number;
  rustFilesFirstParty: number;
  danglingUntriaged: number;
}

interface RoiRow {
  year?: string;
  quarter?: string;
  vrp: RoiBucket;
  all: RoiBucket;
  mitigations: MitigationSnapshot;
}

interface InitiativesPayload {
  generatedAt: string;
  latestDate: string;
  windowDays: { d90: number; d365: number };
  dates: string[];
  initiatives: InitiativeRecord[];
  mitigationRoi: {
    note: string;
    yearly: RoiRow[];
    quarterly: RoiRow[];
  };
}

const fmtInt = format(',d');
const fmtCompact = format('.3~s');
const fmtUsd = (v: number) => '$' + (v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M' : fmtInt(Math.round(v)));
const fmtSigned = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));
const formatPct = (v: number) => (v >= 99.9 && v < 100 ? v.toFixed(2) : v < 1 ? v.toFixed(2) : v.toFixed(1));

const fmtEtaDuration = (days: number | null) => {
  if (days === null) return '';
  if (days < 45) return `${days}d`;
  if (days < 540) return `${Math.round(days / 30.4)} mos`;
  return `${(days / 365.25).toFixed(1)} yrs`;
};

const { category, chartMode, selected, roiMetric, roiGranularity } = useUrlState({
  category: urlCodecs.enum(
    ['all', 'Memory Safety', 'UI & Languages', 'Architecture & APIs', 'Code Health & Tests'] as const,
    'all',
  ),
  chartMode: urlCodecs.enum(['completion', 'remaining_pct', 'raw'] as const, 'completion'),
  selected: urlCodecs.csv([
    'spanification_files',
    'spanification_todo',
    'webui_lit',
    'webui_typescript',
    'browser_modularization',
    'dcheck_to_check',
  ]),
  roiMetric: urlCodecs.enum(['vrp', 'share', 'usd', 'all'] as const, 'vrp'),
  roiGranularity: urlCodecs.enum(['yearly', 'quarterly'] as const, 'yearly'),
});

const categoryOptions = [
  { value: 'all', label: 'All (16)' },
  { value: 'Memory Safety', label: 'Memory Safety' },
  { value: 'UI & Languages', label: 'UI & Languages' },
  { value: 'Architecture & APIs', label: 'Architecture' },
  { value: 'Code Health & Tests', label: 'Code Health' },
];

const chartModeOptions = [
  { value: 'completion', label: '% Completion' },
  { value: 'remaining_pct', label: '% of Peak Debt' },
  { value: 'raw', label: 'Raw Count' },
];

const roiMetricOptions = [
  { value: 'vrp', label: 'VRP CVEs' },
  { value: 'share', label: 'CWE % Share' },
  { value: 'usd', label: 'VRP $' },
  { value: 'all', label: 'All CVEs' },
];

const payload = shallowRef<InitiativesPayload | null>(null);
const expandedIds = ref<Set<string>>(new Set(['spanification_todo']));
const sortBy = ref<string>('default');
const sortAsc = ref<boolean>(true);

const toggleExpand = (id: string) => {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
};

const toggleSort = (col: string) => {
  if (sortBy.value === col) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortBy.value = col;
    sortAsc.value = col === 'name' || col === 'etaDaysSort';
  }
};

const sortedInitiatives = computed(() => {
  if (!payload.value) return [];
  const filtered = payload.value.initiatives
    .filter((r) => category.value === 'all' || r.category === category.value)
    .map((r) => ({
      ...r,
      currentSort: r.kind === 'adoption' ? r.modernCurrent ?? 0 : r.remainingDebt ?? 0,
      etaDaysSort: r.etaDays === null ? 999999 : r.etaDays,
    }));

  if (sortBy.value === 'default') return filtered;
  const dir = sortAsc.value ? 1 : -1;
  return [...filtered].sort((a: any, b: any) => {
    const va = a[sortBy.value];
    const vb = b[sortBy.value];
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

const progressTone = (row: InitiativeRecord) => {
  if ((row.completionPct ?? 0) >= 95) return 'is-complete';
  if ((row.completionPct ?? 0) >= 40) return 'is-good';
  return 'is-early';
};

const deltaTone = (row: InitiativeRecord) => {
  if (row.delta90d === 0) return 'is-neutral';
  if (row.kind === 'adoption') return row.delta90d > 0 ? 'is-good' : 'is-warn';
  return row.delta90d < 0 ? 'is-good' : 'is-warn';
};

const kpis = computed(() => {
  if (!payload.value) return null;
  const byId = new Map(payload.value.initiatives.map((i) => [i.id, i]));
  const spanFile = byId.get('spanification_files');
  const spanTodo = byId.get('spanification_todo');
  const rawPtr = byId.get('miracleptr_adoption');
  const rust = byId.get('rust_first_party');
  const lit = byId.get('webui_lit');

  const y2022 = payload.value.mitigationRoi.yearly.find((y) => y.year === '2022');
  const y2026 = payload.value.mitigationRoi.yearly.find((y) => y.year === '2026');
  const uafShare2022 = y2022?.vrp.total
    ? ((y2022.vrp.uafBrowser / y2022.vrp.total) * 100).toFixed(1)
    : '0';
  const uafShare2026 = y2026?.vrp.total
    ? ((y2026.vrp.uafBrowser / y2026.vrp.total) * 100).toFixed(1)
    : '0';

  const completedOrNear = payload.value.initiatives.filter(
    (i) => i.completionPct !== null && i.completionPct >= 89.5,
  ).length;

  return {
    spanFilePct: spanFile?.completionPct?.toFixed(2) ?? '99.92',
    spanTodoRem: spanTodo?.remainingDebt ?? 0,
    spanTodoDelta90d: spanTodo?.delta90d ?? 0,
    spanTodoEta: spanTodo?.etaDate ?? '—',
    rawPtrCount: rawPtr?.modernCurrent ?? 0,
    uafShare2022,
    uafShare2026,
    rustFiles: rust?.modernCurrent ?? 0,
    rustDelta90d: rust?.delta90d ?? 0,
    baseSpanCount: spanTodo?.modernCurrent ?? 0,
    completedOrNear,
    litPct: lit?.completionPct?.toFixed(1) ?? '0',
    litEta: lit?.etaDate ?? '—',
  };
});

// Interactive LineChart state
const chartableInitiatives = computed(() => {
  if (!payload.value) return [];
  if (chartMode.value === 'completion') {
    return payload.value.initiatives.filter((i) => i.kind !== 'adoption');
  }
  return payload.value.initiatives;
});

const toggleChartSeries = (id: string) => {
  const cur = new Set(selected.value);
  if (cur.has(id)) {
    if (cur.size > 1) cur.delete(id);
  } else {
    cur.add(id);
  }
  selected.value = [...cur];
};

const lineChartData = computed(() => {
  if (!payload.value) return [];
  const chosen = chartableInitiatives.value.filter((i) => selected.value.includes(i.id));
  return chosen.map((init, idx) => {
    const startCut = chartMode.value === 'completion' ? '2020-01-01' : '2019-01-01';
    const values = init.series
      .filter(([d]) => d >= startCut)
      .map(([d, rawVal, pctVal]) => {
        let y = rawVal;
        if (chartMode.value === 'completion') {
          y = pctVal;
        } else if (chartMode.value === 'remaining_pct') {
          y =
            init.kind === 'adoption'
              ? pctVal
              : init.peakDebt > 0
                ? Math.round((rawVal / init.peakDebt) * 1000) / 10
                : 0;
        }
        return { x: new Date(d), y };
      });
    return {
      label: init.name,
      color: seriesTokens[idx % seriesTokens.length],
      values,
    };
  });
});

const lineChartFormatter = computed(() => {
  if (chartMode.value === 'raw') return format(',.0f');
  return (d: number) => `${Number(d).toFixed(0)}%`;
});

const relevantMilestones = computed(() =>
  milestonesJson.filter((m) => m.date >= '2020-01-01'),
);

// Custom d3 Stacked Bar + Dual-Axis Mitigation ROI Chart
const roiChartWrap = ref<HTMLElement | null>(null);
const roiSvg = ref<SVGSVGElement | null>(null);
const roiHover = ref<any>(null);
const roiTooltipPos = ref({ x: 0, y: 0 });
const roiTooltipStyle = computed(() => ({
  left: `${roiTooltipPos.value.x}px`,
  top: `${roiTooltipPos.value.y}px`,
}));

const renderRoiChart = () => {
  if (!payload.value || !roiSvg.value || !roiChartWrap.value) return;
  const rows =
    roiGranularity.value === 'yearly'
      ? payload.value.mitigationRoi.yearly
      : payload.value.mitigationRoi.quarterly;
  if (!rows.length) return;

  const width = roiChartWrap.value.clientWidth || 900;
  const height = 340;
  const margin = { top: 18, right: 64, bottom: 42, left: 58 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);

  const svg = select(roiSvg.value);
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const periods = rows.map((r) => r.year || r.quarter || '');
  const x = scaleBand<string>().domain(periods).range([0, innerW]).padding(0.24);

  const extractSegments = (r: RoiRow) => {
    const src = roiMetric.value === 'all' ? r.all : r.vrp;
    if (roiMetric.value === 'usd') {
      const uafR = Math.max(0, src.uafUsd - src.uafBrowserUsd);
      return [
        { key: 'uafBrowser', val: src.uafBrowserUsd, color: 'var(--series-8)' },
        { key: 'uafRenderer', val: uafR, color: 'var(--series-2)' },
        { key: 'oob', val: src.oobUsd, color: 'var(--series-4)' },
        { key: 'tc', val: src.typeConfusionUsd, color: 'var(--series-7)' },
        { key: 'other', val: src.otherUsd, color: 'var(--line-strong)' },
      ];
    }
    if (roiMetric.value === 'share') {
      const tot = src.total || 1;
      return [
        { key: 'uafBrowser', val: (src.uafBrowser / tot) * 100, color: 'var(--series-8)' },
        { key: 'uafRenderer', val: (src.uafRenderer / tot) * 100, color: 'var(--series-2)' },
        { key: 'oob', val: (src.oob / tot) * 100, color: 'var(--series-4)' },
        { key: 'tc', val: (src.typeConfusion / tot) * 100, color: 'var(--series-7)' },
        { key: 'other', val: (src.other / tot) * 100, color: 'var(--line-strong)' },
      ];
    }
    return [
      { key: 'uafBrowser', val: src.uafBrowser, color: 'var(--series-8)' },
      { key: 'uafRenderer', val: src.uafRenderer, color: 'var(--series-2)' },
      { key: 'oob', val: src.oob, color: 'var(--series-4)' },
      { key: 'tc', val: src.typeConfusion, color: 'var(--series-7)' },
      { key: 'other', val: src.other, color: 'var(--line-strong)' },
    ];
  };

  const stackedData = rows.map((r) => {
    const period = r.year || r.quarter || '';
    const segs = extractSegments(r);
    let y0 = 0;
    const rects = segs.map((s) => {
      const item = { ...s, y0, y1: y0 + s.val };
      y0 += s.val;
      return item;
    });
    return { period, row: r, total: y0, rects };
  });

  const maxLeft =
    roiMetric.value === 'share' ? 100 : (max(stackedData, (d) => d.total) || 10) * 1.08;
  const yLeft = scaleLinear().domain([0, maxLeft]).range([innerH, 0]);

  const maxRight =
    (max(rows, (r) => Math.max(r.mitigations.rawPtrTotal, r.mitigations.baseSpan)) || 1000) * 1.08;
  const yRight = scaleLinear().domain([0, maxRight]).range([innerH, 0]);

  // Subtle horizontal gridlines
  g.append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(yLeft.ticks(5))
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', (d) => yLeft(d))
    .attr('y2', (d) => yLeft(d))
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 3');

  // Stacked bars
  const barGroups = g
    .selectAll('.bar-col')
    .data(stackedData)
    .join('g')
    .attr('class', 'bar-col')
    .attr('transform', (d) => `translate(${x(d.period) || 0},0)`);

  barGroups
    .selectAll('rect')
    .data((d) => d.rects)
    .join('rect')
    .attr('x', 0)
    .attr('width', x.bandwidth())
    .attr('y', (s) => yLeft(s.y1))
    .attr('height', (s) => Math.max(0, yLeft(s.y0) - yLeft(s.y1)))
    .attr('fill', (s) => s.color)
    .attr('rx', 1.5);

  // Invisible hover columns for crisp tooltips
  barGroups
    .append('rect')
    .attr('x', -x.step() * 0.1)
    .attr('width', x.step())
    .attr('y', 0)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('pointerenter pointermove', (event, d) => {
      const src = roiMetric.value === 'all' ? d.row.all : d.row.vrp;
      const fmtVal = (cnt: number, usd: number) => {
        if (roiMetric.value === 'usd') return fmtUsd(usd);
        if (roiMetric.value === 'share') {
          const pct = src.total ? ((cnt / src.total) * 100).toFixed(1) : '0.0';
          return `${pct}% (${cnt})`;
        }
        return `${fmtInt(cnt)}`;
      };
      roiHover.value = {
        period: d.period,
        uafBrowserText: fmtVal(src.uafBrowser, src.uafBrowserUsd),
        uafRendererText: fmtVal(src.uafRenderer, Math.max(0, src.uafUsd - src.uafBrowserUsd)),
        oobText: fmtVal(src.oob, src.oobUsd),
        tcText: fmtVal(src.typeConfusion, src.typeConfusionUsd),
        otherText: fmtVal(src.other, src.otherUsd),
        mitigations: d.row.mitigations,
      };
      const [px, py] = [event.offsetX, event.offsetY];
      roiTooltipPos.value = {
        x: Math.min(width - 230, Math.max(12, px + 14)),
        y: Math.max(10, py - 24),
      };
    })
    .on('pointerleave', () => {
      roiHover.value = null;
    });

  // Mitigation overlay curves (right axis)
  const centerX = (period: string) => (x(period) || 0) + x.bandwidth() / 2;

  const rawPtrLine = d3Line<RoiRow>()
    .x((r) => centerX(r.year || r.quarter || ''))
    .y((r) => yRight(r.mitigations.rawPtrTotal))
    .curve(curveMonotoneX);

  const spanLine = d3Line<RoiRow>()
    .x((r) => centerX(r.year || r.quarter || ''))
    .y((r) => yRight(r.mitigations.baseSpan))
    .curve(curveMonotoneX);

  g.append('path')
    .datum(rows)
    .attr('fill', 'none')
    .attr('stroke', 'var(--series-1)')
    .attr('stroke-width', 2.4)
    .attr('d', rawPtrLine);

  g.append('path')
    .datum(rows)
    .attr('fill', 'none')
    .attr('stroke', 'var(--series-3)')
    .attr('stroke-width', 2.2)
    .attr('stroke-dasharray', '5 4')
    .attr('d', spanLine);

  // Axes
  const xTickValues =
    roiGranularity.value === 'quarterly'
      ? periods.filter((p) => p.endsWith('Q1') || p === periods[periods.length - 1])
      : periods;

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(xTickValues))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  const leftFmt =
    roiMetric.value === 'usd'
      ? (v: any) => '$' + format('.2~s')(Number(v))
      : roiMetric.value === 'share'
        ? (v: any) => `${v}%`
        : format(',d');

  g.append('g')
    .call(axisLeft(yLeft).ticks(5).tickFormat(leftFmt as any))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  g.append('g')
    .attr('transform', `translate(${innerW},0)`)
    .call(axisRight(yRight).ticks(5).tickFormat(format('.2~s') as any))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--series-1)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));
};

let roiObserver: ResizeObserver | null = null;

onMounted(async () => {
  const res = await fetch('/data/initiatives.json');
  if (res.ok) {
    payload.value = await res.json();
    await nextTick();
    renderRoiChart();
  }
  if (roiChartWrap.value) {
    roiObserver = new ResizeObserver(() => renderRoiChart());
    roiObserver.observe(roiChartWrap.value);
  }
});

onBeforeUnmount(() => {
  roiObserver?.disconnect();
});

watch([() => payload.value, roiMetric, roiGranularity], () => {
  nextTick(renderRoiChart);
});
</script>

<style scoped>
.page-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.subtitle-text {
  color: var(--muted);
  max-width: 66ch;
}

.snapshot-badge {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  white-space: nowrap;
}

.kpi-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 769px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1120px) {
  .kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1rem 1.15rem;
}

.kpi-eyebrow {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 560;
  margin-bottom: 0.25rem;
}

.kpi-value {
  color: var(--ink);
  font-size: 1.55rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.kpi-unit {
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 500;
}

.kpi-detail {
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.45;
  margin-top: 0.45rem;
}

.section-toolbar {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.muted-note {
  color: var(--muted);
  font-size: 0.88rem;
}

.table-skeleton {
  border-radius: var(--radius-lg);
  height: 24rem;
}

.scorecard-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.scorecard-table {
  margin-bottom: 0;
}

.scorecard-table th.is-sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.th-wrap {
  align-items: center;
  display: inline-flex;
  gap: 0.25rem;
}

.detail-col {
  padding-right: 0 !important;
  width: 2.2rem;
}

.expand-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  height: 1.75rem;
  justify-content: center;
  width: 1.75rem;
}

.expand-btn:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.init-title-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.init-name {
  color: var(--ink);
  font-weight: 620;
}

.cat-pill {
  background: var(--surface-sunken);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 540;
  padding: 0.1rem 0.5rem;
}

.treemap-icon-link {
  color: var(--muted);
  display: inline-flex;
}

.treemap-icon-link:hover {
  color: var(--accent);
}

.init-desc {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.35;
  margin-top: 0.15rem;
  max-width: 48ch;
}

.progress-col {
  min-width: 155px;
}

.progress-cell {
  align-items: center;
  display: flex;
  gap: 0.55rem;
}

.progress-bar-track {
  background: var(--surface-sunken);
  border-radius: 999px;
  flex: 1;
  height: 8px;
  min-width: 72px;
  overflow: hidden;
}

.progress-bar-fill {
  border-radius: 999px;
  height: 100%;
  transition: width 0.25s ease;
}

.progress-bar-fill.is-complete {
  background: var(--series-3);
}

.progress-bar-fill.is-good {
  background: var(--accent);
}

.progress-bar-fill.is-early {
  background: var(--series-4);
}

.progress-pct {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  min-width: 3.4rem;
  text-align: right;
}

.num-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.unit-sub {
  color: var(--faint);
  display: block;
  font-size: 0.73rem;
}

.unit-inline {
  color: var(--muted);
  font-size: 0.76rem;
}

.delta-badge {
  border-radius: var(--radius-sm);
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
}

.delta-badge.is-good {
  background: var(--tag-success-bg);
  color: var(--tag-success-ink);
}

.delta-badge.is-warn {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.delta-badge.is-neutral {
  background: var(--surface-sunken);
  color: var(--muted);
}

.status-pill {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 580;
  gap: 0.25rem;
  padding: 0.15rem 0.55rem;
}

.status-pill.is-done {
  background: var(--tag-success-bg);
  color: var(--tag-success-ink);
}

.status-pill.is-adoption {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.eta-code {
  font-size: 0.8rem;
}

.muted-dash {
  color: var(--faint);
  font-size: 0.82rem;
}

.blocker-chip {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.76rem;
  gap: 0.4rem;
  padding: 0.2rem 0.5rem;
  text-decoration: none;
  white-space: nowrap;
}

.blocker-chip:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.blocker-chip code {
  background: transparent;
  padding: 0;
}

.blocker-chip-count {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.blocker-detail-row td {
  background: var(--surface-sunken);
  padding: 0.85rem 1.25rem 1rem !important;
}

.blocker-drawer-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.84rem;
  justify-content: space-between;
  margin-bottom: 0.65rem;
}

.drawer-treemap-cta {
  align-items: center;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 560;
  gap: 0.25rem;
}

.blocker-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.blocker-item {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 2rem minmax(170px, 1.4fr) minmax(90px, 1fr) auto auto;
  padding: 0.4rem 0.75rem;
}

@media (max-width: 768px) {
  .blocker-item {
    grid-template-columns: 2rem 1fr auto;
  }
  .blocker-bar-track {
    display: none;
  }
}

.blocker-rank {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.76rem;
}

.blocker-path {
  align-items: center;
  display: inline-flex;
  font-size: 0.82rem;
  gap: 0.3rem;
  text-decoration: none;
}

.blocker-bar-track {
  background: var(--surface-sunken);
  border-radius: 999px;
  height: 6px;
  overflow: hidden;
}

.blocker-bar-fill {
  background: var(--accent);
  border-radius: 999px;
  height: 100%;
}

.blocker-stats {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.blocker-share {
  color: var(--muted);
  margin-left: 0.2rem;
}

.blocker-delta {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  min-width: 5.5rem;
  text-align: right;
  white-space: nowrap;
}

.blocker-delta.is-good {
  color: var(--tag-success-ink);
}

.blocker-delta.is-warn {
  color: var(--tag-warning-ink);
}

.chart-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1rem 1.1rem;
}

.line-chart-box {
  height: 360px;
  width: 100%;
}

.roi-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cna-callout {
  align-items: flex-start;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: var(--radius);
  color: var(--ink-2);
  display: flex;
  font-size: 0.84rem;
  gap: 0.55rem;
  line-height: 1.5;
  padding: 0.7rem 0.95rem;
}

.roi-legend {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.78rem;
  gap: 0.55rem 1.05rem;
  margin-bottom: 0.65rem;
}

.legend-item {
  align-items: center;
  color: var(--ink-2);
  display: inline-flex;
  gap: 0.35rem;
}

.swatch {
  border-radius: 3px;
  display: inline-block;
  height: 10px;
  width: 10px;
}

.line-swatch {
  border-top: 2.5px solid;
  display: inline-block;
  width: 18px;
}

.line-swatch.is-dashed {
  border-top-style: dashed;
}

.roi-svg-wrap {
  min-height: 340px;
  position: relative;
  width: 100%;
}

.roi-tooltip {
  background: var(--tooltip-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  color: var(--tooltip-ink);
  font-size: 0.76rem;
  min-width: 210px;
  padding: 0.55rem 0.75rem;
  pointer-events: none;
  position: absolute;
  z-index: 15;
}

.roi-tooltip strong {
  color: var(--tooltip-ink);
  font-family: var(--font-mono);
}

.roi-tt-head {
  font-size: 0.82rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.roi-tt-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  line-height: 1.45;
}

.roi-tt-sep {
  background: rgba(255, 255, 255, 0.16);
  margin: 0.3rem 0;
}

.roi-table {
  font-size: 0.84rem;
  margin-bottom: 0;
}
</style>
