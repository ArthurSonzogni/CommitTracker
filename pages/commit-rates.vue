<template>
  <div>
    <Navbar />
    <section class="section">
      <div class="container">

        <div>
          <b-field>
            <RepositorySelector
              v-model="repositories"
              :allowMultiple="false"
              :allowAll="false"
              :filter="(repo) => !repo.cone"
            />
          </b-field>

          <b-field>
            <b-slider
              v-model="smoothingWindow"
              :min="1"
              :max="52"
              :step="1"
              size="is-medium"
              type="is-info"
              ></b-slider>
          </b-field>

          Smoothing Window: <strong>{{ smoothingWindow }} week{{ smoothingWindow
            === 1 ? '' : 's' }}</strong>, displaying activity over <strong>{{
            displayedDurationLabel }}</strong>.

          <b-field>
            <b-checkbox v-model="showDeleted">
              Show deleted files
            </b-checkbox>
          </b-field>
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
               <div class="has-icons-left">
                 <input
                   ref="searchInput"
                   class="input"
                   type="text"
                   placeholder="Find in this folder..."
                   v-model="searchQuery"
                 >
                 <span class="icon is-small is-left">
                   <i class="fas fa-search"></i>
                 </span>
               </div>
               <div class="control" v-if="searchQuery">
                 <button class="button" @click="searchQuery = ''">
                   <span class="icon is-small"><i class="fas fa-times"></i></span>
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
              <span class="icon is-small ml-1" v-if="sortBy === 'name'">
                <i :class="sortDesc ? 'fas fa-angle-down' : 'fas fa-angle-up'"></i>
              </span>
            </div>

            <div class="column is-2 is-clickable select-none" @click="toggleSort('score')">
              Liveness
              <span class="icon is-small ml-1" v-if="sortBy === 'score'">
                <i :class="sortDesc ? 'fas fa-angle-down' : 'fas fa-angle-up'"></i>
              </span>
            </div>

            <div class="column is-2 has-text-right is-clickable select-none" @click="toggleSort('total')">
              Total
              <span class="icon is-small ml-1" v-if="sortBy === 'total'">
                <i :class="sortDesc ? 'fas fa-angle-down' : 'fas fa-angle-up'"></i>
              </span>
            </div>

            <div class="column is-2 has-text-right is-clickable select-none" @click="toggleSort('window')">
              Last {{ smoothingWindow }}w
              <span class="icon is-small ml-1" v-if="sortBy === 'window'">
                <i :class="sortDesc ? 'fas fa-angle-down' : 'fas fa-angle-up'"></i>
              </span>
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
              class="virtual-row columns is-mobile m-0 is-clickable"
              :class="{ 'has-text-grey-light': item.isDeleted }"
              :style="{ transform: `translateY(${item.offset}px)` }"
              @click="onItemClick(item)"
            >
              <div class="column is-4 is-flex is-align-items-center is-clipped">
                <span class="icon is-small is-left mr-2" :class="item.isDeleted ? 'has-text-grey-lighter' : 'has-text-grey'">
                  <i :class="item.isDirectory ? 'fas fa-folder' : 'fas fa-file'"></i>
                </span>
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
                 <b-progress
                   :value="5+item.activityScore * 95"
                   :type="getScoreColor(item.activityScore)"
                   size="is-small"
                   style="width: 100%; margin-bottom: 0; opacity: 0.8;"
                 ></b-progress>
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
import { format } from 'd3-format';

// --- Types ---
type RateData = number[];
interface DirectoryItem {
  name: string;
  rates: RateData;
  smoothedRates: RateData;
  isDirectory: boolean;
  totalCommits: number;
  windowCommits: number;
  activityScore: number;
  isDeleted: boolean; // NEW
  deletedAt: number | null; // NEW
}
type SortOption = 'name' | 'total' | 'window' | 'score';

// --- Config ---
const BUCKET_COUNT = 2048;
const BASE_URL = '/commit_rates';
const CONFIG_START_DATE = '2018-01-01';
const ROW_HEIGHT = 50;
const BUFFER_SIZE = 10;

