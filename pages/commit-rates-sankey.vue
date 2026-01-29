<template>
  <div class="sankey-page">
    <Navbar />

    <RepositorySelector
      size="is-medium"
      v-model="repoList"
      :allowMultiple="false"
      :allowAll="false"
      :filter="repoFilter"
      />

    <section class="section">
      <div class="container">
        <div class="level mb-5">
          <div class="level-left">
            <div class="is-flex is-align-items-center">

              <div class="mr-5">
              </div>

              <div>
                <b-breadcrumb size="is-medium" align="is-left">
                  <b-breadcrumb-item
                    v-for="(crumb, index) in breadcrumbs"
                    :key="crumb.path"
                    :active="index === breadcrumbs.length - 1"
                    tag="a"
                    @click="navigateTo(crumb.path)"
                  >
                    <span v-if="index === 0" class="icon is-small mr-1">
                      <i class="fas fa-code-branch"></i>
                    </span>
                    {{ crumb.label }}
                  </b-breadcrumb-item>
                </b-breadcrumb>

                <div class="is-size-7 has-text-grey mt-1">
                  *Displaying top active paths.
                </div>
              </div>

            </div>
          </div>

          <div class="level-right">
             <div style="min-width: 250px;">
                <div class="mb-1 is-size-7 has-text-weight-bold">
                  Includes: {{ smoothingWindow*7 }} days.
                </div>
                <b-field>
                  <b-slider
                    v-model="smoothingWindow"
                    :min="1"
                    :max="300"
                    :step="1"
                    size="is-small"
                    type="is-info"
                    @change="debouncedRender"
                    tooltip
                  ></b-slider>
                </b-field>
             </div>
          </div>
        </div>

        <div v-if="loading" class="notification is-info is-light">
          <span class="icon mr-2">
            <i class="fas fa-spinner fa-spin"></i>
          </span>
          Loading data... Analyzing repository structure...
        </div>
        <div v-if="error" class="notification is-danger">
          {{ error }}
        </div>
      </div>
    </section>

    <section class="section p-0" style="position: relative; overflow: hidden; min-height: 500px;">
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
              Commit/Days: <strong>{{ tooltipData.commit_per_day }}</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- README Section explaining the visualization -->
  <hr/>

  <section class="section">
    <div class="container content">
      <h2 class="title is-4">README</h2>
      <p>
        This visualization represents the number of commit in each
        file/directory. Note that a commit might affect multiple files, so the
        sum of all children nodes exceeds the parent's commit count.
      </p>
    </div>
  </section>

  <!-- All the params section -->

  <section class="section">
    <div class="container content">
      <h2 class="title is-4">Parameters</h2>
      <ul>
        <li><strong>Repository:</strong> The code repository being analyzed.</li>
        <li><strong>Path:</strong> The current directory path in the repository.</li>
        <li><strong>Smoothing Window:</strong> The number of days over which commit counts are smoothed to reduce noise.</li>
      </ul>
    </div>
  </section>




</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { select, pointer } from "d3-selection";
import { sankey, sankeyLeft } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";
import { format } from "d3-format";
import "d3-transition";
import { transition } from "d3-transition";
import { easeQuadInOut } from "d3-ease";

// --- Types ---
interface RateData {
  name: string;
  path: string;
  rates: number[];
  isDirectory: boolean;
}

