<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">Commit rates</h1>
        <FilterPanel :summary="listSummary(repositoryNames(repositories), 'repositories')">
          <RepositorySelector
            size="is-medium"
            v-model="repositories"
            :allowMultiple="false"
            :allowAll="false"
            :filter="(repo) => !repo.cone"
          />
        </FilterPanel>
        <div>
          Smoothing Window: <strong>{{ smoothingWindow }} week{{ smoothingWindow
            === 1 ? '' : 's' }}</strong>, displaying activity over <strong>{{
            displayedDurationLabel }}</strong>.

          <UiField>
            <UiSlider v-model="smoothingWindow" :min="1" :max="52" :step="1"></UiSlider>
          </UiField>

          <UiField>
            <UiCheckbox v-model="showDeleted">
              Show deleted files
            </UiCheckbox>
          </UiField>
        </div>

        <div class="level mb-4">
          <div class="level-left">
            <nav class="breadcrumb has-succeeds-separator mb-0" aria-label="breadcrumbs">
              <ul>
                <li :class="{ 'is-active': currentPath === '.' }">
                  <a @click.prevent="navigate('.')">{{ repositories[0] }}</a>
                </li>
                <li
                  v-for="(part, index) in pathParts"
                  :key="index"
                  :class="{ 'is-active': index === pathParts.length - 1 }"
                >
                  <a @click.prevent="navigate(part.fullPath)">{{ part.name }}</a>
                </li>
              </ul>
            </nav>
          </div>

          <div class="level-right">
            <div class="field has-addons mb-0">
              <div class="control has-icons-left">
                <input
                  ref="searchInput"
                  class="input"
                  type="text"
                  placeholder="Find in this folder..."
                  v-model="searchQuery"
                >
                <UiIcon name="magnify" size="small" class="is-left" />
              </div>
              <div class="control" v-if="searchQuery">
                <button type="button" class="button" aria-label="Clear search" @click="searchQuery = ''">
                  <UiIcon name="close" size="small" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="loading" class="notification">Loading data...</div>
        <div v-else-if="error" class="notification is-danger">{{ error }}</div>

        <div v-else class="box p-0" style="overflow: hidden;">
          <div class="virtual-header columns is-mobile m-0 has-background-light has-text-weight-bold is-size-7-mobile">
            <div class="column is-4 is-clickable select-none" @click="toggleSort('name')">
              File / Directory
              <UiIcon
                v-if="sortBy === 'name'"
                :name="sortDesc ? 'chevron-down' : 'chevron-up'"
                size="small"
                class="ml-1"
              />
            </div>

            <div class="column is-2 is-clickable select-none" @click="toggleSort('score')">
              Liveness
              <UiIcon
                v-if="sortBy === 'score'"
                :name="sortDesc ? 'chevron-down' : 'chevron-up'"
                size="small"
                class="ml-1"
              />
            </div>

            <div class="column is-2 has-text-right is-clickable select-none" @click="toggleSort('total')">
              Total
              <UiIcon
                v-if="sortBy === 'total'"
                :name="sortDesc ? 'chevron-down' : 'chevron-up'"
                size="small"
                class="ml-1"
              />
            </div>

            <div class="column is-2 has-text-right is-clickable select-none" @click="toggleSort('window')">
              Last {{ smoothingWindow }}w
              <UiIcon
                v-if="sortBy === 'window'"
                :name="sortDesc ? 'chevron-down' : 'chevron-up'"
                size="small"
                class="ml-1"
              />
            </div>

            <div class="column is-2">
              Activity
            </div>
          </div>

          <div
            class="virtual-scroll-container"
            ref="scrollContainer"
            @scroll="onScroll"
          >
            <div :style="{ height: totalHeight + 'px' }"></div>

            <div
              v-for="item in visibleItems"
              :key="item.name"
              class="virtual-row columns is-mobile m-0"
              :class="{
                'has-text-grey-light': item.isDeleted,
                'is-clickable': item.isDirectory
              }"
              :style="{ transform: `translateY(${item.offset}px)` }"
              @click="onItemClick(item)"
            >
              <div class="column is-4 is-flex is-align-items-center is-clipped">
                <UiIcon
                  :name="item.isDirectory ? 'folder' : 'file-outline'"
                  size="small"
                  class="mr-2"
                  :class="item.isDeleted ? 'has-text-grey-lighter' : 'has-text-grey'"
                />
                <span
                  class="is-clipped"
                  :class="{
                    'has-text-weight-bold': item.isDirectory,
                    'is-deleted-name': item.isDeleted
                  }"
                  :title="item.name + (item.isDeleted ? ' (Deleted)' : '')"
                >
                  {{ item.name }}
                </span>
              </div>

              <div class="column is-2 is-flex is-align-items-center">
                <progress
                  class="progress is-small"
                  style="width: 100%; margin-bottom: 0; opacity: 0.8;"
                  :class="getScoreColor(item.activityScore)"
                  max="100"
                  :value="5 + item.activityScore * 95"
                ></progress>
              </div>

              <div class="column is-2 has-text-right is-family-monospace is-flex is-align-items-center is-justify-content-flex-end">
                {{ formatNumber(item.totalCommits) }}
              </div>

              <div class="column is-2 has-text-right is-family-monospace is-flex is-align-items-center is-justify-content-flex-end">
                {{ formatNumber(item.windowCommits) }}
              </div>

              <div class="column is-2 p-0 is-flex is-align-items-center" :style="{ opacity: item.isDeleted ? 0.4 : 1 }">
                <svg width="150" height="40" class="sparkline">
                  <path
                    :d="getSparklinePath(item.smoothedRates)"
                    fill="none"
                    stroke="#3e8ed0"
                    stroke-width="2"
                  />
                  <path
                    :d="getSparklinePath(item.smoothedRates, true)"
                    fill="#3e8ed0"
                    fill-opacity="0.1"
                    stroke="none"
                  />
                </svg>
              </div>
            </div>

            <div v-if="sortedDirectoryItems.length === 0" class="has-text-centered p-6 has-text-grey">
              <span v-if="searchQuery">No matching files found.</span>
              <span v-else>Empty directory or no data found.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { format } from "d3-format";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import {
  CONFIG_START_DATE,
  maxAvailableWeeks,
  applyMovingSum,
  fetchRepoTotalRates,
  fetchDirectoryRates,
  type DirectoryRateEntry,
} from "~/utils/commitRates";