// --- State ---
const repositories = ref<string[]>(["chromium"]);
const currentPath = ref('.');
const rawDirectoryItems = ref<Omit<DirectoryItem, 'totalCommits' | 'windowCommits' | 'activityScore' | 'smoothedRates'>[]>([]);
const repoTotalRates = ref<number[]>([]); // NEW: Store total repository rates
const loading = ref(false);
const error = ref<string | null>(null);
const smoothingWindow = ref(40);
const sortBy = ref<SortOption>('name');
const sortDesc = ref(false);
const showDeleted = ref(false);

// Search State
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

// Scroll State
const scrollContainer = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(600);

const route = useRoute();
const router = useRouter();

// --- Initialization ---
onMounted(() => {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight;
  }
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});

if (route.query.repository) {
  const queryRepo = Array.isArray(route.query.repository)
    ? route.query.repository[0]
    : route.query.repository;
  repositories.value = [queryRepo as string];
}
if (route.query.path) {
  currentPath.value = route.query.path as string;
}
if (route.query.smoothing) {
  const smoothing = parseInt(route.query.smoothing as string, 10);
  if (!isNaN(smoothing) && smoothing >= 1 && smoothing <= 52) {
    smoothingWindow.value = smoothing;
  }
}
if (route.query.showDeleted) {
  showDeleted.value = route.query.showDeleted === 'true';
}
if (route.query.search) {
  searchQuery.value = route.query.search as string;
}
if (route.query.sortBy) {
  const sort = route.query.sortBy as SortOption;
  if (['name', 'total', 'window', 'score'].includes(sort)) {
    sortBy.value = sort;
  }
}
if (route.query.sortDesc) {
  sortDesc.value = route.query.sortDesc === 'true';
}

function handleKeydown(e: KeyboardEvent) {
  // Check for both lower and upper case 'f' to handle Caps Lock or Shift
  // Also check e.code for layout independence
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
    e.preventDefault();
    if (searchInput.value) {
      searchInput.value.focus();
      searchInput.value.select(); // Select existing text for quick replacement
    }
  }
}

// --- Formatters ---
const intFormatter = format(",");
function formatNumber(n: number) {
  return intFormatter(n);
}

function getScoreColor(score: number) {
  if (score >= 0.5) return 'is-success';
  if (score >= 0.1) return 'is-warning';
  return 'is-danger';
}

// --- Computed Data ---

const startYear = computed(() => new Date(CONFIG_START_DATE).getFullYear());

