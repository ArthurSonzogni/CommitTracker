<template>
  <BarChart
    :timeLabel="timeLabel"
    :data="data"
    :formatter="formatter"
    >
  </BarChart>
</template>

<script>

import {format} from "d3-format";
import repositories from 'static/data/repositories.json'

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    grouping: { type:String, default: "yearly"},
    what: {},
    display: {},
    kind: {},
    percentile: {},
    individual: {},
    developers: {},
    min_contributions: { type:Number, default: 0},
  },

  data() {
    this.colorMap = new Map();
    for(const repo of repositories) {
      this.colorMap.set(repo.dirname, repo.color);
    }

    return {
      label: "label",
      data: [],
      formatter: format(",d"),
    }
  },

  methods: {
    getItem() {
      return repositories.map(item => item.dirname);
    },

    sortRepositories: function(a,b) {
      const items = this.getItem();
      return items.indexOf(a.repo) - items.indexOf(b.repo);
    },

    quantile: function(arr, q) {
      const sorted = arr.sort((a,b) => (b - a))
      const pos = (sorted.length - 1) * q;
      const base = Math.floor(pos);
      return sorted[base];
    },

    top: function(arr, q) {
      const sorted = arr.sort((a,b) => (b - a))
      if (q <= sorted.length) {
        return sorted[q-1];
      }
      return 0;
    },

    rank: function(arr, target) {
      const sorted = arr.sort((a,b) => (b - a))
      for(let index = 0; index < sorted.length; ++index) {
        if (target >= sorted[index]) {
          return index + 1;
        }
      }
      return sorted.length;
    },

    merge: function(a,b) {
      for(const key in b) {
        a[key] = (a[key] || 0) + b[key];
      }
    },

    groupingFunction: function() {
      switch(this.grouping) {
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
    },

    traits: function() {
      if (this.what == "contributors") {
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
              this.merge(acc, by_date);
            }
            return acc;
          }
        }
      }

      if (this.what == "first_commit") {
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

      if (this.what == "last_commit") {
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

      if (this.what == "commit") {
        return {
          label: "Commit",
          graphLabel: (repo) => repo,
          formatter: v => format(",d")(v) + " ⚙️",
          solidify: data => {
            const acc = {}
            for(const user in data) {
              this.merge(acc, data[user])
            }
            return acc;
          }
        }
      }

      if (this.what == "per_contributor") {
        return this.traitsPerContributor()
      }

      console.log("reached unreacheable code");
    },

    traitsPerContributor() {
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

      if (this.display == "average") {
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

      if (this.display == "percentile") {
        return {
          label: "Contribution",
          graphLabel: () => "Commit",
          formatter: v => format(",d")(v) + " ⚙️",
          solidify: data => {
            return contributionPerYear(data, c => {
              return this.quantile(c, this.percentile / 100);
            });
          }
        };
      }

      if (this.display == "individual") {
        return {
          label: "Contribution",
          graphLabel: (repo) => repo == "solidified" ? "Commit" : repo,
          formatter: v => format(",d")(v) + " ⚙️",
          solidify: data => {
            return contributionPerYear(data, c => {
              return this.top(c, this.individual)
            });
          }
        };
      }

      if (this.display == "someone") {
        return {
          label: "Contribution",
          graphLabel: (repo) => repo,
          formatter: v => format(",d")(v) + " ⚙️",
          solidify: data => {
            const acc = {};
            for(const user of this.developers) {
              for(const year in data[user]) {
                acc[year] ||= 0;
                acc[year] += data[user][year];
              }
            }
            return acc;
          }
        };
      }

      if (this.display == "someone_rank") {
        return {
          label: "Rank",
          graphLabel: () => "Rank",
          formatter: v => format(",d")(v) + " 🏆",
          solidify: data => {
            const contributions = contributionPerYear(data, x => x);

            const contribution_users = {};
            for(const user of this.developers) {
              for(const year in data[user]) {
                contribution_users[year] ||= 0;
                contribution_users[year] += data[user][year];
              }
            }

            const acc = {}
            for(const year in contribution_users) {
              acc[year] = contribution_users[year] == 0
                ? 0
                : this.rank(contributions[year], contribution_users[year]);
            }
            return acc;
          }
        };
      }

      if (this.display == "someone_rank_percent") {
        return {
          label: "Rank (%)",
          graphLabel: () => "Rank %",
          formatter: v => format(".2f")(v) + "% 🏆",
          solidify: data => {
            const contributions = contributionPerYear(data, x => x);

            const contribution_users = {};
            for(const user of this.developers) {
              for(const year in data[user]) {
                contribution_users[year] ||= 0;
                contribution_users[year] += data[user][year];
              }
            }

            const acc = {}
            for(const year in contribution_users) {
              acc[year] = contribution_users[year] == 0
                ? 0
                : 100 * this.rank(contributions[year], contribution_users[year])
                      / contributions[year].length;
            }
            return acc;
          }
        };
      }

      console.log("reached unreacheable code");
    },

    async dataForRepository(repository) {
      const response = await fetch(`/data/${repository}/usernames_summary.json`);
      const data = await response.json();

      // Select author/review/both
      switch(this.what) {
        case "commit":
          for(const user in data) {
            data[user] = data[user].author;
          }
          break;

        default:
          switch(this.kind) {
            case "author":
              for(const user in data) {
                data[user] = data[user].author;
              }
              break;

            case "review":
              for(const user in data) {
                data[user] = data[user].review;
              }
              break;

            case "both":
              for(const user in data) {
                let merged = {};
                this.merge(merged, data[user].author);
                this.merge(merged, data[user].review);
                data[user] = merged
              }
              break;
          }
      }

      // Group dates togethers.
      const group = this.groupingFunction();
      for(const user in data) {
        const old_data = data[user];
        const new_data = {}
        for(const key in old_data) {
          const new_key = group(key);
          new_data[new_key] |= 0;
          new_data[new_key] += old_data[key]
        }
        data[user] = new_data;
      }

      return data;
    },

    removeMinCommit(data) {
      for(const user in data) {
        let sum = 0;
        for(const year in data[user]) {
          sum += data[user][year];
        }
        if (sum < this.min_contributions) {
          delete data[user];
        }
      }
      return data;
    },

    async refresh() {
      const traits = this.traits();
      this.label = traits.label;
      this.formatter = traits.formatter;

      const graphLabel = traits.graphLabel;
      const data = {};
      const summable = (
        this.what == "commit" ||
        (
          this.what == "per_contributor" && this.display == "someone"
        )
      )
      if (summable) {
        for(const repo of this.repositories) {
          const d = traits.solidify(
            this.removeMinCommit(
              await this.dataForRepository(repo)
            )
          );
          for (const year in d) {
            data[year] ||= [];
            data[year].push({
              repo: repo,
              value: d[year],
            })
          }
        }
      } else {
        const data_users = {}
        for(const repo of this.repositories) {
          const data_repo = await this.dataForRepository(repo)
          for(const user in data_repo) {
            data_users[user] ||= {};
            this.merge(data_users[user], data_repo[user])
          }
        }
        const solidified = traits.solidify(this.removeMinCommit(data_users));
        for(const year in solidified) {
          data[year] = [{
            repo: "solidified",
            value: solidified[year],
          }]
        }
      }

      // Turn the object into an array of arrays for D3.
      this.data = Object.keys(data)
        .sort()
        .map(date => {
          return {
            label: date,
            values: data[date].map(x => {
              return {
                label: graphLabel(x.repo),
                value: x.value,
                color: this.colorMap.get(x.repo) || "gray",
              };
            }),
          };
        });
    },
  },

  computed: {
    timeLabel() {
      switch(this.grouping) {
        case "yearly": return "Year";
        case "quarterly": return "Quarter";
        case "monthly": return "Month";
      }
    }
  },

  watch: {
    repositories: "refresh",
    what: "refresh",
    grouping: "refresh",
    display: "refresh",
    kind: "refresh",
    percentile: "refresh",
    individual: "refresh",
    developers: "refresh",
    min_contributions: "refresh",
  },

  mounted() {
    this.refresh();
  }
}

</script>
