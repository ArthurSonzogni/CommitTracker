<template>
  <BarChart
    :timeLabel="timeLabel"
    :data="data"
    :formatter="formatter"
    >
  </BarChart>
</template>

<script setup lang="ts">

import {format} from "d3-format";
import repositories from 'public/data/repositories.json'

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  grouping: { type:String, default: "yearly"},
  what: {},
  display: {},
  kind: {},
  percentile: {},
  individual: {},
  developers: {},
  min_contributions: { type:Number, default: 0},
})

const colorMap = new Map();
for(const repo of repositories) {
  colorMap.set(repo.dirname, repo.color);
}

const label = ref<string>("label");
const data = shallowRef([]);
const formatter = ref(format(",d"));

const sortRepositories = function(a,b) {
  const items = repositories.map(item => item.dirname);
  return items.indexOf(a.repo) - items.indexOf(b.repo);
}

const quantile = function(arr, q) {
  const sorted = arr.sort((a,b) => (b - a))
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  return sorted[base];
}

const top = function(arr, q) {
  const sorted = arr.sort((a,b) => (b - a))
  if (q <= sorted.length) {
    return sorted[q-1];
  }
  return 0;
}

const rank = function(arr, target) {
  const sorted = arr.sort((a,b) => (b - a))
  for(let index = 0; index < sorted.length; ++index) {
    if (target >= sorted[index]) {
      return index + 1;
    }
  }
  return sorted.length;
}

const merge = function(a,b) {
  for(const key in b) {
    a[key] = (a[key] || 0) + b[key];
  }
}

const groupingFunction = function() {
  switch(props.grouping) {
    case "yearly":
      return x => x.substr(0,4);

    case "quarterly":
      return x => {
        const year = x.substr(0,4)
        const month = x.substr(5,2);
        const quarter = Math.floor((month - 1) / 3) + 1;
        return `${year}Q${quarter}`;
      }

    case "monthly":
      return x => x.substr(0,7);
  }

  return x => x;
}

const traits = function() {
  if (props.what == "contributors") {
    return {
      label: "Contributors",
      graphLabel: () => "Contributors",
      formatter: v => format(",d")(v) + " 🧍",
      solidify: data => {
        const acc = {};
        for(const user in data) {
          const by_date = data[user];
          for(const year in by_date) {
            by_date[year] = 1;
          }
          merge(acc, by_date);
        }
        return acc;
      }
    }
  }

  if (props.what == "first_commit") {
    return {
      label: "First time contributor",
      graphLabel: () => "# First time contributors",
      formatter: v => format(",d")(v) + " 🧍",
      solidify: data => {
        const acc = {}
        for(const user in data) {
          const min_year = Object.keys(data[user]).sort()[0];
          if (min_year) {
            acc[min_year] ||= 0;
            acc[min_year] ++
          }
        }
        return acc;
      }
    }
  }

  if (props.what == "last_commit") {
    return {
      label: "Last time contributor",
      graphLabel: () => "# Last time contributors",
      formatter: v => format(",d")(v) + " 🧍",
      solidify: data => {
        const acc = {}
        for(const user in data) {
          const max_year = Object.keys(data[user]).sort().reverse()[0];
          if (max_year) {
            acc[max_year] ||= 0;
            acc[max_year] ++
          }
        }
        return acc;
      }
    }
  }

  if (props.what == "commit") {
    return {
      label: "Commit",
      graphLabel: (repo) => repo,
      formatter: v => format(",d")(v) + " ⚙️",
      solidify: data => {
        const acc = {}
        for(const user in data) {
          merge(acc, data[user])
        }
        return acc;
      }
    }
  }

  if (props.what == "per_contributor") {
    return traitsPerContributor()
  }

  console.log("reached unreacheable code");
}

