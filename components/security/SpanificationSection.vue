<template>
  <section id="spanification" class="section pt-3 pb-5 pillar-section">
    <div class="container">
      <div class="section-toolbar">
        <div>
          <div class="pillar-kicker">Pillar 1</div>
          <h2 class="title is-4 mb-1">Spanification (<code>-Wunsafe-buffer-usage</code>)</h2>
          <p class="muted-note">
            Compile-time bounds-safety enforcement and <code>UNSAFE_TODO</code> burn-down across
            Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC.
          </p>
        </div>
        <UiSegmented
          v-model="spanScope"
          aria-label="Spanification code scope"
          :options="[
            { value: 'first_party', label: 'First-party' },
            { value: 'all', label: 'All code (incl. third_party)' },
          ]" />
      </div>

      <!-- 1A. Multi-Repo Spanification Coverage Table -->
      <div class="scorecard-wrap mb-4">
        <table class="table is-fullwidth is-hoverable scorecard-table span-repo-table">
          <thead>
            <tr>
              <th class="detail-col" aria-label="Expand uncovered directories"></th>
              <th>Repository</th>
              <th>Coverage</th>
              <th class="has-text-right">Covered / Total C++ lines</th>
              <th class="has-text-right">Uncovered lines</th>
              <th class="has-text-right"><code>allow_unsafe_buffers</code></th>
              <th class="has-text-right"><code>UNSAFE_TODO</code></th>
              <th class="has-text-right">90d Δ</th>
              <th class="has-text-right">Treemap</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in activeSpanScope.repos" :key="row.repo">
              <tr :class="{ 'is-expanded': expandedSpanRepos.has(row.repo) }">
                <td class="detail-col">
                  <button
                    v-if="row.topUncoveredDirs.length"
                    type="button"
                    class="expand-btn"
                    :aria-expanded="expandedSpanRepos.has(row.repo)"
                    :aria-label="`Toggle uncovered directories for ${row.label}`"
                    @click="toggleSpanExpand(row.repo)">
                    <UiIcon
                      :name="
                        expandedSpanRepos.has(row.repo) ? 'chevron-down' : 'chevron-right'
                      "
                      size="small" />
                  </button>
                </td>

                <td>
                  <div class="repo-cell">
                    <span class="repo-dot" :style="{ background: row.color }" />
                    <strong :style="{ color: row.color }">{{ row.label }}</strong>
                  </div>
                </td>

                <td class="progress-col">
                  <div class="progress-cell">
                    <div class="progress-bar-track">
                      <div
                        class="progress-bar-fill"
                        :class="covTone(row.coveragePct)"
                        :style="{
                          width: `${Math.min(100, Math.max(0, row.coveragePct))}%`,
                        }" />
                    </div>
                    <span class="progress-pct">{{ formatCovPct(row.coveragePct) }}%</span>
                  </div>
                </td>

                <td class="has-text-right num-cell">
                  <strong>{{ fmtCompact(row.coveredLines) }}</strong>
                  <span class="unit-inline"> / {{ fmtCompact(row.totalLines) }}</span>
                </td>

                <td class="has-text-right num-cell">
                  <strong>{{ fmtInt(row.uncoveredLines) }}</strong>
                </td>

                <td class="has-text-right num-cell">
                  <NuxtLink
                    v-if="row.allowTreemapUrl && row.allowUnsafeBuffersFiles > 0"
                    :to="row.allowTreemapUrl"
                    class="metric-link">
                    {{ fmtInt(row.allowUnsafeBuffersFiles) }} files
                  </NuxtLink>
                  <span v-else class="muted-dash">{{ fmtInt(row.allowUnsafeBuffersFiles) }}</span>
                </td>

                <td class="has-text-right num-cell">
                  <NuxtLink
                    v-if="row.todoTreemapUrl && row.unsafeTodoCount > 0"
                    :to="row.todoTreemapUrl"
                    class="metric-link">
                    {{ fmtInt(row.unsafeTodoCount) }}
                  </NuxtLink>
                  <span v-else class="muted-dash">{{ fmtInt(row.unsafeTodoCount) }}</span>
                </td>

                <td class="has-text-right num-cell">
                  <span
                    class="delta-badge"
                    :class="
                      row.coverageDelta90dPct > 0
                        ? 'is-good'
                        : row.coverageDelta90dPct < 0
                          ? 'is-warn'
                          : 'is-neutral'
                    ">
                    {{ row.coverageDelta90dPct > 0 ? '+' : ''
                    }}{{ row.coverageDelta90dPct.toFixed(2) }} pp
                  </span>
                </td>

                <td class="has-text-right">
                  <NuxtLink
                    :to="row.treemapUrl"
                    class="treemap-pill-link"
                    :title="`Explore ${row.label} in Treemap`">
                    <UiIcon name="chart-tree" size="small" />
                    <span>Explore</span>
                  </NuxtLink>
                </td>
              </tr>

              <!-- Expandable Uncovered Directories Drawer -->
              <tr
                v-if="expandedSpanRepos.has(row.repo) && row.topUncoveredDirs.length"
                class="blocker-detail-row">
                <td colspan="9">
                  <div class="blocker-drawer">
                    <div class="blocker-drawer-head">
                      <strong>
                        Top uncovered directories in {{ row.label }} ({{
                          spanScope === 'first_party' ? 'first-party' : 'all code'
                        }})
                      </strong>
                      <NuxtLink :to="row.treemapUrl" class="drawer-treemap-cta">
                        Open {{ row.label }} treemap
                        <UiIcon name="arrow-right" size="small" />
                      </NuxtLink>
                    </div>
                    <div class="blocker-list">
                      <div
                        v-for="(d, idx) in row.topUncoveredDirs"
                        :key="`${d.repo}:${d.path}`"
                        class="blocker-item">
                        <span class="blocker-rank">#{{ idx + 1 }}</span>
                        <NuxtLink :to="d.treemapUrl" class="blocker-path">
                          <code>{{ d.path }}/</code>
                          <UiIcon name="open-in-new" size="small" />
                        </NuxtLink>
                        <div class="blocker-bar-track">
                          <div
                            class="blocker-bar-fill"
                            :style="{ width: `${Math.min(100, d.sharePct)}%` }" />
                        </div>
                        <span class="blocker-stats">
                          <strong>{{ fmtInt(d.uncoveredLines) }}</strong> lines
                          <span class="blocker-share">({{ d.sharePct }}%)</span>
                        </span>
                        <span
                          class="blocker-delta"
                          :class="
                            d.delta90d < 0 ? 'is-good' : d.delta90d > 0 ? 'is-warn' : ''
                          ">
                          90d: {{ fmtSigned(d.delta90d) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td></td>
              <td>
                <strong>Total ({{ activeSpanScope.repos.length }} repositories)</strong>
              </td>
              <td class="progress-col">
                <div class="progress-cell">
                  <div class="progress-bar-track">
                    <div
                      class="progress-bar-fill"
                      :class="covTone(activeSpanScope.totals.coveragePct)"
                      :style="{
                        width: `${Math.min(100, Math.max(0, activeSpanScope.totals.coveragePct))}%`,
                      }" />
                  </div>
                  <span class="progress-pct">
                    {{ formatCovPct(activeSpanScope.totals.coveragePct) }}%
                  </span>
                </div>
              </td>
              <td class="has-text-right num-cell">
                <strong>{{ fmtCompact(activeSpanScope.totals.coveredLines) }}</strong>
                <span class="unit-inline">
                  / {{ fmtCompact(activeSpanScope.totals.totalLines) }}
                </span>
              </td>
              <td class="has-text-right num-cell">
                <strong>{{ fmtInt(activeSpanScope.totals.uncoveredLines) }}</strong>
              </td>
              <td class="has-text-right num-cell">
                <strong>{{ fmtInt(activeSpanScope.totals.allowUnsafeBuffersFiles) }}</strong>
                files
              </td>
              <td class="has-text-right num-cell">
                <strong>{{ fmtInt(activeSpanScope.totals.unsafeTodoCount) }}</strong>
              </td>
              <td class="has-text-right num-cell">
                <span
                  class="delta-badge"
                  :class="
                    activeSpanScope.totals.coverageDelta90dPct > 0
                      ? 'is-good'
                      : activeSpanScope.totals.coverageDelta90dPct < 0
                        ? 'is-warn'
                        : 'is-neutral'
                  ">
                  {{ activeSpanScope.totals.coverageDelta90dPct > 0 ? '+' : ''
                  }}{{ activeSpanScope.totals.coverageDelta90dPct.toFixed(2) }} pp
                </span>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Historical Spanification Coverage % Chart -->
      <div class="chart-card mb-5">
        <div class="sub-head">
          <div>
            <h3 class="sub-title">Spanification coverage % over time</h3>
            <p class="muted-note">
              Share of C++ lines compiled with <code>-Wunsafe-buffer-usage</code> enabled across
              all 6 repositories.
            </p>
          </div>
          <div class="chips">
            <button
              v-for="r in activeSpanScope.repos"
              :key="r.repo"
              type="button"
              class="chip repo-filter-chip"
              :class="{ 'is-active': spanReposSelected.includes(r.repo) }"
              :style="repoChipStyle(r.color, spanReposSelected.includes(r.repo))"
              @click="toggleRepoSelection(r.repo)">
              <span class="repo-dot" :style="{ background: r.color }" />
              <span>{{ r.label }}</span>
            </button>
          </div>
        </div>
        <div class="line-chart-box">
          <ClientOnly>
            <LineChart
              :data="spanCoverageChartData"
              :formatter="pctFormatter"
              :milestones="spanMilestones" />
          </ClientOnly>
        </div>
      </div>

      <!-- 1B. UNSAFE_TODO Fixes -->
      <div class="sub-section-head">
        <div>
          <h3 class="title is-5 mb-1"><code>UNSAFE_TODO</code> fixes &amp; completion trend</h3>
          <p class="muted-note">
            Granular pointer-arithmetic call sites wrapped in <code>UNSAFE_TODO(...)</code>
            (plus <code>ANGLE_UNSAFE_TODO</code>, <code>DAWN_UNSAFE_TODO</code>, and
            <code>SK_UNSAFE_TODO</code>) with linear burn-down projection to zero.
          </p>
        </div>
        <div class="roi-controls">
          <UiSegmented
            v-model="todoChartMode"
            aria-label="UNSAFE_TODO chart view"
            :options="[
              { value: 'by_repo', label: 'By repository' },
              { value: 'subrepos', label: 'Exclude Chrome' },
              { value: 'vs_span', label: 'vs base::span<T>' },
            ]" />
          <UiSegmented
            v-model="todoTrendBasis"
            aria-label="UNSAFE_TODO projection basis"
            :options="[
              { value: '90d', label: '90d rate' },
              { value: 'peak', label: 'Since peak' },
              { value: '1y', label: '1y rate' },
            ]" />
        </div>
      </div>

      <div class="stat-strip mb-3">
        <div class="stat-pill">
          <span class="stat-label">
            {{ todoChartMode === 'subrepos' ? 'Sub-repos remaining' : 'Remaining' }}
          </span>
          <strong>{{ fmtInt(activeTodoProjection.curVal) }}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Fixed from peak</span>
          <strong class="is-good-text">
            {{ fmtInt(activeTodoProjection.fixedFromPeak) }}
          </strong>
          <span class="stat-sub">
            ({{ activeTodoProjection.burnPct }}% of {{ fmtInt(activeTodoProjection.peakVal) }}
            peak on {{ activeTodoProjection.peakDate }})
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">{{ basisLabel(todoTrendBasis) }} slope</span>
          <span
            class="delta-badge"
            :class="activeTodoProjection.slopePerDay < -0.01 ? 'is-good' : 'is-warn'">
            {{ fmtSlope(activeTodoProjection.slopePerDay) }}/d
          </span>
          <span class="stat-sub">
            ({{ fmtSigned(activeTodoProjection.delta) }} over
            {{ Math.round(activeTodoProjection.days) }}d)
          </span>
        </div>
        <div class="stat-pill eta-pill">
          <span class="stat-label">Estimated completion (ETA to 0)</span>
          <template v-if="activeTodoProjection.etaDate">
            <code class="eta-code">{{ activeTodoProjection.etaDate }}</code>
            <span class="stat-sub">
              (~{{ fmtEtaDuration(activeTodoProjection.etaDays) }})
            </span>
          </template>
          <span v-else class="delta-badge is-warn">
            Rising over {{ basisLabel(todoTrendBasis) }} — select 90d or Since peak
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label"><code>base::span&lt;T&gt;</code></span>
          <strong :style="{ color: 'var(--series-3)' }">
            {{ fmtInt(spanification.unsafeTodo.totals.baseSpanCurrent) }}
          </strong>
          <span class="stat-sub">
            ({{ fmtSigned(spanification.unsafeTodo.totals.baseSpanDelta90d) }} in 90d)
          </span>
        </div>
      </div>

      <div class="split-grid">
        <div class="chart-card">
          <div class="repo-mini-pills mb-2">
            <span v-for="r in activeTodoRepos" :key="r.repo" class="repo-mini-pill">
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
                :data="unsafeTodoChartData"
                :formatter="intFormatter"
                :milestones="todoMilestones" />
            </ClientOnly>
          </div>
        </div>

        <div class="dirs-card">
          <div class="dirs-card-head">
            <strong>
              Top remaining <code>UNSAFE_TODO</code> directories
              <span v-if="todoChartMode === 'subrepos'" class="muted-note">(excl. Chrome)</span>
            </strong>
            <span class="muted-note">90d Δ</span>
          </div>
          <div class="dir-rows">
            <div v-for="d in activeTodoDirs" :key="`${d.repo}:${d.path}`" class="dir-row">
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
  basisLabel,
  computeLinearProjection,
  fmtCompact,
  fmtEtaDuration,
  fmtInt,
  fmtSigned,
  fmtSlope,
  formatCovPct,
  intFormatter,
  pctFormatter,
  repoChipStyle,
  type SecurityPayload,
} from '~/utils/security';