const maxAvailableWeeks = computed(() => {
  const start = new Date(CONFIG_START_DATE);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  return Math.floor(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
});

const displayWeeks = computed(() => {
  if (smoothingWindow.value >= 52) return maxAvailableWeeks.value;
  const desired = Math.max(52, smoothingWindow.value * 5);
  return Math.min(maxAvailableWeeks.value, desired);
});

const displayedDurationLabel = computed(() => {
  const weeks = displayWeeks.value;
  if (weeks >= maxAvailableWeeks.value - 1) return `Since ${startYear.value}`;
  if (weeks >= 52) {
    const years = (weeks / 52).toFixed(1).replace('.0', '');
    return `${years} Year${years === '1' ? '' : 's'}`;
  }
  return `${weeks} Weeks`;
});

const pathParts = computed(() => {
  if (currentPath.value === '.' || currentPath.value === '') return [];
  const parts = currentPath.value.split('/');
  return parts.map((part, index) => {
    return {
      name: part,
      fullPath: parts.slice(0, index + 1).join('/')
    };
  });
});

const processedItems = computed(() => {
  const totalWeeks = maxAvailableWeeks.value;
  // Get current window size (default to 4 if missing/zero to avoid Infinity)
  const windowSize = smoothingWindow.value || 4;

  // Dynamic Decay: 0.5 ^ (1 / windowSize)
  const DECAY_FACTOR = Math.pow(0.5, 1 / windowSize);

  // --- Phase 0: Prepare Total Rates (if available) ---
  let smoothedTotal: number[] = [];
  if (repoTotalRates.value.length > 0) {
    let tr = [...repoTotalRates.value];
    // Pad totals to match totalWeeks logic
    if (tr.length < totalWeeks) {
      tr = tr.concat(new Array(totalWeeks - tr.length).fill(0));
    }
    smoothedTotal = applyMovingSum(tr, windowSize);
  }

  // --- Phase 1: Pre-calculation (Padding + Weighted Sums + Peak Calculation) ---
  const preProcessed = rawDirectoryItems.value.map(item => {
    let rates = item.rates;

    // Zero-Pad
    if (rates.length < totalWeeks) {
      const gap = totalWeeks - rates.length;
      const padding = new Array(gap).fill(0);
      rates = rates.concat(padding);
    }

    // 1. Weighted Sum (for Contribution Score)
    let weightedSum = 0;
    for (let i = 0; i < rates.length; i++) {
      const commits = rates[rates.length - 1 - i]; // Start at newest
      const weight = Math.pow(DECAY_FACTOR, i);    // Decay based on weeks back
      weightedSum += commits * weight;
    }

    // 2. Smoothed Data (for Peak Ratio Score)
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
      peakScore
    };
  });

  // --- Phase 2: Calculate Parent Total (The "Standard") ---
  const parentTotalWeighted = preProcessed.reduce((acc, item) => {
    // Sum of all weighted sums in this view
    return acc + item.weightedSum;
  }, 0);

  // --- Phase 3: Finalize (Combine Scores) ---
  const items = preProcessed.map(item => {
    // Score A: Contribution to Parent Activity (0.0 to 1.0)
    const contributionScore = parentTotalWeighted > 0
      ? item.weightedSum / parentTotalWeighted
      : 0;

    // Score C: Market Share Retention (NEW)
    // Peak of (Activity / Total Activity) vs Current (Activity / Total Activity)
    let shareScore = 0;
    if (smoothedTotal.length > 0) {
      let maxShare = 0;
      // Arrays are padded to totalWeeks, so lengths match
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

    // Final Score: Max of all three metrics
    const score = Math.max(
      contributionScore, // The file's contribution to parent activity.
      item.peakScore,    // The file's retention compared to its own peak.
      shareScore         // The file's share of commit compare to its peak share.
    );


    const total = item.rates.reduce((sum, val) => sum + val, 0);

    return {
      ...item,
      smoothedRates: item.smoothed,
      totalCommits: total,
      windowCommits: item.currentActivity,
      activityScore: parseFloat(score.toFixed(3))
    };
  });

  // 2. Filter Deleted (unless showDeleted is true)
  if (!showDeleted.value) {
    return items.filter(i => !i.isDeleted);
  }

  return items;
});

// Chain: Process -> Filter (Search) -> Sort
const sortedDirectoryItems = computed(() => {
  let items = [...processedItems.value];

  // Search Filter
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(q));
  }

  // Sort
  return items.sort((a, b) => {
    // Directories first
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

    let valA: any, valB: any;
    if (sortBy.value === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (sortBy.value === 'total') {
      valA = a.totalCommits;
      valB = b.totalCommits;
    } else if (sortBy.value === 'window') {
      valA = a.windowCommits;
      valB = b.windowCommits;
    } else if (sortBy.value === 'score') {
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
      offset: i * ROW_HEIGHT
    });
  }
  return visibleSlice;
});

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop;
}

// --- Actions ---

function toggleSort(key: SortOption) {
  if (sortBy.value === key) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortBy.value = key;
    sortDesc.value = key !== 'name';
  }
}

// --- Helpers ---

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

function getBucketId(filepath: string): number {
  let hash = 5381;
  for (let i = 0; i < filepath.length; i++) {
    const char = filepath.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char;
    hash = hash | 0;
  }
  const bucketCount = 2048;
  return (hash >>> 0) % bucketCount;
}

function decompressRates(compressed: any[]): number[] {
  if (!compressed || compressed.length === 0) return [];
  let maxLen = 0;
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i+1];
    const end = start + data.length;
    if (end > maxLen) maxLen = end;
  }
  const rates = new Array(maxLen).fill(0);
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i+1];
    for (let j = 0; j < data.length; j++) {
      rates[start + j] = data[j];
    }
  }
  return rates;
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

  const linePath = `M ${points.join(' L ')}`;
  if (isArea) return `${linePath} L ${width},${height} L 0,${height} Z`;
  return linePath;
}

