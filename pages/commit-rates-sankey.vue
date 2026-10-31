<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">Commit rates sankey</h1>
        <FilterPanel :summary="listSummary(repositoryNames(repoList), 'repositories')">
          <RepositorySelector
            size="is-medium"
            v-model="repoList"
            :allowMultiple="false"
            :allowAll="false"
            :filter="repoFilter"
            />
        </FilterPanel>
        <div class="level mb-5">
          <div class="level-left">
            <div>
              <nav class="breadcrumb is-medium" aria-label="Path">
                <ul>
                  <li
                    v-for="(crumb, index) in breadcrumbs"
                    :key="crumb.path"
                    :class="{ 'is-active': index === breadcrumbs.length - 1 }">
                    <NuxtLink
                      :to="{ query: { ...route.query, path: crumb.path === '.' ? undefined : crumb.path } }"
                      :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined">
                      <UiIcon v-if="index === 0" name="source-branch" size="small" class="mr-1" />
                      {{ crumb.label }}
                    </NuxtLink>
                  </li>
                </ul>
              </nav>

              <div class="is-size-7 has-text-grey mt-1">
                *Displaying top active paths.
              </div>
            </div>
          </div>

          <div class="level-right">
            <div style="min-width: 250px;">
              <div class="mb-1 is-size-7 has-text-weight-bold">
                Window: {{ smoothingWindow }} week{{ smoothingWindow === 1 ? '' : 's' }} ({{ smoothingWindow * 7 }} days).
              </div>
              <UiField>
                <UiSlider v-model="smoothingWindow" :min="1" :max="300" :step="1" tooltip></UiSlider>
              </UiField>
            </div>
          </div>
        </div>

        <div v-if="error" class="notification is-danger">
          {{ error }}
        </div>

        <div class="sankey-container">
          <UiLoading v-model="loading" :is-full-page="false" />
          <svg
            ref="svgRef"
            :width="width"
            :height="height"
            class="sankey-svg"
          >
            <g ref="layerLinks" />
            <g ref="layerNodes" />
            <g ref="layerLabels" />
          </svg>

          <div
            ref="tooltipRef"
            class="chart-tooltip card"
            style="display: none; position: absolute; pointer-events: none; z-index: 100;"
          >
            <div class="card-content p-3">
              <p class="title is-6 mb-1">{{ tooltipData.name }}</p>
              <div class="content is-small">
                <p class="mb-0">
                  Commits: <strong>{{ formatNumber(tooltipData.value) }}</strong>
                </p>
                <p>
                  Commits per day: <strong>{{ tooltipData.commit_per_day }}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section pt-0">
      <div class="container">
        <AboutData>
          <p>
            This visualization represents the number of commit in each
            file/directory. Note that a commit might affect multiple files, so the
            sum of all children nodes exceeds the parent's commit count.
          </p>
          <p>
            Click a directory to explore it, or the first node to go back to
            its parent.
          </p>
          <h3 class="title is-6">Parameters</h3>
          <ul>
            <li><strong>Repository:</strong> The code repository being analyzed.</li>
            <li><strong>Path:</strong> The current directory path in the repository.</li>
            <li><strong>Window:</strong> The number of weeks of commits counted, ending today.</li>
          </ul>
        </AboutData>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { select, pointer } from "d3-selection";
import { sankey, sankeyLeft } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";
import { categoricalPalette } from "~/utils/palette";
import { format } from "d3-format";
import { transition } from "d3-transition";
import { easeQuadInOut } from "d3-ease";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import {
  maxAvailableWeeks,
  applyMovingSum,
  prefetchBuckets,
  fetchDirectoryRates,
} from "~/utils/commitRates";

// --- Types ---
interface GraphNode {
  node: number;
  name: string;
  path: string;
  activity: number;
  height: number;
  depth: number;
  isDirectory: boolean;
  parent?: number;
  value?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  targetLinks?: any[];
  sourceLinks?: any[];
}