const props = defineProps<{
  spanification: SecurityPayload['spanification'];
}>();

const spanScope = defineModel<'first_party' | 'all'>('spanScope', { required: true });
const spanReposSelected = defineModel<string[]>('spanReposSelected', { required: true });
const todoChartMode = defineModel<'by_repo' | 'subrepos' | 'vs_span'>('todoChartMode', {
  required: true,
});
const todoTrendBasis = defineModel<'90d' | 'peak' | '1y'>('todoTrendBasis', { required: true });

const expandedSpanRepos = ref<Set<string>>(new Set());

const toggleSpanExpand = (repo: string) => {
  const next = new Set(expandedSpanRepos.value);
  if (next.has(repo)) next.delete(repo);
  else next.add(repo);
  expandedSpanRepos.value = next;
};

const toggleRepoSelection = (repoId: string) => {
  const next = new Set(spanReposSelected.value);
  if (next.has(repoId)) {
    if (next.size > 1) next.delete(repoId);
  } else {
    next.add(repoId);
  }
  spanReposSelected.value = [...next];
};

const covTone = (pct: number) => {
  if (pct >= 95) return 'is-complete';
  if (pct >= 50) return 'is-good';
  if (pct > 0) return 'is-early';
  return 'is-zero';
};

const activeSpanScope = computed(() => props.spanification.scopes[spanScope.value]);