const traitsPerContributor = function() {
  const contributionPerYear = (data, map) => {
    const contributions = {}
    for(const user in data) {
      const by_date = data[user] || {};
      for(const year in by_date) {
        contributions[year] ||= [];
        contributions[year].push(by_date[year]);
      }
    }
    for (const year in contributions) {
      contributions[year] = map(contributions[year]);
    }
    return contributions;
  }

  if (props.display == "average") {
    return {
      label: "Contribution",
      graphLabel: () => "Commit",
      formatter: v => format(".2f")(v) + " ⚙️",
      solidify: data => {
        return contributionPerYear(data, c => {
          return c.reduce((a,b) => a+b, 0) / c.length;
        });
      }
    };
  }

  if (props.display == "percentile") {
    return {
      label: "Contribution",
      graphLabel: () => "Commit",
      formatter: v => format(",d")(v) + " ⚙️",
      solidify: data => {
        return contributionPerYear(data, c => {
          return quantile(c, props.percentile / 100);
        });
      }
    };
  }

  if (props.display == "individual") {
    return {
      label: "Contribution",
      graphLabel: (repo) => repo == "solidified" ? "Commit" : repo,
      formatter: v => format(",d")(v) + " ⚙️",
      solidify: data => {
        return contributionPerYear(data, c => {
          return top(c, props.individual)
        });
      }
    };
  }

  if (props.display == "someone") {
    return {
      label: "Contribution",
      graphLabel: (repo) => repo,
      formatter: v => format(",d")(v) + " ⚙️",
      solidify: data => {
        const acc = {};
        for(const user of props.developers) {
          for(const year in data[user]) {
            acc[year] ||= 0;
            acc[year] += data[user][year];
          }
        }
        return acc;
      }
    };
  }

  if (props.display == "someone_rank") {
    return {
      label: "Rank",
      graphLabel: () => "Rank",
      formatter: v => format(",d")(v) + " 🏆",
      solidify: data => {
        const contributions = contributionPerYear(data, x => x);

        const contribution_users = {};
        for(const user of props.developers) {
          for(const year in data[user]) {
            contribution_users[year] ||= 0;
            contribution_users[year] += data[user][year];
          }
        }

        const acc = {}
        for(const year in contribution_users) {
          acc[year] = contribution_users[year] == 0
            ? 0
            : rank(contributions[year], contribution_users[year]);
        }
        return acc;
      }
    };
  }

  if (props.display == "someone_rank_percent") {
    return {
      label: "Rank (%)",
      graphLabel: () => "Rank %",
      formatter: v => format(".2f")(v) + "% 🏆",
      solidify: data => {
        const contributions = contributionPerYear(data, x => x);

        const contribution_users = {};
        for(const user of props.developers) {
          for(const year in data[user]) {
            contribution_users[year] ||= 0;
            contribution_users[year] += data[user][year];
          }
        }

        const acc = {}
        for(const year in contribution_users) {
          acc[year] = contribution_users[year] == 0
            ? 0
            : 100 * rank(contributions[year], contribution_users[year])
                  / contributions[year].length;
        }
        return acc;
      }
    };
  }

  console.log("reached unreacheable code");
}

const dataForRepository = async function(repository) {
  const response = await
    fetch(`/data/${repository}/usernames_summary_commit_${props.grouping}_${props.kind}.json`);
  return await response.json();
}

const removeMinCommit = function(data) {
  for(const user in data) {
    let sum = 0;
    for(const year in data[user]) {
      sum += data[user][year];
    }
    if (sum < props.min_contributions) {
      delete data[user];
    }
  }
  return data;
}

const refresh = async function() {
  const t = traits();
  label.value = t.label;
  formatter.value = t.formatter;

  const graphLabel = t.graphLabel;
  const new_data = {};
  const summable = (
    props.what == "commit" ||
    (
      props.what == "per_contributor" && props.display == "someone"
    )
  )
  if (summable) {
    for(const repo of props.repositories) {
      const d = t.solidify(
        removeMinCommit(
          await dataForRepository(repo)
        )
      );
      for (const year in d) {
        new_data[year] ||= [];
        new_data[year].push({
          repo: repo,
          value: d[year],
        })
      }
    }
  } else {
    const data_users = {}
    for(const repo of props.repositories) {
      const data_repo = await dataForRepository(repo)
      for(const user in data_repo) {
        data_users[user] ||= {};
        merge(data_users[user], data_repo[user])
      }
    }
    const solidified = t.solidify(removeMinCommit(data_users));
    for(const year in solidified) {
      new_data[year] = [{
        repo: "solidified",
        value: solidified[year],
      }]
    }
  }

  // Turn the object into an array of arrays for D3.
  data.value = Object.keys(new_data)
    .sort()
    .map(date => {
      return {
        label: date,
        values: new_data[date].map(x => {
          return {
            label: graphLabel(x.repo),
            value: x.value,
            color: colorMap.get(x.repo) || "gray",
          };
        }),
      };
    });
}

const timeLabel = computed(() => {
  switch(props.grouping) {
    case "yearly": return "Year";
    case "quarterly": return "Quarter";
    case "monthly": return "Month";
  }
})

watch(props, refresh)
onMounted(refresh)

</script>
