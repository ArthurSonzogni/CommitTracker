<template>
  <div class="usernames-page">
    <section class="section pb-4">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">Usernames distribution</h1>
            <p class="subtitle-text">
              Username lengths, naming patterns, and how contributor handles have evolved across
              {{ repoListLabel }}.
            </p>
          </div>
        </div>

        <FilterPanel
          class="mt-4"
          :summary="listSummary(repositoryNames(repositories), 'repositories')"
        >
          <RepositorySelector
            v-model="repositories"
            size="medium"
            :allowMultiple="true"
            :allowAll="true"
          />
        </FilterPanel>

        <FetchError v-if="loadError" class="mt-4" :message="loadError" @retry="refresh" />

        <div v-else-if="repositories.length === 0" class="empty-state mt-5">
          <UiIcon name="account-multiple" size="medium" />
          <p>Select at least one repository above to inspect its contributor usernames.</p>
        </div>

        <div v-else-if="loading && allUsernames.length === 0" class="mt-4">
          <div class="skeleton" style="height: 20px; width: 42ch; max-width: 100%" />
        </div>

        <template v-else-if="allUsernames.length > 0">
          <p class="summary-line mt-4">
            <strong>{{ fmtInt(filteredUsernames.length) }}</strong>
            <template v-if="activePattern !== 'all'">
              of {{ fmtInt(allUsernames.length) }}
            </template>
            unique usernames in {{ repoListLabel }} — average length
            <strong>{{ stats.mean.toFixed(1) }}</strong> characters (median
            <strong>{{ stats.median }}</strong>, most common
            <strong>{{ stats.mode }}</strong>).
          </p>

          <!-- Search ("Where do I land?") & Naming Pattern Filters -->
          <div class="panel-card mt-4">
            <div class="search-row">
              <div class="search-input-wrap">
                <UiIcon name="magnify" size="small" class="search-icon" />
                <input
                  v-model="searchQuery"
                  type="search"
                  class="search-input"
                  placeholder="Search a username or type yours to see where it lands…"
                  aria-label="Search usernames"
                />
                <button
                  v-if="searchQuery"
                  type="button"
                  class="search-clear"
                  aria-label="Clear search"
                  @click="searchQuery = ''"
                >
                  <UiIcon name="close" size="small" />
                </button>
              </div>
            </div>

            <!-- "Where do I land?" Spotlight -->
            <div v-if="spotlight" class="spotlight-banner mt-3">
              <div class="spotlight-main">
                <code class="spotlight-handle">{{ spotlight.query }}</code>
                <span class="spotlight-len">{{ spotlight.length }} {{ spotlight.length === 1 ? "char" : "chars" }}</span>
                <span class="spotlight-sep">·</span>
                <span v-if="spotlight.exactMatch">
                  In dataset<template v-if="spotlight.commits > 0">
                    (<strong>{{ fmtInt(spotlight.commits) }}</strong>
                    {{ spotlight.commits === 1 ? "commit" : "commits" }})
                  </template>
                  —
                </span>
                <span v-else>Not in this selection — would be </span>
                <span>
                  longer than <strong>{{ spotlight.shorterPct }}%</strong> of contributors
                  <span v-if="spotlight.sameLengthCount > 0" class="muted-text">
                    ({{ fmtInt(spotlight.sameLengthCount) }} share this exact length)
                  </span>
                </span>
              </div>
              <NuxtLink
                v-if="spotlight.exactMatch"
                :to="individualLink(spotlight.exactMatch)"
                class="spotlight-cta"
              >
                View profile
                <UiIcon name="arrow-right" size="small" />
              </NuxtLink>
            </div>

            <!-- Matching Usernames for Search -->
            <div v-if="trimmedSearch" class="search-results mt-3">
              <div class="search-results-head">
                <span>
                  <strong>{{ fmtInt(searchMatches.length) }}</strong>
                  {{ searchMatches.length === 1 ? "match" : "matches" }}
                </span>
                <span v-if="searchMatches.length > 0 && hasSummaryData" class="muted-text">
                  Sorted by {{ sortMode === "commits" ? "commits" : "A–Z" }}
                </span>
              </div>
              <div v-if="searchMatches.length > 0" class="username-grid mt-2">
                <NuxtLink
                  v-for="u in searchMatches.slice(0, searchLimit)"
                  :key="u"
                  :to="individualLink(u)"
                  class="username-pill"
                >
                  <span class="username-text">{{ u }}</span>
                  <span v-if="commitCounts.get(u)" class="username-meta">
                    {{ fmtCompact(commitCounts.get(u)!) }}
                  </span>
                </NuxtLink>
              </div>
              <div v-if="searchMatches.length > searchLimit" class="mt-3">
                <button
                  type="button"
                  class="more-btn"
                  @click="searchLimit += 60"
                >
                  Show more ({{ fmtInt(searchMatches.length - searchLimit) }} remaining)
                </button>
              </div>
            </div>

            <!-- Naming Pattern Filter Chips -->
            <div class="pattern-row mt-4" role="group" aria-label="Filter by naming pattern">
              <button
                v-for="p in patternCounts"
                :key="p.id"
                type="button"
                class="pattern-chip"
                :class="{ 'is-active': activePattern === p.id }"
                :aria-pressed="activePattern === p.id"
                @click="activePattern = p.id"
              >
                <span class="pattern-label">{{ p.label }}</span>
                <span class="pattern-count">{{ fmtInt(p.count) }}</span>
                <span v-if="p.id !== 'all'" class="pattern-pct">{{ p.pct }}%</span>
              </button>
            </div>
          </div>

          <!-- Length Distribution Histogram -->
          <div class="panel-card mt-5">
            <div class="section-head">
              <div>
                <h2 class="section-title">Length distribution</h2>
                <p class="section-subtitle">
                  Click any bar to inspect the usernames of that length.
                </p>
              </div>
              <div class="section-controls">
                <button
                  v-if="expandedLengths.size > 0"
                  type="button"
                  class="ghost-btn"
                  @click="collapseAll"
                >
                  Collapse all
                </button>
                <UiSegmented
                  v-if="hasSummaryData"
                  v-model="sortMode"
                  :options="sortOptions"
                  aria-label="Sort usernames"
                />
              </div>
            </div>

            <div class="hist-header mt-4">
              <span class="hist-col-len">Length</span>
              <span class="hist-col-bar">Contributors</span>
              <span class="hist-col-count">Count</span>
            </div>

            <div v-if="buckets.length === 0" class="empty-inline">
              No usernames match the current filter.
            </div>

            <div v-else class="hist-list">
              <div
                v-for="bucket in buckets"
                :key="bucket.length"
                class="hist-group"
                :class="{
                  'is-expanded': expandedLengths.has(bucket.length),
                  'is-highlighted': spotlight && spotlight.length === bucket.length,
                }"
              >
                <button
                  type="button"
                  class="hist-row"
                  :disabled="bucket.count === 0"
                  :aria-expanded="expandedLengths.has(bucket.length)"
                  @click="toggleBucket(bucket.length)"
                >
                  <span class="hist-len">{{ bucket.length }}</span>
                  <span class="hist-bar-track">
                    <span
                      class="hist-bar-fill"
                      :style="{ width: bucket.barWidthPct + '%' }"
                    />
                  </span>
                  <span class="hist-count">
                    <span class="hist-count-num">{{ fmtInt(bucket.count) }}</span>
                    <span class="hist-count-pct">{{ bucket.sharePct }}%</span>
                  </span>
                  <span class="hist-chevron" aria-hidden="true">
                    <UiIcon
                      v-if="bucket.count > 0"
                      :name="expandedLengths.has(bucket.length) ? 'chevron-down' : 'chevron-right'"
                      size="small"
                    />
                  </span>
                </button>

                <!-- Lazy-rendered username list -->
                <div v-if="expandedLengths.has(bucket.length)" class="hist-drawer">
                  <div class="username-grid">
                    <NuxtLink
                      v-for="u in getBucketUsers(bucket.length)"
                      :key="u"
                      :to="individualLink(u)"
                      class="username-pill"
                      :class="{ 'is-match': trimmedSearch && u.toLowerCase().includes(trimmedSearch) }"
                    >
                      <span class="username-text">{{ u }}</span>
                      <span v-if="commitCounts.get(u)" class="username-meta">
                        {{ fmtCompact(commitCounts.get(u)!) }}
                      </span>
                    </NuxtLink>
                  </div>
                  <div v-if="bucket.count > getBucketLimit(bucket.length)" class="drawer-actions mt-3">
                    <button
                      type="button"
                      class="more-btn"
                      @click="expandBucketLimit(bucket.length, 150)"
                    >
                      Show 150 more ({{ fmtInt(bucket.count - getBucketLimit(bucket.length)) }} remaining)
                    </button>
                    <button
                      type="button"
                      class="ghost-btn"
                      @click="expandBucketLimit(bucket.length, bucket.count)"
                    >
                      Show all {{ fmtInt(bucket.count) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Username Length Over Time -->
          <div v-if="trendSeries.length > 0" class="panel-card mt-5">
            <div class="section-head">
              <div>
                <h2 class="section-title">
                  <UiIcon name="trending-up" size="small" class="title-icon" />
                  Username length over time
                </h2>
                <p class="section-subtitle">
                  Average and median username length of <strong>newcomers</strong> by their first
                  active year.
                  <template v-if="trendTakeaway">
                    {{ trendTakeaway }}
                  </template>
                </p>
              </div>
            </div>
            <div class="trend-chart-wrap mt-3">
              <LineChart :data="trendSeries" :formatter="formatCharLength" />
            </div>
          </div>

          <!-- Starting Letter (A-Z) Distribution -->
          <div class="panel-card mt-5">
            <div class="section-head">
              <div>
                <h2 class="section-title">
                  <UiIcon name="alphabetical" size="small" class="title-icon" />
                  Starting letter
                </h2>
                <p class="section-subtitle">
                  Click any letter to browse usernames starting with it.
                </p>
              </div>
              <button
                v-if="selectedLetter"
                type="button"
                class="ghost-btn"
                @click="selectedLetter = null"
              >
                Clear "{{ selectedLetter }}"
              </button>
            </div>

            <div class="az-chart mt-4" role="group" aria-label="Starting letter distribution">
              <button
                v-for="item in letterBuckets"
                :key="item.letter"
                type="button"
                class="az-col"
                :class="{ 'is-selected': selectedLetter === item.letter, 'is-empty': item.count === 0 }"
                :disabled="item.count === 0"
                :title="`${item.letter}: ${fmtInt(item.count)} usernames (${item.pct}%)`"
                :aria-pressed="selectedLetter === item.letter"
                @click="toggleLetter(item.letter)"
              >
                <span class="az-count">{{ item.count > 0 ? fmtCompact(item.count) : "" }}</span>
                <span class="az-bar-wrap">
                  <span class="az-bar" :style="{ height: item.heightPct + '%' }" />
                </span>
                <span class="az-label">{{ item.letter }}</span>
              </button>
            </div>

            <div v-if="selectedLetter" class="az-drawer mt-4">
              <div class="search-results-head mb-2">
                <span>
                  Starting with <strong>{{ selectedLetter }}</strong> —
                  <strong>{{ fmtInt(selectedLetterUsers.length) }}</strong> usernames
                </span>
              </div>
              <div class="username-grid">
                <NuxtLink
                  v-for="u in selectedLetterUsers.slice(0, letterLimit)"
                  :key="u"
                  :to="individualLink(u)"
                  class="username-pill"
                >
                  <span class="username-text">{{ u }}</span>
                  <span v-if="commitCounts.get(u)" class="username-meta">
                    {{ fmtCompact(commitCounts.get(u)!) }}
                  </span>
                </NuxtLink>
              </div>
              <div v-if="selectedLetterUsers.length > letterLimit" class="drawer-actions mt-3">
                <button
                  type="button"
                  class="more-btn"
                  @click="letterLimit += 120"
                >
                  Show 120 more ({{ fmtInt(selectedLetterUsers.length - letterLimit) }} remaining)
                </button>
              </div>
            </div>
          </div>

          <!-- Shortest & Longest Extremes -->
          <UsernamesExtremesTables
            :shortest-list="shortestList"
            :longest-list="longestList"
            :commit-counts="commitCounts"
            :individual-link="individualLink"
            :fmt-compact="fmtCompact"
          />
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchJson, formatFetchError } from "~/utils/fetchJson";
import { listSummary, repositoryNames } from "~/utils/filter-summary";
import { fetchUsernamesSummary, type UsernamesSummary } from "~/utils/usernamesSummary";

type PatternId = "all" | "letters" | "dots" | "digits" | "hyphens" | "underscores";
type SortMode = "commits" | "alpha";

const { repositories } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
});

