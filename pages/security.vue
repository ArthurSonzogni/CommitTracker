<template>
  <div class="security-page">
    <!-- Hero & 5-Pillar Executive Summary -->
    <section class="section pb-4">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">Security hardening</h1>
            <p class="subtitle-text">
              Spanification, MiraclePtr, dangling pointers, first-party Rust adoption, and
              <code>CHECK</code> invariant hardening across Chrome, ANGLE, PDFium, Dawn, Skia, and
              WebRTC.
            </p>
          </div>
          <span v-if="payload" class="snapshot-badge">
            <UiIcon name="clock-outline" size="small" />
            Snapshot {{ payload.latestDate }}
          </span>
        </div>

        <AboutData class="mt-3">
          <p>
            Derived from weekly git-tree snapshots across
            <strong>Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC</strong>
            (<NuxtLink to="/treemap">Treemap</NuxtLink>) joined with
            <NuxtLink to="/cve/overview">Chromium's CVE database</NuxtLink>.
          </p>
          <ul>
            <li>
              <strong>Spanification coverage:</strong>
              <code>(total_cpp_lines − lines_unsafe_buffer_usage) ÷ total_cpp_lines</code>, matching
              each repository's <code>unsafe_buffers_paths.txt</code> and
              <code>#pragma allow_unsafe_buffers</code> exemptions.
            </li>
            <li>
              <strong>First-party scope:</strong> excludes vendored <code>third_party/</code>
              subtrees while retaining Blink (<code>third_party/blink</code>). Toggle
              <em>First-party</em> vs <em>All code</em> in Spanification to inspect full-tree
              coverage including third-party libraries.
            </li>
          </ul>
        </AboutData>

        <!-- 5-Pillar Jump KPI Cards -->
        <FetchError v-if="loadError" class="mt-4" :message="loadError" @retry="loadSecurity" />
        <div v-else-if="payload" class="pillar-kpi-grid mt-4">
          <a href="#spanification" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="code-brackets" size="small" />
              1. Spanification
            </div>
            <div class="kpi-value">
              {{ formatCovPct(chromeSpan1p?.coveragePct ?? 0) }}%
              <span class="kpi-unit">Chrome 1P</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtInt(payload.spanification.unsafeTodo.totals.current) }}</strong>
              <code>UNSAFE_TODO</code> left · ETA
              <strong>{{ todoProjection90d?.etaDate ?? payload.spanification.unsafeTodo.totals.etaDate ?? '—' }}</strong>
            </p>
          </a>

          <a href="#miracleptr" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="memory" size="small" />
              2. MiraclePtr
            </div>
            <div class="kpi-value">
              {{ fmtInt(payload.miraclePtr.adoption.totals.total) }}
              <span class="kpi-unit">smart ptrs</span>
            </div>
            <p class="kpi-detail">
              Browser VRP UAF share
              <strong>{{ payload.miraclePtr.uafRoi.highlights.browserUafShare2022Pct }}%</strong>
              → <strong>{{ payload.miraclePtr.uafRoi.highlights.browserUafShare2026Pct }}%</strong>
              · <strong>{{ fmtInt(payload.miraclePtr.exclusion.totals.current) }}</strong> exclusions
            </p>
          </a>

          <a href="#dangling" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="link-variant-off" size="small" />
              3. Dangling Pointers
            </div>
            <div class="kpi-value">
              {{ fmtInt(payload.danglingPointers.totals.current) }}
              <span class="kpi-unit">untriaged</span>
            </div>
            <p class="kpi-detail">
              Down <strong>{{ payload.danglingPointers.totals.burnPct }}%</strong> from
              {{ fmtInt(payload.danglingPointers.totals.peak) }} peak · 1y ETA
              <strong>{{ danglingProjection1y?.etaDate?.slice(0, 7) ?? '—' }}</strong>
            </p>
          </a>

          <a href="#rust" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="language-rust" size="small" />
              4. Rust Adoption
            </div>
            <div class="kpi-value">
              {{ fmtInt(payload.rust.totals.current) }}
              <span class="kpi-unit">1P .rs files</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtSigned(payload.rust.totals.delta90d) }}</strong> in 90d ·
              <strong>{{ fmtSigned(payload.rust.totals.delta365d) }}</strong> in 1y
            </p>
          </a>

          <a href="#checks" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="check-decagram" size="small" />
              5. Invariant Hardening
            </div>
            <div class="kpi-value">
              {{ payload.invariantHardening.totals.checkSharePct.toFixed(1) }}%
              <span class="kpi-unit">CHECK share</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtCompact(payload.invariantHardening.totals.checkCurrent) }}</strong>
              <code>CHECK</code> vs
              <strong>{{ fmtCompact(payload.invariantHardening.totals.dcheckCurrent) }}</strong>
              <code>DCHECK</code>
            </p>
          </a>
        </div>
      </div>
    </section>

    <div v-if="!payload" class="section pt-2">
      <div class="container">
        <div class="skeleton table-skeleton" aria-hidden="true" />
      </div>
    </div>

    <template v-else>
      <SecuritySpanificationSection
        :spanification="payload.spanification"
        v-model:span-scope="spanScope"
        v-model:span-repos-selected="spanReposSelected"
        v-model:todo-chart-mode="todoChartMode"
        v-model:todo-trend-basis="todoTrendBasis" />

      <SecurityMiraclePtrSection
        :miracle-ptr="payload.miraclePtr"
        v-model:uaf-metric="uafMetric"
        v-model:uaf-granularity="uafGranularity"
        v-model:raw-ptr-field="rawPtrField"
        v-model:raw-ptr-scope="rawPtrScope"
        v-model:exclusion-scope="exclusionScope" />

      <SecurityDanglingSection
        :dangling-pointers="payload.danglingPointers"
        v-model:dangling-trend-basis="danglingTrendBasis" />

      <SecurityRustSection
        :rust="payload.rust"
        v-model:rust-scope="rustScope" />

      <SecurityChecksSection
        :invariant-hardening="payload.invariantHardening"
        v-model:checks-chart-mode="checksChartMode"
        v-model:checks-range="checksRange"
        v-model:checks-dir-sort="checksDirSort" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from '~/composables/useUrlState';
