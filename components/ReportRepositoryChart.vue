<template>
  <div ref="root" class="repository-chart" @mouseleave="hover = null">
    <svg
      v-if="width > 0 && rows.length"
      :viewBox="`0 0 ${width} ${height}`"
      :height="height"
      role="img"
      aria-label="Median change of the same people, per repository, against its usual range">
      <g v-for="tick in ticks" :key="tick">
        <line
          :class="tick === 0 ? 'zero' : 'grid'"
          :x1="x(tick)" :x2="x(tick)" :y1="M.top" :y2="height - M.bottom" />
        <text
          v-if="Math.round(tick * 100) % 25 === 0"
          class="axis" :x="x(tick)" :y="height - 6" text-anchor="middle">
          {{ pct(tick) }}
        </text>
      </g>

      <g v-for="(row, k) in rows" :key="row.dirname" :class="{ featured: row.dirname === featured }">
        <rect
          v-if="hover === k"
          class="row-hover"
          :x="0" :y="rowY(k) - ROW / 2" :width="width" :height="ROW" />
        <text class="row-label" :x="M.left - 10" :y="rowY(k) + 4" text-anchor="end">{{ row.name }}</text>
        <line
          v-if="row.usual"
          class="usual"
          :x1="x(row.usual[0])" :x2="x(row.usual[1])"
          :y1="rowY(k)" :y2="rowY(k)" />
        <circle class="median" :cx="x(change(row.p50))" :cy="rowY(k)" r="6" />
        <text class="row-value" :x="width - M.right + 10" :y="rowY(k) + 4">
          {{ pct(change(row.p50)) }}
          <tspan v-if="!narrow" class="row-sub">· {{ row.n }} people</tspan>
        </text>
      </g>

      <rect
        v-for="(row, k) in rows"
        :key="'hit' + row.dirname"
        class="hit"
        :x="0" :y="rowY(k) - ROW / 2" :width="width" :height="ROW"
        @mousemove="onMove($event, k)" />
    </svg>

    <div v-if="hover !== null && rows[hover]" class="chart-tip" :style="tipStyle">
      <div class="tip-title">{{ rows[hover].name }}</div>
      <div><strong>{{ rows[hover].n }}</strong> people with at least {{ minCommits }} commits in both periods</div>
      <div>Median change: <strong>{{ pct(change(rows[hover].p50)) }}</strong></div>
      <div v-if="rows[hover].usual">
        Usual median, {{ usualYears[0] }}–{{ usualYears[1] }}:
        <strong>{{ pct(rows[hover].usual![0]) }}</strong> to <strong>{{ pct(rows[hover].usual![1]) }}</strong>
      </div>
      <div><strong>{{ Math.round(rows[hover].up * 100) }}%</strong> of them landed more commits</div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The same people, a year apart, per repository: the median change of the
// last year (dot) against the range of the medians of the usual years (bar).

export interface RepositoryRow {
  dirname: string;
  name: string;
  n: number;
  p50: number;
  up: number;
  // The lowest and highest median change of the usual years, or null.
  usual: [number, number] | null;
}

const props = defineProps<{
  rows: RepositoryRow[];
  minCommits: number;
  usualYears: [number, number];
  // The repository drawn in bold.
  featured?: string;
}>();

const ROW = 30;

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

const narrow = computed(() => width.value < 440);
const M = computed(() => narrow.value
  ? { top: 8, right: 48, bottom: 26, left: 76 }
  : { top: 8, right: 112, bottom: 26, left: 96 });
const height = computed(() => M.value.top + M.value.bottom + ROW * props.rows.length);
const rowY = (k: number) => M.value.top + k * ROW + ROW / 2;

const change = (log2: number) => 2 ** log2 - 1;

const domain = computed<[number, number]>(() => {
  const values = props.rows.flatMap(r => [change(r.p50), ...(r.usual ?? [])]);
  const lo = Math.min(-0.25, ...values), hi = Math.max(0.5, ...values);
  return [Math.floor(lo * 4) / 4, Math.ceil(hi * 4) / 4];
});
const ticks = computed(() => {
  const out: number[] = [];
  for (let v = domain.value[0]; v <= domain.value[1] + 1e-9; v += 0.125) out.push(Math.round(v * 1000) / 1000);
  return out;
});
const x = (v: number) => {
  const [lo, hi] = domain.value;
  return M.value.left + (v - lo) / (hi - lo) * (width.value - M.value.left - M.value.right);
};

const hover = ref<number | null>(null);
const pointer = ref({ x: 0, y: 0 });
const onMove = (event: MouseEvent, k: number) => {
  const rect = (event.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
  hover.value = k;
  pointer.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
};
const tipStyle = computed(() => {
  const right = pointer.value.x > width.value * 0.55;
  return {
    left: `${right ? pointer.value.x - 14 : pointer.value.x + 14}px`,
    top: `${pointer.value.y + 12}px`,
    transform: right ? "translateX(-100%)" : "none",
  };
});

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
</script>

<style scoped>
.repository-chart {
  position: relative;
  width: 100%;
}

svg {
  display: block;
  overflow: visible;
  width: 100%;
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

.row-label {
  fill: var(--ink-2);
  font-size: 12px;
}

.row-value {
  fill: var(--ink-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.row-sub {
  fill: var(--muted);
  font-size: 11.5px;
}

.row-hover {
  fill: var(--surface-sunken);
}

.usual {
  stroke: var(--line-strong);
  stroke-linecap: round;
  stroke-width: 9;
}

.median {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 2;
}

.featured .row-label,
.featured .row-value {
  fill: var(--ink);
  font-weight: 640;
}

.hit {
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
