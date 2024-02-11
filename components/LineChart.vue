<template>
  <div ref="container" align="center">
    <svg :width="svgWidth" :height="svgHeight">
      <g ref="xAxis" />
      <g ref="yAxis" />
      <g ref="content">
        <g ref="tooltip" />
        <g ref="legend" />
      </g>
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
import {pointer} from "d3-selection";
import {bisector} from "d3-array";

export default {
  props: {
    data: { type: Array },
  },

  data() {
    return {
      svgWidth: 500,
      svgHeight: 500,
    }
  },

  computed: {
    dateExtent() {
      return extent(this.data.map(e => e.values).flat().map(d => d.x));
    },

    patchExtent() {
      return [0, max(this.data.map(e => e.values).flat().map(d => d.y))];
    },
  },

  mounted() {
    this.initialize();
  },

  watch: {
    data: "render",
  },

  methods: {
    initialize() {
      try {
        this.svgWidth = this.$refs.container.clientWidth;
        this.svgHeight = this.svgWidth * 0.5;
      } catch (e) {}
      this.render();
      window.addEventListener("resize", this.initialize);
    },

    render() {
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
        .x(d => x(d.x))
        .y(d => y(d.y))
      const valueZero = line()
        .x(d => x(d.x))
        .y(d => y(0))

      select(this.$refs.container)
        .on("pointerenter pointermove", event => {
          const bisectDate = bisector(d => d.x).left;
          const date = x.invert(pointer(event)[0] - margin.left);

          const references = this.data
            .map(d => {
              const i = bisectDate(d.values, date);
              if (i <= 0 || i >= d.values.length) {
                return null;
              }
              return {
                label: d.label,
                x: d.values[i].x,
                y: d.values[i].y,
              };
            })
            .filter(d => d !== null);

          select(this.$refs.tooltip)
            .selectAll(".tooltipData")
            .data(references, reference => reference.label)
            .join(
              enter => {
                const group = enter
                  .append("g")
                  .attr("class", "tooltipData")
                  .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)})`)
                group
                  .attr("opacity", 0)
                  .transition()
                  .duration(300)
                  .attr("opacity", 1)
                group
                  .append("text")
                  .attr("text-anchor", "middle")
                  .attr("font-size", "12px")
                  .attr("font-weight", "bold")
                  .attr("x", -10)
                  .attr("y", -10)
                  .attr("fill", d => this.$color(d.label))
                  .text(d => d.y)
                group.append("circle")
                  .attr("r", 3)
                  .attr("fill", d => this.$color(d.label))
                return group;
              },

              update => update
              .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)})`)
              .select("text")
              .text(d => d.y),
              exit => exit
              .attr("opacity", 1)
              .transition()
              .duration(200)
              .attr("opacity", 0)
              .remove()
            )
          ;

        })
        .on("pointerleave", event => {
          select(this.$refs.tooltip)
            .selectAll(".tooltipData")
            .transition()
            .duration(500)
            .attr("opacity", 0)
            .remove()
        })
        .on("touchstart", event => event.preventDefault())
      ;

      select(this.$refs.content)
        .selectAll(".line")
        .data(this.data, d => d.label)
        .join(
          enter => enter
          .append("path")
          .attr("class", "line")
          .attr("fill", "none")
          .attr("stroke", d => this.$color(d.label))
          .attr("stroke-width", 0)
          .attr("d", d => valueZero(d.values))
          .transition(500)
          .duration(500)
          .attr("d", d => valueLines(d.values))
          .attr("stroke-width", 1.5),

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

      select(this.$refs.legend)
        .selectAll(".legend")
        .data(this.data, d => d.label)
        .join(
          enter => {enter
            const group = enter
              .append("g")
              .attr("class", "legend")

            group
              .attr("opacity", 0)
              .attr("transform", (d, i) => `translate(100, ${i*20})`)
              .transition()
              .duration(500)
              .attr("transform", (d, i) => `translate(10, ${i*20})`)
              .attr("opacity", 1)

            group
              .append("text")
              .attr("font-size", "12px")
              .attr("font-weight", "bold")
              .attr("fill", d => this.$color(d.label))
              .text(d => d.label)
            return group;
          },
          update => {
            update
              .transition()
              .duration(1000)
              .attr("transform", (d, i) => `translate(10, ${i*20})`)
              .attr("opacity", 1)
            return update;
          },
          exit => {
            exit
              .transition()
              .duration(500)
              .attr("transform", (d, i) => `translate(100, ${i*20})`)
              .attr("opacity", 0)
              .remove()
          }
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
