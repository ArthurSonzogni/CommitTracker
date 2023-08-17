<template>
  <div>
    <div class="line">
      <div class="left"><strong>Year</strong></div>
      <div class="right"><strong># {{label}}</strong></div>
    </div>
    <div ref="histogram"></div>

  </div>
</template>

<script>

import {select} from "d3-selection";
import {interpolate} from "d3-interpolate";
import {linear} from "d3-ease";
import {easeBackOut} from "d3-ease";
import {transition} from "d3-transition";
import {format} from "d3-format";

export default {
  props: {
    repositories: { type:String, default: "chrome",},
    what: {},
    display: {},
    kind: {},
    percentile: {},
    individual: {},
    developers: {},
  },

  data() {
    return {
      label: "label",
    }
  },

  methods: {
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
      return Object.entries(b).reduce((acc, [key, value]) =>
        ({ ...acc, [key]: (acc[key] || 0) + value })
        , { ...a });
    },


    async refresh() {
      const response = await fetch(`./data/${this.repositories}/users_info.json`);
      const data = await response.json();

      for(const user in data) {
        data[user].both = {
          total: data[user].author.total +
                 data[user].review.total,
          by_date: this.merge(data[user].author.by_date,
                              data[user].review.by_date),
        };
      }

      let formatter = format(",d");
      let per_year = {};
      let postfix = () => "";
      switch(this.what) {
        case "contributors":
          this.label = "Contributors";
          postfix = (year) => ' 🧍';

          for(const user in data) {
            const by_date = data[user][this.kind]?.by_date || {};
            for(const year in by_date) {
              by_date[year] = 1;
            }
            per_year = this.merge(per_year, by_date);
          }
          break;

        case "first_commit":
          this.label = "First time contributor";
          postfix = (year) => ' 🧍';

          for(const user in data) {
            const by_date = data[user][this.kind]?.by_date || {};
            const min_year = Math.min(...Object.keys(by_date));
            if (isFinite(min_year)) {
              per_year[min_year] ||= 0;
              per_year[min_year] ++
            }
          }
          break;

        case "last_commit":
          this.label = "Last time contributor"
          postfix = (year) => ' 🧍';
          for(const user in data) {
            const by_date = data[user][this.kind]?.by_date || {};
            const max_year = Math.max(...Object.keys(by_date));
            if (isFinite(max_year)) {
              per_year[max_year] ||= 0;
              per_year[max_year] ++
            }
          }
          break;

        case "commit":
          this.label = "Commit";
          postfix = (year) => ' ⚙️';

          for(const user in data) {
            const by_date = data[user].author.by_date || {};
            per_year = this.merge(per_year, by_date)
          }
          break;

        case "per_contributor":
          this.label = "Contributions";
          postfix = (year) => ' ⚙️';
          for(const user in data) {
            const by_date = data[user][this.kind]?.by_date || {};
            for(const year in by_date) {
              per_year[year] ||= [];
              per_year[year].push(by_date[year]);
            }
          }

          switch (this.display) {
            case "average":
              formatter = format(".2f");
              for(const year in per_year) {
                per_year[year] = per_year[year].reduce((a,b)=>a+b, 0) /
                                 per_year[year].length;
              }
              break;

            case "percentile":
              for(const year in per_year) {
                per_year[year] = this.quantile(per_year[year], this.percentile / 100);
              }
              break;

            case "individual":
              for(const year in per_year) {
                per_year[year] = this.top(per_year[year], this.individual)
              }
              break;

            case "someone":
              for(const year in per_year) {
                let sum = 0;
                for(const user of this.developers) {
                  sum += data[user][this.kind]?.by_date[year] || 0;
                }
                per_year[year] = sum;
              }
              break;

            case "someone_rank":
              this.label = "rank"
              postfix = () => ' 🏆';
              for(const year in per_year) {
                let sum = 0;
                for(const user of this.developers) {
                  if (this.kind == "author" || this.kind == "both") {
                    sum += data[user]?.author.by_date[year] || 0;
                  }
                  if (this.kind == "review" || this.kind == "both") {
                    sum += data[user]?.review.by_date[year] || 0;
                  }
                }
                per_year[year] = sum == 0
                  ? 0
                  : this.rank(per_year[year], sum);
              }
              break;

            case "someone_rank_percent":
              this.label = "rank (%)"
              formatter = format(",.2");
              postfix = () => '% 🏆';
              for(const year in per_year) {
                let sum = 0;
                for(const user of this.developers) {
                  if (this.kind == "author" || this.kind == "both") {
                    sum += data[user]?.author.by_date[year] || 0;
                  }
                  if (this.kind == "review" || this.kind == "both") {
                    sum += data[user]?.review.by_date[year] || 0;
                  }
                }
                per_year[year] = sum == 0
                  ? 0
                  : 100 * this.rank(per_year[year], sum) / per_year[year].length;
              }
              break;
          }
          break;

        default:
          this.label = "unimplemented";
      }

      let max = 20;
      for(const year in per_year) {
        max = Math.max(max, per_year[year]);
      }

      // Fill holes with zeroes:
      for(let i = 2008; i<2024; ++i) {
        per_year[i] ||= 0;
      }

      const updateCenter = center => {
        center
          .transition()
          .duration(d => 450)
          .ease(easeBackOut)
          .style("width", year => (70 * (per_year[year] || 0) / max) + "%")
      };

      const updateRight = async right => {
        right
          .transition()
          .duration(d => 350)
          .textTween(function(year) {
            const previous = parseFloat(select(this).text());
            const interpolator = interpolate(previous, per_year[year] || 0);
            return t => formatter(interpolator(t));
          })
      };

      select(this.$refs.histogram)
        .selectAll(".line")
        .data(Object.keys(per_year), d => d)
        .join(
          enter => {
            const div = enter.append("div");
            div.classed("line", true);

            const left = div.append("div")
            left.classed("left", true)
            left.text(year => year);

            const center = div.append("div")
            center.classed("center", true)
            center.style("width", 0)
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
            const center = update.select(".center");
            const right = update.select(".right")
            const right_right = update.select(".right_right")
            updateCenter(center);
            updateRight(right);
            right_right.text(d => postfix(d));
            return update;
          },
          exit => {
            return exit
              .transition()
              .duration(350)
              .style("opacity", 0)
              .remove();
          }
        )
    },
  },

  watch: {
    repositories: "refresh",
    what: "refresh",
    display: "refresh",
    kind: "refresh",
    percentile: "refresh",
    individual: "refresh",
    developers: "refresh",
  },

  mounted() {
    this.refresh();
  }
}

</script>

<style>
.line {
  display:flex;
  margin:1px;
}

.left {
  text-align:right;
  margin-right:10px;
  width:48px;
}

.center {
  color: black;
  background: rgba(0,128,255);
  opacity: 0.2;
  margin: 0px 10px 0px 0px;
  border-radius: 5px;
}

</style>