interface GraphNode {
  node: number;
  name: string;
  path: string;
  activity: number;
  height: number; // New field for visual calculation
  depth: number;
  parent?: number;
  value?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  targetLinks?: any[]; // added by d3-sankey
  sourceLinks?: any[]; // added by d3-sankey
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
const BASE_URL = '/commit_rates';
const CONFIG_START_DATE = '2018-01-01';
const MAX_NODES = 300;

// --- State ---
const route = useRoute();
const router = useRouter();

const repository = ref<string>("chromium");
const currentRootPath = ref<string>(".");
const smoothingWindow = ref(40);
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

const tooltipData = ref({ name: '', path: '', value: 0, percent: '' });

// Caching & Concurrency Control
const dirCache = new Map<string, RateData[]>();
let renderRequestId = 0;

// --- Computed Props (New) ---
const startYear = computed(() => new Date(CONFIG_START_DATE).getFullYear());

const maxAvailableWeeks = computed(() => {
  const start = new Date(CONFIG_START_DATE);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  return Math.floor(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
});

// Handle v-model array for RepositorySelector
const repoList = computed({
  get: () => [repository.value],
  set: (val: any[]) => {
    if (val && val.length > 0) {
      // Support both object and string returns from selector
      const selected = val[0];
      const name = typeof selected === 'object' ? selected.name : selected;
      if (name && name !== repository.value) {
        // Reset path to root when repo changes
        router.push({ query: { repository: name, path: '.' } });
      }
    }
  }
});

const breadcrumbs = computed(() => {
  const repoName = repository.value;
  const items = [{ label: repoName, path: '.' }];

  if (currentRootPath.value && currentRootPath.value !== '.') {
    const parts = currentRootPath.value.split('/');
    let currentPath = '';
    parts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      items.push({ label: part, path: currentPath });
    });
  }
  return items;
});

const repoFilter = (repo: any) => !repo.cone;

function navigateTo(path: string) {
  router.push({ query: { ...route.query, path } });
}

// --- Helpers ---
const intFormatter = format(",");
function formatNumber(n: number) { return intFormatter(Math.round(n)); }
const percentFormatter = format(".1%");

function getBucketId(filepath: string): number {
  let hash = 5381;
  for (let i = 0; i < filepath.length; i++) {
    hash = ((hash << 5) + hash) ^ filepath.charCodeAt(i);
    hash = hash | 0;
  }
  return (hash >>> 0) % 2048;
}

function decompressRates(compressed: any[]): number[] {
  if (!compressed || compressed.length === 0) return [];
  let maxLen = 0;
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i+1];
    if (data && data.length) {
      const end = start + data.length;
      if (end > maxLen) maxLen = end;
    }
  }
  const rates = new Array(maxLen).fill(0);
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i+1];
    if (data) {
      for (let j = 0; j < data.length; j++) {
        rates[start + j] = data[j];
      }
    }
  }

  // Fill to maxAvailableWeeks with 0s if needed
  while (rates.length < maxAvailableWeeks.value) {
    rates.push(0);
  }


  return rates;
}

function applyMovingSum(data: number[], windowSize: number): number[] {
  if (windowSize <= 1) return data;
  const smoothed: number[] = [];
  let currentSum = 0;
  for (let i = 0; i < data.length; i++) {
    currentSum += data[i];
    if (i >= windowSize) currentSum -= data[i - windowSize];
    smoothed.push(currentSum);
  }
  return smoothed;
}

// --- Custom Link Generator (Reduced Curvature + Offset Fix) ---
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

// --- Data Fetching ---

