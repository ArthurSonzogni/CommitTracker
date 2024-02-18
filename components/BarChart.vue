<template>
  <div>
    <div class="line">
      <div class="left"><strong>{{timeLabel}}</strong></div>
      <div class="right"><strong># commit</strong></div>
    </div>

    <div ref="histogram" class="histogram">
    </div>

    <div ref="tooltip" class="tooltip">
      <div class="tooltip-inner">Test</div>
      <div class="tooltip-arrow"></div>
    </div>
  </div>
</template>

<script>

import {easeBackOut} from "d3-ease";
import {easeCircleOut} from "d3-ease";
import {format} from "d3-format";
import {interpolate} from "d3-interpolate";
import {select} from "d3-selection";
import {mouse} from "d3-selection";

export default {
  props: {
    timeLabel: {type: String, default: ""},
    data: { type: Array },
    formatter: {
      type: Function,
      default: format(",d"),
    },
  },

  mounted() {
    const histogram = select(this.$refs.histogram);
    const tooltip = select(this.$refs.tooltip);
    histogram.on("mouseout", () => {
      tooltip
        .transition()
        .duration(600)
        .delay(1000)
        .style("opacity", 0)
    })
    this.formatter_wrap = {
      formatter: this.formatter,
    }
    this.step();
  },

  methods: {
    async step() {
      this.formatter_wrap.formatter = this.formatter;
      const that = this;
      const row_width = []
      for(const row of this.data) {
        let width = 0;
        for(const value of row.values) {
          width += value.value;
        }
        row_width.push(width);
      }

      let row_max_width = 0;
      for(const width of row_width) {
        row_max_width = Math.max(row_max_width, width);
      }

      let min_value = row_max_width;
      for(const row of this.data) {
        for(const value of row.values) {
          if (value.value> 0) {
            min_value = Math.min(min_value, value.value);
          }
        }
      }
      min_value = Math.max(min_value, 0.01);

      const updateCenter = center => {
        center
          .transition()
          .duration(d => 450)
          .ease(easeBackOut)
          .style("width", (year, i) => (70 * row_width[i] / row_max_width) + "%")
      };

      const updateBox = repository => {
        repository
          .transition()
          .duration(450)
          .ease(easeCircleOut)
          .style("flex-grow", d => d.value / min_value)
          .style("background-color", d => d.color)
      };

      const updateRight = async right => {
        right
          .transition()
          .duration(d => 350)
          .textTween(function(year, index) {
            const next = row_width[index];
            const previous = this._current;
            this._current = next;

            const formatter = that.formatter_wrap.formatter;
            if (previous === undefined) {
              return t => formatter(next);
            }

            if (previous <= 1 && next >= 1) {
              return t => formatter(next);
            }

            if (previous >= 1 && next <= 1) {
              return t => formatter(next);
            }

            const interpolator = interpolate(
              previous,
              row_width[index],
            );
            return t => formatter(interpolator(t));
          })
      };

      const tooltip = select(this.$refs.tooltip);

      select(this.$refs.histogram)
        .selectAll(".line")
        .data(this.data, d => d.label)
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
            left.text(d => d.label);

            const center = div.append("div")
            center.classed("center", true);
            updateCenter(center);

            const right = div.append("div")
            right.classed("right", true)
            right.text(0)
            right.property("_current", d => 0);
            updateRight(right);

            return div;
          },
          update => {
            const center = update.select(".center")
            updateCenter(center);
            const right = update.select(".right")
            updateRight(right);
            return update;
          },
          exit => {
            exit
              .transition()
              .duration((d,i) => 350)
              .delay((d,i) => 500-30*Math.sqrt(i))
              .ease(easeCircleOut)
              .style("opacity", "0.2")
              .style("filter", "blur(3px)")
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
        .data(row => row.values, d => d.label)
        .join(
          enter => {
            const repository = enter.append("div")
            repository
              .classed("repository", true)
              .style("flex-grow", 0);
            updateBox(repository);
            repository.on("mouseover", function(event, d) {
              const box = select(this).node().getBoundingClientRect();
              const tooltip_inner = tooltip.select(".tooltip-inner");
              tooltip
                .transition()
                .duration(200)
                .ease(easeCircleOut)
                .style("opacity", 1.0)
                .style("left", (box.left + box.width / 2) + "px")
                .style("top", (box.top) + "px")

              const formatter = that.formatter_wrap.formatter;
              tooltip_inner.text(d.label+ ": " + formatter(d.value));
            })
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

  watch: {
    data: "step",
  },
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
  border: 1px solid #343434
}

.tooltip {
  position: fixed;
  color: white;
  text-align: center;
  border-radius: 6px;
  font-size: 12px;
  z-index: 10;
  transform: translate(-50%, -125%);
  opacity: 0;
}

.tooltip-inner {
  margin: 0;
  padding: 10px;
  font-size: 1rem;
  background-color: #333;
  border-radius: 8px;
}

.tooltip-arrow {
  width: 0;
  height: 0;
  border-style: solid;
  margin: 0;
  padding: 0;
  border-width: 10px;
  border-color: #333 transparent transparent transparent;
  transform: translateX(-50%);
  position: absolute;
  top: 98%;
  left: 50%;
  z-index: 9;
}

.histogram {
  margin-bottom:1rem;
}

</style>

