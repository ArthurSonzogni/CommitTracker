<template>
  <!-- The yearly reductions on a hexagonal grid: each value sits on three
       lines, its row (year written), its ↙ diagonal (age) and its ↘ diagonal
       (year removed). Each side of the triangle labels one of them. -->
  <div class="hex-reduction">
    <svg :width="layout.width" :height="layout.height" @mouseleave="crossed = null">
      <g v-for="cell in layout.cells" :key="cell.key"
        :class="{ dimmed: crossed && !onCrossedLine(cell), selected: cell === crossed }"
        @mouseenter="crossed = cell" @click="crossed = cell">
        <polygon :points="hexagon(cell.x, cell.y)"
          :style="{ '--value': Math.max(0, Math.min(1, cell.value / 0.4)) }" />
        <text :x="cell.x" :y="cell.y" dominant-baseline="central" text-anchor="middle">
          {{ short(cell.value) }}
        </text>
      </g>
      <text v-for="title in layout.titles" :key="title.text" class="side-title"
        :transform="`translate(${title.x}, ${title.y}) rotate(${title.angle})`"
        dominant-baseline="central" text-anchor="middle">
        {{ title.text }}
      </text>
      <text v-for="label in layout.labels" :key="label.key" class="axis"
        :class="{ dimmed: crossed && !onCrossedLine(label) }"
        :x="label.x" :y="label.y" dominant-baseline="central" :text-anchor="label.anchor">
        {{ label.text }}
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";

const props = defineProps({
  // [{ written: 2015, values: [reduction at age 1, at age 2, ...] }, ...]
  years: { type: Array, required: true },
});
const crossed = defineModel({ default: null });

const SIZE = 25; // The radius of a hexagon.
const WIDTH = Math.sqrt(3) * SIZE;
const ROW = 1.5 * SIZE;
const MARGIN = { left: 90, top: 30, right: 110, bottom: 55 };

const short = value => format(Math.abs(value) >= 1 ? ".0%" : ".1%")(value);

const hexagon = (x, y) => Array.from({ length: 6 }, (_, i) => {
  const angle = Math.PI / 3 * i + Math.PI / 6;
  return `${x + SIZE * Math.cos(angle)},${y + SIZE * Math.sin(angle)}`;
}).join(" ");

// Row k (newest year first) and age a are at x = a - k / 2: going down a row,
// the same age is half a cell left, and the same year removed half a cell
// right.
const layout = computed(() => {
  const years = [...props.years].sort((a, b) => b.written - a.written);
  if (years.length === 0) return { cells: [], labels: [], titles: [], width: 0, height: 0 };
  const position = (k, a) => ({ x: (a - k / 2) * WIDTH, y: k * ROW });
  const cells = [];
  const labels = [];
  years.forEach(({ written, values }, k) => {
    values.forEach((value, i) => {
      if (value === null || value === undefined) return;
      const age = i + 1;
      cells.push({ key: `${written}/${age}`, written, age, removed: written + age,
        value, ...position(k, age) });
    });
    // Left side: the year written.
    labels.push({ key: `w${written}`, written, text: String(written),
      anchor: "end", ...position(k, 0.4) });
  });
  // Right side: the ages, above the newest year having them, where their ↙
  // diagonal starts.
  const ages = Math.max(0, ...years.map(year => year.values.length));
  for (let age = 1; age <= ages; age++) {
    const k = years.findIndex(year => year.values[age - 1] != null);
    if (k === -1) continue;
    labels.push({ key: `a${age}`, age, text: `${age} year${age > 1 ? "s" : ""}`, anchor: "start",
      ...position(k - 1, age - 0.4) });
  }
  // Bottom side: the years removed, where their ↘ diagonal ends.
  const last = years.length;
  const oldest = years.at(-1);
  oldest?.values.forEach((_, i) => {
    const removed = oldest.written + i + 1;
    labels.push({ key: `r${removed}`, removed, text: String(removed),
      anchor: "middle", ...position(last, i + 2) });
  });
  // The titles of the three sides, along them, outside of their labels. The
  // sides are at 60 degrees.
  const middle = items => ({
    x: (items[0].x + items.at(-1).x) / 2,
    y: (items[0].y + items.at(-1).y) / 2,
  });
  const along = (items, angle, distance) => {
    if (items.length === 0) return null;
    const { x, y } = middle(items);
    const normal = (angle - 90) * Math.PI / 180;
    return { x: x + distance * Math.cos(normal), y: y + distance * Math.sin(normal), angle };
  };
  const written = labels.filter(label => label.written !== undefined);
  const aged = labels.filter(label => label.age !== undefined);
  const removed = labels.filter(label => label.removed !== undefined);
  const titles = [
    { text: "Added in", position: along(written, -60, 60) },
    { text: "Lifetime", position: along(aged, 60, 75) },
    { text: "Removed in", position: along(removed, 0, -22) },
  ].filter(title => title.position)
    .map(({ text, position }) => ({ text, ...position }));
  // Move everything in view.
  const all = [...cells, ...labels, ...titles];
  const minX = Math.min(...all.map(item => item.x));
  const minY = Math.min(...all.map(item => item.y));
  all.forEach(item => {
    item.x += MARGIN.left - minX;
    item.y += MARGIN.top - minY;
  });
  return {
    cells,
    labels,
    titles,
    width: Math.max(...all.map(item => item.x)) + MARGIN.right,
    height: Math.max(...all.map(item => item.y)) + MARGIN.bottom,
  };
});

const onCrossedLine = item => {
  const c = crossed.value;
  return (item.written !== undefined && item.written === c.written) ||
    (item.age !== undefined && item.age === c.age) ||
    (item.removed !== undefined && item.removed === c.removed);
};
</script>

<style scoped>
.hex-reduction {
  overflow-x: auto;
}

svg {
  display: block;
  margin: 0 auto;
}

polygon {
  fill: color-mix(in srgb, var(--series-8) calc(var(--value, 0) * 60%), var(--surface));
  stroke: var(--line);
  stroke-width: 1;
}

text {
  fill: var(--ink);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

text.side-title {
  fill: var(--ink-2);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

text.axis {
  fill: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

g {
  cursor: default;
  transition: opacity 0.15s;
}

.dimmed {
  opacity: 0.25;
}

g.selected polygon {
  stroke: var(--ink);
  stroke-width: 2;
}
</style>