interface GraphLink {
  source: GraphNode | number;
  target: GraphNode | number;
  value: number;
  width?: number;
  y0?: number;
  y1?: number;
}

// --- Constants & Config ---
const MAX_NODES = 300;
const DEFAULT_WINDOW = 40;

// --- State ---
const route = useRoute();

const {
  repository,
  currentRootPath,
  smoothingWindow,
} = useUrlState({
  repository: { ...urlCodecs.string("chromium"), history: "push" },
  currentRootPath: { ...urlCodecs.string("."), key: "path", history: "push" },
  smoothingWindow: {
    ...urlCodecs.number(DEFAULT_WINDOW, { min: 1, max: 300, integer: true }),
    key: "window",
  },
});

const width = ref(1200);
const height = ref(800);
const loading = ref(false);
const error = ref<string | null>(null);

// D3 Refs
const svgRef = ref<SVGSVGElement | null>(null);
const layerLinks = ref<SVGGElement | null>(null);
const layerNodes = ref<SVGGElement | null>(null);
const layerLabels = ref<SVGGElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);

const tooltipData = ref({ name: "", value: 0, commit_per_day: "" });

let renderRequestId = 0;

// --- Computed Props ---
const availableWeeks = computed(() => maxAvailableWeeks());

// Handle v-model array for RepositorySelector
const repoList = computed({
  get: () => [repository.value],
  set: (val: any[]) => {
    if (val && val.length > 0) {
      const selected = val[0];
      const name = typeof selected === "object" ? selected.name : selected;
      if (name && name !== repository.value) {
        repository.value = name;
        currentRootPath.value = ".";
      }
    }
  },
});

const breadcrumbs = computed(() => {
  const repoName = repository.value;
  const items = [{ label: repoName, path: "." }];

  if (currentRootPath.value && currentRootPath.value !== ".") {
    const parts = currentRootPath.value.split("/");
    let currentPath = "";
    parts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      items.push({ label: part, path: currentPath });
    });
  }
  return items;
});

const repoFilter = (repo: any) => !repo.cone;

function openPath(path: string) {
  currentRootPath.value = path;
}

function parentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/") || ".";
}

// Where clicking a node leads: the root goes back to its parent, a directory
// opens, and a file leads nowhere.
function nodeTarget(d: GraphNode): string | null {
  if (d.node === 0) {
    return currentRootPath.value === "." ? null : parentPath(currentRootPath.value);
  }
  return d.isDirectory ? d.path : null;
}

// --- Helpers ---
const intFormatter = format(",");
function formatNumber(n: number) {
  return intFormatter(Math.round(n));
}

function getCustomSankeyPath(d: any) {
  const source = d.source as GraphNode;
  const target = d.target as GraphNode;

  const x0 = source.x1!;
  const x1 = target.x0!;
  const xi = (x0 + x1) / 2;
  const y0 = d.y0 - (d.width || 0) / 2;
  const y1 = d.y1 - (d.width || 0) / 2;
  const y2 = d.y0 + (d.width || 0) / 2;
  const y3 = d.y1 + (d.width || 0) / 2;

  return `M${x0},${y0}
          C${xi},${y0} ${xi},${y1} ${x1},${y1}
          L${x1},${y3}
          C${xi},${y3} ${xi},${y2} ${x0},${y2}
          Z`;
}

function calculateActivity(rates: number[]): number {
  if (!rates || rates.length === 0) return 0;
  const smoothed = applyMovingSum(rates, smoothingWindow.value);
  return smoothed[smoothed.length - 1] || 0;
}