async function fetchRepoTotal(repo: string) {
  try {
    // Attempt to load the repository total file
    const url = `${BASE_URL}/${repo}/total.json`;
    const res = await fetch(url);
    if (!res.ok) {
        repoTotalRates.value = [];
        return;
    }
    const data = await res.json();

    // Robustly handle format: Array or { r: ... } or { total: ... }
    if (Array.isArray(data)) {
        repoTotalRates.value = data;
    } else if (data.r) {
        repoTotalRates.value = decompressRates(data.r);
    } else if (data.total && Array.isArray(data.total)) {
        repoTotalRates.value = data.total;
    } else {
        repoTotalRates.value = [];
    }
  } catch (e) {
    console.warn("Failed to load total.json", e);
    repoTotalRates.value = [];
  }
}

async function fetchDirectoryData(repo: string, path: string) {
  loading.value = true;
  error.value = null;
  rawDirectoryItems.value = [];
  searchQuery.value = '';
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;

  try {
    let url = '';
    if (path === '.') {
      url = `${BASE_URL}/${repo}/main.json`;
    } else {
      const bucketId = getBucketId(path);
      console.log("Fetching bucket:", bucketId, "for path:", path);
      url = `${BASE_URL}/${repo}/${bucketId}.json`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) throw new Error("Path not found in data.");
      throw new Error("Failed to load data.");
    }

    const bucketData = await res.json();
    const targetDir = bucketData[path];

    if (!targetDir) throw new Error(`Directory data missing for path: ${path}`);

    // UPDATED PARSING LOGIC FOR CLEANER FORMAT
    // Every item is { r: [...], d: number | undefined }
    const items = Object.entries(targetDir).map(([name, data]: [string, any]) => {

      const compressed = data.r;

      // Determine deletion status based on 'd' property existence/type
      // If 'd' is a number, it's deleted. If it's missing/undefined, it's active.
      const deletedAt = (typeof data.d === 'number') ? data.d : null;
      const isDeleted = deletedAt !== null;

      return {
        name,
        rates: decompressRates(compressed),
        isDirectory: !name.includes('.'), // Heuristic
        isDeleted,
        deletedAt
      };
    });

    rawDirectoryItems.value = items;
  } catch (err: any) {
    console.error(err);
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function navigate(path: string) {
  currentPath.value = path;
}

function onItemClick(item: DirectoryItem) {
  if (item.name.includes('.')) return;
  const nextPath = currentPath.value === '.' ? item.name : `${currentPath.value}/${item.name}`;
  navigate(nextPath);
}

// Watcher 1: Fetch REPO TOTALS when repo changes
watch(repositories, () => {
   const repo = repositories.value[0];
   if (repo) fetchRepoTotal(repo);
}, { immediate: true });

// Watcher 2: Fetch DIRECTORY DATA when repo or path changes
watch([repositories, currentPath], () => {
  const repo = repositories.value[0];
  if (repo) fetchDirectoryData(repo, currentPath.value);
}, { immediate: true });

// Watcher 3: Update URL when any filter/view option changes
watch([
  repositories,
  currentPath,
  smoothingWindow,
  showDeleted,
  searchQuery,
  sortBy,
  sortDesc,
], () => {
  const repo = repositories.value[0];
  router.replace({
    query: {
      repository: repo,
      path: currentPath.value,
      smoothing: smoothingWindow.value.toString(),
      showDeleted: showDeleted.value.toString(),
      search: searchQuery.value,
      sortBy: sortBy.value,
      sortDesc: sortDesc.value.toString()
    }
  });
});

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
  border-bottom: 2px solid #dbdbdb;
  padding: 0.75rem;
}

.virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 50px;
  border-bottom: 1px solid #f5f5f5;
  transition: background-color 0.1s;
}

.virtual-row:hover {
  background-color: #fafafa;
}

.virtual-row .column {
  height: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
}

.virtual-scroll-container {
  height: calc(100vh - 500px);
  overflow-y: auto;
  position: relative;
}

.virtual-scroll-container::-webkit-scrollbar {
  width: 8px;
}
.virtual-scroll-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}
.virtual-scroll-container::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}
.virtual-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #bbb;
}
</style>
