<template>
  <BarChart
    :timeLabel="timeLabel"
    :valueLabel="valueLabel"
    :data="data"
    :formatter="formatter"
  />
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import { format } from "d3-format";
import repositories from "../public/data/repositories.json";
import { fetchUsernamesSummary, type UsernamesSummary } from "~/utils/usernamesSummary";

type BarBucket = {
  label: string;
  values: { label: string; value: number; color: string }[];
};

type Trait = {
  label: string;
  graphLabel: (repo: string) => string;
  formatter: (v: number) => string;
  solidify: (data: UsernamesSummary) => Record<string, number>;
};

const props = defineProps({
  repositories: { type: Array as PropType<string[]>, default: () => ["chromium"] },
  grouping: { type: String, default: "yearly" },
  what: { type: String, default: "commit" },
  display: { type: String, default: "average" },
  kind: { type: String, default: "author" },
  percentile: { type: Number, default: 50 },
  individual: { type: Number, default: 300 },
  developers: { type: Array as PropType<string[]>, default: () => [] },
  min_contributions: { type: Number, default: 0 },
});

const colorMap = new Map<string, string>();
for (const repo of repositories) {
  colorMap.set(repo.dirname, repo.color);
}

const data = shallowRef<BarBucket[]>([]);
const formatter = ref<(v: number) => string>(format(",d"));
const valueLabel = ref("");

const quantile = (arr: number[], q: number) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => b - a);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  return sorted[base] ?? 0;
};

const top = (arr: number[], q: number) => {
  const sorted = [...arr].sort((a, b) => b - a);
  if (q >= 1 && q <= sorted.length) {
    return sorted[q - 1];
  }
  return 0;
};

const rank = (arr: number[], target: number) => {
  const sorted = [...arr].sort((a, b) => b - a);
  for (let index = 0; index < sorted.length; ++index) {
    if (target >= sorted[index]) {
      return index + 1;
    }
  }
  return sorted.length;
};

const merge = (a: Record<string, number>, b: Record<string, number>) => {
  for (const key in b) {
    a[key] = (a[key] || 0) + b[key];
  }
};

const traitsPerContributor = (): Trait | undefined => {
  const contributionPerYear = <T>(
    summary: UsernamesSummary,
    map: (values: number[]) => T,
  ): Record<string, T> => {
    const buckets: Record<string, number[]> = {};
    for (const user in summary) {
      const by_date = summary[user] || {};
      for (const year in by_date) {
        (buckets[year] ||= []).push(by_date[year]);
      }
    }
    const result: Record<string, T> = {};
    for (const year in buckets) {
      result[year] = map(buckets[year]);
    }
    return result;
  };

  if (props.display == "average") {
    return {
      label: "Contribution",
      graphLabel: () => "Commit",
      formatter: (v) => format(".2f")(v),
      solidify: (summary) =>
        contributionPerYear(summary, (c) =>
          c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0,
        ),
    };
  }

  if (props.display == "percentile") {
    return {
      label: "Contribution",
      graphLabel: () => "Commit",
      formatter: (v) => format(",d")(v),
      solidify: (summary) =>
        contributionPerYear(summary, (c) => quantile(c, props.percentile / 100)),
    };
  }

  if (props.display == "individual") {
    return {
      label: "Contribution",
      graphLabel: (repo) => (repo == "solidified" ? "Commit" : repo),
      formatter: (v) => format(",d")(v),
      solidify: (summary) => contributionPerYear(summary, (c) => top(c, props.individual)),
    };
  }

  if (props.display == "someone") {
    return {
      label: "Contribution",
      graphLabel: (repo) => repo,
      formatter: (v) => format(",d")(v),
      solidify: (summary) => {
        const acc: Record<string, number> = {};
        for (const user of props.developers) {
          const byDate = summary[user];
          if (!byDate) continue;
          for (const year in byDate) {
            acc[year] = (acc[year] || 0) + byDate[year];
          }
        }
        return acc;
      },
    };
  }

  if (props.display == "someone_rank") {
    return {
      label: "Rank",
      graphLabel: () => "Rank",
      formatter: (v) => format(",d")(v),
      solidify: (summary) => {
        const contributions = contributionPerYear(summary, (x) => x);

        const contribution_users: Record<string, number> = {};
        for (const user of props.developers) {
          const byDate = summary[user];
          if (!byDate) continue;
          for (const year in byDate) {
            contribution_users[year] = (contribution_users[year] || 0) + byDate[year];
          }
        }

        const acc: Record<string, number> = {};
        for (const year in contribution_users) {
          const list = contributions[year];
          acc[year] =
            contribution_users[year] == 0 || !list?.length
              ? 0
              : rank(list, contribution_users[year]);
        }
        return acc;
      },
    };
  }

  if (props.display == "someone_rank_percent") {
    return {
      label: "Rank (%)",
      graphLabel: () => "Rank %",
      formatter: (v) => format(".2f")(v) + "%",
      solidify: (summary) => {
        const contributions = contributionPerYear(summary, (x) => x);

        const contribution_users: Record<string, number> = {};
        for (const user of props.developers) {
          const byDate = summary[user];
          if (!byDate) continue;
          for (const year in byDate) {
            contribution_users[year] = (contribution_users[year] || 0) + byDate[year];
          }
        }

        const acc: Record<string, number> = {};
        for (const year in contribution_users) {
          const list = contributions[year];
          acc[year] =
            contribution_users[year] == 0 || !list?.length
              ? 0
              : (100 * rank(list, contribution_users[year])) / list.length;
        }
        return acc;
      },
    };
  }

  return undefined;
};

