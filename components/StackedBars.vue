<template>
  <!-- One bar per year, stacking series. The negative series go below the
       axis. -->
  <div ref="container" class="stacked-bars">
    <svg :width="width" :height="height">
      <g :transform="`translate(${margin.left}, ${margin.top})`">
        <g v-for="tick in ticks" :key="tick" class="tick">
          <line :x1="0" :x2="inner.width" :y1="y(tick)" :y2="y(tick)" />
          <text :x="-6" :y="y(tick)" text-anchor="end" dominant-baseline="central">
            {{ format(tick) }}
          </text>
        </g>
        <g v-for="bar in bars" :key="bar.year">
          <rect v-for="part in bar.parts" :key="part.key"
            :x="bar.x" :width="bar.width" :y="Math.min(y(part.from), y(part.to))"
            :height="Math.abs(y(part.from) - y(part.to))" :style="{ fill: part.color }">
            <title>{{ bar.year }}: {{ part.label }} {{ format(Math.abs(part.to - part.from)) }}</title>
          </rect>
          <text v-if="bar.labeled" class="year" :x="bar.x + bar.width / 2" :y="inner.height + 14"
            text-anchor="middle">{{ bar.year }}</text>
        </g>
      </g>
    </svg>
    <div class="legend">
      <span v-for="serie in series" :key="serie.key">
        <span class="swatch" :style="{ background: serie.color }" />{{ serie.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format as d3format } from "d3-format";
import { scaleLinear } from "d3-scale";

const props = defineProps({
  years: { type: Array, required: true },
  // [{ key, label, color, values, negative }], stacked in this order.
  series: { type: Array, required: true },
  height: { type: Number, default: 300 },
});

const container = ref<HTMLElement | null>(null);
const width = ref(0);
onMounted(() => {
  const observer = new ResizeObserver(() => width.value = container.value?.clientWidth || 0);
  observer.observe(container.value);
  onBeforeUnmount(() => observer.disconnect());
});

const margin = { top: 10, right: 10, bottom: 24, left: 50 };
const inner = computed(() => ({
  width: Math.max(0, width.value - margin.left - margin.right),
  height: props.height - margin.top - margin.bottom,
}));
const format = d3format(".2~s");

const extent = computed(() => {
  let top = 0;
  let bottom = 0;
  props.years.forEach((_, i) => {
    let up = 0;
    let down = 0;
    for (const serie of props.series) {
      if (serie.negative) down -= serie.values[i] || 0;
      else up += serie.values[i] || 0;
    }
    top = Math.max(top, up);
    bottom = Math.min(bottom, down);
  });
  return [bottom, top || 1];
});
const y = computed(() => scaleLinear().domain(extent.value).range([inner.value.height, 0]).nice());
const ticks = computed(() => y.value.ticks(5));

const bars = computed(() => {
  const step = inner.value.width / Math.max(1, props.years.length);
  // About one year label every 40 pixels.
  const every = Math.max(1, Math.ceil(40 / step));
  return props.years.map((year, i) => {
    let up = 0;
    let down = 0;
    const parts = props.series.map(serie => {
      const value = serie.values[i] || 0;
      const from = serie.negative ? down : up;
      if (serie.negative) down -= value;
      else up += value;
      return { key: serie.key, label: serie.label, color: serie.color, from, to: serie.negative ? down : up };
    }).filter(part => part.from !== part.to);
    return {
      year,
      x: i * step + step * 0.1,
      width: step * 0.8,
      parts,
      labeled: (props.years.length - 1 - i) % every === 0,
    };
  });
});
</script>

<style scoped>
svg {
  display: block;
}

.tick line {
  stroke: var(--line);
}

text {
  fill: var(--muted);
  font-size: 11px;
}

.legend {
  color: var(--ink-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.3rem 1rem;
  margin-top: 0.3rem;
}

.swatch {
  border-radius: 2px;
  display: inline-block;
  height: 0.7rem;
  margin-right: 0.3rem;
  vertical-align: -1px;
  width: 0.7rem;
}
</style>
