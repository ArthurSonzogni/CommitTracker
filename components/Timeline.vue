<template>
  <div ref="container" class="svg-container" align="center">
    <svg :width="svgWidth" :height="svgHeight">
      <g ref="xAxis" />
      <g ref="yAxis" />
      <g ref="content" />
    </svg>
  </div>
</template>

<script>

import {axisBottom, axisLeft} from "d3-axis";
import {extent, max} from "d3-array";
import {scaleTime, scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {transition} from "d3-transition";
import {line} from "d3-shape";
import {interpolatePath} from "d3-interpolate-path";

const t = transition();

export default {
  props: {
    developers: { type: Array },
    data: { type: Array},
    startDate: { type: Date },
    endDate: { type: Date },
  },

  data() {
    return {
      svgWidth: 500,
      svgHeight: 500,
    }
  },

  computed: {
    filteredData() {
      return this.data.map(d => {
        let accu = 0;
        const author = Object.entries(d.data.author)
          .map(([time, reviewers]) => time)
        const review = Object.entries(d.data.review)
          .map(([time, author]) => time)

        const values = [author, review]
          .flat()
          .sort()
          .map(time => new Date(time))
          .filter(time => {
            return time >= this.startDate && time <= this.endDate;
          })
          .map(time => {
            accu++;
            return {
              time: time,
              patch: accu,
            };
          });


        return {
          developer: d.developer,
          values:values,
        };
      });
    },

    dateExtent() {
      return extent(this.filteredData.map(e => e.values).flat().map(d => d.time));
    },

    patchExtent() {
      return [0, max(this.filteredData.map(e => e.values).flat().map(d => d.patch))];
    },
  },

  mounted() {
    this.initSvg();
    this.svgWidth = this.$refs.container.clientWidth;
    this.svgHeight = this.$refs.container.clientHeight;
  },

  watch: {
    data: "render",
    startDate: "render",
    endDate: "render",
  },

  methods: {
    initSvg() {
      this.render();
    },

    render() {
      if (this.data.length === 0 && !this.rendered) {
        return;
      }
      this.rendered = true;

      const margin = {
        top: 10,
        right: 30,
        bottom: 30,
        left: 60,
      };

      const innerWidth = this.svgWidth - margin.left - margin.right;
      const innerHeight = this.svgHeight - margin.top - margin.bottom;

      select(this.$refs.content)
          .attr("transform", `translate(${margin.left}, ${margin.top})`);
      select(this.$refs.xAxis)
        .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight})`)
      select(this.$refs.yAxis)
        .attr("transform", `translate(${margin.left}, ${margin.top})`)

      const x = scaleTime()
        .range([ 0, innerWidth])
        .domain(this.dateExtent);

      const y = scaleLinear()
        .range([ innerHeight, 0 ])
        .domain(this.patchExtent);

      select(this.$refs.xAxis)
        .transition()
        .duration(500)
        .call(axisBottom(x).ticks(7));

      select(this.$refs.yAxis)
        .transition()
        .duration(500)
        .call(axisLeft(y));

      const valueLines = line()
        .x(d => x(d.time))
        .y(d => y(d.patch))
      const valueZero = line()
        .x(d => x(d.time))
        .y(d => y(0))

      select(this.$refs.content)
        .selectAll(".line")
        .data(this.filteredData, d => d.developer)
        .join(
          enter => enter
              .append("path")
              .attr("class", "line")
              .attr("fill", "none")
              .attr("stroke", "black")
              .attr("stroke-width", 0)
              .attr("d", d => valueZero(d.values))
              .transition(500)
              .duration(500)
              .attr("d", d => valueLines(d.values))
              .attr("stroke-width", 1.5)
          ,

          update => update
            .transition()
            .duration(500)
            .attrTween('d', function (d) {
              var previous = select(this).attr('d');
              var current = valueLines(d.values);
              return interpolatePath(previous, current);
            })
          ,

          exit => exit
            .transition(500)
            .duration(500)
            .attr("d", d => valueZero(d.values))
            .remove()
        )
    }
  }
};
</script>

<style scoped>
  .svg-container {
    width: 100%;
    height:100%;
    min-height:500px;
  }
</style>
