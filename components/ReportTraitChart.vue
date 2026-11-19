<template>
  <div ref="root" class="trait-chart" @mouseleave="hover = null">
    <svg
      v-if="width > 0 && lines.length"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      :height="HEIGHT"
      role="img"
      :aria-label="ariaLabel">
      <rect
        v-if="highlightIndex >= 0"
        class="highlight"
        :x="x(highlightIndex)" :y="M.top"
        :width="x(shown.length - 1) - x(highlightIndex)" :height="HEIGHT - M.top - M.bottom" />
      <text v-if="highlightIndex >= 0" class="highlight-label" :x="x(highlightIndex) + 5" :y="M.top + 12">
        {{ highlightFrom.slice(0, 4) }}
      </text>

      <g v-for="tick in ticks" :key="tick">
        <line :class="tick === 0 ? 'base' : 'grid'" :x1="M.left" :x2="width - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text class="axis" :x="M.left - 6" :y="y(tick) + 3.5" text-anchor="end">{{ axisFormat(tick) }}</text>
      </g>
      <g v-for="(month, i) in shown" :key="month">
        <text
          v-if="month.endsWith('-01') && +month.slice(0, 4) % 2 === 0"
          class="axis" :x="x(i)" :y="HEIGHT - 6" text-anchor="middle">
          {{ month.slice(0, 4) }}
        </text>
      </g>

      <path
        v-for="line in lines"
        :key="line.label"
        class="line"
        :d="pathOf(line.values)"
        :style="{ stroke: line.color }" />
      <text
        v-for="label in endLabels"
        :key="label.text"
        class="end-label" :x="width - M.right + 8" :y="label.y + 3.5">
        {{ label.text }}
      </text>

      <line
        v-if="hover !== null"
        class="cross"
        :x1="x(hover)" :x2="x(hover)" :y1="M.top" :y2="HEIGHT - M.bottom" />
      <rect
        class="hit"
        :x="M.left" :y="M.top" :width="plotWidth" :height="HEIGHT - M.top - M.bottom"
        @mousemove="onMove" />
    </svg>

    <div v-if="hover !== null" class="chart-tip" :style="tipStyle">
      <div class="tip-title">{{ monthLabel(shown[hover]) }}</div>
      <div v-for="line in lines" :key="line.label">
        <span class="swatch" :style="{ background: line.color }" />
        {{ line.label }}: <strong>{{ line.values[hover] === null ? "—" : format(line.values[hover]!) }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Monthly values of one or more series over time (e.g. commit message length
// in characters, or share of commits with a trait).

export interface TraitSeries {
  label: string;
  short?: string;
  color: string;
  values: (number | null)[];
}

const props = withDefaults(defineProps<{
  months: string[];
  series: TraitSeries[];
  from?: string;
  highlightFrom?: string;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  ariaLabel?: string;
  zeroBase?: boolean;
}>(), {
  from: "2016-01",
  highlightFrom: "2026-01",
  format: (v: number) => Math.round(v).toLocaleString("en"),
  axisFormat: (v: number) => Math.round(v).toLocaleString("en"),
  ariaLabel: "Monthly values over time",
  zeroBase: true,
});

const HEIGHT = 260;
const M = { top: 10, right: 145, bottom: 24, left: 52 };

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

const start = computed(() => {
  const idx = props.months.findIndex(m => m >= props.from);
  return idx >= 0 ? idx : 0;
});
const shown = computed(() => props.months.slice(start.value));
const highlightIndex = computed(() => shown.value.findIndex(m => m >= props.highlightFrom));

const lines = computed(() => props.series.map(s => ({
  ...s,
  values: s.values.slice(start.value),
})));

const niceStep = (range: number, maxTicks = 6) => {
  if (!(range > 0)) return 1;
  const rough = range / maxTicks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / pow;
  const factor = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return factor * pow;
};

const scaleInfo = computed(() => {
  const all = lines.value.flatMap(l => l.values).filter((v): v is number => v !== null);
  if (!all.length) return { lo: 0, hi: 1, ticks: [0, 1] };
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const loBase = props.zeroBase ? 0 : rawMin;
  const span = Math.max(rawMax - loBase, rawMax * 0.1 || 1e-4);
  const step = niceStep(span, 5);
  const lo = props.zeroBase ? 0 : Math.floor(rawMin / step) * step;
  const hi = Math.max(lo + step, Math.ceil((rawMax * 1.05) / step) * step);
  const ticks: number[] = [];
  for (let k = 0; k <= 10; k++) {
    const v = +(lo + k * step).toPrecision(10);
    if (v > hi + step * 1e-6) break;
    ticks.push(v);
  }
  return { lo, hi, ticks };
});

const ticks = computed(() => scaleInfo.value.ticks);

const plotWidth = computed(() => Math.max(0, width.value - M.left - M.right));
const x = (i: number) => M.left + i / Math.max(1, shown.value.length - 1) * plotWidth.value;
const y = (v: number) => {
  const { lo, hi } = scaleInfo.value;
  return M.top + (HEIGHT - M.top - M.bottom) * (1 - (v - lo) / (hi - lo));
};

const pathOf = (values: (number | null)[]) => {
  let path = "", pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return path;
};

const endLabels = computed(() => {
  const labels = lines.value
    .map(l => {
      let last: number | null = null;
      for (let i = l.values.length - 1; i >= 0; i--) {
        if (l.values[i] !== null) { last = l.values[i]; break; }
      }
      return last === null ? null : { y: y(last), text: `${l.short ?? l.label} ${props.format(last)}` };
    })
    .filter((v): v is { y: number; text: string } => v !== null)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 13);
  return labels;
});

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

const monthLabel = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
</script>

<style scoped>
.trait-chart {
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

.base {
  stroke: var(--faint);
}

.axis {
  fill: var(--muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.line {
  fill: none;
  stroke-linejoin: round;
  stroke-width: 2;
}

.end-label {
  fill: var(--ink-2);
  font-size: 11.5px;
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

.swatch {
  border-radius: 2px;
  display: inline-block;
  height: 3px;
  margin-right: 0.3rem;
  vertical-align: middle;
  width: 12px;
}
</style>