async function fetchPathItems(repo: string, path: string): Promise<RateData[]> {
  const cacheKey = `${repo}:${path}`;
  if (dirCache.has(cacheKey)) return dirCache.get(cacheKey)!;

  let url = '';
  if (path === '.') {
    url = `${BASE_URL}/${repo}/main.json`;
  } else {
    const bucketId = getBucketId(path);
    url = `${BASE_URL}/${repo}/${bucketId}.json`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${path} (Status: ${res.status})`);

    const bucketData = await res.json();
    const targetDir = bucketData[path];

    if (!targetDir) return [];

    const items = Object.entries(targetDir).map(([name, data]: [string, any]) => {
      if (data.d && typeof data.d === 'number') return null;
      const deletedAt = (typeof data.d === 'number') ? data.d : null;
      const isDeleted = deletedAt !== null;
      if (name == "WebKit")
        console.log(data);

      return {
        name,
        path: path === '.' ? name : `${path}/${name}`,
        rates: decompressRates(data.r),
        isDirectory: data.f == undefined || data.f != 1,
        isDeleted,
      };
    }).filter(Boolean) as RateData[];

    dirCache.set(cacheKey, items);
    return items;
  } catch (err) {
    console.error(`Error fetching path ${path}:`, err);
    throw err;
  }
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

  const rootName = startPath === '.' ? repository.value : startPath.split('/').pop()!;

  // Initialize root
  nodes.push({
    node: 0,
    name: rootName,
    path: startPath,
    activity: 0, // Will be filled based on children sum
    height: 0,   // Will be filled based on children sum
    depth: 0
  });
  nodeMap.set(startPath, 0);

  const queue: string[] = [startPath];

  while (queue.length > 0 && nodes.length < MAX_NODES) {
    const currentPath = queue.shift()!;
    const parentIndex = nodeMap.get(currentPath)!;

    const items = await fetchPathItems(repository.value, currentPath);
    if (!items.length) continue;

    const itemsWithActivity = items.map(item => ({
      ...item,
      activity: calculateActivity(item.rates)
    })).filter(i => i.activity > 0 && !i.isDeleted);

    itemsWithActivity.sort((a, b) => b.activity - a.activity);

    const significantChildren = itemsWithActivity.slice(0, 20);

    // Sum of activity for the siblings we are actually displaying
    const totalSiblingsActivity = significantChildren.reduce((sum, i) => sum + i.activity, 0);

    // Update Parent Logic
    const parentNode = nodes[parentIndex];

    // If this is the root node, its height/activity is defined by the sum of its displayed children
    if (parentIndex === 0) {
        parentNode.activity = totalSiblingsActivity;
        parentNode.height = totalSiblingsActivity;
    }

    const parentHeight = parentNode.height;

    for (const child of significantChildren) {
      const childIndex = nodes.length;

      // Calculate relative height
      // Formula: (Child Activity / Sum of Siblings Activity) * Parent Height
      let relativeHeight = 0;
      if (totalSiblingsActivity > 0) {
        relativeHeight = (child.activity / totalSiblingsActivity) * parentHeight;
      }

      nodes.push({
        node: childIndex,
        name: child.name,
        path: child.path,
        activity: child.activity, // Real world value
        height: relativeHeight,   // Visual calculation value
        depth: parentNode.depth + 1,
        parent: parentIndex
      });
      nodeMap.set(child.path, childIndex);

      links.push({
        source: parentIndex,
        target: childIndex,
        value: relativeHeight // Link width based on visual height
      });

      if (child.isDirectory && nodes.length < MAX_NODES) {
        queue.push(child.path);
      }
    }
  }

  return { nodes, links };
}

// --- Rendering ---

const colorScale = scaleOrdinal(schemeCategory10);

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

    width.value = Math.min(window.innerWidth - 40, 1600);
    height.value = nodes.length * 10 + 25

    const sankeyGenerator = sankey<GraphNode, GraphLink>()
      .nodeWidth(50)
      .nodePadding(5)
      .nodeAlign(sankeyLeft)
      .extent([[1, 1], [width.value - 1, height.value - 6]])
      .nodeSort((a, b) => {
        // Iterate over the parents to maintain hierarchy
        let nodeA: GraphNode | undefined = a;
        let nodeB: GraphNode | undefined = b;

        // Find common ancestor:
        while (nodeA &&
               nodeB &&
               nodeA.parent !== undefined &&
               nodeB.parent !== undefined &&
               nodeA.parent === nodeB.parent) {
          nodeA = nodes[nodeA.parent];
          nodeB = nodes[nodeB.parent];
        }

        if (nodeA &&
            nodeB &&
            nodeA.parent !== undefined &&
            nodeB.parent !== undefined) {
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
      links: links.map(d => ({ ...d }))
    });

    const duration = 300;
    const update_transition = transition().ease(easeQuadInOut).duration(duration);
    const enter_transition = transition().ease(easeQuadInOut).duration(duration).delay(3*duration/2);
    const exit_transition = transition().ease(easeQuadInOut).duration(duration)

    // --- Nodes ---
    const nodeSelection = select(layerNodes.value)
      .selectAll<SVGRectElement, GraphNode>("rect")
      .data(graph.nodes, (d) => d.path);

    nodeSelection.join(
      enter => enter.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => Math.max(1, d.y1 - d.y0))
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => colorScale(d.name))
        .attr("rx", 2)
        .attr("opacity", 0)
        .call(enter => enter.transition(enter_transition).attr("opacity", 0.9)),
      update => update.transition(update_transition)
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => Math.max(1, d.y1 - d.y0))
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => colorScale(d.name))
        .attr("opacity", 0.9),
      exit => exit.transition(exit_transition).attr("opacity", 0).remove()
    )
    .attr("cursor", "pointer")
    .on("click", (e, d) => {
       router.push({
         query: { ...route.query, path: d.path }
       });
    })
    // Pass root activity for percentage calc
    .on("mouseover", (e, d) => showTooltip(e, d, graph.nodes[0].activity || 0))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

    // --- Links ---
    const linkSelection = select(layerLinks.value)
      .selectAll<SVGPathElement, GraphLink>("path")
      .data(graph.links, (d) => {
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
      exit => exit.transition(exit_transition).attr("opacity", 0).remove()
    )
    .style("mix-blend-mode", "multiply")
    .on("mouseover", function(e, d) {
      select(this).attr("opacity", 0.7);
      showTooltip(e, d.target, graph.nodes[0].activity || 0);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", function() {
      select(this).attr("opacity", 0.3);
      hideTooltip();
    });

    // --- Labels ---
    const labelSelection = select(layerLabels.value)
      .selectAll<SVGTextElement, GraphNode>("text")
      .data(graph.nodes, (d) => d.path);

    labelSelection.join(
      enter => {
        const text = enter.append("text")
          .attr("x", d => d.x0 < width.value / 2 ? d.x1 + 6 : d.x0 - 6)
          .attr("y", d => (d.y1 + d.y0) / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", d => d.x0 < width.value / 2 ? "start" : "end")
          .attr("opacity", 0)
          .text(d => d.name);

        text.transition(enter_transition).attr("opacity", 1);
        return text;
      },
      update => {
        const text = update.transition(update_transition)
          .attr("x", d => d.x0 < width.value / 2 ? d.x1 + 6 : d.x0 - 6)
          .attr("y", d => (d.y1 + d.y0) / 2)
          .attr("text-anchor", d => d.x0 < width.value / 2 ? "start" : "end")
          .text(d => d.name);
        return text;
      },
      exit => exit.transition(exit_transition).attr("opacity", 0).remove()
    )
    .attr("pointer-events", "none")
    .style("display", d => (d.y1 - d.y0) > 12 ? "block" : "none");

  } catch (err: any) {
    console.error("Render error:", err);
    error.value = err.message || "An unexpected error occurred.";
  } finally {
    if (currentRequestId === renderRequestId) {
      loading.value = false;
    }
  }
}

// --- Tooltip Logic ---

function showTooltip(event: MouseEvent, node: any, rootActivity: number) {
  if (!tooltipRef.value) return;

  const isLink = !node.name && node.target;
  const dataNode = isLink ? node.target : node;

  tooltipData.value = {
    name: dataNode.name,
    path: dataNode.path,
    // IMPORTANT: Use .activity (real data) not .value (visual height)
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
  let top = y + 20;
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

let debounceTimeout: any;
function debouncedRender() {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    render();
  }, 50);
}

watch(
  () => route.query,
  (newQuery) => {
    let needsRender = false;
    const newRepo = Array.isArray(newQuery.repository) ? newQuery.repository[0] : newQuery.repository;
    if (newRepo && newRepo !== repository.value) {
      repository.value = newRepo as string;
      dirCache.clear();
      needsRender = true;
    }
    const newPath = (Array.isArray(newQuery.path) ? newQuery.path[0] : newQuery.path) || '.';
    if (newPath !== currentRootPath.value) {
      currentRootPath.value = newPath as string;
      needsRender = true;
    }
    if (needsRender) render();
  },
  { immediate: true, deep: true }
);

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
.sankey-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.sankey-svg {
  background-color: #fff;
  display: block;
  margin: 0 auto;
}

.chart-tooltip {
  min-width: 150px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 4px 15px rgba(0,0,0,0.15);
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  pointer-events: none;
  transition: opacity 0.1s;
}
</style>