const spanMilestones = [
  {
    date: '2024-04-01',
    label: '-Wunsafe-buffer-usage rollout',
    color: 'var(--series-1)',
    anchor: 'end' as const,
  },
  { date: '2024-08-15', label: 'UNSAFE_TODO macro introduced', color: 'var(--series-1)' },
];

const todoMilestones = computed(() => {
  const c =
    todoChartMode.value === 'vs_span'
      ? 'var(--series-8)'
      : todoChartMode.value === 'subrepos'
        ? 'var(--series-7)'
        : 'var(--series-1)';
  return [{ date: '2024-08-15', label: 'UNSAFE_TODO macro introduced', color: c }];
});

const spanCoverageChartData = computed(() => {
  const chosen = activeSpanScope.value.repos.filter((r) =>
    spanReposSelected.value.includes(r.repo),
  );
  return chosen.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series
      .filter(([d]) => d >= '2023-09-01')
      .map(([d, pct]) => ({ x: new Date(d), y: pct })),
  }));
});

const subrepoTodoTotalSeries = computed<Array<[string, number]>>(() => {
  const block = props.spanification.unsafeTodo;
  const chromeRepo = block.repos.find((r) => r.repo === 'chromium');
  if (!chromeRepo) return block.totalSeries.map(([d, tot]) => [d, tot]);
  const chromeMs = chromeRepo.series.map(([d, v]) => [new Date(d).getTime(), v] as const);
  const sampleChrome = (ms: number) => {
    let lo = 0;
    let hi = chromeMs.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (chromeMs[mid][0] <= ms) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return chromeMs.length ? chromeMs[ans][1] : 0;
  };
  return block.totalSeries.map(([d, tot]) => [
    d,
    Math.max(0, tot - sampleChrome(new Date(d).getTime())),
  ]);
});

