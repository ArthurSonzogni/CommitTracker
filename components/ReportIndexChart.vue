<template>
  <div ref="root" class="index-chart" @mouseleave="hover = null">
    <svg
      v-if="width > 0 && lines.length"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      :height="HEIGHT"
      role="img"
      aria-label="Measures indexed to their baseline average">
      <defs>
        <clipPath :id="clipId">
          <rect :x="0" :y="M.top" :width="width" :height="HEIGHT - M.top" />
        </clipPath>
      </defs>
      <rect
        v-if="highlightIndex >= 0"
        class="highlight"
        :x="x(highlightIndex)" :y="M.top"
        :width="x(shown.length - 1) - x(highlightIndex)" :height="HEIGHT - M.top - M.bottom" />
      <text v-if="highlightIndex >= 0" class="highlight-label" :x="x(highlightIndex) + 5" :y="M.top + 12">
        {{ highlightFrom.slice(0, 4) }}
      </text>

      <g v-for="tick in ticks" :key="tick">
        <line :class="tick === 100 ? 'base' : 'grid'" :x1="M.left" :x2="width - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text class="axis" :x="M.left - 6" :y="y(tick) + 3.5" text-anchor="end">{{ tick }}</text>
      </g>
      <g v-for="(month, i) in shown" :key="month">
        <text
          v-if="month.endsWith('-01') && +month.slice(0, 4) % 2 === 0"
          class="axis" :x="x(i)" :y="HEIGHT - 6" text-anchor="middle">
          {{ month.slice(0, 4) }}
        </text>
      </g>

      <g :clip-path="`url(#${clipId})`">
        <path
          v-for="line in lines"
          :key="line.label"
          class="line"
          :d="pathOf(line.values)"
          :style="{ stroke: line.color }" />
      </g>
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
      <div class="tip-title">{{ monthLabel(shown[hover]) }}, {{ window }}-month average</div>
      <div v-for="line in lines" :key="line.label">
        <span class="swatch" :style="{ background: line.color }" />
        {{ line.label }}: <strong>{{ line.values[hover] === null ? "—" : Math.round(line.values[hover]!) }}</strong>
      </div>
    </div>
    <p v-if="clipped" class="note">▲ Cut off above {{ domain[1] }}: {{ clipped }}.</p>
  </div>
</template>

<script setup lang="ts">
// Several monthly measures, as trailing averages indexed to their own
// average over the baseline years (= 100).

export interface IndexSeries {
  label: string;
  // A short label for the end of the line.
  short?: string;
  color: string;
  values: (number | null)[];
  // Months before this one are not drawn.
  from?: string;
}

const props = withDefaults(defineProps<{
  months: string[];
  series: IndexSeries[];
  from?: string;
  highlightFrom?: string;
  baseline?: [string, string];
  window?: number;
}>(), {
  from: "2016-01",
  highlightFrom: "2026-01",
  baseline: () => ["2021-01", "2025-12"],
  window: 3,
});

const HEIGHT = 300;
const M = { top: 10, right: 140, bottom: 24, left: 40 };

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

const start = computed(() => Math.max(0, props.months.indexOf(props.from)));
const shown = computed(() => props.months.slice(start.value));
const highlightIndex = computed(() => shown.value.findIndex(m => m >= props.highlightFrom));

const lines = computed(() => props.series.map(s => {
  const [b0, b1] = props.baseline;
  const base: number[] = [];
  props.months.forEach((m, i) => {
    if (m >= b0 && m <= b1 && s.values[i] !== null) base.push(s.values[i]!);
  });
  const average = base.length ? base.reduce((a, b) => a + b, 0) / base.length : 0;
  const values = shown.value.map((month, k) => {
    const i = k + start.value;
    if (!average || i < props.window - 1 || (s.from && month < s.from)) return null;
    let total = 0;
    for (let j = i - props.window + 1; j <= i; j++) {
      if (s.values[j] === null) return null;
      total += s.values[j]!;
    }
    return 100 * total / props.window / average;
  });
  return { ...s, values };
}));

// The scale stops at CAP, so that an unusual early period (a young project
// with a few very active people) doesn't flatten the rest. The year before
// the highlighted period is never cut.
const CAP = 300;
const domain = computed<[number, number]>(() => {
  const all = lines.value.flatMap(l => l.values).filter((v): v is number => v !== null);
  if (!all.length) return [0, 200];
  const recentFrom = shown.value.findIndex(m => m >= `${+props.highlightFrom.slice(0, 4) - 1}-01`);
  const recent = recentFrom < 0 ? [] : lines.value
    .flatMap(l => l.values.slice(recentFrom))
    .filter((v): v is number => v !== null);
  const top = Math.min(Math.max(...all), Math.max(CAP, ...recent));
  return [Math.floor(Math.min(80, ...all) / 20) * 20, Math.ceil(Math.max(120, top) / 20) * 20];
});
// The measures cut off at the top, and when: "Commits per author, 2019–2020".
const clipped = computed(() => lines.value.flatMap(l => {
  const years = shown.value
    .filter((_, k) => l.values[k] !== null && l.values[k]! > domain.value[1])
    .map(m => m.slice(0, 4));
  if (!years.length) return [];
  const span = years[0] === years.at(-1) ? years[0] : `${years[0]}–${years.at(-1)}`;
  return [`${l.label}, ${span}`];
}).join("; "));
const clipId = `index-clip-${useId()}`;
const ticks = computed(() => {
  // About 8 gridlines at most, on round numbers.
  const [lo, hi] = domain.value, out: number[] = [];
  const step = [20, 50, 100, 200, 250, 500, 1000].find(s => (hi - lo) / s <= 8) ?? 2000;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  if (!out.includes(100)) out.push(100);
  return out;
});

const plotWidth = computed(() => Math.max(0, width.value - M.left - M.right));
const x = (i: number) => M.left + i / Math.max(1, shown.value.length - 1) * plotWidth.value;
const y = (v: number) => {
  const [lo, hi] = domain.value;
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

// The last value of each solid line, moved apart so the labels don't overlap.
const endLabels = computed(() => {
  const labels = lines.value
    .filter(l => l.values.at(-1) != null)
    .map(l => ({ y: y(l.values.at(-1)!), text: `${l.short ?? l.label} ${Math.round(l.values.at(-1)!)}` }))
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
.index-chart {
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
.note {
  color: var(--muted);
  font-size: 0.78rem;
  margin-top: 0.35rem;
}
</style>
