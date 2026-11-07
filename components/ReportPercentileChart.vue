<template>
  <div ref="root" class="percentile-chart" @mouseleave="hover = null">
    <svg
      v-if="width > 0 && years.length"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      :height="HEIGHT"
      role="img"
:aria-label="`${tipTitle}: percentiles, one line per year`">
      <text class="axis-title" :x="M.left - 6" :y="10">
        {{ axisTitle }} · log scale: each gridline is ×2
      </text>
      <g v-for="tick in ticks" :key="tick">
        <line class="grid" :x1="M.left" :x2="width - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text class="axis" :x="M.left - 6" :y="y(tick) + 3.5" text-anchor="end">{{ tick }}</text>
      </g>
      <g v-for="(q, k) in quantiles" :key="q">
        <line v-if="hover === k" class="cross" :x1="x(k)" :x2="x(k)" :y1="M.top" :y2="HEIGHT - M.bottom" />
        <text class="axis" :x="x(k)" :y="HEIGHT - 22" text-anchor="middle">p{{ Math.round(q * 100) }}</text>
        <text v-if="factor(k) !== null" class="factor" :x="x(k)" :y="HEIGHT - 6" text-anchor="middle">
          ×{{ factor(k)!.toFixed(1) }}
        </text>
      </g>

      <path
        v-for="year in years"
        :key="year"
        :class="['line', role(year)]"
        :d="pathOf(percentiles[year])" />
      <template v-for="year in [previousYear, currentYear]" :key="'dots' + year">
        <circle
          v-for="(v, k) in percentiles[year] ?? []"
          :key="k"
          :class="['dot', role(year)]"
          :cx="x(k)" :cy="y(v)" r="3.5" />
        <text
          v-if="percentiles[year]"
          :class="['end-label', role(year)]"
          :x="x(quantiles.length - 1) + 8"
          :y="endY(year) + 3.5">
          {{ year }}
        </text>
      </template>

      <rect
        v-for="(q, k) in quantiles"
        :key="'hit' + q"
        class="hit"
        :x="x(k) - columnWidth / 2" :y="M.top" :width="columnWidth" :height="HEIGHT - M.top - M.bottom"
        @mousemove="onMove($event, k)" />
    </svg>

    <div v-if="hover !== null && current" class="chart-tip" :style="tipStyle">
      <div class="tip-title">p{{ Math.round(quantiles[hover] * 100) }} of {{ tipTitle }}</div>
      <div>
        {{ previousYear }}: <strong>{{ previous?.[hover] ?? "—" }}</strong> ·
        {{ currentYear }}: <strong>{{ current[hover] }}</strong>
        <template v-if="factor(hover) !== null">: <strong>×{{ factor(hover)!.toFixed(2) }}</strong></template>
      </div>
      <div v-if="earlier.length">
        {{ years[0] }}–{{ previousYear - 1 }}: <strong>{{ Math.min(...earlier.map(v => v[hover!])) }}</strong>
        to <strong>{{ Math.max(...earlier.map(v => v[hover!])) }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Percentiles of a quantity (by default, the commits per active person-month),
// one line per year, on a log scale. The last year is highlighted, the one
// before it is darker.

const props = withDefaults(defineProps<{
  quantiles: number[];
  // year -> the value at each quantile.
  percentiles: Record<string, number[]>;
  // What the values are, above the axis and in the tooltip.
  axisTitle?: string;
  tipTitle?: string;
}>(), {
  axisTitle: "Commits in a month",
  tipTitle: "commits per person-month",
});

const HEIGHT = 310;
const M = { top: 26, right: 46, bottom: 40, left: 34 };

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

const years = computed(() => Object.keys(props.percentiles).map(Number).sort((a, b) => a - b));
const currentYear = computed(() => years.value.at(-1)!);
const previousYear = computed(() => currentYear.value - 1);
const current = computed(() => props.percentiles[currentYear.value]);
const previous = computed(() => props.percentiles[previousYear.value]);
const earlier = computed(() => years.value
  .filter(y => y < previousYear.value)
  .map(y => props.percentiles[y]));
// How many times the last year is the year before, at quantile k.
const factor = (k: number) =>
  previous.value?.[k] ? current.value[k] / previous.value[k] : null;
const role = (year: number) =>
  year === currentYear.value ? "current" : year === previousYear.value ? "previous" : "past";

// The log scale spans from the power of 2 below the lowest value.
const vmax = computed(() => Math.max(2, ...Object.values(props.percentiles).flat()));
const bottom = computed(() =>
  Math.floor(Math.log2(Math.max(1, Math.min(...Object.values(props.percentiles).flat())))));
const top = computed(() => bottom.value + (Math.log2(vmax.value) - bottom.value) * 1.05);
const ticks = computed(() => {
  const out: number[] = [];
  for (let v = 2 ** bottom.value; v <= vmax.value; v *= 2) out.push(v);
  return out;
});
const plotWidth = computed(() => Math.max(0, width.value - M.left - M.right));
const columnWidth = computed(() => plotWidth.value / Math.max(1, props.quantiles.length - 1));
const x = (k: number) => M.left + k * columnWidth.value;
const y = (v: number) => M.top + (HEIGHT - M.top - M.bottom) *
  (1 - (Math.log2(Math.max(1, v)) - bottom.value) / (top.value - bottom.value || 1));
const pathOf = (values: number[]) =>
  values.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");

// The year labels at the right end, kept apart.
const endY = (year: number) => {
  const cy = y(current.value.at(-1)!);
  const py = previous.value ? y(previous.value.at(-1)!) : cy + 14;
  if (year === currentYear.value) return Math.min(cy, py - 13);
  return Math.max(py, cy + 13);
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
    top: `${Math.max(0, pointer.value.y - 10)}px`,
    transform: right ? "translateX(-100%)" : "none",
  };
});

</script>

<style scoped>
.percentile-chart {
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

.cross {
  stroke: var(--faint);
  stroke-dasharray: 3 3;
}

.axis {
  fill: var(--muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.axis-title {
  fill: var(--muted);
  font-size: 11px;
}

.factor {
  fill: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}

.line {
  fill: none;
  stroke-linejoin: round;
}

.line.past {
  stroke: var(--line-strong);
  stroke-width: 1.5;
}

.line.previous {
  stroke: var(--ink-2);
  stroke-width: 2.5;
}

.line.current {
  stroke: var(--accent);
  stroke-width: 2.5;
}

.dot {
  stroke: var(--surface);
  stroke-width: 1.5;
}

.dot.previous {
  fill: var(--ink-2);
}

.dot.current {
  fill: var(--accent);
}

.end-label {
  fill: var(--ink-2);
  font-size: 11.5px;
}

.end-label.current {
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
  max-width: 280px;
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