const activeTodoProjection = computed(() => {
  const pts: Array<[string, number]> =
    todoChartMode.value === 'subrepos'
      ? subrepoTodoTotalSeries.value
      : props.spanification.unsafeTodo.totalSeries.map(([d, tot]) => [d, tot]);
  return computeLinearProjection(pts, todoTrendBasis.value, '2024-06-01');
});

const activeTodoRepos = computed(() => {
  const all = props.spanification.unsafeTodo.repos;
  return todoChartMode.value === 'subrepos' ? all.filter((r) => r.repo !== 'chromium') : all;
});

const activeTodoDirs = computed(() => {
  const block = props.spanification.unsafeTodo;
  if (todoChartMode.value === 'subrepos') {
    return (block.subrepoTopDirs || block.topDirs.filter((d) => d.repo !== 'chromium')).slice(0, 8);
  }
  return block.topDirs.slice(0, 8);
});

const unsafeTodoChartData = computed(() => {
  const block = props.spanification.unsafeTodo;
  const proj = activeTodoProjection.value;
  const endTag = proj.etaDate
    ? `ETA ${proj.etaDate} (${fmtSlope(proj.slopePerDay)}/d)`
    : `${fmtSlope(proj.slopePerDay)}/d (${basisLabel(todoTrendBasis.value)} rising)`;

  if (todoChartMode.value === 'vs_span') {
    const out: any[] = [
      {
        label: 'UNSAFE_TODO remaining',
        color: 'var(--series-8)',
        values: block.totalSeries.map(([d, todo]) => ({ x: new Date(d), y: todo })),
      },
      {
        label: 'base::span<T> uses',
        color: 'var(--series-3)',
        values: block.totalSeries.map(([d, , span]) => ({ x: new Date(d), y: span })),
      },
    ];
    if (proj.trendPoints.length) {
      out.push({
        label: `UNSAFE_TODO ${basisLabel(todoTrendBasis.value)} trend`,
        color: 'var(--series-8)',
        dashed: true,
        endLabel: endTag,
        values: proj.trendPoints,
      });
    }
    return out;
  }

  if (todoChartMode.value === 'subrepos') {
    const repos = block.repos.filter(
      (r) => r.repo !== 'chromium' && (r.peak > 0 || r.current > 0),
    );
    const out: any[] = [
      {
        label: 'Sub-repos total',
        color: 'var(--ink)',
        strokeWidth: 2,
        values: subrepoTodoTotalSeries.value.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
      },
      ...repos.map((r) => ({
        label: r.label,
        color: r.color,
        values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
      })),
    ];
    if (proj.trendPoints.length) {
      out.push({
        label: `Sub-repos ${basisLabel(todoTrendBasis.value)} trend`,
        color: 'var(--ink)',
        dashed: true,
        endLabel: endTag,
        values: proj.trendPoints,
      });
    }
    return out;
  }

  const repos = block.repos.filter((r) => r.peak > 0 || r.current > 0 || r.repo === 'chromium');
  const out: any[] = [
    {
      label: 'All 6 repos',
      color: 'var(--ink)',
      strokeWidth: 2,
      values: block.totalSeries.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
    },
    ...repos.map((r) => ({
      label: r.label,
      color: r.color,
      values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
    })),
  ];
  if (proj.trendPoints.length) {
    out.push({
      label: `Projected (${basisLabel(todoTrendBasis.value)} rate)`,
      color: 'var(--ink)',
      dashed: true,
      endLabel: endTag,
      values: proj.trendPoints,
    });
  }
  return out;
});
</script>