import {
  computeLinearProjection,
  fmtCompact,
  fmtInt,
  fmtSigned,
  formatCovPct,
  type SecurityPayload,
} from '~/utils/security';

const {
  spanScope,
  spanReposSelected,
  todoChartMode,
  todoTrendBasis,
  uafMetric,
  uafGranularity,
  rawPtrField,
  rawPtrScope,
  exclusionScope,
  danglingTrendBasis,
  rustScope,
  checksChartMode,
  checksRange,
  checksDirSort,
} = useUrlState({
  spanScope: urlCodecs.enum(['first_party', 'all'] as const, 'first_party'),
  spanReposSelected: urlCodecs.csv(['chromium', 'angle', 'pdfium', 'dawn', 'skia', 'webrtc']),
  todoChartMode: urlCodecs.enum(['by_repo', 'subrepos', 'vs_span'] as const, 'by_repo'),
  todoTrendBasis: urlCodecs.enum(['90d', 'peak', '1y'] as const, '90d'),
  uafMetric: urlCodecs.enum(['vrp_share', 'count', 'usd', 'all_share'] as const, 'vrp_share'),
  uafGranularity: urlCodecs.enum(['yearly', 'quarterly'] as const, 'yearly'),
  rawPtrField: urlCodecs.enum(['total', 'raw_ptr', 'raw_ref'] as const, 'total'),
  rawPtrScope: urlCodecs.enum(['all', 'subrepos'] as const, 'all'),
  exclusionScope: urlCodecs.enum(['all', 'subrepos'] as const, 'all'),
  danglingTrendBasis: urlCodecs.enum(['1y', 'peak', '90d'] as const, '1y'),
  rustScope: urlCodecs.enum(['all', 'subrepos'] as const, 'all'),
  checksChartMode: urlCodecs.enum(['counts', 'share'] as const, 'counts'),
  checksRange: urlCodecs.enum(['2022', '2025', 'all'] as const, '2022'),
  checksDirSort: urlCodecs.enum(['dcheck', 'check'] as const, 'dcheck'),
});

