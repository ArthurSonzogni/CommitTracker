<template>
  <section id="rust" class="section pt-4 pb-5 pillar-section">
    <div class="container">
      <div class="section-toolbar">
        <div>
          <div class="pillar-kicker">Pillar 4</div>
          <h2 class="title is-4 mb-1">First-party Rust adoption</h2>
          <p class="muted-note">
            First-party <code>*.rs</code> source files across repositories (excluding vendored
            <code>third_party/rust</code> crates).
          </p>
        </div>
        <UiSegmented
          v-if="hasNonChromeRust"
          v-model="rustScope"
          aria-label="Rust repository view"
          :options="[
            { value: 'all', label: 'All 6 repos' },
            { value: 'subrepos', label: 'Exclude Chrome' },
          ]" />
      </div>

      <div class="stat-strip mb-3">
        <div class="stat-pill">
          <span class="stat-label">First-party .rs files</span>
          <strong>{{ fmtInt(rust.totals.current) }}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-label">90d growth</span>
          <span
            class="delta-badge"
            :class="rust.totals.delta90d > 0 ? 'is-good' : 'is-neutral'">
            {{ fmtSigned(rust.totals.delta90d) }}
          </span>
          <span class="stat-sub">(~{{ rust.totals.velocityPerWeek90d }}/wk)</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">365d growth</span>
          <span
            class="delta-badge"
            :class="rust.totals.delta365d > 0 ? 'is-good' : 'is-neutral'">
            {{ fmtSigned(rust.totals.delta365d) }}
          </span>
        </div>
      </div>

      <div class="split-grid">
        <div class="chart-card">
          <div class="repo-mini-pills mb-2">
            <span v-for="r in activeRustRepos" :key="r.repo" class="repo-mini-pill">
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
                :data="rustChartData"
                :formatter="intFormatter"
                :milestones="rustMilestones" />
            </ClientOnly>
          </div>
        </div>

        <div class="dirs-card">
          <div class="dirs-card-head">
            <strong>
              Top first-party Rust subsystems
              <span v-if="rustScope === 'subrepos'" class="muted-note">(excl. Chrome)</span>
            </strong>
            <span class="muted-note">90d Δ</span>
          </div>
          <div class="dir-rows">
            <div v-for="d in activeRustDirs" :key="`${d.repo}:${d.path}`" class="dir-row">
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
                    d.delta90d > 0 ? 'is-good' : d.delta90d < 0 ? 'is-warn' : 'is-neutral'
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
import { fmtInt, fmtSigned, intFormatter, type SecurityPayload } from '~/utils/security';

const props = defineProps<{
  rust: SecurityPayload['rust'];
}>();

const rustScope = defineModel<'all' | 'subrepos'>('rustScope', { required: true });

const hasNonChromeRust = computed(() =>
  props.rust.repos.some((r) => r.repo !== 'chromium' && r.current > 0),
);

const rustMilestones = computed(() =>
  rustScope.value === 'subrepos'
    ? [
        {
          date: '2026-01-15',
          label: 'ANGLE & Skia Rust crates',
          color: 'var(--series-7)',
          anchor: 'end' as const,
        },
      ]
    : [{ date: '2023-01-12', label: 'Production Rust allowed in Chromium', color: 'var(--series-1)' }],
);

const activeRustRepos = computed(() => {
  const all = props.rust.repos;
  return rustScope.value === 'subrepos' ? all.filter((r) => r.repo !== 'chromium') : all;
});

const activeRustDirs = computed(() => {
  const rs = props.rust;
  if (rustScope.value === 'subrepos') {
    return (rs.subrepoTopDirs || rs.topDirs.filter((d) => d.repo !== 'chromium')).slice(0, 8);
  }
  return rs.topDirs.slice(0, 8);
});

const rustChartData = computed(() => {
  const base =
    rustScope.value === 'subrepos'
      ? props.rust.repos.filter((r) => r.repo !== 'chromium')
      : props.rust.repos.filter((r) => r.current > 0 || r.repo === 'chromium');
  return base.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
  }));
});
</script>