// --- Graph Building ---
async function buildGraphData(startPath: string) {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeMap = new Map<string, number>();

  const rootName = startPath === "." ? repository.value : startPath.split("/").pop()!;

  nodes.push({
    node: 0,
    name: rootName,
    path: startPath,
    activity: 0,
    height: 0,
    depth: 0,
    isDirectory: true,
  });
  nodeMap.set(startPath, 0);

  const queue: string[] = [startPath];
  const weeks = availableWeeks.value;
  const repo = repository.value;

  while (queue.length > 0 && nodes.length < MAX_NODES) {
    const nextBatch = queue.slice(0, 5);
    if (nextBatch.length > 0) {
      prefetchBuckets(repo, nextBatch);
    }

    const currentPath = queue.shift()!;
    const parentIndex = nodeMap.get(currentPath)!;

    const items = await fetchDirectoryRates(repo, currentPath, {
      includeDeleted: false,
      padToWeeks: weeks,
    });
    if (!items.length) continue;

    const itemsWithActivity = items
      .map(item => ({
        ...item,
        activity: calculateActivity(item.rates),
      }))
      .filter(i => i.activity > 0);

    itemsWithActivity.sort((a, b) => b.activity - a.activity);

    const significantChildren = itemsWithActivity.slice(0, 20);
    const totalSiblingsActivity = significantChildren.reduce((sum, i) => sum + i.activity, 0);
    const parentNode = nodes[parentIndex];

    if (parentIndex === 0) {
      parentNode.activity = totalSiblingsActivity;
      parentNode.height = totalSiblingsActivity;
    }

    const parentHeight = parentNode.height;

    for (const child of significantChildren) {
      const childIndex = nodes.length;
      const relativeHeight = totalSiblingsActivity > 0
        ? (child.activity / totalSiblingsActivity) * parentHeight
        : 0;

      nodes.push({
        node: childIndex,
        name: child.name,
        path: child.path,
        activity: child.activity,
        height: relativeHeight,
        depth: parentNode.depth + 1,
        isDirectory: child.isDirectory,
        parent: parentIndex,
      });
      nodeMap.set(child.path, childIndex);

      links.push({
        source: parentIndex,
        target: childIndex,
        value: relativeHeight,
      });

      if (child.isDirectory && nodes.length < MAX_NODES) {
        queue.push(child.path);
      }
    }
  }

  return { nodes, links };
}

// --- Rendering ---
const colorScale = scaleOrdinal(categoricalPalette);

