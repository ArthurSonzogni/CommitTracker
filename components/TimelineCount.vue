<template>
  <div class="timeline-count">
    <UiField v-if="!basic">
      <UiSwitch v-model="full">Full</UiSwitch>
    </UiField>
    <div align="center">
      <UiTable
        :data="filteredData"
        :columns="columns"
        row-key="developer"
        :sticky-header="!basic"
        :height="basic ? '100%' : undefined"
        striped
        :hoverable="!basic" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";
import type { PropType } from "vue";
import type { Column } from "./ui/Table.vue";
import {
  useDeveloperCommits,
  type DeveloperCommitsEntry,
} from "~/composables/useDeveloperCommits";

const props = defineProps({
  repositories: {
    type: Array as PropType<string[]>,
    default: () => ["chromium"],
  },
  developers: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  dates: {
    type: Array as PropType<Date[]>,
    default: undefined,
  },
  author: { type: Boolean, default: true },
  review: { type: Boolean, default: true },
  basic: { type: Boolean, default: false },
  commits: {
    type: Array as PropType<DeveloperCommitsEntry[]>,
    default: undefined,
  },
});

const full = ref(false);

const intFormat = format(",d");
const floatFormat = format(",.2f");
const formatInt = (v: unknown) => intFormat(typeof v === "number" && Number.isFinite(v) ? v : 0);
const formatFloat = (v: unknown) => floatFormat(typeof v === "number" && Number.isFinite(v) ? v : 0);

const { filtered: fetchedFiltered } = useDeveloperCommits({
  repo: () => (props.commits !== undefined ? "" : props.repositories),
  developers: () => (props.commits !== undefined ? [] : props.developers),
  dates: () => props.dates,
  author: () => props.author,
  review: () => props.review,
});

const entries = computed<DeveloperCommitsEntry[]>(() => {
  if (props.commits === undefined) {
    return fetchedFiltered.value;
  }
  const hasDateBounds =
    Array.isArray(props.dates) &&
    props.dates.length >= 2 &&
    props.dates[0] instanceof Date &&
    props.dates[1] instanceof Date;
  const startMs = hasDateBounds ? props.dates![0].getTime() : -Infinity;
  const endMs = hasDateBounds ? props.dates![1].getTime() : Infinity;

  return props.commits.map((entry) => {
    if (!props.author && !props.review) {
      return { developer: entry.developer, data: [] };
    }
    const data = entry.data.filter((commit) => {
      if (!props.author && commit.kind === "author") return false;
      if (!props.review && commit.kind === "review") return false;
      const t = commit.timeMs ?? Date.parse(commit.date);
      return t >= startMs && t <= endMs;
    });
    return { developer: entry.developer, data };
  });
});

const STAT_TYPES = ["Additions", "Deletions", "Net", "Modified", "Files"] as const;

const columns = computed<Column[]>(() => {
  if (props.basic) {
    return [
      {
        field: "developer",
        label: "Developer",
        sortable: true,
      },
      {
        field: "author",
        label: "Author",
        sortable: true,
        numeric: true,
        formatter: formatInt,
      },
      {
        field: "review",
        label: "Review",
        sortable: true,
        numeric: true,
        formatter: formatInt,
      },
    ];
  }

  const cols: Column[] = [
    {
      field: "developer",
      label: "Developer",
      sortable: true,
      sticky: true,
      visible: true,
      numeric: false,
      headerClass: "table-style-header",
    },
    {
      field: "commit",
      label: "Σ(Commits)",
      sortable: true,
      visible: true,
      numeric: true,
      formatter: formatInt,
      cellClass: "table-style-commits",
      headerClass: "table-style-header",
    },
  ];

  const stats: Array<[string, (x: string) => string, (v: unknown) => string]> = [
    ["", (x: string) => `Σ(${x})`, formatInt],
  ];
  if (full.value) {
    stats.push(["_mean", (x: string) => `Mean(${x})`, formatFloat]);
    stats.push(["_median", (x: string) => `Median(${x})`, formatInt]);
    stats.push(["_min", (x: string) => `Min(${x})`, formatInt]);
    stats.push(["_max", (x: string) => `Max(${x})`, formatInt]);
  }

  for (const type of STAT_TYPES) {
    const lower = type.toLowerCase();
    for (const [suffix, labelFn, formatter] of stats) {
      cols.push({
        field: `${lower}${suffix}`,
        label: labelFn(type),
        sortable: true,
        visible: true,
        numeric: true,
        formatter,
        cellClass: `table-style-${lower}`,
        headerClass: "table-style-header",
      });
    }
  }

  return cols;
});

const calcStats = (values: number[]) => {
  const n = values.length;
  if (n === 0) {
    return { sum: 0, mean: 0, median: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += sorted[i];
  }
  return {
    sum,
    mean: sum / n,
    median: sorted[Math.floor(n / 2)],
    min: sorted[0],
    max: sorted[n - 1],
  };
};

const filteredData = computed(() => {
  if (props.basic) {
    return entries.value.map((entry) => {
      let authorCount = 0;
      let reviewCount = 0;
      for (const c of entry.data) {
        if (props.author && c.kind === "author") authorCount++;
        else if (props.review && c.kind === "review") reviewCount++;
      }
      return {
        developer: entry.developer,
        author: authorCount,
        review: reviewCount,
      };
    });
  }

  return entries.value.map((entry) => {
    const commits = entry.data;
    const additions = calcStats(commits.map((c) => c.additions ?? 0));
    const deletions = calcStats(commits.map((c) => c.deletions ?? 0));
    const net = calcStats(commits.map((c) => (c.additions ?? 0) - (c.deletions ?? 0)));
    const modified = calcStats(commits.map((c) => (c.additions ?? 0) + (c.deletions ?? 0)));
    const files = calcStats(commits.map((c) => c.files ?? 0));

    return {
      developer: entry.developer,
      commit: commits.length,

      additions: additions.sum,
      additions_mean: additions.mean,
      additions_median: additions.median,
      additions_min: additions.min,
      additions_max: additions.max,

      deletions: deletions.sum,
      deletions_mean: deletions.mean,
      deletions_median: deletions.median,
      deletions_min: deletions.min,
      deletions_max: deletions.max,

      net: net.sum,
      net_mean: net.mean,
      net_median: net.median,
      net_min: net.min,
      net_max: net.max,

      modified: modified.sum,
      modified_mean: modified.mean,
      modified_median: modified.median,
      modified_min: modified.min,
      modified_max: modified.max,

      files: files.sum,
      files_mean: files.mean,
      files_median: files.median,
      files_min: files.min,
      files_max: files.max,
    };
  });
});
</script>

<style scoped>
.timeline-count :deep(.table-style-commits) {
  font-family: var(--font-mono);
  background-color: rgba(255, 255, 0, 0.1);
}

.timeline-count :deep(.table-style-additions) {
  font-family: var(--font-mono);
  background-color: rgba(0, 255, 0, 0.1);
}

.timeline-count :deep(.table-style-deletions) {
  font-family: var(--font-mono);
  background-color: rgba(255, 0, 0, 0.1);
}

.timeline-count :deep(.table-style-net) {
  font-family: var(--font-mono);
  background-color: rgba(0, 0, 255, 0.1);
}

.timeline-count :deep(.table-style-modified) {
  font-family: var(--font-mono);
  background-color: rgba(255, 0, 255, 0.1);
}

.timeline-count :deep(.table-style-files) {
  font-family: var(--font-mono);
  background-color: rgba(128, 128, 128, 0.12);
}
</style>
