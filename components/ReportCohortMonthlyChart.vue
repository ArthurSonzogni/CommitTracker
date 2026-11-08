<template>
  <div ref="root" class="cohort-monthly-chart" @mouseleave="hover = null">
    <svg
      v-if="width > 0 && shown.length"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      :height="HEIGHT"
      role="img"
      aria-label="Average change of the commits of the same people, a year apart, month by month">
      <rect
        v-if="highlightIndex >= 0"
        class="highlight"
        :x="x(highlightIndex)" :y="M.top"
        :width="x(shown.length - 1) - x(highlightIndex)" :height="HEIGHT - M.top - M.bottom" />
      <text v-if="highlightIndex >= 0" class="highlight-label" :x="x(highlightIndex) + 5" :y="M.top + 12">
        {{ highlightFrom.slice(0, 4) }}
      </text>

      <g v-for="tick in ticks" :key="tick">
        <line :class="tick === 0 ? 'zero' : 'grid'" :x1="M.left" :x2="width - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text
          v-if="Math.round(tick * 100) % labelStep === 0"
          class="axis" :x="M.left - 6" :y="y(tick) + 3.5" text-anchor="end">
          {{ pct(tick) }}
        </text>
      </g>
      <g v-for="(month, k) in shown" :key="month">
        <text
          v-if="month.endsWith('-01') && +month.slice(0, 4) % 2 === 0"
          class="axis" :x="x(k)" :y="HEIGHT - 6" text-anchor="middle">
          {{ month.slice(0, 4) }}
        </text>
      </g>

      <path class="median" :d="linePath" />

      <template v-if="hover !== null">
        <line class="cross" :x1="x(hover)" :x2="x(hover)" :y1="M.top" :y2="HEIGHT - M.bottom" />
        <circle v-if="valid(hover)" class="dot" :cx="x(hover)" :cy="y(at(hover))" r="4" />
      </template>
      <rect
        class="hit"
        :x="M.left" :y="M.top" :width="plotWidth" :height="HEIGHT - M.top - M.bottom"
        @mousemove="onMove" />
    </svg>

    <div v-if="hover !== null" class="chart-tip" :style="tipStyle">
      <div class="tip-title">{{ windowOf(hover, 12) }} → {{ windowOf(hover, 0) }}</div>
      <template v-if="valid(hover)">
        <div><strong>{{ n(hover) }}</strong> people with at least {{ minCommits }} commits in both</div>
        <div>Average change: <strong>{{ pct(at(hover)) }}</strong></div>
        <div><strong>{{ Math.round(cohort.up[start + hover]! * 100) }}%</strong> of them landed more commits</div>
      </template>
      <div v-else>Only {{ n(hover) }} people: too few to summarize.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The same people, a year apart, for the window ending at each month: the
// average change of commits of the people active in both windows (the mean of
// their log2 ratios, a geometric mean).

export interface CohortMonthly {
  n: (number | null)[];
  mean: (number | null)[];
  up: (number | null)[];
}

const props = withDefaults(defineProps<{
  months: string[];
  cohort: CohortMonthly;
  minCommits: number;
  window?: number;
  minPeople?: number;
  highlightFrom?: string;
}>(), {
  window: 3,
  minPeople: 10,
  highlightFrom: "2026-01",
});

const HEIGHT = 280;
const M = { top: 10, right: 16, bottom: 24, left: 44 };