const payload = shallowRef<SecurityPayload | null>(null);
const loadError = ref<string | null>(null);

const chromeSpan1p = computed(() =>
  payload.value?.spanification.scopes.first_party.repos.find((r) => r.repo === 'chromium'),
);

const todoProjection90d = computed(() => {
  if (!payload.value) return null;
  const pts: Array<[string, number]> = payload.value.spanification.unsafeTodo.totalSeries.map(
    ([d, tot]) => [d, tot],
  );
  return computeLinearProjection(pts, '90d', '2024-06-01');
});

const danglingProjection1y = computed(() => {
  if (!payload.value) return null;
  return computeLinearProjection(payload.value.danglingPointers.totalSeries, '1y', '2022-01-01');
});

const loadSecurity = async () => {
  loadError.value = null;
  try {
    payload.value = await fetchJson<SecurityPayload>('/data/security.json', { cache: true });
  } catch (error) {
    loadError.value = formatFetchError(error, 'Failed to load security data.');
  }
};

onMounted(loadSecurity);
</script>

<style>
.security-page {
.security-page {
  overflow-x: clip;
}

.page-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.subtitle-text {
  color: var(--muted);
  max-width: 68ch;
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

.pillar-kpi-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 700px) {
  .pillar-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .pillar-kpi-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  color: inherit;
  display: block;
  padding: 0.9rem 1rem;
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

.kpi-card:hover {
  background: color-mix(in srgb, var(--surface-sunken) 45%, var(--surface));
  border-color: var(--accent);
}

.kpi-eyebrow {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 600;
  gap: 0.3rem;
  margin-bottom: 0.25rem;
}

.kpi-value {
  color: var(--ink);
  font-size: 1.42rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.kpi-unit {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 500;
}

.kpi-detail {
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.4;
  margin-top: 0.4rem;
}

.pillar-section {
  border-top: 1px solid var(--line);
  scroll-margin-top: 3.75rem;
}

.pillar-kicker {
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 640;
  letter-spacing: 0.04em;
  margin-bottom: 0.15rem;
  text-transform: uppercase;
}

.section-toolbar {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.sub-section-head {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.sub-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.sub-title {
  color: var(--ink);
  font-size: 0.98rem;
  font-weight: 640;
}

.muted-note {
  color: var(--muted);
  font-size: 0.86rem;
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

.scorecard-table,
.compact-repo-table {
  margin-bottom: 0;
}

.compact-repo-table {
  font-size: 0.84rem;
}

.detail-col {
  padding-right: 0 !important;
  width: 2.1rem;
}

.expand-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  height: 1.65rem;
  justify-content: center;
  width: 1.65rem;
}

.expand-btn:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.repo-cell {
  align-items: center;
  display: inline-flex;
  gap: 0.45rem;
  white-space: nowrap;
}

.repo-dot {
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  height: 0.55rem;
  width: 0.55rem;
}

.repo-filter-chip {
  font-weight: 620;
}

.repo-pill-label {
  font-weight: 640;
}

.progress-col {
  min-width: 165px;
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

.progress-bar-fill.is-zero {
  background: var(--line-strong);
}

.progress-pct {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  min-width: 3.6rem;
  text-align: right;
}

.num-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.unit-inline {
  color: var(--muted);
  font-size: 0.76rem;
}

.metric-link {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 600;
}

.treemap-pill-link {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 560;
  gap: 0.25rem;
  padding: 0.15rem 0.55rem;
  text-decoration: none;
  white-space: nowrap;
}

.treemap-pill-link:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.treemap-icon-link {
  color: var(--muted);
  display: inline-flex;
}

.treemap-icon-link:hover {
  color: var(--accent);
}

.totals-row td {
  background: color-mix(in srgb, var(--surface-sunken) 55%, var(--surface));
  border-top: 2px solid var(--line-strong);
}

.delta-badge {
  border-radius: var(--radius-sm);
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.1rem 0.42rem;
  white-space: nowrap;
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

.is-good-text {
  color: var(--tag-success-ink);
}

.muted-dash {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.stat-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.stat-pill {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: inline-flex;
  flex-wrap: wrap;
  font-size: 0.82rem;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
}

.eta-code {
  color: var(--ink);
  font-weight: 650;
}

.stat-label {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 560;
}

.stat-sub {
  color: var(--muted);
  font-size: 0.75rem;
}

.split-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 1024px) {
  .split-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  }
}

.chart-card,
.dirs-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 0.95rem 1.05rem;
}

.line-chart-box {
  height: 330px;
  width: 100%;
}

.line-chart-box.is-compact {
  height: 305px;
}

.repo-mini-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
}

.repo-mini-pill {
  align-items: center;
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  gap: 0.3rem;
}

.mini-delta {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.dirs-card-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.84rem;
  gap: 0.5rem;
  justify-content: space-between;
  margin-bottom: 0.65rem;
}

.dir-rows {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.dir-row {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.36rem 0.6rem;
}

.dir-main {
  align-items: center;
  display: flex;
  gap: 0.45rem;
  min-width: 0;
}

.repo-tag {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  display: inline-flex;
  flex-shrink: 0;
  font-size: 0.69rem;
  font-weight: 600;
  gap: 0.25rem;
  padding: 0.08rem 0.45rem;
}

.dir-link {
  align-items: center;
  display: inline-flex;
  font-size: 0.8rem;
  gap: 0.25rem;
  min-width: 0;
  overflow: hidden;
  text-decoration: none;
}

.dir-link code {
  background: transparent;
  overflow: hidden;
  padding: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-nums {
  align-items: center;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  gap: 0.4rem;
}

.blocker-detail-row td {
  background: var(--surface-sunken);
  padding: 0.8rem 1.15rem 0.95rem !important;
}

.blocker-drawer-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.83rem;
  justify-content: space-between;
  margin-bottom: 0.55rem;
}

.drawer-treemap-cta {
  align-items: center;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 560;
  gap: 0.25rem;
}

.blocker-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.blocker-item {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: grid;
  gap: 0.7rem;
  grid-template-columns: 2rem minmax(160px, 1.4fr) minmax(80px, 1fr) auto auto;
  padding: 0.35rem 0.7rem;
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
  font-size: 0.75rem;
}

.blocker-path {
  align-items: center;
  display: inline-flex;
  font-size: 0.8rem;
  gap: 0.25rem;
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
  font-size: 0.79rem;
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
  font-size: 0.74rem;
  min-width: 5.2rem;
  text-align: right;
  white-space: nowrap;
}

.blocker-delta.is-good {
  color: var(--tag-success-ink);
}

.blocker-delta.is-warn {
  color: var(--tag-warning-ink);
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
  font-size: 0.83rem;
  gap: 0.55rem;
  line-height: 1.5;
  padding: 0.65rem 0.9rem;
}

.roi-legend {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.78rem;
  gap: 0.55rem 1.05rem;
  margin-bottom: 0.55rem;
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
  flex-shrink: 0;
  height: 10px;
  width: 10px;
}

.line-swatch {
  border-top: 2.5px solid;
  display: inline-block;
  flex-shrink: 0;
  width: 18px;
}
}
</style>
