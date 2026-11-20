<template>
  <div class="bug-leaderboard">
    <div v-if="!loaded" class="loading-note">Loading bugs…</div>
    <div v-else-if="!rows.length" class="loading-note">No multi-commit bugs found for the selected repositories.</div>
    <template v-else>
      <div class="bug-controls">
        <UiSegmented
          v-model="sortBy"
          aria-label="Sort bugs by"
          :options="[
            { value: 'commits', label: 'Commits' },
            { value: 'authors', label: 'Authors' },
            { value: 'lines', label: 'Lines changed' },
            { value: 'span', label: 'Timespan' },
          ]" />
        <span class="bug-hint">Top {{ sortedRows.length }} bugs (5+ commits, ranked from primary bug IDs)</span>
      </div>

      <div class="table-scroll">
        <table class="bug-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Bug</th>
              <th v-if="showRepo">Repository</th>
              <th>Commits</th>
              <th>Authors</th>
              <th>Lines</th>
              <th>Timespan</th>
              <th>Top contributor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in sortedRows.slice(0, limit)" :key="`${row.repo}:${row.id}`">
              <td class="rank">{{ i + 1 }}</td>
              <td class="bug-id">
                <a v-if="row.url" :href="row.url" target="_blank" rel="noopener">#{{ row.id }}</a>
                <template v-else>#{{ row.id }}</template>
              </td>
              <td v-if="showRepo" class="repo-cell">
                <span class="repo-dot" :style="{ background: row.repoColor }" />{{ row.repoName }}
              </td>
              <td class="num"><strong>{{ intFmt.format(row.commits) }}</strong></td>
              <td class="num">{{ intFmt.format(row.authors) }}</td>
              <td class="num">{{ compact(row.lines) }}</td>
              <td class="span-cell" :title="`${row.first} → ${row.last}`">
                {{ formatSpan(row.spanDays) }}
                <span class="span-years">{{ row.first.slice(0, 4) }}–{{ row.last.slice(0, 4) }}</span>
              </td>
              <td class="top-cell">
                <NuxtLink :to="`/developers/${encodeURIComponent(row.top)}`">{{ row.top }}</NuxtLink>
                <span class="top-count">({{ intFmt.format(row.top_n) }})</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        v-if="sortedRows.length > limit"
        type="button"
        class="button is-small more-btn"
        @click="limit += 50">
        Show more ({{ sortedRows.length - limit }} remaining)
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import repositoriesJson from "../public/data/repositories.json";

interface RawBug {
  id: number;
  commits: number;
  authors: number;
  lines: number;
  first: string;
  last: string;
  top: string;
  top_n: number;
}

const props = defineProps({
  repositories: {
    type: Array as PropType<string[]>,
    default: () => ["chromium"],
  },
});

const rawData = shallowRef<Record<string, RawBug[]> | null>(null);
const loaded = ref(false);
const sortBy = ref<"commits" | "authors" | "lines" | "span">("commits");
const limit = ref(50);

watch([() => props.repositories, sortBy], () => { limit.value = 50; });

onMounted(async () => {
  try {
    const res = await fetch("/data/top-bugs.json");
    if (res.ok) rawData.value = await res.json();
  } finally {
    loaded.value = true;
  }
});

const repoMeta = new Map(repositoriesJson.map(r => [r.dirname, r]));
const intFmt = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : intFmt.format(n);

const bugUrlOf = (dirname: string, id: number): string | null => {
  if (dirname === "firefox" || dirname === "spidermonkey") {
    return `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`;
  }
  if (dirname === "webkit" || dirname === "jsc") {
    return `https://bugs.webkit.org/show_bug.cgi?id=${id}`;
  }
  const repo = repoMeta.get(dirname);
  if (repo?.reviewers === true) return `https://crbug.com/${id}`;
  if (repo?.owner && repo?.repository) return `https://github.com/${repo.owner}/${repo.repository}/issues/${id}`;
  return null;
};

const formatSpan = (days: number) => {
  if (days >= 730) return `${(days / 365.25).toFixed(1)}y`;
  if (days >= 60) return `${Math.round(days / 30.4)}mo`;
  return `${Math.max(1, days)}d`;
};

const showRepo = computed(() => props.repositories.length > 1);

const rows = computed(() => {
  if (!rawData.value) return [];
  const out: Array<RawBug & { repo: string; repoName: string; repoColor: string; spanDays: number; url: string | null }> = [];
  for (const dirname of props.repositories) {
    const list = rawData.value[dirname];
    if (!list) continue;
    const meta = repoMeta.get(dirname);
    for (const b of list) {
      const spanDays = Math.max(0, Math.round((Date.parse(b.last) - Date.parse(b.first)) / 86400000));
      out.push({
        ...b,
        repo: dirname,
        repoName: meta?.name ?? dirname,
        repoColor: meta?.color ?? "var(--accent)",
        spanDays,
        url: bugUrlOf(dirname, b.id),
      });
    }
  }
  return out;
});

const TOP_LIMIT = 100;

const sortedRows = computed(() => {
  const list = [...rows.value];
  switch (sortBy.value) {
    case "authors": list.sort((a, b) => b.authors - a.authors || b.commits - a.commits); break;
    case "lines": list.sort((a, b) => b.lines - a.lines || b.commits - a.commits); break;
    case "span": list.sort((a, b) => b.spanDays - a.spanDays || b.commits - a.commits); break;
    default: list.sort((a, b) => b.commits - a.commits || b.authors - a.authors); break;
  }
  return list.slice(0, TOP_LIMIT);
});
</script>

<style scoped>
.bug-leaderboard {
  display: grid;
  gap: 0.9rem;
}

.loading-note {
  color: var(--muted);
  padding: 2rem 0;
}

.bug-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: space-between;
}

.bug-hint {
  color: var(--muted);
  font-size: 0.82rem;
}

.table-scroll {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.bug-table {
  border-collapse: collapse;
  font-size: 0.86rem;
  width: 100%;
}

.bug-table th,
.bug-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.5rem 0.7rem;
  white-space: nowrap;
}

.bug-table thead th {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
}

.bug-table thead th:nth-child(n + 3) {
  text-align: right;
}

.bug-table td.num,
.bug-table td.rank {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.bug-table td.rank {
  color: var(--muted);
  width: 2.5rem;
}

.bug-id {
  font-family: var(--font-mono);
  font-weight: 600;
}

.repo-cell {
  text-align: left !important;
}

.repo-dot {
  border-radius: 50%;
  display: inline-block;
  height: 8px;
  margin-right: 0.4rem;
  width: 8px;
}

.span-cell {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.span-years {
  color: var(--muted);
  font-size: 0.76rem;
  margin-left: 0.35rem;
}

.top-cell {
  text-align: right;
}

.top-count {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  margin-left: 0.25rem;
}

.more-btn {
  justify-self: start;
}
</style>