// --- Types ---
interface DirectoryItem extends DirectoryRateEntry {
  smoothedRates: number[];
  totalCommits: number;
  windowCommits: number;
  activityScore: number;
}
type SortOption = "name" | "total" | "window" | "score";

// --- Config ---
const ROW_HEIGHT = 50;
const BUFFER_SIZE = 10;

// --- URL State ---
const {
  repository,
  currentPath,
  smoothingWindow,
  showDeleted,
  searchQuery,
  sortBy,
  sortDesc,
} = useUrlState({
  repository: { ...urlCodecs.string("chromium"), history: "push" },
  currentPath: { ...urlCodecs.string("."), key: "path", history: "push" },
  smoothingWindow: {
    ...urlCodecs.number(40, { min: 1, max: 52, integer: true }),
    key: "smoothing",
  },
  showDeleted: urlCodecs.boolean(false),
  searchQuery: { ...urlCodecs.string(""), key: "search" },
  sortBy: urlCodecs.enum(["name", "total", "window", "score"] as const, "name"),
  sortDesc: urlCodecs.boolean(false),
});

const repositories = computed({
  get: () => [repository.value],
  set: (val: string[]) => {
    const next = val?.[0];
    if (next && next !== repository.value) {
      repository.value = next;
      currentPath.value = ".";
      searchQuery.value = "";
    }
  },
});

// --- Local State ---
const rawDirectoryItems = shallowRef<DirectoryRateEntry[]>([]);
const repoTotalRates = shallowRef<number[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const searchInput = ref<HTMLInputElement | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(600);

// --- Lifecycle ---
onMounted(() => {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight;
  }
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});

function handleKeydown(e: KeyboardEvent) {
  // Ctrl+F or Cmd+F to focus search input
  if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F" || e.code === "KeyF")) {
    e.preventDefault();
    if (searchInput.value) {
      searchInput.value.focus();
      searchInput.value.select();
    }
  }

  // Enter to navigate to the first search result.
  if (e.key === "Enter" && searchQuery.value) {
    if (
      sortedDirectoryItems.value.length === 1 ||
      (sortedDirectoryItems.value.length > 1 &&
        sortedDirectoryItems.value[0].name.toLowerCase() === searchQuery.value.toLowerCase())
    ) {
      onItemClick(sortedDirectoryItems.value[0]);
    }
  }
}

// --- Formatters ---
const intFormatter = format(",");
function formatNumber(n: number) {
  return intFormatter(n);
}

function getScoreColor(score: number) {
  if (score >= 0.5) return "is-success";
  if (score >= 0.1) return "is-warning";
  return "is-danger";
}

