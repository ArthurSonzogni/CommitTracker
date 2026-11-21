<template>
  <section id="miracleptr" class="section pt-4 pb-5 pillar-section">
    <div class="container">
      <div class="section-toolbar">
        <div>
          <div class="pillar-kicker">Pillar 2</div>
          <h2 class="title is-4 mb-1">MiraclePtr (BackupRefPtr)</h2>
          <p class="muted-note">
            Use-After-Free (<code>CWE-416</code>) vulnerability share over time,
            <code>raw_ptr</code> / <code>raw_ref</code> rollout across all 6 repositories, and
            <code>RAW_PTR_EXCLUSION</code> burn-down.
          </p>
        </div>
        <div class="roi-controls">
          <UiSegmented
            v-model="uafMetric"
            aria-label="UAF metric"
            :options="uafMetricOptions" />
          <UiSegmented
            v-model="uafGranularity"
            aria-label="Time granularity"
            :options="[
              { value: 'yearly', label: 'Yearly' },
              { value: 'quarterly', label: 'Quarterly' },
            ]" />
        </div>
      </div>

      <!-- 2A. UAF Share Over Time -->
      <div class="cna-callout mb-3">
        <UiIcon name="shield-check" size="small" />
        <span>
          <strong>MiraclePtr impact:</strong> Browser / Non-Renderer Use-After-Free share of
          externally reported VRP CVEs dropped <strong>~3×</strong> from
          <strong>{{ miraclePtr.uafRoi.highlights.browserUafShare2022Pct }}%</strong>
          ({{ miraclePtr.uafRoi.highlights.browserUafCount2022 }} CVEs,
          {{ fmtUsd(miraclePtr.uafRoi.highlights.browserUafUsd2022) }}) in 2022 to
          <strong>{{ miraclePtr.uafRoi.highlights.browserUafShare2026Pct }}%</strong> in
          2026. {{ miraclePtr.uafRoi.note }}
        </span>
      </div>

      <div class="chart-card mb-5">
        <div class="roi-legend">
          <span class="legend-item" style="color: var(--series-8)">
            <span class="swatch" style="background: var(--series-8)" />
            <strong>Browser / Non-Renderer UAF (MiraclePtr target)</strong>
          </span>
          <span class="legend-item" style="color: var(--series-2)">
            <span class="swatch" style="background: var(--series-2)" />
            <strong>Blink / V8 / Renderer UAF</strong>
          </span>
          <span v-if="uafMetric === 'count' || uafMetric === 'usd'" class="legend-item">
            <span class="swatch" style="background: var(--line-strong)" />
            Non-UAF CVEs
          </span>
          <span class="legend-item is-line" style="color: var(--series-1)">
            <span class="line-swatch" style="border-color: var(--series-1)" />
            <strong><code>raw_ptr + raw_ref</code> across 6 repos (right axis)</strong>
          </span>
        </div>

        <SecurityUafChart
          :rows="uafGranularity === 'yearly' ? miraclePtr.uafRoi.yearly : miraclePtr.uafRoi.quarterly"
          :metric="uafMetric"
          :granularity="uafGranularity" />
      </div>

      <!-- 2B. raw_ptr & raw_ref Across All 6 Repositories -->
      <div class="sub-section-head">
        <div>
          <h3 class="title is-5 mb-1">
            <code>raw_ptr</code> &amp; <code>raw_ref</code> across repositories
          </h3>
          <p class="muted-note">
            Smart pointer field counts, mass-rewrite campaigns, and density per 10,000
            first-party C++ lines across Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC.
          </p>
        </div>
        <div class="roi-controls">
          <UiSegmented
            v-model="rawPtrField"
            aria-label="Pointer type"
            :options="[
              { value: 'total', label: 'raw_ptr + raw_ref' },
              { value: 'raw_ptr', label: 'raw_ptr' },
              { value: 'raw_ref', label: 'raw_ref' },
            ]" />
          <UiSegmented
            v-model="rawPtrScope"
            aria-label="Repository scale"
            :options="[
              { value: 'all', label: 'All 6 repos' },
              { value: 'subrepos', label: 'Exclude Chrome' },
            ]" />
        </div>
      </div>

      <div class="split-grid mb-5">
        <div class="chart-card">
          <div class="line-chart-box is-compact">
            <ClientOnly>
              <LineChart
                :data="rawPtrChartData"
                :formatter="intFormatter"
                :milestones="miracleMilestones" />
            </ClientOnly>
          </div>
        </div>

        <div class="scorecard-wrap">
          <table class="table is-fullwidth is-hoverable compact-repo-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th class="has-text-right"><code>raw_ptr</code></th>
                <th class="has-text-right"><code>raw_ref</code></th>
                <th class="has-text-right">Total</th>
                <th class="has-text-right">/ 10k LoC</th>
                <th class="has-text-right">90d Δ</th>
                <th class="has-text-right">Treemap</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in miraclePtr.adoption.repos" :key="r.repo">
                <td>
                  <div class="repo-cell">
                    <span class="repo-dot" :style="{ background: r.color }" />
                    <strong :style="{ color: r.color }">{{ r.label }}</strong>
                  </div>
                </td>
                <td class="has-text-right num-cell">{{ fmtInt(r.rawPtr) }}</td>
                <td class="has-text-right num-cell">{{ fmtInt(r.rawRef) }}</td>
                <td class="has-text-right num-cell">
                  <strong>{{ fmtInt(r.total) }}</strong>
                </td>
                <td class="has-text-right num-cell">{{ r.densityPer10kLines.toFixed(1) }}</td>
                <td class="has-text-right num-cell">
                  <span
                    class="delta-badge"
                    :class="
                      r.delta90d > 0 ? 'is-good' : r.delta90d < 0 ? 'is-warn' : 'is-neutral'
                    ">
                    {{ fmtSigned(r.delta90d) }}
                  </span>
                </td>
                <td class="has-text-right">
                  <NuxtLink
                    v-if="r.treemapUrl"
                    :to="r.treemapUrl"
                    class="treemap-icon-link"
                    :title="`Open ${r.label} MiraclePtr treemap`">
                    <UiIcon name="chart-tree" size="small" />
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td><strong>Total</strong></td>
                <td class="has-text-right num-cell">
                  <strong>{{ fmtInt(miraclePtr.adoption.totals.rawPtr) }}</strong>
                </td>
                <td class="has-text-right num-cell">
                  <strong>{{ fmtInt(miraclePtr.adoption.totals.rawRef) }}</strong>
                </td>
                <td class="has-text-right num-cell">
                  <strong>{{ fmtInt(miraclePtr.adoption.totals.total) }}</strong>
                </td>
                <td class="has-text-right num-cell">
                  {{ miraclePtr.adoption.totals.densityPer10kLines.toFixed(1) }}
                </td>
                <td class="has-text-right num-cell">
                  <span
                    class="delta-badge"
                    :class="
                      miraclePtr.adoption.totals.delta90d > 0 ? 'is-good' : 'is-neutral'
                    ">
                    {{ fmtSigned(miraclePtr.adoption.totals.delta90d) }}
                  </span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 2C. RAW_PTR_EXCLUSION -->
      <div class="sub-section-head">
        <div>
          <h3 class="title is-5 mb-1"><code>RAW_PTR_EXCLUSION</code></h3>
          <p class="muted-note">
            Pointer fields explicitly exempted from MiraclePtr protection (performance,
            constexpr/union layout, or FFI boundaries).
          </p>
        </div>
        <UiSegmented
          v-model="exclusionScope"
          aria-label="RAW_PTR_EXCLUSION repository scope"
          :options="[
            { value: 'all', label: 'All 6 repos' },
            { value: 'subrepos', label: 'Exclude Chrome' },
          ]" />
      </div>

      <div class="stat-strip mb-3">
        <div class="stat-pill">
          <span class="stat-label">
            {{ exclusionScope === 'subrepos' ? 'Sub-repos remaining' : 'Remaining' }}
          </span>
          <strong>{{ fmtInt(activeExclusionStats.current) }}</strong>
        </div>
        <div v-if="exclusionScope === 'all'" class="stat-pill">
          <span class="stat-label">Burned from peak</span>
          <strong class="is-good-text">
            {{ miraclePtr.exclusion.totals.burnPct }}%
          </strong>
          <span class="stat-sub">
            (peak {{ fmtInt(miraclePtr.exclusion.totals.peak) }} on
            {{ miraclePtr.exclusion.totals.peakDate }})
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">90d Δ</span>
          <span
            class="delta-badge"
            :class="
              activeExclusionStats.delta90d < 0
                ? 'is-good'
                : activeExclusionStats.delta90d > 0
                  ? 'is-warn'
                  : 'is-neutral'
            ">
            {{ fmtSigned(activeExclusionStats.delta90d) }}
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">365d Δ</span>
          <span
            class="delta-badge"
            :class="
              activeExclusionStats.delta365d < 0
                ? 'is-good'
                : activeExclusionStats.delta365d > 0
                  ? 'is-warn'
                  : 'is-neutral'
            ">
            {{ fmtSigned(activeExclusionStats.delta365d) }}
          </span>
        </div>
      </div>

      <div class="split-grid">
        <div class="chart-card">
          <div class="repo-mini-pills mb-2">
            <span v-for="r in activeExclusionRepos" :key="r.repo" class="repo-mini-pill">
              <span class="repo-dot" :style="{ background: r.color }" />
              <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
              <strong>{{ fmtInt(r.current) }}</strong>
              <span v-if="r.delta90d !== 0" class="mini-delta">
                ({{ fmtSigned(r.delta90d) }})
              </span>
            </span>
          </div>
          <div class="line-chart-box is-compact">
            <ClientOnly>
              <LineChart
                :data="exclusionChartData"
                :formatter="intFormatter"
                :milestones="exclusionMilestones" />
            </ClientOnly>
          </div>
        </div>

        <div class="dirs-card">
          <div class="dirs-card-head">
            <strong>
              Top <code>RAW_PTR_EXCLUSION</code> directories
              <span v-if="exclusionScope === 'subrepos'" class="muted-note">(excl. Chrome)</span>
            </strong>
            <span class="muted-note">90d Δ</span>
          </div>
          <div class="dir-rows">
            <div v-for="d in activeExclusionDirs" :key="`${d.repo}:${d.path}`" class="dir-row">
              <div class="dir-main">
                <span class="repo-tag" :style="{ borderColor: d.repoColor }">
                  <span class="repo-dot" :style="{ background: d.repoColor }" />
                  <span :style="{ color: d.repoColor }">{{ d.repoLabel }}</span>
                </span>
                <NuxtLink :to="d.treemapUrl" class="dir-link">
                  <code>{{ d.path }}/</code>
                  <UiIcon name="open-in-new" size="small" />
                </NuxtLink>
              </div>
              <div class="dir-nums">
                <strong>{{ fmtInt(d.count) }}</strong>
                <span
                  class="delta-badge"
                  :class="
                    d.delta90d < 0 ? 'is-good' : d.delta90d > 0 ? 'is-warn' : 'is-neutral'
                  ">
                  {{ fmtSigned(d.delta90d) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  fmtInt,
  fmtSigned,
  fmtUsd,
  intFormatter,
  type SecurityPayload,
} from '~/utils/security';

const props = defineProps<{
  miraclePtr: SecurityPayload['miraclePtr'];
}>();

const uafMetric = defineModel<'vrp_share' | 'count' | 'usd' | 'all_share'>('uafMetric', {
  required: true,
});
const uafGranularity = defineModel<'yearly' | 'quarterly'>('uafGranularity', { required: true });
const rawPtrField = defineModel<'total' | 'raw_ptr' | 'raw_ref'>('rawPtrField', {
  required: true,
});
const rawPtrScope = defineModel<'all' | 'subrepos'>('rawPtrScope', { required: true });
const exclusionScope = defineModel<'all' | 'subrepos'>('exclusionScope', { required: true });

const uafMetricOptions = [
  { value: 'vrp_share', label: 'VRP UAF %' },
  { value: 'count', label: 'VRP CVEs' },
  { value: 'usd', label: 'VRP $' },
  { value: 'all_share', label: 'All CVEs %' },
];

const miracleMilestones = computed(() => {
  if (rawPtrScope.value === 'subrepos') {
    return [
      { date: '2024-01-18', label: 'Dawn MiraclePtr rewrite (+255)', color: 'var(--series-3)' },
      {
        date: '2026-06-08',
        label: 'Skia raw_ptr definitions (+81)',
        color: 'var(--series-8)',
        anchor: 'end' as const,
      },
      {
        date: '2026-09-24',
        label: 'ANGLE raw_ptr/ref (+143)',
        color: 'var(--series-7)',
        anchor: 'end' as const,
      },
      {
        date: '2026-10-21',
        label: 'Skia Graphite & SkSL (+91)',
        color: 'var(--series-8)',
        anchor: 'end' as const,
      },
    ];
  }
  if (rawPtrField.value === 'raw_ref') {
    return [
      { date: '2022-06-30', label: 'raw_ref<T> introduced (+231)', color: 'var(--series-1)' },
      { date: '2022-11-09', label: 'T& → raw_ref rewrite (+426)', color: 'var(--series-1)' },
      { date: '2023-04-27', label: 'Win/Android/Ash check (+59)', color: 'var(--series-1)' },
      { date: '2023-10-01', label: 'Renderer rewrite (+87)', color: 'var(--series-1)' },
    ];
  }
  return [
    { date: '2021-11-27', label: 'Big Rewrite (+14.3k)', color: 'var(--series-1)' },
    { date: '2022-06-21', label: 'Linux/Mac/CrOS (+2.0k)', color: 'var(--series-1)' },
    { date: '2022-09-01', label: 'MiraclePtr on Stable', color: 'var(--series-1)' },
    { date: '2023-04-21', label: 'Win, Android & Ash (+7.6k)', color: 'var(--series-1)' },
    { date: '2023-10-01', label: 'Renderer rewrite (+1.0k)', color: 'var(--series-1)' },
    { date: '2023-12-20', label: 'vector<raw_ptr> (+2.6k)', color: 'var(--series-1)' },
  ];
});

const exclusionMilestones = computed(() =>
  exclusionScope.value === 'subrepos'
    ? [
        { date: '2024-01-18', label: 'Dawn exclusions', color: 'var(--series-3)' },
        {
          date: '2026-06-15',
          label: 'Skia C ABI exclusions',
          color: 'var(--series-8)',
          anchor: 'end' as const,
        },
        {
          date: '2026-10-26',
          label: 'Skia SkSL hot-path exclusions',
          color: 'var(--series-8)',
          anchor: 'end' as const,
        },
      ]
    : [
        { date: '2022-09-01', label: 'MiraclePtr on Stable', color: 'var(--series-1)' },
        { date: '2023-04-18', label: 'Win/Android/Ash peak (912)', color: 'var(--series-1)' },
      ],
);

const rawPtrChartData = computed(() => {
  const allRepos = props.miraclePtr.adoption.repos;
  const filtered =
    rawPtrScope.value === 'subrepos' ? allRepos.filter((r) => r.repo !== 'chromium') : allRepos;
  return filtered.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, rp, rr, tot]) => ({
      x: new Date(d),
      y: rawPtrField.value === 'raw_ptr' ? rp : rawPtrField.value === 'raw_ref' ? rr : tot,
    })),
  }));
});

