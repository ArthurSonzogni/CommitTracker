<template>
  <section id="checks" class="section pt-4 pb-6 pillar-section">
    <div class="container">
      <div class="section-toolbar">
        <div>
          <div class="pillar-kicker">Pillar 5</div>
          <h2 class="title is-4 mb-1">
            Invariant hardening (<code>DCHECK</code> vs <code>CHECK</code>)
          </h2>
          <p class="muted-note">
            Production-enforced <code>CHECK(...)</code> assertions turning security-relevant
            invariant violations into deterministic crashes instead of debug-only
            <code>DCHECK(...)</code> UB.
          </p>
        </div>
        <div class="roi-controls">
          <UiSegmented
            v-model="checksChartMode"
            aria-label="Checks chart mode"
            :options="[
              { value: 'counts', label: 'CHECK vs DCHECK counts' },
              { value: 'share', label: 'CHECK hardening %' },
            ]" />
          <UiSegmented
            v-model="checksRange"
            aria-label="Checks history window"
            :options="[
              { value: '2022', label: 'Since 2022' },
              { value: '2025', label: '2025–2026' },
              { value: 'all', label: 'All history' },
            ]" />
        </div>
      </div>

      <div class="stat-strip mb-3">
        <div class="stat-pill">
          <span class="stat-label"><code>CHECK</code> share</span>
          <strong class="is-good-text">
            {{ invariantHardening.totals.checkSharePct.toFixed(1) }}%
          </strong>
          <span class="stat-sub">
            (up from {{ invariantHardening.totals.checkShare2022Pct }}% in 2022)
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label" style="color: var(--series-3)">
            <strong><code>CHECK(...)</code></strong>
          </span>
          <strong style="color: var(--series-3)">
            {{ fmtInt(invariantHardening.totals.checkCurrent) }}
          </strong>
          <span
            class="delta-badge"
            :class="invariantHardening.totals.checkDelta90d > 0 ? 'is-good' : 'is-neutral'">
            {{ fmtSigned(invariantHardening.totals.checkDelta90d) }} in 90d
          </span>
        </div>
        <div class="stat-pill">
          <span class="stat-label" style="color: var(--series-2)">
            <strong><code>DCHECK(...)</code></strong>
          </span>
          <strong style="color: var(--series-2)">
            {{ fmtInt(invariantHardening.totals.dcheckCurrent) }}
          </strong>
          <span
            class="delta-badge"
            :class="invariantHardening.totals.dcheckDelta90d < 0 ? 'is-good' : 'is-warn'">
            {{ fmtSigned(invariantHardening.totals.dcheckDelta90d) }} in 90d
          </span>
        </div>
      </div>

      <div class="split-grid">
        <div class="chart-card">
          <div class="repo-mini-pills mb-2">
            <span v-for="r in invariantHardening.repos" :key="r.repo" class="repo-mini-pill">
              <span class="repo-dot" :style="{ background: r.color }" />
              <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
              <strong>{{ r.checkSharePct.toFixed(0) }}%</strong>
              <span class="mini-delta">
                ({{ fmtCompact(r.checkCurrent) }} C / {{ fmtCompact(r.dcheckCurrent) }} D)
              </span>
            </span>
          </div>
          <div class="line-chart-box is-compact">
            <ClientOnly>
              <LineChart
                :data="checksChartData"
                :formatter="checksChartMode === 'share' ? pctFormatter : intFormatter"
                :milestones="checksMilestones" />
            </ClientOnly>
          </div>
        </div>

        <div class="dirs-card">
          <div class="dirs-card-head">
            <strong>Subsystems by assertion balance</strong>
            <UiSegmented
              v-model="checksDirSort"
              aria-label="Directory sort"
              :options="[
                { value: 'dcheck', label: 'Most DCHECKs' },
                { value: 'check', label: 'Most CHECKs' },
              ]" />
          </div>
          <div class="dir-rows">
            <div v-for="d in activeCheckDirs" :key="`${d.repo}:${d.path}`" class="dir-row">
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
                <span class="unit-inline">
                  {{ fmtCompact(d.checkCount) }} C / {{ fmtCompact(d.dcheckCount) }} D
                </span>
                <span
                  class="delta-badge"
                  :class="
                    d.checkSharePct >= 65
                      ? 'is-good'
                      : d.checkSharePct < 30
                        ? 'is-warn'
                        : 'is-neutral'
                  ">
                  {{ d.checkSharePct }}% CHECK
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
  fmtCompact,
  fmtInt,
  fmtSigned,
  intFormatter,
  pctFormatter,
  type SecurityPayload,
} from '~/utils/security';

const props = defineProps<{
  invariantHardening: SecurityPayload['invariantHardening'];
}>();

const checksChartMode = defineModel<'counts' | 'share'>('checksChartMode', { required: true });
const checksRange = defineModel<'2022' | '2025' | 'all'>('checksRange', { required: true });
const checksDirSort = defineModel<'dcheck' | 'check'>('checksDirSort', { required: true });

const checksMilestones = computed(() => {
  const c = checksChartMode.value === 'share' ? 'var(--series-1)' : 'var(--series-3)';
  const items: any[] = [
    {
      date: '2026-04-01',
      label: 'Apr 1, 2026: Systematic CHECK() conversion',
      color: c,
      anchor: 'end' as const,
      pill: true,
      yRatio: checksChartMode.value === 'share' ? 0.30 : 0.42,
    },
  ];
  if (checksRange.value !== '2025') {
    items.unshift({
      date: '2023-02-01',
      label: 'Prefer CHECK() over DCHECK() guideline',
      color: c,
    });
  }
  return items;
});

const checksStartDate = computed(() =>
  checksRange.value === '2025'
    ? '2025-01-01'
    : checksRange.value === '2022'
      ? '2022-01-01'
      : '2019-01-01',
);

const checksChartData = computed(() => {
  const minD = checksStartDate.value;
  const ts = props.invariantHardening.totalSeries.filter(([d]) => d >= minD);
  if (checksChartMode.value === 'share') {
    return props.invariantHardening.repos.map((r) => ({
      label: `${r.label} CHECK %`,
      color: r.color,
      values: r.series
        .filter(([d]) => d >= minD)
        .map(([d, , , sh]) => ({ x: new Date(d), y: sh })),
    }));
  }
  return [
    {
      label: 'CHECK(...) — production enforced',
      color: 'var(--series-3)',
      values: ts.map(([d, ck]) => ({ x: new Date(d), y: ck })),
    },
    {
      label: 'DCHECK(...) — debug only',
      color: 'var(--series-2)',
      values: ts.map(([d, , dc]) => ({ x: new Date(d), y: dc })),
    },
  ];
});

const activeCheckDirs = computed(() =>
  checksDirSort.value === 'check'
    ? props.invariantHardening.topCheckDirs.slice(0, 8)
    : props.invariantHardening.topDcheckDirs.slice(0, 8),
);
</script>