// --- Computed Data ---
const startYear = computed(() => new Date(CONFIG_START_DATE).getFullYear());
const availableWeeks = computed(() => maxAvailableWeeks());

const displayWeeks = computed(() => {
  if (smoothingWindow.value >= 52) return availableWeeks.value;
  const desired = Math.max(52, smoothingWindow.value * 5);
  return Math.min(availableWeeks.value, desired);
});

const displayedDurationLabel = computed(() => {
  const weeks = displayWeeks.value;
  if (weeks >= availableWeeks.value - 1) return `Since ${startYear.value}`;
  if (weeks >= 52) {
    const years = (weeks / 52).toFixed(1).replace(".0", "");
    return `${years} Year${years === "1" ? "" : "s"}`;
  }
  return `${weeks} Weeks`;
});

const pathParts = computed(() => {
  if (currentPath.value === "." || currentPath.value === "") return [];
  const parts = currentPath.value.split("/");
  return parts.map((part, index) => ({
    name: part,
    fullPath: parts.slice(0, index + 1).join("/"),
  }));
});

const processedItems = computed<DirectoryItem[]>(() => {
  const totalWeeks = availableWeeks.value;
  const windowSize = smoothingWindow.value || 4;
  const DECAY_FACTOR = Math.pow(0.5, 1 / windowSize);

  let smoothedTotal: number[] = [];
  if (repoTotalRates.value.length > 0) {
    let tr = [...repoTotalRates.value];
    if (tr.length < totalWeeks) {
      tr = tr.concat(new Array(totalWeeks - tr.length).fill(0));
    }
    smoothedTotal = applyMovingSum(tr, windowSize);
  }

  const preProcessed = rawDirectoryItems.value.map(item => {
    let rates = item.rates;
    if (rates.length < totalWeeks) {
      rates = rates.concat(new Array(totalWeeks - rates.length).fill(0));
    }

    let weightedSum = 0;
    for (let i = 0; i < rates.length; i++) {
      const commits = rates[rates.length - 1 - i];
      const weight = Math.pow(DECAY_FACTOR, i);
      weightedSum += commits * weight;
    }

    const smoothed = applyMovingSum(rates, windowSize);
    const currentActivity = smoothed[smoothed.length - 1] || 0;
    const peakActivity = Math.max(...smoothed, 1);
    const peakScore = currentActivity / peakActivity;

    return {
      ...item,
      rates,
      weightedSum,
      smoothed,
      currentActivity,
      peakScore,
    };
  });

  const parentTotalWeighted = preProcessed.reduce((acc, item) => acc + item.weightedSum, 0);

  const items = preProcessed.map(item => {
    const contributionScore = parentTotalWeighted > 0
      ? item.weightedSum / parentTotalWeighted
      : 0;

    let shareScore = 0;
    if (smoothedTotal.length > 0) {
      let maxShare = 0;
      const len = Math.min(item.smoothed.length, smoothedTotal.length);
      for (let i = 0; i < len; i++) {
        const tot = smoothedTotal[i];
        const val = item.smoothed[i];
        const share = tot > 0 ? val / tot : 0;
        if (share > maxShare) maxShare = share;
      }

      const currentTotal = smoothedTotal[smoothedTotal.length - 1] || 0;
      const currentShare = currentTotal > 0 ? item.currentActivity / currentTotal : 0;
      shareScore = maxShare > 0 ? currentShare / maxShare : 0;
    }

    const metrics = [contributionScore, item.peakScore, shareScore];
    const score = 0.7 * Math.max(...metrics) +
                  0.3 * (metrics.reduce((a, b) => a + b, 0) / metrics.length);
    const total = item.rates.reduce((sum, val) => sum + val, 0);

    return {
      ...item,
      smoothedRates: item.smoothed,
      totalCommits: total,
      windowCommits: item.currentActivity,
      activityScore: parseFloat(score.toFixed(3)),
    };
  });

  if (!showDeleted.value) {
    return items.filter(i => !i.isDeleted);
  }
  return items;
});

const sortedDirectoryItems = computed(() => {
  let items = [...processedItems.value];

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(q));
  }

  return items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    let valA: any;
    let valB: any;
    if (sortBy.value === "name") {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (sortBy.value === "total") {
      valA = a.totalCommits;
      valB = b.totalCommits;
    } else if (sortBy.value === "window") {
      valA = a.windowCommits;
      valB = b.windowCommits;
    } else {
      valA = a.activityScore;
      valB = b.activityScore;
    }

    if (valA < valB) return sortDesc.value ? 1 : -1;
    if (valA > valB) return sortDesc.value ? -1 : 1;
    return 0;
  });
});

