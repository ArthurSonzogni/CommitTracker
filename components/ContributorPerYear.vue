<template>
  <div>
    <p>
      Approximatively <strong>{{sum}}</strong> commits were made to Chrome.
    </p>

    <div class="line">
      <div class="left"><strong>Year</strong></div>
      <div class="right"><strong># Commits</strong></div>
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
  data() {
    return {
      sum: 0,
      distribution: [],
    }
  },

  mounted: async function() {
    const response = await fetch("./data/users_info.json");
    const data = await response.json();

    const per_year = {};
    for(const user of Object.values(data)) {
      for(const year in user.author.by_date) {
        per_year[year] ||= 0;
        per_year[year] += 1;
      }
    }

    let max = 0;
    for(const year in per_year) {
      this.sum += per_year[year];
      max = Math.max(max, per_year[year]);
    }

    select(this.$refs.histogram)
      .selectAll("div")
      .data(Object.keys(per_year))
      .join(enter => {
        const group = enter.append("div");
        const div = group.append("div");
        div.classed("line", true);

        const left = div.append("div")
        left.classed("left", true)
        left.text(year => year);

        const center = div.append("div")
        center.classed("center", true)
        center
          .style("width", 0)
          .transition()
          .duration(d => 450)
          .ease(easeBackOut)
          .delay((year,i) => 100*(i-3))
          .style("width", year => (79 * per_year[year] / max) + "%")

        const right = div.append("div")
        right.classed("right", true)
        right
          .text(0)
          .transition()
          .duration(d => 450)
          .delay((d,i) => 120*(i-3))
          .textTween(year => t => interpolate(0, per_year[year])(t).toFixed(0));
      })
  },
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

