<template>
  <!-- The developers by breadth (the effective number of components they
       committed to) and commits. Clicking one selects it. -->
  <div ref="container" class="breadth-scatter">
    <svg :width="width" :height="height" @mouseleave="hovered = null">
      <g :transform="`translate(${margin.left}, ${margin.top})`">
        <g v-for="tick in xTicks" :key="`x${tick}`" class="tick">
          <line :x1="x(tick)" :x2="x(tick)" :y1="0" :y2="inner.height" />
          <text :x="x(tick)" :y="inner.height + 14" text-anchor="middle">{{ tick }}</text>
        </g>
        <g v-for="tick in yTicks" :key="`y${tick}`" class="tick">
          <line :x1="0" :x2="inner.width" :y1="y(tick)" :y2="y(tick)" />
          <text :x="-6" :y="y(tick)" text-anchor="end" dominant-baseline="central">{{ tick }}</text>
        </g>
        <text class="axis" :x="inner.width" :y="inner.height + 28" text-anchor="end">
          Breadth: effective number of components →
        </text>
        <text class="axis" :x="-margin.left + 4" :y="-12">Commits ↑</text>
        <g v-for="point in points" :key="point.username" class="point"
          :class="{ selected: selected.includes(point.username) }"
          @mouseenter="hovered = point.username"
          @click="emit('select', point.username)">
          <circle :cx="x(point.breadth)" :cy="y(point.commits)"
            :r="selected.includes(point.username) || hovered === point.username ? 6 : 4"
            :style="{ fill: selected.includes(point.username) || hovered === point.username ? $color(point.username) : null }">
            <title>{{ point.username }}: {{ point.commits }} commits in {{ point.breadth }} components</title>
          </circle>
          <text v-if="selected.includes(point.username) || hovered === point.username"
            :x="x(point.breadth) > inner.width - 140 ? x(point.breadth) - 8 : x(point.breadth) + 8"
            :text-anchor="x(point.breadth) > inner.width - 140 ? 'end' : 'start'"
            :y="y(point.commits)" dominant-baseline="central" class="name">
            {{ hovered === point.username ? `${point.username} (${point.commits} commits · ${point.breadth} comp.)` : point.username }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { scaleLog } from "d3-scale";

const props = defineProps({
  // [{ username, breadth, commits }]
  developers: { type: Array, required: true },
  selected: { type: Array, default: () => [] },
  height: { type: Number, default: 360 },
});
const emit = defineEmits(["select"]);
const { $color } = useNuxtApp();

const container = ref<HTMLElement | null>(null);
const width = ref(0);
const hovered = ref<string | null>(null);
onMounted(() => {
  const observer = new ResizeObserver(() => width.value = container.value?.clientWidth || 0);
  observer.observe(container.value);
  onBeforeUnmount(() => observer.disconnect());
});

const margin = { top: 26, right: 80, bottom: 34, left: 50 };
const inner = computed(() => ({
  width: Math.max(0, width.value - margin.left - margin.right),
  height: props.height - margin.top - margin.bottom,
}));

// The selected and hovered developers last, drawn above the others.
const points = computed(() => props.developers
  .filter(d => d.breadth && d.commits)
  .sort((a, b) => (props.selected.includes(a.username) + (hovered.value === a.username ? 2 : 0)) -
    (props.selected.includes(b.username) + (hovered.value === b.username ? 2 : 0))));
// Both logarithmic: a few developers spread over hundreds of components.
const x = computed(() => scaleLog()
  .domain([1, Math.max(2, ...points.value.map(p => p.breadth))]).nice()
  .range([0, inner.value.width]));
const y = computed(() => scaleLog()
  .domain([Math.max(1, Math.min(...points.value.map(p => p.commits)) / 1.5),
    Math.max(10, ...points.value.map(p => p.commits))]).nice()
  .range([inner.value.height, 0]));
const niceTicks = scale => scale.ticks().filter(tick =>
  [1, 2, 5].includes(tick / 10 ** Math.floor(Math.log10(tick))));
const xTicks = computed(() => niceTicks(x.value));
const yTicks = computed(() => niceTicks(y.value));
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

text.axis {
  font-weight: 600;
}

text.name {
  fill: var(--ink);
  font-weight: 600;
  paint-order: stroke;
  pointer-events: none;
  stroke: var(--bg);
  stroke-width: 3;
}

circle {
  fill: var(--faint);
  fill-opacity: 0.8;
  stroke: var(--bg);
}

.point {
  cursor: pointer;
}

.point:hover circle {
  stroke: var(--ink);
}
</style>
