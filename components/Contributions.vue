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

export default {
  props: [
    "kind",
    "percentile",
    "individual",
  ],

  data() {
    return {
      label: "label",
    }
  },

  methods: {
    quantile: function(arr, q) {
      console.log(q);
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

    async refresh() {
      const response = await fetch("./data/users_info.json");
      const data = await response.json();

      let precision = 0;
      const per_year = {};
      switch(this.kind) {
        case "commit":
          this.label = "Commit";
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= 0;
              per_year[year] += user.author.by_date[year];
            }
          }
          break;

        case "contributors":
          this.label = "Contributors";
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= 0;
              per_year[year] += 1;
            }
          }
          break;

        case "author_first":
          this.label = "First authored commit";
          for(const user of Object.values(data)) {
            if (!user.author.first) {
              continue;
            }
            const year = user.author.first.substr(0, 4);
            per_year[year] ||= 0;
            per_year[year] += 1;
          }
          break;

        case "review_first":
          this.label = "First reviewed commit";
          for(const user of Object.values(data)) {
            if (!user.review.first) {
              continue;
            }
            const year = user.review.first.substr(0, 4);
            per_year[year] ||= 0;
            per_year[year] += 1;
          }
          break;

        case "both_first":
          this.label = "First authored or reviewed commit";
          for(const user of Object.values(data)) {
            const year = [
              (user.author.first || "9999").substr(0, 4),
              (user.review.first || "9999").substr(0, 4),
            ].sort()[0]
            per_year[year] ||= 0;
            per_year[year] += 1;
          }
          break;

        case "author_last":
          this.label = "last authored commit";
          for(const user of Object.values(data)) {
            if (!user.author.last) {
              continue;
            }
            const year = user.author.last.substr(0, 4);
            per_year[year] ||= 0;
            per_year[year] += 1;
          }
          break;

        case "review_last":
          this.label = "last reviewed commit";
          for(const user of Object.values(data)) {
            if (!user.review.last) {
              continue;
            }
            const year = user.review.last.substr(0, 4);
            per_year[year] ||= 0;
            per_year[year] += 1;
          }
          break;

        case "both_last":
          this.label = "Last authored or reviewed commit";
          for(const user of Object.values(data)) {
            const year = [
              (user.author.last || "0000").substr(0, 4),
              (user.review.last || "0000").substr(0, 4),
            ].sort()[1]
            per_year[year] ||= 0;
            per_year[year] += 1;
          }
          break;

        case "author_mean":
          this.label = "Commit / contributor (mean)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.author.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = per_year[year].reduce((a,b)=>a+b, 0) /
                             per_year[year].length;
          }
          break;

        case "review_mean":
          this.label = "Review / contributor (mean)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.review.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.review.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = per_year[year].reduce((a,b)=>a+b, 0) /
                             per_year[year].length;
          }
          break;

        case "both_mean":
          this.label = "(Commit + Review) / contributor (mean)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.author.by_date[year]);
            }
            for(const year in user.review.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.review.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = per_year[year].reduce((a,b)=>a+b, 0) /
                             per_year[year].length;
          }
          break;


        case "author_percentile":
          this.label = "Commit / contributor (top percentile)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.author.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = this.quantile(per_year[year], this.percentile / 100);
          }
          break;

        case "review_percentile":
          this.label = "Review / contributor (top percentile)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.review.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.review.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = this.quantile(per_year[year], this.percentile / 100);
          }
          break;

        case "both_percentile":
          this.label = "(Commit + Review) / contributor (top percentile)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.author.by_date[year]);
            }
            for(const year in user.review.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.review.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = this.quantile(per_year[year], this.percentile / 100);
          }
          break;

        case "author_individual":
          this.label = "Commit / contributor (top individual)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.author.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = this.top(per_year[year], this.individual)
          }
          break;

        case "review_individual":
          this.label = "Review / contributor (top individual)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.review.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.review.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = this.top(per_year[year], this.individual)
          }
          break;

        case "both_individual":
          this.label = "(Commit + Review) / contributor (top individual)";
          precision = 2;
          for(const user of Object.values(data)) {
            for(const year in user.author.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.author.by_date[year]);
            }
            for(const year in user.review.by_date) {
              per_year[year] ||= [];
              per_year[year].push(user.review.by_date[year]);
            }
          }
          for(const year in per_year) {
            per_year[year] = this.top(per_year[year], this.individual);
          }
          break;

        default:
          this.label = "unimplemented";
      }

      let max = 0;
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
          .style("width", year => (70 * per_year[year] / max) + "%")
      };

      const updateRight = async right => {
        right
          .transition()
          .duration(d => 350)
          .textTween(function(year) {
            const previous = select(this).text();
            const interpolator = interpolate(previous, per_year[year]);
            return t => interpolator(t).toFixed(precision);
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

            return div;
          },
          update => {
            const center = update.select(".center");
            const right = update.select(".right")
            updateCenter(center);
            updateRight(right);
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
    kind: "refresh",
    percentile: "refresh",
    individual: "refresh",
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

.center:hover {
  opacity: 0.4;
}

</style>