// --- Virtual Scroll Logic ---
const totalHeight = computed(() => sortedDirectoryItems.value.length * ROW_HEIGHT);

const visibleItems = computed(() => {
  const itemCount = sortedDirectoryItems.value.length;
  if (itemCount === 0) return [];

  const startNode = Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER_SIZE;
  const start = Math.max(0, startNode);
  const visibleNodeCount = Math.ceil(containerHeight.value / ROW_HEIGHT) + 2 * BUFFER_SIZE;
  const end = Math.min(itemCount, start + visibleNodeCount);

  const visibleSlice = [];
  for (let i = start; i < end; i++) {
    const item = sortedDirectoryItems.value[i];
    visibleSlice.push({
      ...item,
      offset: i * ROW_HEIGHT,
    });
  }
  return visibleSlice;
});

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop;
}

function toggleSort(key: SortOption) {
  if (sortBy.value === key) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortBy.value = key;
    sortDesc.value = key !== "name";
  }
}

function getSparklinePath(smoothedData: number[], isArea = false): string {
  if (!smoothedData.length) return "";

  const sliceSize = displayWeeks.value;
  const displayData = smoothedData.slice(-sliceSize);

  const width = 150;
  const height = 40;
  const max = Math.max(...displayData, 1);
  const step = width / (displayData.length - 1 || 1);

  const points = displayData.map((val, i) => {
    const x = i * step;
    const y = height - (val / max) * height;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  if (isArea) return `${linePath} L ${width},${height} L 0,${height} Z`;
  return linePath;
}

// --- Data Fetching with Stale-Request Guards ---
let repoReqId = 0;
async function fetchRepoTotal(repo: string) {
  const reqId = ++repoReqId;
  const rates = await fetchRepoTotalRates(repo);
  if (reqId !== repoReqId) return;
  repoTotalRates.value = rates;
}

let dirReqId = 0;
async function fetchDirectoryData(repo: string, path: string) {
  const reqId = ++dirReqId;
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0;
  }
  scrollTop.value = 0;
  loading.value = true;
  error.value = null;

  try {
    const items = await fetchDirectoryRates(repo, path, { includeDeleted: true });
    if (reqId !== dirReqId) return;
    rawDirectoryItems.value = items;
  } catch (err: any) {
    if (reqId !== dirReqId) return;
    console.error(err);
    error.value = err?.message || "Failed to load data.";
    rawDirectoryItems.value = [];
  } finally {
    if (reqId === dirReqId) {
      loading.value = false;
      await nextTick();
      if (scrollContainer.value) {
        containerHeight.value = scrollContainer.value.clientHeight || 600;
      }
    }
  }
}

function navigate(path: string) {
  searchQuery.value = "";
  currentPath.value = path;
}

function onItemClick(item: DirectoryItem) {
  if (!item.isDirectory) return;
  const nextPath = currentPath.value === "." ? item.name : `${currentPath.value}/${item.name}`;
  navigate(nextPath);
}

watch(repository, (repo) => {
  if (repo) fetchRepoTotal(repo);
}, { immediate: true });

watch([repository, currentPath], ([repo, path]) => {
  if (repo) fetchDirectoryData(repo, path);
}, { immediate: true });
</script>

<style scoped>
.is-clickable {
  cursor: pointer;
}
.select-none {
  user-select: none;
}
.sparkline {
  display: block;
}
.is-family-monospace {
  font-family: monospace;
}
.is-deleted-name {
  text-decoration: line-through;
  color: #b5b5b5;
}

.virtual-header {
  border-bottom: 2px solid var(--line-strong, #dbdbdb);
  padding: 0.75rem;
}

.virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 50px;
  border-bottom: 1px solid var(--line, #f5f5f5);
  transition: background-color 0.1s;
}

.virtual-row:hover {
  background-color: var(--surface-sunken, #fafafa);
}

.virtual-row .column {
  height: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
}

.virtual-scroll-container {
  height: calc(100vh - 470px);
  overflow-y: auto;
  position: relative;
}

.virtual-scroll-container::-webkit-scrollbar {
  width: 8px;
}
.virtual-scroll-container::-webkit-scrollbar-track {
  background: var(--surface-sunken, #f1f1f1);
}
.virtual-scroll-container::-webkit-scrollbar-thumb {
  background: var(--line-strong);
  border-radius: 4px;
}
.virtual-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #bbb;
}
</style>
