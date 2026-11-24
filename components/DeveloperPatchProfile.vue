<template>
  <div v-if="summaries.length" class="patch-profile">
    <div class="profile-controls">
      <UiSegmented
        v-model="trendMetric"
        aria-label="Patch profile metric"
        :options="[
          { value: 'lines', label: 'Patch size (lines)' },
          { value: 'msg', label: 'Description length (chars)' },
          { value: 'files', label: 'Files per patch' },
        ]" />
      <span class="profile-note">
        Authored commits · {{ bucketLabel }} median{{ trendMetric === 'msg' ? ' (excl. reverts & rolls)' : '' }}
      </span>
    </div>

    <div v-if="trendMonths.length >= 2 && trendSeries.length" class="trend-box">
      <div v-if="trendSeries.length > 1" class="legend">
        <span v-for="s in trendSeries" :key="s.label">
          <span
            :class="['legend-line', { dashed: s.dashed }]"
            :style="s.dashed ? { borderColor: s.color } : { background: s.color }" />{{ s.label }}
        </span>
      </div>
      <ReportTraitChart
        :months="trendMonths"
        :series="trendSeries"
        :from="trendMonths[0]"
        :highlight-from="`${currentYear}-01`"
        :format="trendFormat"
        :axis-format="trendAxisFormat"
        :aria-label="`Personal ${trendMetric} over time`" />
    </div>

    <div class="hist-grid">
      <div class="hist-card">
        <h3 class="hist-title">Patch size distribution (lines changed)</h3>
        <div v-if="summaries.length > 1" class="legend">
          <span v-for="s in summaries" :key="s.developer">
            <span class="legend-line" :style="{ background: s.color }" />{{ s.developer }}
          </span>
        </div>
        <div class="hist-rows">
          <div v-for="(bucket, bi) in SIZE_BUCKETS" :key="bucket.label" class="hist-row">
            <span class="hist-label">{{ bucket.label }}</span>
            <div class="hist-bars">
              <div
                v-for="s in summaries"
                :key="s.developer"
                class="hist-bar-line"
                :title="`${s.developer}: ${intFmt.format(s.sizeCounts[bi])} commits (${(s.sizeShares[bi] * 100).toFixed(1)}%)`">
                <div class="hist-track">
                  <div
                    class="hist-fill"
                    :style="{ width: `${(s.sizeShares[bi] / maxSizeShare) * 100}%`, background: s.color }" />
                </div>
                <span class="hist-val">{{ Math.round(s.sizeShares[bi] * 100) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="hasMsgData" class="hist-card">
        <h3 class="hist-title">Description length distribution (chars)</h3>
        <div v-if="summaries.length > 1" class="legend">
          <span v-for="s in summaries" :key="s.developer">
            <span class="legend-line" :style="{ background: s.color }" />{{ s.developer }}
          </span>
        </div>
        <div class="hist-rows">
          <div v-for="(bucket, bi) in MSG_BUCKETS" :key="bucket.label" class="hist-row">
            <span class="hist-label">{{ bucket.label }}</span>
            <div class="hist-bars">
              <div
                v-for="s in summaries"
                :key="s.developer"
                class="hist-bar-line"
                :title="`${s.developer}: ${intFmt.format(s.msgCounts[bi])} commits (${(s.msgShares[bi] * 100).toFixed(1)}%)`">
                <div class="hist-track">
                  <div
                    class="hist-fill"
                    :style="{ width: `${(s.msgShares[bi] / maxMsgShare) * 100}%`, background: s.color }" />
                </div>
                <span class="hist-val">{{ Math.round(s.msgShares[bi] * 100) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import type { DeveloperCommitsEntry } from "~/composables/useDeveloperCommits";
import type { TraitSeries } from "~/components/ReportTraitChart.vue";
import { fetchJson } from "~/utils/fetchJson";
import { categoricalPalette } from "~/utils/palette";
import { COMMIT_FLAGS, MSG_EXCLUDE_MASK, medianOf } from "~/utils/commitFlags";

const props = defineProps({
  commits: {
    type: Array as PropType<DeveloperCommitsEntry[]>,
    required: true,
  },
  repositories: {
    type: Array as PropType<string[]>,
    default: () => ["chromium"],
  },
  dates: {
    type: Array as PropType<Date[]>,
    default: undefined,
  },
});

const devOutput = shallowRef<Record<string, any> | null>(null);
onMounted(async () => {
  try {
    devOutput.value = await fetchJson<Record<string, any>>("/data/developer-output.json", { cache: true });
  } catch {
    devOutput.value = null;
  }
});

type TrendMetric = "lines" | "msg" | "files";
const trendMetric = ref<TrendMetric>("lines");
const currentYear = new Date().getUTCFullYear();
const intFmt = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

const SIZE_BUCKETS = [
  { label: "≤ 5", test: (n: number) => n <= 5 },
  { label: "6–20", test: (n: number) => n >= 6 && n <= 20 },
  { label: "21–50", test: (n: number) => n >= 21 && n <= 50 },
  { label: "51–200", test: (n: number) => n >= 51 && n <= 200 },
  { label: "201–1k", test: (n: number) => n >= 201 && n <= 1000 },
  { label: "1k+", test: (n: number) => n > 1000 },
];

const MSG_BUCKETS = [
  { label: "< 100", test: (n: number) => n < 100 },
  { label: "100–250", test: (n: number) => n >= 100 && n < 250 },
  { label: "250–500", test: (n: number) => n >= 250 && n < 500 },
  { label: "500–1k", test: (n: number) => n >= 500 && n < 1000 },
  { label: "1k+", test: (n: number) => n >= 1000 },
];

const authoredEntries = computed(() => {
  const hasRange = Array.isArray(props.dates) && props.dates.length >= 2;
  const startMs = hasRange ? props.dates![0].getTime() : -Infinity;
  const endMs = hasRange ? props.dates![1].getTime() : Infinity;

  return props.commits
    .map((entry, idx) => {
      const data = entry.data.filter(c => {
        if (c.kind !== "author") return false;
        const t = c.timeMs ?? Date.parse(c.date);
        return t >= startMs && t <= endMs;
      });
      return {
        developer: entry.developer,
        color: categoricalPalette[idx % categoricalPalette.length],
        data,
      };
    })
    .filter(e => e.data.length > 0);
});

const summaries = computed(() =>
  authoredEntries.value.map(entry => {
    const sizeCounts = new Array(SIZE_BUCKETS.length).fill(0);
    const msgCounts = new Array(MSG_BUCKETS.length).fill(0);
    let msgTotal = 0;

    for (const c of entry.data) {
      const lines = (c.additions ?? 0) + (c.deletions ?? 0);
      const si = SIZE_BUCKETS.findIndex(b => b.test(lines));
      if (si >= 0) sizeCounts[si]++;

      if (typeof c.msg === "number" && ((c.flags ?? 0) & MSG_EXCLUDE_MASK) === 0) {
        const mi = MSG_BUCKETS.findIndex(b => b.test(c.msg!));
        if (mi >= 0) msgCounts[mi]++;
        msgTotal++;
      }
    }

    const n = entry.data.length || 1;
    return {
      developer: entry.developer,
      color: entry.color,
      sizeCounts,
      sizeShares: sizeCounts.map(v => v / n),
      msgCounts,
      msgShares: msgTotal ? msgCounts.map(v => v / msgTotal) : msgCounts.map(() => 0),
      msgTotal,
    };
  }),
);

const hasMsgData = computed(() => summaries.value.some(s => s.msgTotal > 0));
const maxSizeShare = computed(() =>
  Math.max(0.01, ...summaries.value.flatMap(s => s.sizeShares)),
);
const maxMsgShare = computed(() =>
  Math.max(0.01, ...summaries.value.flatMap(s => s.msgShares)),
);

// Build a continuous YYYY-MM axis spanning all active authored commits,
// aggregated with a 3-month trailing window so individual developer medians stay smooth.
const trendMonths = computed(() => {
  let minM = "";
  let maxM = "";
  for (const e of authoredEntries.value) {
    for (const c of e.data) {
      const m = c.date.slice(0, 7);
      if (!minM || m < minM) minM = m;
      if (!maxM || m > maxM) maxM = m;
    }
  }
  if (!minM || !maxM) return [];
  const out: string[] = [];
  let y = +minM.slice(0, 4);
  let m = +minM.slice(5, 7);
  const endY = +maxM.slice(0, 4);
  const endM = +maxM.slice(5, 7);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { y++; m = 1; }
  }
  return out;
});

const windowSize = computed(() => (trendMonths.value.length > 36 ? 6 : 3));
const bucketLabel = computed(() => `${windowSize.value}-month rolling`);

const trendSeries = computed<TraitSeries[]>(() => {
  const months = trendMonths.value;
  if (months.length < 2) return [];
  const mIndex = new Map(months.map((m, i) => [m, i]));
  const win = windowSize.value;

  const devLines: TraitSeries[] = authoredEntries.value
    .map(entry => {
      const perMonth: number[][] = Array.from({ length: months.length }, () => []);
      for (const c of entry.data) {
        const i = mIndex.get(c.date.slice(0, 7));
        if (i === undefined) continue;
        if (trendMetric.value === "lines") {
          perMonth[i].push((c.additions ?? 0) + (c.deletions ?? 0));
        } else if (trendMetric.value === "files") {
          perMonth[i].push(c.files ?? 0);
        } else if (typeof c.msg === "number" && ((c.flags ?? 0) & MSG_EXCLUDE_MASK) === 0) {
          perMonth[i].push(c.msg);
        }
      }
      const values = months.map((_, i) => {
        const vals: number[] = [];
        for (let j = Math.max(0, i - win + 1); j <= i; j++) {
          for (const v of perMonth[j]) vals.push(v);
        }
        return vals.length >= 3 ? medianOf(vals) : null;
      });
      return {
        label: entry.developer,
        color: entry.color,
        values,
      };
    })
    .filter(s => s.values.some(v => v !== null));

  // Overlay dashed repository median when inspecting a single developer.
  if (devLines.length === 1 && props.repositories.length === 1 && devOutput.value?.repositories) {
    const repo = devOutput.value.repositories.find((r: any) => r.dirname === props.repositories[0]);
    const all = repo?.groups?.[0];
    const repoMonths: string[] | undefined = devOutput.value.months;
    if (all && repoMonths) {
      const src: (number | null)[] | undefined =
        trendMetric.value === "lines" ? all.lines
          : trendMetric.value === "msg" ? all.msg
            : all.size?.files;
      if (Array.isArray(src)) {
        const repoMap = new Map<string, number | null>(repoMonths.map((m, i) => [m, src[i] ?? null]));
        const aligned = months.map(m => repoMap.get(m) ?? null);
        if (aligned.some(v => v !== null)) {
          devLines.push({
            label: `${repo.name} median`,
            short: `${repo.name} median`,
            color: "var(--muted)",
            dashed: true,
            values: aligned,
          });
        }
      }
    }
  }

  return devLines;
});

const trendFormat = computed(() => {
  if (trendMetric.value === "msg") return (v: number) => `${intFmt.format(v)} chars`;
  if (trendMetric.value === "files") return (v: number) => `${intFmt.format(v)} files`;
  return (v: number) => `${intFmt.format(v)} lines`;
});
const trendAxisFormat = (v: number) => intFmt.format(v);
</script>

<style scoped>
.patch-profile {
  display: grid;
  gap: 1.25rem;
}

.profile-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.profile-note {
  color: var(--muted);
  font-size: 0.82rem;
}

.trend-box,
.hist-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.7rem;
  padding: 1rem 1.15rem;
}

.hist-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
}

.hist-title {
  color: var(--ink);
  font-size: 0.92rem;
  font-weight: 620;
  margin: 0;
}

.hist-rows {
  display: grid;
  gap: 0.45rem;
}

.hist-row {
  align-items: center;
  display: grid;
  gap: 0.65rem;
  grid-template-columns: 4.5rem minmax(0, 1fr);
}

.hist-label {
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  text-align: right;
}

.hist-bars {
  display: grid;
  gap: 0.2rem;
}

.hist-bar-line {
  align-items: center;
  display: grid;
  gap: 0.45rem;
  grid-template-columns: minmax(0, 1fr) 2.5rem;
}

.hist-track {
  background: var(--surface-sunken);
  border-radius: 3px;
  height: 10px;
  overflow: hidden;
}

.hist-fill {
  border-radius: 3px;
  height: 100%;
  min-width: 2px;
  transition: width 0.25s ease;
}

.hist-val {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.legend {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.35rem 1rem;
}

.legend-line {
  border-radius: 2px;
  display: inline-block;
  height: 3px;
  margin-right: 0.35rem;
  vertical-align: middle;
  width: 14px;
}

.legend-line.dashed {
  background: transparent;
  border-top: 2px dashed var(--muted);
  height: 0;
}
</style>
