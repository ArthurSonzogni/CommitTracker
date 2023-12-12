<template>
  <div>
    <div class="line">
      <div class="left"><strong>{{timeLabel}}</strong></div>
      <div class="right"><strong># {{label}}</strong></div>
    </div>
    <div ref="histogram"></div>

  </div>
</template>

<script>

import {easeBackOut} from "d3-ease";
import {easeCircleOut} from "d3-ease";
import {format} from "d3-format";
import {interpolate} from "d3-interpolate";
import {scaleOrdinal} from "d3-scale";
import {schemeCategory10} from "d3-scale-chromatic";
import {select} from "d3-selection";
import {transition} from "d3-transition";

export default {
  props: {
    repositories: { type:Array[String], default: ["chrome"],},
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
    return {
      label: "label",
    }
  },

  methods: {
    getItem() {
      return [
        "chrome",
        "v8",
        "skia",
        "angle",
        "dawn",
        "webrtc",
        "pdfium",
        "devtool-frontend",
        "llvm",
      ];
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
          formatter: format(",d"),
          postfix: (year) => ' 🧍',
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
          postfix: (year) => ' 🧍',
          formatter: format(",d"),
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
          postfix: (year) => ' 🧍',
          formatter: format(",d"),
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
          postfix: (year) => ' ⚙️',
          formatter: format(",d"),
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
          formatter: format(".2f"),
          postfix: (year) => ' ⚙️',
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
          formatter: format(",d"),
          postfix: (year) => ' ⚙️',
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
          formatter: format(",d"),
          postfix: (year) => ' ⚙️',
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
          formatter: format(",d"),
          postfix: (year) => ' ⚙️',
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
          formatter: format(",d"),
          postfix: () => ' 🏆',
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
          formatter: format(".2f"),
          postfix: () => ' % 🏆',
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
      const response = await fetch(`/data/${repository}/users_info.json`);
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
      const color = scaleOrdinal(schemeCategory10);
      this.getItem().map(color);

      const traits = this.traits();
      this.label = traits.label;

      const formatter = traits.formatter;
      const postfix = traits.postfix;
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

      const per_year = {}
      for(const year in data) {
        per_year[year] = 0;
        for(const d in data[year]) {
          per_year[year] += data[year][d].value;
        }
      }

      let max = 20;
      for(const year in per_year) {
        max = Math.max(max, per_year[year]);
      }

      const updateCenter = center => {
        center
          .transition()
          .duration(d => 450)
          .ease(easeBackOut)
          .style("width", year => (70 * per_year[year] / max) + "%")
      };

      const updateBox = repository => {
        repository
          .transition()
          .duration(450)
          .ease(easeCircleOut)
          .style("flex-grow", d => d.value)
          .style("background-color", d => {
            if (this.repositories.length == 1) {
              return color(this.repositories[0]);
            }
            if (summable) {
              return color(d.repo)
            }
            return "gray";
          });
      };

      const updateRight = async right => {
        right
          .transition()
          .duration(d => 350)
          .textTween(function(year) {
            const previous = parseFloat(
              select(this)
              .text()
              .replace(',', '')
            );
            const interpolator = interpolate(
              previous,
              per_year[year]
            );
            return t => formatter(interpolator(t));
          })
      };


      select(this.$refs.histogram)
        .selectAll(".line")
        .data(Object.keys(per_year).sort(), d => d)
        .join(
          enter => {
            const div = enter.append("div");
            div.classed("line", true);
            div
              .style("filter", "blur(4px)")
              .style("height", "0px")
              .style("opacity", 0.3)
              .style("transform", "translate(-32px, 0)")
              .transition()
              .duration((d,i) => 450 + 30*Math.sqrt(i))
              .ease(easeBackOut)
              .style("height", "24px")
              .style("transform", "translate(0px, 0)")
              .style("filter", "blur(0px)")
              .transition()
              .duration(d => 450)
              .ease(easeBackOut)
              .style("filter", "none")
              .style("opacity", 1.0)
              .style("filter", "none")

            const left = div.append("div")
            left.classed("left", true)
            left.text(year => year);

            const center = div.append("div")
            center.classed("center", true);
            updateCenter(center);

            const right = div.append("div")
            right.classed("right", true)
            right.text(0)
            updateRight(right);

            const right_right = div.append("div")
            right_right.classed("right_right", true)
            right_right.text(d => postfix(d));

            return div;
          },
          update => {
            const center = update.select(".center")
            updateCenter(center);
            const right = update.select(".right")
            updateRight(right);
            const right_right = update.select(".right_right")
            right_right.text(d => postfix(d));
            return update;
          },
          exit => {
            exit
              .transition()
              .duration((d,i) => 350)
              .delay((d,i) => 500-30*Math.sqrt(i))
              .ease(easeCircleOut)
              .style("opacity", "0.2")
              .style("filter", "blur(1px)")
              .duration((d,i) => 200)
              .delay((d,i) => 500-30*Math.sqrt(i))
              .ease(easeCircleOut)
              .style("filter", "blur(2px)")
              .transition()
              .duration((d,i) => 150)
              .ease(easeCircleOut)
              .style("transform", "translate(64px, 0)")
              .style("height", "0px")
              .style("opacity", "0")
              .remove()
          }
        )
        .select(".center")
        .selectAll(".repository")
        .data(year => data[year].sort(this.sortRepositories), d => d.repo)
        .join(
          enter => {
            const repository = enter.append("div")
            repository.classed("repository", true);
            repository.style("flex-grow", 0);
            updateBox(repository);
            return repository;
          },
          update => {
            updateBox(update);
            return update;
          },
          exit => {
            return exit
              .transition()
              .duration(450)
              .ease(easeCircleOut)
              .style("flex-grow", 0)
              .remove();
          },
        )
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

<style>
.line {
  display:flex;
  justify-content: flex-start;
  align-items:stretch;
  gap:5px;
  padding:1px;
  overflow: hidden;
}

.left {
  text-align:right;
  width:72px;
}

.center {
  display:flex;
  justify-content: flex-start;
  align-items:stretch;

  border-radius: 5px;
  background: rgba(0,128,255);
  overflow:hidden;
  opacity:0.3;
}

</style>

