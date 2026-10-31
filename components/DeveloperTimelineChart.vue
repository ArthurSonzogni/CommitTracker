<template>
  <LineChart v-if="chart === 'line'" :data="filteredData" />
  <CalendarHeatmap v-else-if="chart === 'heatmap'" :data="filteredData" />
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import {
  useDeveloperCommits,
  type DeveloperCommitsEntry,
} from "~/composables/useDeveloperCommits";

const props = defineProps({
  repositories: {
    type: Array as PropType<string[]>,
    default: () => ["chromium"],
  },
  chart: { type: String, default: "line" },
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
  stacked: { type: Boolean, default: false },
  commits: {
    type: Array as PropType<DeveloperCommitsEntry[]>,
    default: undefined,
  },
});

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

const filteredData = computed(() => {
  let series = entries.value.map((entry) => {
    const times = entry.data
      .map((commit) => commit.timeMs ?? Date.parse(commit.date))
      .sort((a, b) => a - b);
    return {
      label: entry.developer,
      times,
    };
  });

  if (props.stacked) {
    let accu: number[] = [];
    series = series.map((entry, i) => {
      const label = i !== 0 ? `${entry.label} (+${i})` : entry.label;
      accu = accu.concat(entry.times).sort((a, b) => a - b);
      return {
        label,
        times: accu,
      };
    });
  }

  const isLine = props.chart === "line";
  return series.map((entry) => {
    let accu = 0;
    return {
      label: entry.label,
      values: entry.times.map((timeMs) => {
        accu++;
        return {
          x: new Date(timeMs),
          y: isLine ? accu : 1,
        };
      }),
    };
  });
});
</script>