const root = ref<HTMLElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(entries => {
    width.value = Math.floor(entries[0].contentRect.width);
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

// From the first month with a value.
const start = computed(() => Math.max(0, props.cohort.n.findIndex(v => v !== null)));
const shown = computed(() => props.months.slice(start.value));
const highlightIndex = computed(() => shown.value.findIndex(m => m >= props.highlightFrom));

const change = (log2: number) => 2 ** log2 - 1;
const n = (k: number) => props.cohort.n[start.value + k] ?? 0;
const valid = (k: number) => n(k) >= props.minPeople && props.cohort.mean[start.value + k] !== null;
const at = (k: number) => change(props.cohort.mean[start.value + k]!);

// Gridlines every 10%, or 25% for a wide range, labeled every other one.
const domain = computed<[number, number]>(() => {
  const values = shown.value.flatMap((_, k) => valid(k) ? [at(k)] : []);
  const lo = Math.max(-0.75, Math.min(-0.2, ...values));
  const hi = Math.min(2, Math.max(0.4, ...values));
  return [Math.floor(lo / step.value) * step.value, Math.ceil(hi / step.value) * step.value];
});
const step = computed(() => {
  const values = shown.value.flatMap((_, k) => valid(k) ? [at(k)] : []);
  return Math.max(0.4, ...values) - Math.min(-0.2, ...values) > 1 ? 0.25 : 0.1;
});
const labelStep = computed(() => Math.round(step.value * 200));
const ticks = computed(() => {
  const out: number[] = [];
  for (let v = domain.value[0]; v <= domain.value[1] + 1e-9; v += step.value) out.push(Math.round(v * 100) / 100);
  return out;
});

const plotWidth = computed(() => Math.max(0, width.value - M.left - M.right));
const x = (k: number) => M.left + k / Math.max(1, shown.value.length - 1) * plotWidth.value;
const y = (v: number) => {
  const [lo, hi] = domain.value;
  const c = Math.max(lo, Math.min(hi, v));
  return M.top + (HEIGHT - M.top - M.bottom) * (1 - (c - lo) / (hi - lo));
};

// The runs of consecutive months with enough people.
const runs = computed(() => {
  const out: number[][] = [];
  let run: number[] = [];
  shown.value.forEach((_, k) => {
    if (valid(k)) run.push(k);
    else if (run.length) { out.push(run); run = []; }
  });
  if (run.length) out.push(run);
  return out;
});
const linePath = computed(() => runs.value.map(run =>
  run.map((k, j) => `${j ? "L" : "M"}${x(k).toFixed(1)},${y(at(k)).toFixed(1)}`).join("")).join(""));

const hover = ref<number | null>(null);
const pointer = ref({ x: 0, y: 0 });
const onMove = (event: MouseEvent) => {
  const rect = (event.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
  const px = (event.clientX - rect.left) * width.value / rect.width;
  hover.value = Math.max(0, Math.min(shown.value.length - 1,
    Math.round((px - M.left) / plotWidth.value * (shown.value.length - 1))));
  pointer.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
};
const tipStyle = computed(() => {
  const right = pointer.value.x > width.value * 0.6;
  return {
    left: `${right ? pointer.value.x - 14 : pointer.value.x + 14}px`,
    top: `${Math.max(0, pointer.value.y - 10)}px`,
    transform: right ? "translateX(-100%)" : "none",
  };
});

const monthShort = (month: string, year = true) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", year
    ? { month: "short", year: "numeric", timeZone: "UTC" }
    : { month: "short", timeZone: "UTC" });
// The window ending at month k, `back` months earlier: "Aug–Oct 2025", or
// "Nov 2024–Jan 2025".
const windowOf = (k: number, back: number) => {
  const i = start.value + k - back, first = props.months[i - props.window + 1];
  const sameYear = first.slice(0, 4) === props.months[i].slice(0, 4);
  return `${monthShort(first, !sameYear)}–${monthShort(props.months[i])}`;
};

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
</script>

<style scoped>
.cohort-monthly-chart {
  position: relative;
  width: 100%;
}

svg {
  display: block;
  overflow: visible;
  width: 100%;
}

.highlight {
  fill: var(--surface-sunken);
}

.highlight-label {
  fill: var(--muted);
  font-size: 11px;
}

.grid {
  stroke: var(--line);
}

.zero {
  stroke: var(--faint);
}

.axis {
  fill: var(--muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.median {
  fill: none;
  stroke: var(--accent);
  stroke-linejoin: round;
  stroke-width: 2;
}

.dot {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 2;
}

.cross {
  stroke: var(--faint);
  stroke-dasharray: 3 3;
}

.hit {
  cursor: crosshair;
  fill: transparent;
}

.chart-tip {
  background: var(--tooltip-bg);
  border-radius: var(--radius-sm);
  color: var(--tooltip-ink);
  font-size: 0.78rem;
  line-height: 1.45;
  max-width: 300px;
  padding: 0.45rem 0.65rem;
  pointer-events: none;
  position: absolute;
  width: max-content;
  z-index: 5;
}

.chart-tip strong {
  color: inherit;
  font-variant-numeric: tabular-nums;
}

.tip-title {
  font-weight: 640;
  margin-bottom: 0.1rem;
}
</style>
