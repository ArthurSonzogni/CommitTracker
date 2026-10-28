<template>
  <!-- Where the lines a developer authored are: one rectangle per directory,
       sized by their lines, and painted by their share of the directory. -->
  <div ref="container" class="ownership-treemap">
    <svg :width="width" :height="height">
      <g v-for="node in nodes" :key="node.data.key"
        :class="{ clickable: node.data.path !== undefined && node.depth > 0 }"
        @click="node.depth > 0 && node.data.path !== undefined && emit('select', node.data.path)">
        <rect :x="node.x0" :y="node.y0"
          :width="Math.max(0, node.x1 - node.x0)" :height="Math.max(0, node.y1 - node.y0)"
          :style="{ fill: fill(node) }">
          <title>{{ describe(node) }}</title>
        </rect>
        <text v-if="node.x1 - node.x0 > 50 && node.y1 - node.y0 > 14"
          :x="node.x0 + 4" :y="node.y0 + 11">
          {{ label(node) }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";
import { hierarchy, treemap } from "d3-hierarchy";

const props = defineProps({
  // { name, path, lines, owned, children: [...] }: the lines authored in each
  // directory. A child without a path holds the lines authored elsewhere in
  // its parent.
  tree: { type: Object, required: true },
  color: { type: String, required: true },
  height: { type: Number, default: 360 },
});
const emit = defineEmits(["select"]);

const container = ref<HTMLElement | null>(null);
const width = ref(0);
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

// Darker for a larger share of the directory, on a logarithmic scale.
const fill = node => {
  const amount = Math.round(shareIntensity(share(node)) * 75) + 10;
  return `color-mix(in srgb, ${props.color} ${amount}%, var(--surface))`;
};

const label = node => node.depth === 0
  ? ""
  : `${node.data.name} ${compact(node.data.owned)} · ${percent(share(node))}`;

const describe = node => node.data.path === undefined
  ? `${compact(node.data.owned)} lines elsewhere in this directory`
  : `${node.data.path || "Everything"}: ${compact(node.data.owned)} lines authored, ` +
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
  fill: var(--ink);
  font-size: 11px;
  paint-order: stroke;
  pointer-events: none;
  stroke: var(--bg);
  stroke-opacity: 0.6;
  stroke-width: 2;
}

.clickable {
  cursor: pointer;
}

.clickable:hover rect {
  stroke: var(--ink);
}
</style>