const allUsernames = ref<string[]>([]);
const commitCounts = ref<Map<string, number>>(new Map());
const firstActiveYear = ref<Map<string, number>>(new Map());
const loading = ref(false);
const loadError = ref<string | null>(null);

const searchQuery = ref("");
const searchLimit = ref(60);
const activePattern = ref<PatternId>("all");
const sortMode = ref<SortMode>("commits");
const expandedLengths = ref<Set<number>>(new Set());
const bucketLimits = ref<Map<number, number>>(new Map());
const selectedLetter = ref<string | null>(null);
const letterLimit = ref(120);

const sortOptions = [
  { value: "commits", label: "Most commits", icon: "fire" },
  { value: "alpha", label: "A–Z", icon: "sort-alphabetical-ascending" },
];

const hasSummaryData = computed(() => commitCounts.value.size > 0);

const repoListLabel = computed(() => {
  const names = repositoryNames(repositories.value);
  if (names.length === 0) return "selected repositories";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} repositories`;
});

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};
const formatCharLength = (d: number) => `${d.toFixed(1)} chars`;

const individualLink = (username: string) => ({
  path: "/individuals",
  query: {
    developers: username,
    ...(repositories.value.length > 0
      ? { repositories: repositories.value.join(",") }
      : {}),
  },
});

const matchesPattern = (u: string, pattern: PatternId): boolean => {
  switch (pattern) {
    case "letters":
      return /^[a-z]+$/.test(u);
    case "dots":
      return u.includes(".");
    case "digits":
      return /\d/.test(u);
    case "hyphens":
      return u.includes("-");
    case "underscores":
      return u.includes("_");
    default:
      return true;
  }
};

const patternDefs: { id: PatternId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "letters", label: "Letters only" },
  { id: "dots", label: "Has dots" },
  { id: "digits", label: "Has digits" },
  { id: "hyphens", label: "Has hyphens" },
  { id: "underscores", label: "Has underscores" },
];

const patternCounts = computed(() => {
  const total = allUsernames.value.length || 1;
  return patternDefs.map((def) => {
    const count =
      def.id === "all"
        ? allUsernames.value.length
        : allUsernames.value.filter((u) => matchesPattern(u, def.id)).length;
    return {
      ...def,
      count,
      pct: ((count / total) * 100).toFixed(count > 0 && count / total < 0.01 ? 1 : 0),
    };
  });
});

const filteredUsernames = computed(() => {
  if (activePattern.value === "all") return allUsernames.value;
  return allUsernames.value.filter((u) => matchesPattern(u, activePattern.value));
});

const sortUsers = (list: string[]): string[] => {
  const copy = [...list];
  if (sortMode.value === "commits" && hasSummaryData.value) {
    const counts = commitCounts.value;
    copy.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
  } else {
    copy.sort((a, b) => a.localeCompare(b));
  }
  return copy;
};

// Bucket usernames by length
const bucketMap = computed(() => {
  const map = new Map<number, string[]>();
  for (const u of filteredUsernames.value) {
    const len = u.length;
    if (len === 0) continue;
    let arr = map.get(len);
    if (!arr) {
      arr = [];
      map.set(len, arr);
    }
    arr.push(u);
  }
  return map;
});

const stats = computed(() => {
  const users = filteredUsernames.value;
  if (users.length === 0) {
    return { mean: 0, median: 0, mode: 0, modeCount: 0, minLength: 0, maxLength: 0 };
  }
  const lengths = users.map((u) => u.length).sort((a, b) => a - b);
  let sum = 0;
  for (const l of lengths) sum += l;
  const mean = sum / lengths.length;
  const mid = Math.floor(lengths.length / 2);
  const median =
    lengths.length % 2 === 1 ? lengths[mid] : Math.round(((lengths[mid - 1] + lengths[mid]) / 2) * 10) / 10;

  let mode = lengths[0];
  let modeCount = 0;
  for (const [len, arr] of bucketMap.value.entries()) {
    if (arr.length > modeCount) {
      modeCount = arr.length;
      mode = len;
    }
  }
  return {
    mean,
    median,
    mode,
    modeCount,
    minLength: lengths[0],
    maxLength: lengths[lengths.length - 1],
  };
});

const buckets = computed(() => {
  const total = filteredUsernames.value.length;
  if (total === 0) return [];
  const minLen = stats.value.minLength;
  const maxLen = stats.value.maxLength;
  let maxCount = 1;
  for (const arr of bucketMap.value.values()) {
    if (arr.length > maxCount) maxCount = arr.length;
  }
  const out: { length: number; count: number; barWidthPct: number; sharePct: string }[] = [];
  for (let len = minLen; len <= maxLen; len++) {
    const count = bucketMap.value.get(len)?.length ?? 0;
    const share = (count / total) * 100;
    out.push({
      length: len,
      count,
      barWidthPct: count === 0 ? 0 : Math.max(1.2, (count / maxCount) * 100),
      sharePct: share === 0 ? "0" : share < 0.1 ? "<0.1" : share.toFixed(1),
    });
  }
  return out;
});

const shortestList = computed(() => {
  const counts = commitCounts.value;
  return [...filteredUsernames.value]
    .sort((a, b) => a.length - b.length || (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b))
    .slice(0, 10);
});

const longestList = computed(() => {
  const counts = commitCounts.value;
  return [...filteredUsernames.value]
    .sort((a, b) => b.length - a.length || (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b))
    .slice(0, 10);
});

// Search & "Where do I land?"
const trimmedSearch = computed(() => searchQuery.value.trim().toLowerCase());

const exactUsernameSet = computed(() => {
  const map = new Map<string, string>();
  for (const u of allUsernames.value) {
    map.set(u.toLowerCase(), u);
  }
  return map;
});

const spotlight = computed(() => {
  const q = trimmedSearch.value;
  if (!q || filteredUsernames.value.length === 0) return null;
  const len = q.length;
  let shorter = 0;
  let same = 0;
  for (const u of filteredUsernames.value) {
    if (u.length < len) shorter++;
    else if (u.length === len) same++;
  }
  const exactMatch = exactUsernameSet.value.get(q) ?? null;
  return {
    query: exactMatch ?? q,
    length: len,
    exactMatch,
    commits: exactMatch ? commitCounts.value.get(exactMatch) ?? 0 : 0,
    shorterPct: Math.round((shorter / filteredUsernames.value.length) * 100),
    sameLengthCount: same,
  };
});

const searchMatches = computed(() => {
  const q = trimmedSearch.value;
  if (!q) return [];
  const matches = filteredUsernames.value.filter((u) => u.toLowerCase().includes(q));
  return sortUsers(matches);
});

watch(trimmedSearch, () => {
  searchLimit.value = 60;
});

// Bucket expand / lazy render helpers
const toggleBucket = (len: number) => {
  const next = new Set(expandedLengths.value);
  if (next.has(len)) {
    next.delete(len);
  } else {
    next.add(len);
  }
  expandedLengths.value = next;
};

const collapseAll = () => {
  expandedLengths.value = new Set();
};

const getBucketLimit = (len: number) => bucketLimits.value.get(len) ?? 120;

const expandBucketLimit = (len: number, delta: number) => {
  const next = new Map(bucketLimits.value);
  next.set(len, (next.get(len) ?? 120) + delta);
  bucketLimits.value = next;
};

const getBucketUsers = (len: number) => {
  const arr = bucketMap.value.get(len) ?? [];
  return sortUsers(arr).slice(0, getBucketLimit(len));
};

// Starting letter A-Z
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

const letterMap = computed(() => {
  const map = new Map<string, string[]>();
  for (const l of LETTERS) map.set(l, []);
  for (const u of filteredUsernames.value) {
    const ch = u.charAt(0).toUpperCase();
    const key = ch >= "A" && ch <= "Z" ? ch : "#";
    map.get(key)!.push(u);
  }
  return map;
});

const letterBuckets = computed(() => {
  const total = filteredUsernames.value.length || 1;
  let maxCount = 1;
  for (const arr of letterMap.value.values()) {
    if (arr.length > maxCount) maxCount = arr.length;
  }
  return LETTERS.map((letter) => {
    const count = letterMap.value.get(letter)?.length ?? 0;
    return {
      letter,
      count,
      heightPct: count === 0 ? 0 : Math.max(4, (count / maxCount) * 100),
      pct: ((count / total) * 100).toFixed(1),
    };
  });
});

const toggleLetter = (letter: string) => {
  selectedLetter.value = selectedLetter.value === letter ? null : letter;
  letterLimit.value = 120;
};

const selectedLetterUsers = computed(() => {
  if (!selectedLetter.value) return [];
  return sortUsers(letterMap.value.get(selectedLetter.value) ?? []);
});

// Username length over time (newcomers by first active year)
const trendStats = computed(() => {
  if (firstActiveYear.value.size === 0) return [];
  const currentYear = new Date().getFullYear();
  const byYear = new Map<number, number[]>();
  for (const u of filteredUsernames.value) {
    const y = firstActiveYear.value.get(u);
    if (!y || y < 2005 || y > currentYear) continue;
    let arr = byYear.get(y);
    if (!arr) {
      arr = [];
      byYear.set(y, arr);
    }
    arr.push(u.length);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  return years
    .map((year) => {
      const arr = byYear.get(year)!.sort((a, b) => a - b);
      if (arr.length < 5) return null;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const mid = Math.floor(arr.length / 2);
      const median = arr.length % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
      return { year, count: arr.length, mean, median };
    })
    .filter((d): d is { year: number; count: number; mean: number; median: number } => d !== null);
});

const trendSeries = computed(() => {
  if (trendStats.value.length < 2) return [];
  return [
    {
      label: "Mean length",
      values: trendStats.value.map((d) => ({
        x: new Date(Date.UTC(d.year, 0, 1)),
        y: Math.round(d.mean * 100) / 100,
      })),
    },
    {
      label: "Median length",
      dashed: true,
      values: trendStats.value.map((d) => ({
        x: new Date(Date.UTC(d.year, 0, 1)),
        y: d.median,
      })),
    },
  ];
});

const trendTakeaway = computed(() => {
  const rows = trendStats.value;
  if (rows.length < 2) return "";
  const first = rows[0];
  const last = rows[rows.length - 1];
  const pct = Math.round(((last.mean - first.mean) / first.mean) * 100);
  const sign = pct > 0 ? "+" : "";
  return `Grew from ${first.mean.toFixed(1)} chars in ${first.year} to ${last.mean.toFixed(1)} chars in ${last.year} (${sign}${pct}%).`;
});

// Reset transient UI state when pattern changes
watch(activePattern, () => {
  expandedLengths.value = new Set();
  bucketLimits.value = new Map();
  selectedLetter.value = null;
});

// Data loading
let requestId = 0;

const refresh = async () => {
  const id = ++requestId;
  const repos = [...repositories.value];
  loadError.value = null;
  expandedLengths.value = new Set();
  bucketLimits.value = new Map();
  selectedLetter.value = null;

  if (repos.length === 0) {
    allUsernames.value = [];
    commitCounts.value = new Map();
    firstActiveYear.value = new Map();
    loading.value = false;
    return;
  }

  loading.value = true;

  let arrays: string[][];
  try {
    arrays = await Promise.all(
      repos.map((repo) => fetchJson<string[]>(`/data/${repo}/usernames.json`, { cache: true })),
    );
  } catch (error) {
    if (id === requestId) {
      loading.value = false;
      loadError.value = formatFetchError(error, "Failed to load usernames data.");
    }
    return;
  }
  if (id !== requestId) return;

  allUsernames.value = [...new Set(arrays.flat())].filter(Boolean);
  loading.value = false;

  // Load yearly author commit summaries in parallel for commit sorting & length-over-time chart.
  const summaries: UsernamesSummary[] = await Promise.all(
    repos.map((repo) => fetchUsernamesSummary(repo, "commit", "yearly", "author").catch(() => ({}))),
  );
  if (id !== requestId) return;

  const counts = new Map<string, number>();
  const firstYear = new Map<string, number>();

  for (const summary of summaries) {
    for (const [user, years] of Object.entries(summary)) {
      let userTotal = counts.get(user) || 0;
      let minYear = firstYear.get(user) ?? Infinity;
      for (const [yearStr, val] of Object.entries(years)) {
        userTotal += val;
        const y = Number(yearStr);
        if (y >= 2005 && y < minYear) {
          minYear = y;
        }
      }
      if (userTotal > 0) counts.set(user, userTotal);
      if (minYear < Infinity) firstYear.set(user, minYear);
    }
  }

  commitCounts.value = counts;
  firstActiveYear.value = firstYear;
};

watch(repositories, refresh);
onMounted(refresh);
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.subtitle-text {
  color: var(--muted);
  font-size: 0.95rem;
  max-width: 68ch;
  margin: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 3rem 1.5rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  color: var(--muted);
  text-align: center;
}

.summary-line {
  margin: 0;
  font-size: 0.95rem;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.muted-text {
  color: var(--muted);
}

/* Panels */
.panel-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.35rem;
  box-shadow: var(--shadow-xs);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 650;
  color: var(--ink);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.title-icon {
  color: var(--accent);
}

.section-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.88rem;
  color: var(--muted);
}

.section-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

/* Search & Spotlight */
.search-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.search-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.8rem;
  color: var(--muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.6rem 2.3rem 0.6rem 2.35rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface-sunken);
  color: var(--ink);
  font-size: 0.92rem;
  font-family: var(--font-sans);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}

.search-input:focus {
  outline: none;
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: var(--ring);
}

.search-clear {
  position: absolute;
  right: 0.45rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
}

.search-clear:hover {
  color: var(--ink);
  background: var(--surface-sunken);
}

.spotlight-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.7rem 0.95rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  font-size: 0.88rem;
  color: var(--ink);
}

.spotlight-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.spotlight-handle {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent-ink);
  background: transparent;
  padding: 0;
}

.spotlight-len {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--surface);
  border: 1px solid var(--accent-line);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
}

.spotlight-sep {
  color: var(--muted);
}

.spotlight-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--accent-ink);
  text-decoration: none;
  white-space: nowrap;
}

.spotlight-cta:hover {
  text-decoration: underline;
}

.search-results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.84rem;
  color: var(--ink-2);
}

/* Pattern Chips */
.pattern-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.pattern-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-sunken);
  color: var(--ink-2);
  font-size: 0.83rem;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.pattern-chip:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.pattern-chip.is-active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}

.pattern-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.pattern-pct {
  font-variant-numeric: tabular-nums;
  font-size: 0.76rem;
  opacity: 0.75;
}

/* Histogram */
.hist-header {
  display: grid;
  grid-template-columns: 3.5rem 1fr 7.2rem 1.5rem;
  gap: 0.65rem;
  padding: 0 0.5rem 0.45rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.hist-col-len {
  text-align: right;
}

.hist-col-count {
  text-align: right;
}

.hist-list {
  display: flex;
  flex-direction: column;
  margin-top: 0.25rem;
}

.hist-group {
  border-radius: var(--radius-sm);
  transition: background-color 0.12s ease;
}

.hist-group.is-highlighted {
  background: var(--accent-soft);
}

.hist-group.is-expanded {
  background: var(--surface-sunken);
  margin: 0.25rem 0;
  border: 1px solid var(--line);
}

.hist-row {
  width: 100%;
  display: grid;
  grid-template-columns: 3.5rem 1fr 7.2rem 1.5rem;
  gap: 0.65rem;
  align-items: center;
  padding: 0.32rem 0.5rem;
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  transition: background-color 0.12s ease;
}

.hist-row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.hist-row:disabled {
  cursor: default;
  opacity: 0.45;
}

.hist-len {
  text-align: right;
  font-family: var(--font-mono);
  font-size: 0.84rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink-2);
}

.hist-bar-track {
  height: 1.15rem;
  background: color-mix(in srgb, var(--line) 45%, transparent);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.hist-bar-fill {
  height: 100%;
  background: color-mix(in srgb, var(--accent) 72%, transparent);
  border-radius: 4px;
  transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.15s ease;
}

.hist-row:hover:not(:disabled) .hist-bar-fill,
.hist-group.is-expanded .hist-bar-fill,
.hist-group.is-highlighted .hist-bar-fill {
  background: var(--accent);
}

.hist-count {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 0.45rem;
  font-variant-numeric: tabular-nums;
}

.hist-count-num {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink);
}

.hist-count-pct {
  font-size: 0.76rem;
  color: var(--muted);
  min-width: 2.8rem;
  text-align: right;
}

.hist-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.hist-drawer {
  padding: 0.65rem 0.9rem 0.9rem 4.65rem;
  border-top: 1px solid var(--line);
}

@media (max-width: 640px) {
  .hist-drawer {
    padding-left: 0.75rem;
  }
}

.username-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.username-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.24rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  text-decoration: none;
  transition: border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}

.username-pill:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
  background: var(--accent-soft);
}

.username-pill.is-match {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.username-meta {
  font-family: var(--font-sans);
  font-size: 0.72rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.more-btn,
.ghost-btn {
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.35rem 0.75rem;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.more-btn {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
}

.more-btn:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.ghost-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
}

.ghost-btn:hover {
  color: var(--ink);
  background: var(--surface-sunken);
}

.empty-inline {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}

/* Trend Chart */
.trend-chart-wrap {
  height: 360px;
}

/* A-Z Chart */
.az-chart {
  display: grid;
  grid-template-columns: repeat(27, minmax(0, 1fr));
  gap: 0.2rem;
  align-items: end;
}

@media (max-width: 720px) {
  .az-chart {
    overflow-x: auto;
    grid-template-columns: repeat(27, minmax(22px, 1fr));
    padding-bottom: 0.35rem;
  }
}

.az-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem 0.1rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--ink);
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.az-col:hover:not(:disabled) {
  background: var(--surface-sunken);
}

.az-col.is-selected {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.az-col.is-empty {
  opacity: 0.35;
  cursor: default;
}

.az-count {
  font-size: 0.66rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  height: 0.95rem;
  line-height: 0.95rem;
}

.az-bar-wrap {
  width: 100%;
  max-width: 20px;
  height: 84px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.az-bar {
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: color-mix(in srgb, var(--accent) 68%, transparent);
  transition: height 0.3s ease, background-color 0.15s ease;
}

.az-col:hover:not(:disabled) .az-bar,
.az-col.is-selected .az-bar {
  background: var(--accent);
}

.az-label {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-2);
}

.az-drawer {
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}
</style>
