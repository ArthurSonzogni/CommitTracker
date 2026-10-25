<template>
  <div class="community-map">
    <div class="map-toolbar">
      <input
        v-model="query"
        class="input map-search"
        type="search"
        list="community-map-developers"
        placeholder="Find a developer"
        aria-label="Find a developer"
        @change="findDeveloper" />
      <datalist id="community-map-developers">
        <option v-for="label in sortedLabels" :key="label" :value="label" />
      </datalist>
      <div class="map-zoom">
        <button type="button" class="button" aria-label="Zoom in" @click="zoomBy(1.5)">
          <UiIcon name="plus" size="small" />
        </button>
        <button type="button" class="button" aria-label="Zoom out" @click="zoomBy(1 / 1.5)">
          <UiIcon name="minus" size="small" />
        </button>
        <button type="button" class="button" aria-label="Show everything" @click="fit(); selectNode(-1); selectCommunity(-1)">
          <UiIcon name="fit-to-screen-outline" size="small" />
        </button>
      </div>
    </div>

    <div ref="frame" class="map-frame">
      <canvas
        ref="canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerLeave"
        @wheel.prevent="onWheel"
        @dblclick="onDoubleClick" />

      <!-- The developer under the pointer, or selected. -->
      <div v-if="focused >= 0" class="map-card">
        <strong>{{ graph.nodes[focused][0] }}</strong>
        <span class="map-card-community">
          <span class="dot" :style="{ background: communityColor(graph.nodes[focused][4]) }" />
          {{ graph.communities[graph.nodes[focused][4]].name }}
        </span>
        <span>{{ neighbors[focused].size }} connections</span>
        <NuxtLink v-if="selected === focused" :to="`/developers/${encodeURIComponent(graph.nodes[focused][0])}`">
          Open the profile →
        </NuxtLink>
        <span v-else class="map-card-hint">Tap to select</span>
      </div>
    </div>

    <!-- The communities, largest first. -->
    <ul class="map-communities">
      <li v-for="community in graph.communities" :key="community.id">
        <button
          type="button"
          :class="{ 'is-selected': selectedCommunity === community.id }"
          :title="communityTitle(community)"
          @click="selectCommunity(selectedCommunity === community.id ? -1 : community.id)">
          <span class="dot" :style="{ background: communityColor(community.id) }" />
          {{ community.name }}
          <span class="count">{{ community.size }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// An interactive map of the communities of developers, from the JSON written
// by the graph generator (graph/ and importer/graph.mjs).

import { hsl } from "d3-color";
import { categoricalPalette } from "~/utils/palette";

type Graph = {
  // [label, x, y, font size, community]. Coordinates in [0, 2] x [0, 1].
  nodes: [string, number, number, number, number][];
  // [author, reviewer, thickness].
  edges: [number, number, number][];
  communities: {
    id: number;
    name: string;
    x: number;
    y: number;
    size: number;
    members: string[];
    organizations: [string, number][];
    color: number;
  }[];
};

const props = defineProps<{
  graph: Graph;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const frame = ref<HTMLElement | null>(null);

// The view: screen = (world - origin) * scale.
const view = { x: 0, y: 0, scale: 1 };
// The scale showing the whole graph.
let fit_scale = 1;
let width = 0;
let height = 0;

// The developer highlighted by hovering. It changes after a short delay, so
// that moving the mouse across the map doesn't flicker.
const hovered = ref(-1);
const selected = ref(-1);
const selectedCommunity = ref(-1);
const focused = computed(() => selected.value >= 0 ? selected.value : hovered.value);
const query = ref("");

const neighbors = computed(() => {
  const out = props.graph.nodes.map(() => new Set<number>());
  for (const [a, b] of props.graph.edges) {
    out[a].add(b);
    out[b].add(a);
  }
  return out;
});

const sortedLabels = computed(() =>
  props.graph.nodes.map(node => node[0]).sort());

// Colors ---------------------------------------------------------------------

let dark = false;
let colors = { surface: "#fff", ink: "#111" };
const updateTheme = () => {
  const style = getComputedStyle(document.documentElement);
  colors = {
    surface: style.getPropertyValue("--surface").trim() || "#fff",
    ink: style.getPropertyValue("--ink").trim() || "#111",
  };
  dark = hsl(colors.surface).l < 0.5;
  draw();
};

const communityColor = (community: number) =>
  categoricalPalette[props.graph.communities[community].color % categoricalPalette.length];

// Labels are darker (light theme) or lighter (dark theme) than the edges, to
// stay readable.
const labelColors = computed(() => props.graph.communities.map(community => {
  const color = hsl(communityColor(community.id));
  return { light: color.darker(0.9).formatHex(), dark: color.brighter(0.7).formatHex() };
}));

const communityTitle = (community: Graph["communities"][number]) => [
  `Top members: ${community.members.join(", ")}`,
  `Organizations: ${community.organizations.map(([name, share]) => `${name} ${Math.round(share * 100)}%`).join(", ")}`,
].join("\n");

// Drawing --------------------------------------------------------------------

const toScreen = (x: number, y: number) =>
  [(x - view.x) * view.scale, (y - view.y) * view.scale];

// The edge curve of the SVG output: a quadratic curve, bent to the left from
// the author to the reviewer. The SVG computes it before stretching x by 2.
const edgeControl = (a: number, b: number) => {
  const [, ax, ay, as] = props.graph.nodes[a];
  const [, bx, by, bs] = props.graph.nodes[b];
  const x1 = ax / 2, y1 = ay + as / 2;
  const x2 = bx / 2, y2 = by + bs / 2;
  const mx = (x1 + x2) / 2 - 0.4 * (y2 - y1);
  const my = (y1 + y2) / 2 + 0.4 * (x2 - x1);
  return [2 * x1, y1, 2 * mx, my, 2 * x2, y2];
};

let frame_request = 0;
const draw = () => {
  cancelAnimationFrame(frame_request);
  frame_request = requestAnimationFrame(render);
};

// The highlight fades in and out: `mix` goes from 0 (no highlight) to 1. While
// fading out, the last highlighted developer or community is kept.
const FADE_DURATION = 150;
let mix = 0;
let mix_target = 0;
let mix_time = 0;
let shown_node = -1;
let shown_community = -1;

const updateHighlight = () => {
  if (focused.value >= 0 || selectedCommunity.value >= 0) {
    shown_node = focused.value;
    shown_community = selectedCommunity.value;
    mix_target = 1;
  } else {
    mix_target = 0;
  }
  mix_time = performance.now();
  draw();
};

const stepHighlight = () => {
  if (mix === mix_target) {
    return;
  }
  const now = performance.now();
  const step = (now - mix_time) / FADE_DURATION;
  mix_time = now;
  mix = mix_target > mix ? Math.min(mix_target, mix + step) : Math.max(mix_target, mix - step);
  if (mix === 0) {
    shown_node = -1;
    shown_community = -1;
  }
  draw();
};

const isHighlighted = (node: number) => {
  if (shown_node >= 0) {
    return node === shown_node || neighbors.value[shown_node].has(node);
  }
  if (shown_community >= 0) {
    return props.graph.nodes[node][4] === shown_community;
  }
  return true;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const render = () => {
  const context = canvas.value?.getContext("2d");
  if (!context) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const { nodes, edges, communities } = props.graph;
  stepHighlight();
  const filtering = mix > 0;

  // Edges.
  context.lineCap = "round";
  for (const [a, b, thickness] of edges) {
    const normal = dark ? 0.22 : 0.16;
    if (filtering) {
      const highlighted = isHighlighted(a) && isHighlighted(b) &&
        (shown_node < 0 || a === shown_node || b === shown_node);
      context.globalAlpha = lerp(normal, highlighted ? 0.6 : 0.04, mix);
    } else {
      context.globalAlpha = normal;
    }
    context.strokeStyle = communityColor(nodes[a][4]);
    context.lineWidth = Math.max(0.3, thickness * view.scale);
    const [x1, y1, mx, my, x2, y2] = edgeControl(a, b);
    const [sx1, sy1] = toScreen(x1, y1);
    const [smx, smy] = toScreen(mx, my);
    const [sx2, sy2] = toScreen(x2, y2);
    context.beginPath();
    context.moveTo(sx1, sy1);
    context.quadraticCurveTo(smx, smy, sx2, sy2);
    context.stroke();
  }

  // Labels. Too small to read ones are skipped.
  context.textAlign = "center";
  context.textBaseline = "top";
  const theme = dark ? "dark" : "light";
  let readable = 0;
  for (let i = 0; i < nodes.length; ++i) {
    const [label, x, y, size, community] = nodes[i];
    const font_size = size * view.scale;
    if (font_size >= 9) {
      readable++;
    }
    if (font_size < 3.5 && i !== shown_node) {
      continue;
    }
    const [sx, sy] = toScreen(x, y);
    if (sx < -500 || sx > width + 500 || sy < -100 || sy > height + 100) {
      continue;
    }
    context.globalAlpha = !filtering || isHighlighted(i) ? 1 : lerp(1, 0.12, mix);
    context.fillStyle = labelColors.value[community][theme];
    // The highlighted developer is bold, and grows to stay readable.
    const emphasis = i === shown_node ? mix : 0;
    context.font = `${emphasis > 0.5 ? 700 : 500} ${Math.max(font_size, 12 * emphasis)}px Geist, sans-serif`;
    context.fillText(label, sx, sy);
  }

  // Community names, only when most developer names are too small to read:
  // when zoomed out of a large graph. Otherwise they would cover them.
  const readable_share = readable / nodes.length;
  const names_alpha = Math.max(0, Math.min(1, (0.3 - readable_share) / 0.2));
  // Hidden while a developer is highlighted.
  const names_visibility = names_alpha * (shown_node >= 0 ? 1 - mix : 1);
  if (names_visibility > 0) {
    context.lineJoin = "round";
    // Larger communities first, skipping the names overlapping a previous one.
    const placed: number[][] = [];
    for (const community of communities) {
      if (community.size < 15) {
        continue;
      }
      const [sx, sy] = toScreen(community.x, community.y);
      // Smaller on small screens.
      const font_size = Math.min(22, 10 + Math.sqrt(community.size) * 0.6) *
        Math.min(1, 0.4 + width / 1200);
      context.font = `650 ${font_size}px Geist, sans-serif`;
      const half_width = context.measureText(community.name).width / 2 + 6;
      const box = [sx - half_width, sy - 4, sx + half_width, sy + font_size + 4];
      if (placed.some(other => box[0] < other[2] && box[2] > other[0] &&
                               box[1] < other[3] && box[3] > other[1])) {
        continue;
      }
      placed.push(box);
      context.globalAlpha = names_visibility *
        (shown_community < 0 || shown_community === community.id ? 1 : lerp(1, 0.25, mix));
      context.font = `650 ${font_size}px Geist, sans-serif`;
      context.lineWidth = 4;
      context.strokeStyle = colors.surface;
      context.strokeText(community.name, sx, sy);
      context.fillStyle = colors.ink;
      context.fillText(community.name, sx, sy);
    }
  }
  context.globalAlpha = 1;
};

// View -----------------------------------------------------------------------

const resize = () => {
  if (!frame.value || !canvas.value) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const previous_width = width;
  width = frame.value.clientWidth;
  height = frame.value.clientHeight;
  canvas.value.width = width * ratio;
  canvas.value.height = height * ratio;
  canvas.value.style.width = `${width}px`;
  canvas.value.style.height = `${height}px`;
  if (previous_width === 0) {
    fit();
  }
  draw();
};

// Show the whole graph.
// A few isolated developers can be far away from the rest: ignore the extreme
// 1% on each side.
const fit = () => {
  const xs = props.graph.nodes.map(node => node[1]).sort((a, b) => a - b);
  const ys = props.graph.nodes.map(node => node[2]).sort((a, b) => a - b);
  const at = (values: number[], q: number) =>
    values[Math.min(values.length - 1, Math.floor(q * values.length))];
  fitBox(at(xs, 0.01) - 0.03, at(ys, 0.01) - 0.02,
         at(xs, 0.99) + 0.03, at(ys, 0.99) + 0.04, true);
  fit_scale = view.scale;
};

// With `fill`, when the box and the screen have different shapes (a wide graph
// on a phone), crop the box a bit to use more of the screen.
const fitBox = (x1: number, y1: number, x2: number, y2: number, fill = false) => {
  const contain = Math.min(width / (x2 - x1), height / (y2 - y1));
  const cover = Math.max(width / (x2 - x1), height / (y2 - y1));
  view.scale = fill ? Math.sqrt(contain * cover) : contain;
  view.x = (x1 + x2) / 2 - width / 2 / view.scale;
  view.y = (y1 + y2) / 2 - height / 2 / view.scale;
  draw();
};

// Zoom by `factor`, keeping the world point under (sx, sy) in place.
const zoomAt = (factor: number, sx: number, sy: number) => {
  const scale = Math.max(fit_scale * 0.8, Math.min(view.scale * factor, fit_scale * 50));
  view.x += sx / view.scale - sx / scale;
  view.y += sy / view.scale - sy / scale;
  view.scale = scale;
  draw();
};

const zoomBy = (factor: number) => zoomAt(factor, width / 2, height / 2);

const zoomTo = (x: number, y: number, scale: number) => {
  view.scale = scale;
  view.x = x - width / 2 / scale;
  view.y = y - height / 2 / scale;
  draw();
};

// Interactions ---------------------------------------------------------------

// The node whose label is under the screen point.
const nodeAt = (sx: number, sy: number) => {
  const x = sx / view.scale + view.x;
  const y = sy / view.scale + view.y;
  const min_size = 6 / view.scale;
  let best = -1;
  let best_size = 0;
  props.graph.nodes.forEach(([label, nx, ny, size], i) => {
    const s = Math.max(size, min_size);
    const half_width = s * label.length * 0.3;
    if (x > nx - half_width && x < nx + half_width && y > ny && y < ny + s &&
        size > best_size) {
      best = i;
      best_size = size;
    }
  });
  return best;
};

const pointers = new Map<number, { x: number, y: number }>();
let moved = 0;
let pinch_distance = 0;

const localPoint = (event: PointerEvent | MouseEvent) => {
  const rect = canvas.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

const onPointerDown = (event: PointerEvent) => {
  canvas.value!.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, localPoint(event));
  moved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch_distance = Math.hypot(a.x - b.x, a.y - b.y);
  }
};

const onPointerMove = (event: PointerEvent) => {
  const point = localPoint(event);
  const previous = pointers.get(event.pointerId);
  if (!previous) {
    if (event.pointerType === "mouse") {
      hover(nodeAt(point.x, point.y));
    }
    return;
  }

  pointers.set(event.pointerId, point);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt(distance / pinch_distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch_distance = distance;
    moved += 10;
    return;
  }
  const dx = point.x - previous.x;
  const dy = point.y - previous.y;
  moved += Math.abs(dx) + Math.abs(dy);
  view.x -= dx / view.scale;
  view.y -= dy / view.scale;
  draw();
};

const onPointerUp = (event: PointerEvent) => {
  const was_tap = pointers.size === 1 && moved < 6 && event.type === "pointerup";
  pointers.delete(event.pointerId);
  if (!was_tap) {
    return;
  }
  const point = localPoint(event);
  const node = nodeAt(point.x, point.y);
  if (node >= 0 && node === selected.value) {
    navigateTo(`/developers/${encodeURIComponent(props.graph.nodes[node][0])}`);
    return;
  }
  selectNode(node);
};

// The developer under the mouse, and the timer to highlight it.
let pointed = -1;
let hover_timer: ReturnType<typeof setTimeout> | undefined;
const HOVER_DELAY = 80;
const LEAVE_DELAY = 200;

const hover = (node: number) => {
  if (node === pointed) {
    return;
  }
  pointed = node;
  canvas.value!.style.cursor = node >= 0 ? "pointer" : "grab";
  clearTimeout(hover_timer);
  const apply = () => {
    hovered.value = node;
    updateHighlight();
  };
  if (node >= 0 && hovered.value >= 0) {
    // Already highlighting someone: switch directly.
    apply();
  } else {
    hover_timer = setTimeout(apply, node >= 0 ? HOVER_DELAY : LEAVE_DELAY);
  }
};

const onPointerLeave = () => hover(-1);

const onWheel = (event: WheelEvent) => {
  const point = localPoint(event);
  zoomAt(Math.exp(-event.deltaY * 0.002), point.x, point.y);
};

const onDoubleClick = (event: MouseEvent) => {
  const point = localPoint(event);
  zoomAt(2, point.x, point.y);
};

const selectNode = (node: number) => {
  clearTimeout(hover_timer);
  pointed = -1;
  selected.value = node;
  hovered.value = -1;
  updateHighlight();
};

const selectCommunity = (community: number) => {
  selectedCommunity.value = community;
  selected.value = -1;
  if (community >= 0) {
    // Fit the members.
    const members = props.graph.nodes.filter(node => node[4] === community);
    const xs = members.map(node => node[1]);
    const ys = members.map(node => node[2]);
    fitBox(Math.min(...xs) - 0.05, Math.min(...ys) - 0.05,
           Math.max(...xs) + 0.05, Math.max(...ys) + 0.05);
  }
  updateHighlight();
};

const findDeveloper = () => {
  const node = props.graph.nodes.findIndex(n => n[0] === query.value.trim());
  if (node < 0) {
    return;
  }
  selectedCommunity.value = -1;
  const [, x, y, size] = props.graph.nodes[node];
  // Zoom so that the label is readable.
  zoomTo(x, y + size / 2, Math.min(fit_scale * 50, Math.max(view.scale, 14 / size, fit_scale * 4)));
  selectNode(node);
};

watch(() => props.graph, () => {
  hovered.value = -1;
  selected.value = -1;
  selectedCommunity.value = -1;
  mix = 0;
  updateHighlight();
  fit();
});

let observer: ResizeObserver | null = null;
let theme_observer: MutationObserver | null = null;
const media = typeof window !== "undefined"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

onMounted(() => {
  updateTheme();
  observer = new ResizeObserver(resize);
  observer.observe(frame.value!);
  theme_observer = new MutationObserver(updateTheme);
  theme_observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media?.addEventListener("change", updateTheme);
  // Redraw once the font is loaded.
  document.fonts?.ready.then(draw);
});

onUnmounted(() => {
  observer?.disconnect();
  theme_observer?.disconnect();
  media?.removeEventListener("change", updateTheme);
  cancelAnimationFrame(frame_request);
  clearTimeout(hover_timer);
});
</script>

<style scoped>
.community-map {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}

.map-toolbar {
  align-items: center;
  display: flex;
  gap: 0.75rem;
}

.map-search {
  max-width: 20rem;
}

.map-zoom {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.map-frame {
  border: 1px solid var(--line);
  border-radius: 18px;
  flex: 1;
  min-height: 60vh;
  overflow: hidden;
  position: relative;
}

@media (max-width: 768px) {
  .map-frame {
    flex: none;
    height: min(70vh, 85vw);
    min-height: 0;
  }
}

canvas {
  cursor: grab;
  display: block;
  touch-action: none;
}

.map-card {
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  gap: 0.2rem;
  left: 0.75rem;
  max-width: calc(100% - 1.5rem);
  padding: 0.6rem 0.8rem;
  position: absolute;
  top: 0.75rem;
}

.map-card-community {
  align-items: center;
  display: flex;
  gap: 0.4rem;
}

.map-card-hint {
  color: var(--muted);
}

.dot {
  border-radius: 999px;
  display: inline-block;
  flex-shrink: 0;
  height: 0.6rem;
  width: 0.6rem;
}

.map-communities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.map-communities button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 0.8rem;
  gap: 0.4rem;
  padding: 0.25rem 0.7rem;
}

.map-communities button:hover {
  border-color: var(--line-strong);
}

.map-communities button.is-selected {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.map-communities .count {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