async function render() {
  if (!svgRef.value) return;

  const currentRequestId = ++renderRequestId;

  loading.value = true;
  error.value = null;

  try {
    const { nodes, links } = await buildGraphData(currentRootPath.value);

    if (currentRequestId !== renderRequestId) return;
    if (!svgRef.value) return;

    if (nodes.length <= 1) {
      error.value = "No active data found for this path.";
      loading.value = false;
      return;
    }

    width.value = svgRef.value.parentElement!.clientWidth;
    height.value = nodes.length * 10 + 25;

    const sankeyGenerator = sankey<GraphNode, GraphLink>()
      .nodeWidth(width.value < 700 ? 24 : 50)
      .nodePadding(5)
      .nodeAlign(sankeyLeft)
      .extent([[1, 1], [width.value - 1, height.value - 6]])
      .nodeSort((a, b) => {
        let nodeA: GraphNode | undefined = a;
        let nodeB: GraphNode | undefined = b;

        while (
          nodeA &&
          nodeB &&
          nodeA.parent !== undefined &&
          nodeB.parent !== undefined &&
          nodeA.parent === nodeB.parent
        ) {
          nodeA = nodes[nodeA.parent];
          nodeB = nodes[nodeB.parent];
        }

        if (
          nodeA &&
          nodeB &&
          nodeA.parent !== undefined &&
          nodeB.parent !== undefined
        ) {
          return nodeA.parent - nodeB.parent;
        }
        return 0;
      })
      .linkSort((a, b) => {
        const targetA = a.target as GraphNode;
        const targetB = b.target as GraphNode;
        return (targetB.height || 0) - (targetA.height || 0);
      });

    const graph = sankeyGenerator({
      nodes: nodes.map(d => ({ ...d })),
      links: links.map(d => ({ ...d })),
    });

    const duration = 300;
    const update_transition = transition().ease(easeQuadInOut).duration(duration);
    const enter_transition = transition().ease(easeQuadInOut).duration(duration).delay((3 * duration) / 2);
    const exit_transition = transition().ease(easeQuadInOut).duration(duration);

    // --- Nodes ---
    const nodeSelection = select(layerNodes.value)
      .selectAll<SVGRectElement, GraphNode>("rect")
      .data(graph.nodes, d => d.path);

    nodeSelection.join(
      enter => enter.append("rect")
        .attr("x", d => d.x0!)
        .attr("y", d => d.y0!)
        .attr("height", d => Math.max(1, d.y1! - d.y0!))
        .attr("width", d => d.x1! - d.x0!)
        .attr("fill", d => colorScale(d.name))
        .attr("rx", 2)
        .attr("opacity", 0)
        .call(enter => enter.transition(enter_transition).attr("opacity", 0.9)),
      update => update.transition(update_transition)
        .attr("x", d => d.x0!)
        .attr("y", d => d.y0!)
        .attr("height", d => Math.max(1, d.y1! - d.y0!))
        .attr("width", d => d.x1! - d.x0!)
        .attr("fill", d => colorScale(d.name))
        .attr("opacity", 0.9),
      exit => exit.transition(exit_transition).attr("opacity", 0).remove(),
    )
    .attr("cursor", d => nodeTarget(d) ? "pointer" : null)
    .attr("tabindex", d => nodeTarget(d) ? 0 : null)
    .attr("role", d => nodeTarget(d) ? "link" : null)
    .attr("aria-label", d => nodeTarget(d) && (d.node === 0
      ? `Go back to ${parentPath(currentRootPath.value)}`
      : `Explore ${d.path}, ${formatNumber(d.activity)} commits`))
    .on("click", (_e, d) => {
      const target = nodeTarget(d);
      if (target) openPath(target);
    })
    .on("keydown", (e, d) => {
      const target = nodeTarget(d);
      if (target && e.key === "Enter") openPath(target);
    })
    .on("mouseover", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

    // --- Links ---
    const linkSelection = select(layerLinks.value)
      .selectAll<SVGPathElement, GraphLink>("path")
      .data(graph.links, d => {
        const s = d.source as GraphNode;
        const t = d.target as GraphNode;
        return `${s.path}->${t.path}`;
      });

    linkSelection.join(
      enter => enter.append("path")
        .attr("d", getCustomSankeyPath)
        .attr("stroke", "none")
        .attr("fill", d => colorScale((d.source as GraphNode).name))
        .attr("opacity", 0)
        .call(enter => enter.transition(enter_transition).attr("opacity", 0.3)),
      update => update.transition(update_transition)
        .attr("d", getCustomSankeyPath)
        .attr("fill", d => colorScale((d.source as GraphNode).name))
        .attr("opacity", 0.3),
      exit => exit.transition(exit_transition).attr("opacity", 0).remove(),
    )
    .on("mouseover", function (e, d) {
      select(this).attr("opacity", 0.7);
      showTooltip(e, d.target as GraphNode);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function () {
      select(this).attr("opacity", 0.3);
      hideTooltip();
    });

    // --- Labels (Names) ---
    const labelSelection = select(layerLabels.value)
      .selectAll<SVGTextElement, GraphNode>("text.name-label")
      .data(graph.nodes, d => d.path);

    labelSelection.join(
      enter => {
        const text = enter.append("text")
          .attr("class", "name-label")
          .attr("x", d => d.x0! < width.value / 2 ? d.x1! + 6 : d.x0! - 6)
          .attr("y", d => (d.y1! + d.y0!) / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", d => d.x0! < width.value / 2 ? "start" : "end")
          .attr("opacity", 0)
          .text(d => d.name);

        text.transition(enter_transition).attr("opacity", 1);
        return text;
      },
      update => {
        return update.transition(update_transition)
          .attr("x", d => d.x0! < width.value / 2 ? d.x1! + 6 : d.x0! - 6)
          .attr("y", d => (d.y1! + d.y0!) / 2)
          .attr("text-anchor", d => d.x0! < width.value / 2 ? "start" : "end")
          .text(d => d.name);
      },
      exit => exit.transition(exit_transition).attr("opacity", 0).remove(),
    )
    .attr("pointer-events", "none")
    .style("display", d => (d.y1! - d.y0!) > 12 ? "block" : "none");

    // --- Labels (Commit Values) ---
    const valueSelection = select(layerLabels.value)
      .selectAll<SVGTextElement, GraphNode>("text.value-label")
      .data(graph.nodes, d => d.path);

    valueSelection.join(
      enter => {
        const text = enter.append("text")
          .attr("class", "value-label")
          .attr("x", d => (d.x0! + d.x1!) / 2)
          .attr("y", d => (d.y0! + d.y1!) / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("opacity", 0)
          .style("font-size", "11px")
          .style("font-weight", "bold")
          .style("fill", "#fff")
          .style("pointer-events", "none")
          .style("text-shadow", "0px 0px 3px rgba(0,0,0,0.8)")
          .text(d => formatNumber(d.activity));

        text.transition(enter_transition).attr("opacity", 1);
        return text;
      },
      update => {
        return update.transition(update_transition)
          .attr("x", d => (d.x0! + d.x1!) / 2)
          .attr("y", d => (d.y0! + d.y1!) / 2)
          .text(d => formatNumber(d.activity))
          .attr("opacity", 1);
      },
      exit => exit.transition(exit_transition).attr("opacity", 0).remove(),
    )
    .style("display", d => {
      const val = formatNumber(d.activity);
      const textWidth = val.length * 7;
      const nodeWidth = d.x1! - d.x0!;
      const nodeHeight = d.y1! - d.y0!;
      return nodeWidth >= textWidth && nodeHeight > 14 ? "block" : "none";
    });
  } catch (err: any) {
    if (currentRequestId !== renderRequestId) return;
    console.error("Render error:", err);
    error.value = err.message || "An unexpected error occurred.";
  } finally {
    if (currentRequestId === renderRequestId) {
      loading.value = false;
    }
  }
}

// --- Tooltip Logic ---
function showTooltip(event: MouseEvent, dataNode: GraphNode) {
  if (!tooltipRef.value) return;

  tooltipData.value = {
    name: dataNode.name,
    value: dataNode.activity,
    commit_per_day: (dataNode.activity / (smoothingWindow.value * 7)).toFixed(2),
  };

  tooltipRef.value.style.display = "block";
  moveTooltip(event);
}

function moveTooltip(event: MouseEvent) {
  if (!tooltipRef.value || !svgRef.value) return;
  const [x, y] = pointer(event, svgRef.value.parentElement);
  const tooltipWidth = 180;
  let left = x + 20;
  const top = y + 20;
  if (left + tooltipWidth > width.value) {
    left = x - tooltipWidth - 20;
  }
  tooltipRef.value.style.left = `${left}px`;
  tooltipRef.value.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipRef.value) tooltipRef.value.style.display = "none";
}

// --- Watchers & Init ---
let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
function debouncedRender() {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    render();
  }, 50);
}

watch([repository, currentRootPath], () => {
  render();
});

watch(smoothingWindow, () => {
  debouncedRender();
});

onMounted(() => {
  window.addEventListener("resize", debouncedRender);
  render();
});

onUnmounted(() => {
  window.removeEventListener("resize", debouncedRender);
  clearTimeout(debounceTimeout);
});
</script>

<style scoped>
.sankey-container {
  position: relative;
  min-height: 500px;
}

.sankey-svg {
  background-color: var(--surface);
  display: block;
  margin: 0 auto;
}

.chart-tooltip {
  min-width: 150px;
  background: color-mix(in srgb, var(--surface) 98%, transparent);
  box-shadow: 0 4px 15px rgba(0,0,0,0.15);
  border: 1px solid var(--line);
  border-radius: 6px;
  pointer-events: none;
  transition: opacity 0.1s;
}

.sankey-svg :deep(rect:focus-visible) {
  outline: none;
  stroke: var(--ink);
  stroke-width: 2px;
}
</style>