const activeExclusionRepos = computed(() => {
  const all = props.miraclePtr.exclusion.repos;
  return exclusionScope.value === 'subrepos' ? all.filter((r) => r.repo !== 'chromium') : all;
});

const activeExclusionStats = computed(() => {
  if (exclusionScope.value === 'all') {
    const t = props.miraclePtr.exclusion.totals;
    return { current: t.current, delta90d: t.delta90d, delta365d: t.delta365d };
  }
  const subs = props.miraclePtr.exclusion.repos.filter((r) => r.repo !== 'chromium');
  return {
    current: subs.reduce((s, r) => s + r.current, 0),
    delta90d: subs.reduce((s, r) => s + r.delta90d, 0),
    delta365d: subs.reduce((s, r) => s + r.delta365d, 0),
  };
});

const activeExclusionDirs = computed(() => {
  const ex = props.miraclePtr.exclusion;
  if (exclusionScope.value === 'subrepos') {
    return (ex.subrepoTopDirs || ex.topDirs.filter((d) => d.repo !== 'chromium')).slice(0, 8);
  }
  return ex.topDirs.slice(0, 8);
});

const exclusionChartData = computed(() => {
  const nonZero = activeExclusionRepos.value.filter((r) => r.peak > 0 || r.current > 0);
  return nonZero.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
  }));
});
</script>
