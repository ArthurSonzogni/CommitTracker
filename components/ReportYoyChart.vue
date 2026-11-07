<template>
  <div ref="root" class="yoy-chart" @mouseleave="hover = null">
    <svg
      v-if="width > 0 && bars.length"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      :height="HEIGHT"
      role="img"
      :aria-label="`Year-over-year change of ${label}, month by month`">
      <rect
        class="band"
        :x="M.left" :y="y(shown.band.hi)"
        :width="plotWidth" :height="Math.max(0, y(shown.band.lo) - y(shown.band.hi))" />

      <g v-for="tick in ticks" :key="tick">
        <line
          :class="tick === 0 ? 'zero' : 'grid'"
          :x1="M.left" :x2="width - M.right" :y1="y(tick)" :y2="y(tick)" />
        <text class="axis" :x="M.left - 6" :y="y(tick) + 3.5" text-anchor="end">{{ pct(tick) }}</text>
      </g>

      <g v-for="(bar, i) in bars" :key="bar.month">
        <rect
          :class="['bar', { highlight: bar.month >= highlightFrom, hovered: hover === i }]"
          :x="x(i) + gap" :width="barWidth"
          :y="Math.min(y(0), y(rOf(bar.month)))"
          :height="Math.max(0.5, Math.abs(y(rOf(bar.month)) - y(0)))"
          :rx="Math.min(1.5, barWidth / 2)" />
        <path
          v-if="bar.r > domain[1] && rOf(bar.month) >= domain[1]"
          class="cut"
          :d="`M${x(i) + gap + barWidth / 2 - 4},${y(domain[1]) - 2}l4,-6l4,6Z`" />
        <text v-if="bar.month.endsWith('-01') && showYear(bar.month)" class="axis" :x="x(i) + gap" :y="HEIGHT - 6">
          {{ bar.month.slice(0, 4) }}
        </text>
      </g>

      <text
        v-if="lastBar"
        class="end-label"
        :x="width - M.right"
        :y="endLabelY"
        text-anchor="end">
        {{ monthLabel(lastBar.month) }} {{ pct(lastBar.r) }}
      </text>

      <rect
        class="hit"
        :x="M.left" :y="M.top" :width="plotWidth" :height="HEIGHT - M.top - M.bottom"
        @mousemove="onMove" />
    </svg>

    <div v-if="hover !== null && bars[hover]" class="chart-tip" :style="tipStyle">
      <div class="tip-title">{{ monthLabel(bars[hover].month) }}</div>
      <div>
        {{ label }}: <strong>{{ format(bars[hover].value) }}</strong>
        vs <strong>{{ format(bars[hover].previous) }}</strong> a year earlier
      </div>
      <div>
        Change: <strong>{{ pct(bars[hover].r) }}</strong>,
        {{ Math.abs(z(bars[hover].r)).toFixed(1) }} standard deviations
        {{ z(bars[hover].r) >= 0 ? "above" : "below" }} the usual
      </div>
    </div>
    <p class="note">
      Usual range: {{ pct(band.lo) }} to {{ pct(band.hi) }}.
      <template v-if="clipped">
        ▲ {{ clipped }} month{{ clipped > 1 ? "s" : "" }} above {{ pct(domain[1]) }} cut off.
      </template>
      Hover for the values.
    </p>
  </div>
</template>

<script setup lang="ts">
import { easeCubicInOut } from "d3-ease";

// Year-over-year change of a monthly measure, as bars, against its usual
// range: the mean ± 2 standard deviations over the baseline years.
//
// The scale also fits `scale`: the other measures the chart can switch to, so
// they all share one scale. Changes of data are animated.

export interface YoySeries {
  values: (number | null)[];
  from?: string;
}

const props = withDefaults(defineProps<{
  months: string[];
  values: (number | null)[];
  label: string;
  from?: string;
  highlightFrom?: string;
  baseline?: [string, string];
  format?: (v: number) => string;
  scale?: YoySeries[];
}>(), {
  from: "2017-01",
  highlightFrom: "2026-01",
  baseline: () => ["2021-01", "2025-12"],
  format: (v: number) => Math.round(v).toLocaleString("en"),
  scale: () => [],
});

const HEIGHT = 300;
const M = { top: 22, right: 8, bottom: 24, left: 48 };
// Small groups can change by several hundred percent: the axis is clamped.
const CAP = 2;

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

const changes = (values: (number | null)[], from: string) => {
  const out: { month: string; value: number; previous: number; r: number }[] = [];
  props.months.forEach((month, i) => {
    if (month < from || i < 12) return;
    const value = values[i], previous = values[i - 12];
    if (value === null || previous === null || !(previous > 0)) return;
    out.push({ month, value, previous, r: value / previous - 1 });
  });
  return out;
};
const bars = computed(() => changes(props.values, props.from));
const lastBar = computed(() => bars.value.at(-1));

