<template>
  <!-- Where the lines a developer authored are: one rectangle per directory,
       sized by their lines, and painted by their share of the directory. -->
  <div ref="container" class="ownership-treemap">
    <svg :width="width" :height="height" @mouseleave="hovered = null">
      <g v-for="node in nodes" :key="node.data.key"
        :class="{ clickable: node.data.path !== undefined && node.depth > 0 }"
        @mouseenter="node.depth > 0 && (hovered = node)"
        @click="node.depth > 0 && node.data.path !== undefined && emit('select', node.data.path)">
        <rect :x="node.x0" :y="node.y0"
          :width="Math.max(0, node.x1 - node.x0)" :height="Math.max(0, node.y1 - node.y0)"
          :style="{ fill: fill(node) }">
          <title>{{ describe(node) }}</title>
        </rect>
        <text v-if="node.x1 - node.x0 > 50 && node.y1 - node.y0 > 14"
          :x="node.x0 + 4" :y="node.y0 + 11"
          :class="{ 'is-light': isDarkFill(node) }">
          {{ label(node) }}
        </text>
      </g>
    </svg>
    <div class="treemap-footer">
      <span class="treemap-readout">
        <template v-if="hovered">{{ describe(hovered) }}</template>
        <span v-else class="treemap-hint">Hover a tile to inspect · click to open directory</span>
      </span>
      <span class="treemap-legend" title="Share of the directory's lines (pow(x, 0.3) scale)">
        <span>0%</span>
        <span class="legend-bar" :style="{ background: legendGradient }" />
        <span>1%</span>
        <span>10%</span>
        <span>100%</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { hsl } from "d3-color";
import { format } from "d3-format";
import { hierarchy, treemap } from "d3-hierarchy";
import { interpolateYlOrRd } from "d3-scale-chromatic";

const props = defineProps({
  // { name, path, lines, owned, children: [...] }: the lines authored or
  // reviewed in each directory. A child without a path holds the lines
  // elsewhere in its parent.
  tree: { type: Object, required: true },
  color: { type: String, required: true },
  verb: { type: String, default: "authored" },
  height: { type: Number, default: 360 },
});
const emit = defineEmits(["select"]);

const container = ref<HTMLElement | null>(null);
const width = ref(0);
const hovered = shallowRef(null);
const legendGradient = `linear-gradient(to right, ${Array.from({ length: 10 }, (_, i) =>
  interpolateYlOrRd(i / 9)).join(", ")})`;
onMounted(() => {
  const observer = new ResizeObserver(() => width.value = container.value?.clientWidth || 0);
  observer.observe(container.value);
  onBeforeUnmount(() => observer.disconnect());
});

const compact = format(".3~s");
// Two decimals under 1%, where most developers are.
const percent = value => value > 0 && value < 0.00005 ? "<0.01%"
  : format(value < 0.01 ? ".2%" : ".1%")(value);
const share = node => node.data.lines ? node.data.owned / node.data.lines : 0;

const nodes = computed(() => {
  if (!width.value) return [];
  const root = hierarchy(props.tree)
    .sum(node => node.children?.length ? 0 : node.owned)
    .sort((a, b) => b.value - a.value);
  return treemap()
    .size([width.value, props.height])
    // After paddingOuter, which sets paddingTop too: room for the labels.
    .paddingOuter(2)
    .paddingTop(node => node.depth > 0 ? 16 : 2)
    .paddingInner(2)
    .round(true)(root)
    .descendants();
});

// Map share in [0, 1] -> (x => pow(x, 0.3)) -> colormap.
const fill = node => interpolateYlOrRd(shareIntensity(share(node)));
const isDarkFill = node => (hsl(fill(node)).l ?? 1) < 0.52;

const label = node => node.depth === 0
  ? ""
  : `${node.data.name} ${compact(node.data.owned)} · ${percent(share(node))}`;

const describe = node => node.data.path === undefined
  ? `${compact(node.data.owned)} lines elsewhere in this directory`
  : `${node.data.path || "Everything"}: ${compact(node.data.owned)} lines ${props.verb}, ` +
    `${percent(share(node))} of its ${compact(node.data.lines)} lines`;
</script>

<style scoped>
.ownership-treemap {
  width: 100%;
}

svg {
  display: block;
}

rect {
  stroke: var(--bg);
  stroke-width: 1;
}

text {
  fill: #1f2328;
  font-size: 11px;
  paint-order: stroke;
  pointer-events: none;
  stroke: rgb(255 255 255 / 70%);
  stroke-width: 2;
}

text.is-light {
  fill: #ffffff;
  stroke: rgb(0 0 0 / 60%);
}

.clickable {
  cursor: pointer;
}

.clickable:hover rect {
  stroke: var(--ink);
}

.treemap-footer {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  gap: 0.3rem 1rem;
  justify-content: space-between;
  margin-top: 0.35rem;
  min-height: 1.35rem;
}

.treemap-hint {
  color: var(--muted);
}

.treemap-legend {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.75rem;
  gap: 0.35rem;
}

.legend-bar {
  border: 1px solid var(--line);
  border-radius: 999px;
  display: inline-block;
  height: 0.55rem;
  width: 5.5rem;
}
</style>
