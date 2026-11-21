<template>
  <section id="dangling" class="section pt-4 pb-5 pillar-section">
    <div class="container">
      <div class="section-toolbar">
        <div>
          <div class="pillar-kicker">Pillar 3</div>
          <h2 class="title is-4 mb-1">
            Dangling pointers (<code>DanglingUntriaged</code>) &amp; completion trend
          </h2>
          <p class="muted-note">
            Pre-existing <code>raw_ptr&lt;T, DanglingUntriaged&gt;</code> annotations awaiting
            lifetime / ownership cleanup, with linear burn-down projection to zero.
          </p>
        </div>
        <UiSegmented
          v-model="danglingTrendBasis"
          aria-label="DanglingUntriaged projection basis"
          :options="[
            { value: '1y', label: '1y rate' },
            { value: 'peak', label: 'Since peak' },
            { value: '90d', label: '90d rate' },
          ]" />
      </div>

      <div class="stat-strip mb-3">
        <div class="stat-pill">
          <span class="stat-label">Remaining</span>
          <strong>{{ fmtInt(danglingPointers.totals.current) }}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Eliminated from peak</span>
          <strong class="is-good-text">
            {{ fmtInt(danglingPointers.totals.fixedFromPeak) }}
          </strong>
          <span class="stat-sub">
            ({{ danglingPointers.totals.burnPct }}% of
            {{ fmtInt(danglingPointers.totals.peak) }} peak on
            {{ danglingPointers.totals.peakDate }})
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">{{ basisLabel(danglingTrendBasis) }} slope</span>
          <span
            class="delta-badge"
            :class="activeDanglingProjection.slopePerDay < -0.01 ? 'is-good' : 'is-warn'">
            {{ fmtSlope(activeDanglingProjection.slopePerDay) }}/d
          </span>
          <span class="stat-sub">
            ({{ fmtSigned(activeDanglingProjection.delta) }} over
            {{ Math.round(activeDanglingProjection.days) }}d)
          </span>
        </div>
        <div class="stat-pill eta-pill">
          <span class="stat-label">Estimated completion (ETA to 0)</span>
          <template v-if="activeDanglingProjection.etaDate">
            <code class="eta-code">{{ activeDanglingProjection.etaDate }}</code>
            <span class="stat-sub">
              (~{{ fmtEtaDuration(activeDanglingProjection.etaDays) }})
            </span>
          </template>
          <span v-else class="delta-badge is-warn">
            90d slightly rising ({{ fmtSigned(activeDanglingProjection.delta) }}) — switch to 1y
            or Since peak
          </span>
        </div>
      </div>

      <div class="split-grid">
        <div class="chart-card">
          <div class="repo-mini-pills mb-2">
            <span v-for="r in danglingPointers.repos" :key="r.repo" class="repo-mini-pill">
              <span class="repo-dot" :style="{ background: r.color }" />
              <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
              <strong>{{ fmtInt(r.current) }}</strong>
            </span>
          </div>
          <div class="line-chart-box is-compact">
            <ClientOnly>
              <LineChart
                :data="danglingChartData"
                :formatter="intFormatter"
                :milestones="danglingMilestones" />
            </ClientOnly>
          </div>
        </div>

        <div class="dirs-card">
          <div class="dirs-card-head">
            <strong>Top remaining <code>DanglingUntriaged</code> directories</strong>
            <span class="muted-note">90d Δ</span>
          </div>
          <div class="dir-rows">
            <div
              v-for="d in danglingPointers.topDirs.slice(0, 8)"
              :key="`${d.repo}:${d.path}`"
              class="dir-row">
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
                <span class="unit-inline">({{ d.sharePct }}%)</span>
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
  fmtEtaDuration,
  fmtInt,
  fmtSigned,
  fmtSlope,
  intFormatter,
  type SecurityPayload,
} from '~/utils/security';

const props = defineProps<{
  danglingPointers: SecurityPayload['danglingPointers'];
}>();

const danglingTrendBasis = defineModel<'1y' | 'peak' | '90d'>('danglingTrendBasis', {
  required: true,
});

const danglingMilestones = [
  { date: '2022-10-01', label: 'DanglingPtr detector rollout', color: 'var(--series-1)' },
  { date: '2023-08-31', label: 'Peak DanglingUntriaged (6,010)', color: 'var(--series-1)' },
];

const activeDanglingProjection = computed(() =>
  computeLinearProjection(
    props.danglingPointers.totalSeries,
    danglingTrendBasis.value,
    '2022-01-01',
  ),
);

const danglingChartData = computed(() => {
  const nonZero = props.danglingPointers.repos.filter((r) => r.peak > 0 || r.current > 0);
  const out: any[] = nonZero.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
  }));

  const proj = activeDanglingProjection.value;
  if (proj.trendPoints.length) {
    const endTag = proj.etaDate
      ? `ETA ${proj.etaDate} (${fmtSlope(proj.slopePerDay)}/d)`
      : `${fmtSlope(proj.slopePerDay)}/d (${basisLabel(danglingTrendBasis.value)} rising)`;
    out.push({
      label: `Projected (${basisLabel(danglingTrendBasis.value)} rate)`,
      color: 'var(--ink)',
      dashed: true,
      endLabel: endTag,
      values: proj.trendPoints,
    });
  }
  return out;
});
</script>