const stats = computed(() => {
  const [b0, b1] = props.baseline;
  const values = bars.value.filter(b => b.month >= b0 && b.month <= b1).map(b => b.r);
  if (!values.length) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, sd: sd || 1 };
});
const band = computed(() => ({
  lo: Math.max(-1, stats.value.mean - 2 * stats.value.sd),
  hi: Math.min(CAP, stats.value.mean + 2 * stats.value.sd),
}));
const z = (r: number) => (r - stats.value.mean) / stats.value.sd;

const tickStep = (range: number) => range > 2 ? 0.5 : range > 1.2 ? 0.25 : 0.1;
const domain = computed<[number, number]>(() => {
  const all = [
    ...bars.value.map(b => b.r),
    ...props.scale.flatMap(s => changes(s.values, s.from ?? props.from).map(b => b.r)),
    band.value.lo, band.value.hi,
  ];
  const lo = Math.max(-1, Math.min(-0.2, ...all));
  const hi = Math.min(CAP, Math.max(0.2, ...all));
  const s = tickStep(hi - lo);
  return [Math.floor(lo / s) * s, Math.ceil(hi / s) * s];
});
// The ticks of the new scale, inside the animated one.
const ticks = computed(() => {
  const [lo, hi] = domain.value, s = tickStep(hi - lo), out: number[] = [];
  const [shownLo, shownHi] = shown.value.domain;
  for (let v = lo; v <= hi + 1e-9; v += s) {
    if (v >= shownLo - 1e-9 && v <= shownHi + 1e-9) out.push(Math.round(v * 100) / 100);
  }
  return out;
});

const plotWidth = computed(() => Math.max(0, width.value - M.left - M.right));
const step = computed(() => plotWidth.value / Math.max(1, bars.value.length));
const gap = computed(() => Math.min(1, step.value * 0.15));
const barWidth = computed(() => Math.max(1, step.value - 2 * gap.value));
// Animation: what is drawn moves from the previous data to the new one. The
// bars of the months that are new start from 0.
interface Frame {
  r: Map<string, number>;
  domain: [number, number];
  band: { lo: number; hi: number };
}
const DURATION = 700;
const frameOf = (): Frame => ({
  r: new Map(bars.value.map(b => [b.month, b.r])),
  domain: domain.value,
  band: band.value,
});
const shown = shallowRef<Frame>({ r: new Map(), domain: domain.value, band: { lo: 0, hi: 0 } });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
let animation = 0;
const animate = () => {
  cancelAnimationFrame(animation);
  const from = shown.value, to = frameOf();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    shown.value = to;
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION), e = easeCubicInOut(t);
    const r = new Map<string, number>();
    for (const [month, value] of to.r) r.set(month, lerp(from.r.get(month) ?? 0, value, e));
    shown.value = {
      r,
      domain: [lerp(from.domain[0], to.domain[0], e), lerp(from.domain[1], to.domain[1], e)],
      band: { lo: lerp(from.band.lo, to.band.lo, e), hi: lerp(from.band.hi, to.band.hi, e) },
    };
    if (t < 1) animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
};
onMounted(animate);
watch([bars, domain, band], animate);
onBeforeUnmount(() => cancelAnimationFrame(animation));
const rOf = (month: string) => shown.value.r.get(month) ?? 0;

const x = (i: number) => M.left + i * step.value;
const y = (v: number) => {
  const [lo, hi] = shown.value.domain;
  const c = Math.max(lo, Math.min(hi, v));
  return M.top + (HEIGHT - M.top - M.bottom) * (1 - (c - lo) / (hi - lo));
};
// The label of the last bar, above the bars it spans (about 100px).
const endLabelY = computed(() => {
  const n = Math.max(1, Math.ceil(100 / step.value));
  const spanned = bars.value.slice(-n);
  const top = Math.max(0, ...spanned.map(b => rOf(b.month)));
  return y(top) - (spanned.some(b => b.r > domain.value[1]) ? 14 : 7);
});
const clipped = computed(() => bars.value.filter(b => b.r > domain.value[1]).length);
// Every year label when there is room, else every other one.
const showYear = (month: string) => step.value * 12 > 34 || +month.slice(0, 4) % 2 === 0;

const hover = ref<number | null>(null);
const pointer = ref({ x: 0, y: 0 });
const onMove = (event: MouseEvent) => {
  const rect = (event.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
  const px = (event.clientX - rect.left) * width.value / rect.width;
  hover.value = Math.max(0, Math.min(bars.value.length - 1, Math.floor((px - M.left) / step.value)));
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

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;
const monthLabel = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
</script>

<style scoped>
.yoy-chart {
  position: relative;
  width: 100%;
}

svg {
  display: block;
  overflow: visible;
  width: 100%;
}

.band {
  fill: var(--surface-sunken);
}

.axis {
  fill: var(--muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.grid {
  stroke: var(--line);
}

.zero {
  stroke: var(--faint);
}

.bar {
  fill: var(--line-strong);
}

.bar.highlight {
  fill: var(--accent);
}

.bar.hovered {
  fill: var(--ink-2);
}

.cut {
  fill: var(--ink);
}

.end-label {
  fill: var(--ink);
  font-size: 12px;
  font-weight: 640;
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

.note {
  color: var(--muted);
  font-size: 0.78rem;
  margin-top: 0.35rem;
}
</style>