const traits = (): Trait | undefined => {
  if (props.what == "contributors") {
    return {
      label: "Contributors",
      graphLabel: () => "Contributors",
      formatter: (v) => format(",d")(v),
      solidify: (summary) => {
        const acc: Record<string, number> = {};
        for (const user in summary) {
          for (const year in summary[user]) {
            acc[year] = (acc[year] || 0) + 1;
          }
        }
        return acc;
      },
    };
  }

  if (props.what == "first_commit") {
    return {
      label: "First time contributor",
      graphLabel: () => "# First time contributors",
      formatter: (v) => format(",d")(v),
      solidify: (summary) => {
        const acc: Record<string, number> = {};
        for (const user in summary) {
          const min_year = Object.keys(summary[user]).sort()[0];
          if (min_year) {
            acc[min_year] = (acc[min_year] || 0) + 1;
          }
        }
        return acc;
      },
    };
  }

  if (props.what == "last_commit") {
    return {
      label: "Last time contributor",
      graphLabel: () => "# Last time contributors",
      formatter: (v) => format(",d")(v),
      solidify: (summary) => {
        const acc: Record<string, number> = {};
        for (const user in summary) {
          const keys = Object.keys(summary[user]).sort();
          const max_year = keys[keys.length - 1];
          if (max_year) {
            acc[max_year] = (acc[max_year] || 0) + 1;
          }
        }
        return acc;
      },
    };
  }

  if (props.what == "commit") {
    return {
      label: "Commits",
      graphLabel: (repo) => repo,
      formatter: (v) => format(",d")(v),
      solidify: (summary) => {
        const acc: Record<string, number> = {};
        for (const user in summary) {
          merge(acc, summary[user]);
        }
        return acc;
      },
    };
  }

  if (props.what == "per_contributor") {
    return traitsPerContributor();
  }

  return undefined;
};

// Filter out users below min_contributions without mutating cached summaries.
const filterMinCommit = (summary: UsernamesSummary): UsernamesSummary => {
  if (props.min_contributions <= 0) {
    return summary;
  }
  const filtered: UsernamesSummary = {};
  for (const user in summary) {
    const byDate = summary[user];
    let sum = 0;
    for (const year in byDate) {
      sum += byDate[year];
    }
    if (sum >= props.min_contributions) {
      filtered[user] = byDate;
    }
  }
  return filtered;
};

let requestId = 0;

const refresh = async () => {
  const t = traits();
  if (!t) {
    return;
  }

  const id = ++requestId;
  const repos = [...props.repositories];
  const repoSummaries = await Promise.all(
    repos.map((repo) =>
      fetchUsernamesSummary(repo, "commit", props.grouping, props.kind || "author"),
    ),
  );
  if (id !== requestId) {
    return;
  }

  formatter.value = t.formatter;
  valueLabel.value = t.label;

  const graphLabel = t.graphLabel;
  const new_data: Record<string, { repo: string; value: number }[]> = {};
  const summable =
    props.what == "commit" ||
    (props.what == "per_contributor" && props.display == "someone");

  if (summable) {
    for (let i = 0; i < repos.length; ++i) {
      const repo = repos[i];
      const d = t.solidify(filterMinCommit(repoSummaries[i]));
      for (const year in d) {
        (new_data[year] ||= []).push({
          repo,
          value: d[year],
        });
      }
    }
  } else {
    const data_users: UsernamesSummary = {};
    for (const data_repo of repoSummaries) {
      for (const user in data_repo) {
        data_users[user] ||= {};
        merge(data_users[user], data_repo[user]);
      }
    }
    const solidified = t.solidify(filterMinCommit(data_users));
    for (const year in solidified) {
      new_data[year] = [
        {
          repo: "solidified",
          value: solidified[year],
        },
      ];
    }
  }

  data.value = Object.keys(new_data)
    .sort()
    .map((date) => ({
      label: date,
      values: new_data[date].map((x) => ({
        label: graphLabel(x.repo),
        value: x.value,
        color: colorMap.get(x.repo) || "gray",
      })),
    }));
};

const timeLabel = computed(() => {
  switch (props.grouping) {
    case "forever":
      return "Forever";
    case "decennial":
      return "Decade";
    case "yearly":
      return "Year";
    case "quarterly":
      return "Quarter";
    case "monthly":
      return "Month";
  }
  return "";
});

watch(props, refresh);
onMounted(refresh);
</script>
