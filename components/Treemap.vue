<template>
  <div ref="container" align="center">
    <table class="tooltip" ref="tooltip">
      <thead>
        <td ref="componentName"> </td>
        <td> . </td>
        <td> .. </td>
        <td> % </td>
      </thead>
    </table>
    <svg :width="svgWidth" :height="svgHeight">
      <g ref="content"/>
    </svg>
  </div>
</template>

<script>

import {easeCubicInOut} from "d3-ease";
import {extent, max} from "d3-array";
import {hierarchy} from "d3-hierarchy";
import {interpolateRgb} from "d3-interpolate";
import {pointer} from "d3-selection";
import {scaleLinear} from "d3-scale";
import {scaleRadial} from "d3-scale";
import {select} from "d3-selection";
import {selectAll} from "d3-selection";
import {transition} from "d3-transition";
import {treemapSquarify} from "d3-hierarchy";
import {treemap} from "d3-hierarchy";

export default {

  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    path: {},
    field_color: {},
    field_size: {},
    colormap: {},
    colormapMin: {},
    colormapMax: {},
  },

  emits: [
    "zoomin"
  ],

  data() {
    return {
      svgWidth: 600,
      svgHeight: 600,
    };
  },

  methods: {

    transition: function(d) {
      return d
        .transition()
        .ease(easeCubicInOut)
        .duration(500)
      ;
    },

    getFieldColor: function(d) {
      let sum = 0;
      for(const field of this.field_color) {
        sum += d[field] || 0;
      }
      return sum;
    },

    getFieldSize: function(d) {
      let sum = 0;
      for(const field of this.field_size) {
        sum += d[field] || 0;
      }
      return sum;
    },

    renderGroup: function(group, x, y) {
      return group
        .attr("transform", d => `translate(${x(d.x0)}, ${y(d.y0)})`)
      ;
    },

    renderRect: function(rect, x, y, hover) {
      return rect
        .attr("rx", 7)
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr('width', d => x(d.x1) - x(d.x0))
        .attr('height', d => y(d.y1) - y(d.y0))
        .style("fill", d => {
          const colorScale = scaleLinear()
            .domain([this.colormapMin || 0, this.colormapMax || 1])
            .range([0, 1])
          ;
          const color = this.getFieldColor(d.data);
          const size = this.getFieldSize(d.data);
          const c1 = "white";
          const c2 = this.colormapFunc(colorScale(color / size));
          return interpolateRgb(c1, c2)(hover ? 0.5 : 0.6);
        })
    },

    renderText: function(text, index, x, y) {
      return text
        .attr("text-anchor", "start")
        .attr("alignment-baseline", "bottom")
        .attr("font-size", "12px")
        .attr("x", 6)
        .attr("y", 18 + index * 14)
        .attr("fill", index == 0 ? "black" : "rgb(100, 100, 100)")
        .text(d => {

          const name = d.data.name;
          const color = this.getFieldColor(d.data);
          const size = this.getFieldSize(d.data);
          const percent =  Math.floor(100 * color / size);
          if (index == 0) {
            return `${name}`;
          }
          else {
            return `${color}/${size} = ${percent}%`;
          }
        })
      ;
    },

    render(group, data, x, y) {
      const join = d => {
        return d.join(
          enter => {
            const group = enter.append("g");
            const rect = group.append("rect")
            const text_1 = group.append("text")
            const text_2 = group.append("text")
            this.renderGroup(group, x, y);
            this.renderRect(rect, x, y, false)
            this.renderText(text_1, 0, x, y);
            this.renderText(text_2, 1, x, y);
            return group;
          },

          update => {
            const group = this.transition(update);
            const rect = this.transition(update.select("rect"));
            const text = this.transition(update.selectAll("text"));
            this.renderGroup(group, x, y);
            this.renderRect(rect, x, y, false)
            text.each((d, i, nodes) => {
              this.renderText(select(nodes[i]), i, x, y);
            });
            return update;
          },

          leave => leave.remove()
        );
      };

      const child = join(group
        .selectAll("g")
        .data(data.children, d => d.data.name)
      )
      ;


      child
        .filter(d => d.children)
        .attr("cursor", "pointer")
        .on("click", (event, d) => this.zoomin(d))
      ;

      child
        .on("mousemove", (event, d) => {
          const rect = select(event.currentTarget).select("rect");
          this.renderRect(rect, x, y, true)

          select(this.$refs.componentName).text(d.data.name);

          const tooltip = select(this.$refs.tooltip);
          tooltip.style("opacity", 1.0)


          const width = this.$refs.tooltip.offsetWidth;
          const height = this.$refs.tooltip.offsetHeight;
          const max_left = window.innerWidth - width - 20;
          const max_top = window.innerHeight - height - 20;
          let mouse_x = Math.min(event.pageX + 20, max_left);
          let mouse_y = Math.min(event.pageY + 20, max_top);
          if (mouse_x == max_left && mouse_y == max_top) {
            mouse_x = event.pageX - width - 20;
            mouse_y = event.pageY - height- 20;
          }

          tooltip
            .style("left", `${mouse_x}px`)
            .style("top", mouse_y + "px")

          tooltip
            .selectAll("tr")
            .data([]
              .concat(this.field_size)
              .concat(this.field_color)
            )
            .join(
              enter => {
                const row = enter.append("tr");
                const v1 = row.append("td");
                const v2 = row.append("td");
                const v3 = row.append("td");
                const v4 = row.append("td");
                v1.attr("class", "v1");
                v2.attr("class", "v2");
                v3.attr("class", "v3");
                v4.attr("class", "v4");
                return row
              },
              update => {
                const v1 = update.select("td.v1");
                const v2 = update.select("td.v2");
                const v3 = update.select("td.v3");
                const v4 = update.select("td.v4");
                v1.text(field => field)
                v2.text(field => d.data[field] || 0)
                v3.text(field => data.data[field] || 0)
                v4.text(field => {
                  const value = d.data[field] || 0;
                  const total = data.data[field] || 0;
                  const percent = Math.floor(100 * value / total);
                  return percent + "%";
                });
                return update;
              },
              exit => exit.remove(),
            )
        })
        .on("mouseleave", (event, d) => {
          const rect = select(event.currentTarget).select("rect");
          this.renderRect(rect, x, y, false)

          const tooltip = select(this.$refs.tooltip);
          tooltip.style("opacity", 0.0)
        })
    },

    zoomin(child) {
      this.$emit("zoomin", child.data.name)
    },

    async zoom(data_old, data_new) {
      // Remove the previous content by fading them out.
      const old_content = select(this.$refs.content)
        .select('g')
      const new_content =
        select(this.$refs.content)
        .append("g")

      // Draw the old and new contents from the old content zoom.
      {
        const x = scaleLinear()
          .domain([data_old.x0, data_old.x1])
          .rangeRound([0, this.svgWidth])
        ;
        const y = scaleLinear()
          .domain([data_old.y0, data_old.y1])
          .rangeRound([0, this.svgHeight])
        ;
        this.render(old_content, data_old, x, y)
        this.render(new_content, data_new, x, y)
      }

      // Wait for new content opacity transition from zero to one.
      new_content.attr("opacity", 0)
      this.transition(new_content).attr("opacity", 1.0)

      // Draw the old and new contents from the new content zoom.
      {
        const x = scaleLinear()
          .domain([data_new.x0, data_new.x1])
          .rangeRound([0, this.svgWidth])
        ;
        const y = scaleLinear()
          .domain([data_new.y0, data_new.y1])
          .rangeRound([0, this.svgHeight])
        ;
        this.render(old_content, data_old, x, y)
        this.render(new_content, data_new , x, y)

        old_content
          .attr("opacity", 1)
          .transition()
          .duration(600)
          .attr("opacity", 0)
          .remove()
      }

      return;
    },

    mytreemap : function(data) {
      const data_with_layout = hierarchy(data)
        .sum(d => {
          if (d.children.length != 0) {
            return 0;
          }
          return this.getFieldSize(d);
        })
      ;

      const map = treemap()
        .tile(treemapSquarify)
        .size([this.svgWidth, this.svgHeight])
        .round(true)

      return map(data_with_layout);
    },

    async fetchEntries() {
      const response = await fetch(`/data/${this.repositories[0]}/treemap/latest.json`);
      const data = await response.json();

      const propagate = entry => {
        for(const child of entry.children) {
          propagate(child)
          for(const field in child) {
            if (field == "children") {
              continue;
            }
            if (field == "name") {
              continue;
            }
            entry[field] ||= 0;
            entry[field] += child[field];
          }
        }
      };
      propagate(data);
      this.fetchedData = data;
    },

    resize() {
      try {
        const aspect_ratio = window.innerHeight/ window.innerWidth;
        this.svgWidth = this.$refs.container.clientWidth;
        this.svgHeight = this.svgWidth * aspect_ratio - 200;
      } catch (e) {
        console.log(e);
      }
      this.paramsChanged()
    },

    getCurrentDataFromPath(path) {
      let data = this.data;
      for(const name of path) {
        for(let child of data.children) {
          if (child.data.name == name) {
            data = child;
            break;
          }
        }
      }
      return data;
    },

    refresh: function() {
      this.colormapFunc = this.$getColormapList()[this.colormap];

      if (!select(this.$refs.content).select("g").node()) {
        select(this.$refs.content).append("g")
      }

      const data = this.getCurrentDataFromPath(this.path);

      const group =
        select(this.$refs.content)
        .select("g")

      const x = scaleLinear()
        .domain([data.x0, data.x1])
        .rangeRound([0, this.svgWidth])
      ;
      const y = scaleLinear()
        .domain([data.y0, data.y1])
        .rangeRound([0, this.svgHeight])
      ;
      this.render(group, data, x, y);

      this.current_data = data;
    },

    async paramsChanged() {
      await this.fetchEntries();
      this.data = this.mytreemap(this.fetchedData)
      this.refresh();
    },

    pathChanged: function(new_path, old_path) {
      console.log("pathChanged", new_path, old_path);
      const data_old = this.getCurrentDataFromPath(old_path);
      const data_new = this.getCurrentDataFromPath(new_path);
      this.zoom(data_old, data_new)
    },
  },

  computed: {
    path_wrapped: function() { return [...this.path];}
  },

  watch: {
    repositories: "paramsChanged",
    field_size: "paramsChanged",
    field_color: "paramsChanged",
    colormap: "refresh",
    colormapMin: "refresh",
    colormapMax: "refresh",
    path_wrapped: "pathChanged",
  },

  mounted() {
    this.resize();
    window.addEventListener("resize", this.resize);
  },
}
</script>

<style>

.tooltip {
  backdrop-filter: blur(10px);
  position: absolute;
  pointer-events: none;
  color: black;
  z-index:100;
  opacity: 0;
  background: rgba(255, 255, 255, 0.1);
}

.tooltip td {
  border: 0.1px solid black;
  padding: 5px;
}

.tooltip td {
  text-align:right;
}

.tooltip thead td {
  text-align:center;
}

.tooltip thead td {
  background:rgba(255, 255, 255, 0.5);
}

.tooltip thead td:first-child {
  border: 0;
  background: rgba(255, 0, 255, 0.0);
  font-weight: bold;
}

.tooltip tr:nth-child(even) {
  background:rgba(220, 220, 220, 0.5);
}
.tooltip tr:nth-child(odd) {
  background:rgba(255, 255, 255, 0.5);
}

</style>
