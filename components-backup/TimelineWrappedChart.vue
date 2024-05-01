<template>
  <div ref="container" align="center">
    <svg ref="svg" :width="svgWidth" :height="svgHeight">
      <g ref="arcs"></g>
      <g ref="indicators"></g>
      <g ref="legend" />
    </svg>
  </div>
</template>

<script>

import {max} from "d3-array";
import {scaleLinear, scaleRadial} from "d3-scale";
import {select} from "d3-selection";
import {arc} from "d3-shape";
import {interpolate} from "d3-interpolate";
import {local} from "d3-selection";
import {transition} from "d3-transition";

const currentState = local();
const now = new Date();

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    developers: { type: Array },
    dates: { type: Array[Date] },
    author: { type: Boolean },
    review: { type: Boolean },
    stacked: { type: Boolean },
    hourlyParam: { type: Number },
    buckets: { type: Number, default: 24},
  },

  data() {
    return {
      data: [],
      svgWidth: 300,
      svgHeight: 300,
    }
  },

  computed: {
    modulo() {
      switch(this.hourlyParam) {
        case 0: return 24*60*60*1000;
        case 1: return 7*24*60*60*1000;
        case 2: return 30*24*60*60*1000;
        case 3: return 365*24*60*60*1000;
      }
      return 0;
    },

    filteredData() {

      const developers = this.data.map(d => d.developer);

      // Filter:
      let data = this.data.map(d => {

        let commits = d.data;

        if (!this.author) {
          commits = commits.filter(commit => commit.kind != "author")
        }

        if (!this.review) {
          commits = commits.filter(commit => commit.kind != "review")
        }

        const values = commits
          .map(commit => new Date(commit.date))
          .sort((a,b) => (a-b))
          .filter(date => {
            return date >= this.dates[0] && date <= this.dates[1];
          })

        return {
          label: d.developer,
          values: values,
        }
      });

      // Accumulate patches:
      data = data.map(entry => {
        return {
          developer: entry.label,
          values: entry.values.map(time => {
            const seconds = now - time;
            return (seconds % this.modulo) / this.modulo;
          })
        };
      });

      let inner = new Array(this.buckets).fill(0);

      data = data.map(entry => {
        const outer = [...inner];
        entry.values.forEach(time => {
          outer[Math.floor(time * this.buckets)]++;
        });
        const out = {
          developer: entry.developer,
          values: outer.map((_v, i) => {
            return {
              angle: i,
              buckets: this.buckets,
              inner: inner[i],
              outer: outer[i],
              developer: entry.developer,
            };
          })
        }
        inner = this.stacked
          ? outer
          : new Array(this.buckets).fill(0);

        return out;
      });

      data = data.map(entry => entry.values).flat()
      return {
        developers: developers,
        arcs:data,
      }
    },

    max() {
      return max(
        this.filteredData.arcs.map(e => e.outer)
      );
    },
  },

  mounted() {
    this.initialize();
  },

  watch: {
    developers: "developersChanged",
    repositories: "developersChanged",
    filteredData: "render",
  },

  methods: {
    async developersChanged() {
      this.data = await this.$chromeDataAll(this.repositories, this.developers);
    },

    initialize() {
      try {
        this.svgWidth = this.$refs.container.clientWidth;
        this.svgWidth = Math.min(this.svgWidth, 800);
        this.svgWidth = Math.min(this.svgWidth, window.innerWidth * 0.8);
        this.svgWidth = Math.min(this.svgWidth,
          Math.max(0, (window.innerHeight - 300) * 0.9));
        this.svgHeight = this.svgWidth;
      } catch (e) {
        console.log(e);
      }
      this.developersChanged();
      this.render();
      window.addEventListener("resize", this.initialize);

    },

    render() {
      select(this.$refs.arcs)
        .attr("transform", `translate(${this.svgWidth/2}, ${this.svgHeight/2})`);
      select(this.$refs.indicators)
        .attr("transform", `translate(${this.svgWidth/2}, ${this.svgHeight/2})`);

      const innerRadius = Math.max(this.svgWidth, this.svgHeight) * 0.2;
      const outerRadius = Math.max(this.svgWidth, this.svgHeight) * 0.5;

      const x = scaleLinear()
        .domain([0, this.buckets])
        .range([0, 2 * Math.PI])

      const y = scaleRadial()
        .domain([0, this.max])
        .range([innerRadius, outerRadius])

      const Scale = data => {
        return {
          startAngle: x(data.angle),
          endAngle: x(data.angle + 1.0),
          padAngle: x(0.05),
          innerRadius: y(data.inner),
          outerRadius: y(data.outer),
        }
      };

      const ArcInterpolator = function(a, b) {
        return function(t) {
          const current = {
            startAngle: interpolate(a.startAngle, b.startAngle)(t),
            endAngle: interpolate(a.endAngle, b.endAngle)(t),
            innerRadius: interpolate(a.innerRadius, b.innerRadius)(t),
            outerRadius: interpolate(a.outerRadius, b.outerRadius)(t),
            padAngle: interpolate(a.padAngle, b.padAngle)(t),
          };
          currentState.set(this, current);
          return MakeArc(current);
        };
      };

      const MakeArc = arc()
        .innerRadius(d => d.innerRadius)
        .outerRadius(d => d.outerRadius)
        .startAngle(d => -d.endAngle)
        .endAngle(d => -d.startAngle)
        .padAngle(d => d.padAngle)
        .cornerRadius(d => d.padAngle * 1000)
      ;

      select(this.$refs.arcs)
        .selectAll("path")
        .data(this.filteredData.arcs,
              d => `${d.developer}-${d.angle}-${d.buckets}`)
        .join(
          enter => {
            return enter
              .append("path")
              .attr("fill", d => this.$color(d.developer))
              .attr("d", d => MakeArc(Scale(d)))
              .attr("opacity", 0)
              .transition()
              .duration(1000)
              .attr("opacity", 0.5)
              .attrTween('d', function (d) {
                const previous = Scale({
                  angle: d.angle,
                  inner: 0,
                  outer: 0,
                });
                const next = Scale(d)
                return ArcInterpolator(previous, next);
              })
          },
          update => {
            return update
              .transition()
              .duration(1000)
              .attr("opacity", 0.5)
              .attrTween('d', function (d) {
                const previous = currentState.get(this);
                const next = Scale(d)
                return ArcInterpolator(previous, next);
              });
          },
          exit => {
            return exit
              .transition()
              .duration(1000)
              .attr("opacity", 0)
              .attrTween('d', function (_d) {
                const previous = currentState.get(this);
                const next = Scale({
                  angle: 0,
                  padAngle: 0,
                  inner: 0,
                  outer: 0,
                });
                next.startAngle = previous.startAngle;
                next.endAngle = previous.endAngle;
                next.padAngle = previous.padAngle;
                return ArcInterpolator(previous, next);
              })
              .remove();
          }
        )

      const indicatorDataAll = [
        {
          data: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
                 "12", "13", "14", "15", "16", "17", "18", "19", "20", "21",
                 "22", "23"],
        },
        {
          data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        },
        {
          data: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
                 "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
                 "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
                 "30"],
        },
        {
          data: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
                 "Oct", "Nov", "Dec"],
        },
      ];

      const indicatorData = indicatorDataAll[this.hourlyParam].data.map((d, i) => {

        const timezero = new Date("2000-01-03T00:00:00.000");
        const dephasage = ((now - timezero) % this.modulo) / this.modulo;
        const angle = i / indicatorDataAll[this.hourlyParam].data.length;
        return {
          text: d,
          angle: (angle - dephasage - 0.25) * 360,
        }
      });

      select(this.$refs.indicators)
        .selectAll("text")
        .data(indicatorData, d => `${d.text}-${d.angle}`)
        .join(
          enter => {
            return enter
              .append("text")
              .attr("x", innerRadius * 0.5)
              .attr("y", 0)
              .attr("text-anchor", "end")
              .attr("alignment-baseline", "middle")
              .attr("opacity", 1)
              .text(d => d.text)
              .attr("transform", d => `rotate(${d.angle})`)
              .transition()
              .duration(1000)
              .attr("font-size", innerRadius*0.1)
              .attr("x", innerRadius * 0.9)
              .attr("opacity", 0.5)
            ;
          },
          update => {
            return update
              .transition()
              .duration(1000)
              .attr("font-size", innerRadius*0.1)
              .attr("x", innerRadius * 0.9)
              .attr("opacity", 0.5)
          },
          exit => {
            return exit
              .transition()
              .duration(1000)
              .attr("x", innerRadius * 1)
              .attr("opacity", 0)
              .remove();
          }
        )
      ;

      select(this.$refs.legend)
        .selectAll(".legend")
        .data(this.filteredData.developers, d => d)
        .join(
          enter => {enter
            const group = enter
              .append("g")
              .attr("class", "legend")

            group
              .attr("opacity", 0)
              .attr("transform", (_d, i) => `translate(100, ${i*20+20})`)
              .transition()
              .duration(500)
              .attr("transform", (_d, i) => `translate(10, ${i*20+20})`)
              .attr("opacity", 1)

            group
              .append("text")
              .attr("font-size", "12px")
              .attr("font-weight", "bold")
              .attr("fill", d => this.$color(d))
              .text(d => d)
            return group;
          },
          update => {
            update
              .transition()
              .duration(1000)
              .attr("transform", (_d, i) => `translate(10, ${i*20+20})`)
              .attr("opacity", 1)
            return update;
          },
          exit => {
            exit
              .transition()
              .duration(500)
              .attr("transform", (_d, i) => `translate(100, ${i*20+20})`)
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
