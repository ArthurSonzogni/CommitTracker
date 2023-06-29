<template>
  <div ref="container" align="center">
    <svg ref="svg" :width="svgWidth" :height="svgHeight">
      <g ref="axis"></g>
      <g ref="authors"></g>
    </svg>
  </div>
</template>

<script>

import {max} from "d3-array";
import {scaleLinear, scaleRadial} from "d3-scale";
import {select} from "d3-selection";
import {transition} from "d3-transition";
import {arc} from "d3-shape";
import {interpolate} from "d3-interpolate";
import {local} from "d3-selection";
import {axisTop} from "d3-axis";

const currentState = local();
const now = new Date();

export default {
  props: {
    developers: { type: Array },
    startDate: { type: Date },
    endDate: { type: Date },
    author: { type: Boolean },
    review: { type: Boolean },
    stacked: { type:Boolean },
    take_n: { type: Number , default: 60},
  },

  data() {
    return {
      data: [],
      svgWidth: 300,
      svgHeight: 300,
    }
  },

  computed: {
    filteredData() {
      // Filter and count peers for every developers.
      const data = this.data.map(d => {
        const author = !this.author ? [] :
          Object.entries(d.data.author)
          .filter(([time, _]) => {
            const date = new Date(time)
            return date >= this.startDate && date <= this.endDate;
          })
          .map(([_, reviewers]) => reviewers)
          .flat();

        const review = !this.review ? [] :
          Object.entries(d.data.review)
          .filter(([time, _]) => {
            const date = new Date(time)
            return date >= this.startDate && date <= this.endDate;
          })
          .map(([_, author]) => author)

        const developers = [...author, ...review];
        const peers = {};

        developers.forEach(d=> {
          if (!peers[d])
            peers[d] = 0;
          peers[d]++;
        })

        return {
          developer: d.developer,
          peers: peers,
        };
      });

      // Reformat data to be indexed by peers.
      const peers = {};
      data.forEach(d => {
        Object.entries(d.peers).forEach(([peer, count]) => {
          if (!peers[peer])
            peers[peer] = {};
          peers[peer][d.developer] = count;
        })
      });

      // If stacked, accumulate the data
      for(const peer in peers) {
        let accumulated = 0;
        Object.entries(peers[peer]).forEach(([developer, count]) => {
          peers[peer][developer] = {
            left: accumulated,
            right: accumulated + count,
          }
          if (this.stacked)
            accumulated += count;
        })
      }

      // Turn the object into an array.
      const result = [];
      for(const peer in peers) {
        let max =  0;
        Object.entries(peers[peer]).forEach(([developer, count]) => {
          max = Math.max(max, count.right);
        });

        result.push({
          peer: peer,
          developers: Object.entries(peers[peer]).map(([developer, count]) => {
            return {
              developer: developer,
              left: count.left,
              right: count.right,
            }
          }),
          max: max,
        })
      }

      result.sort((a, b) => b.max - a.max);

      return result.splice(0, this.take_n);
    },
  },

  mounted() {
    this.initialize();
  },

  watch: {
    developers: "developersChanged",
    filteredData: "render",
  },

  methods: {
    async developersChanged() {
      this.data = await this.$chromeDataAll(this.developers);
    },

    initialize() {
      try {
        this.svgWidth = this.$refs.container.clientWidth;
        this.svgHeight = this.take_n * 20 + 50;
      } catch (e) {
        console.log(e);
      }
      this.developersChanged();
      this.render();
      window.addEventListener("resize", this.initialize);
    },

    render() {

      const scale = scaleLinear()
        .domain([0, max(this.filteredData, d => max(d.developers, d => d.right))])
        .range([0, this.svgWidth - 200]);

      const axis = axisTop(scale)

      select(this.$refs.axis)
        .attr("transform", `translate(130, 25)`)
        .transition()
        .duration(500)
        .call(axis);

      select(this.$refs.authors)
        .attr("transform", `translate(130, 50)`)

      select(this.$refs.authors)
        .selectAll("g")
        .data(this.filteredData, d => d.peer)
        .join(
          enter => {
            const group = enter.append("g");
            group
              .attr("opacity", 0)
              .attr("transform", (d, i) => `translate(-100, ${i * 20})`)
              .transition()
              .duration(500)
              .attr("opacity", 1)
              .attr("transform", (d, i) => `translate(0, ${i * 20})`);

            const peer = group.append("text");
            peer 
              .attr("class", "peer")
              .text(d => d.peer)
              .attr("text-anchor", "end")
              .attr("text-baseline", "middle")
              .attr("x", -5)
              .attr("color", d => this.$color(d.peer))

            const value = group.append("text");
            value
              .attr("class", "value")
              .text(d => d.max)
              .attr("text-anchor", "start")
              .attr("text-baseline", "bottom")
              .attr("x", d => scale(d.max) + 5);

            return group;
          },
          update => {
            const group = update;
            group
              .transition()
              .duration(1500)
              .attr("transform", (d, i) => `translate(0, ${i * 20})`)

            const value = group.select(".value");
            value
              .transition()
              .duration(1000)
              .attr("x", d => scale(d.max))
              .textTween((d, i, nodes) => {
                const previous = select(nodes[i]).text();
                const interpolator = interpolate(previous, d.max);
                return t => {
                  return Math.round(interpolator(t));
                }
              });
            return group; },
          exit => {
            exit
              .transition()
              .duration(500)
              .attr("opacity", 0)
              .attr("transform", (d, i) => `translate(100, ${i * 20})`)
              .remove();
            return exit;
          },
        )
        .selectAll("rect")
        .data(d => d.developers, d => d.developer)
        .join(
          enter => {
            const rect = enter.append("rect")
              .attr("opacity", 0)
              .attr("rx", 5)
              .attr("ry", 5)
              .attr("x", d => scale(d.left))
              .attr("y", -15)
              .attr("width", d => scale(d.right - d.left))
              .attr("height", 19)
              .attr("fill", d => this.$color(d.developer))
              .transition()
              .duration(500)
              .attr("opacity", 0.5)
            return rect;
          },
          update => {
            const rect = update;
            rect
              .transition()
              .duration(1000)
              .attr("x", d => scale(d.left))
              .attr("width", d => scale(d.right - d.left))
            return rect;
          },
          exit => {
            exit
              .transition()
              .duration(500)
              .attr("opacity", 0)
              .remove();
            return exit;
          },
        )
    }
  }
};
</script>
