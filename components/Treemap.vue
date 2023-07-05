<template>
  <div ref="container" align="center">
    <svg :width="svgWidth" :height="svgHeight">
      <g ref="content"/>
      <g ref="tooltip" :opacity="0">
        <rect ref="tooltipBackground"/>
        <text ref="tooltipTitle" x="0" y="0" >text</text>
        <g ref="tooltipData"/>
      </g>
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

  props: [
    "field_color",
    "field_size",
    "colormap",
    "colormapMin",
    "colormapMax",
  ],

  emits: [
    "pathChanged"
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

          const tooltip = select(this.$refs.tooltip);
          const background = select(this.$refs.tooltipBackground)
          const tooltipTitle = select(this.$refs.tooltipTitle)
          const tooltipData = select(this.$refs.tooltipData);

          tooltipTitle
            .text(d.data.name)
            .attr("font-size", "20px")

          tooltipData
            .selectAll("text")
            .data([]
              .concat(this.field_size)
              .concat(this.field_color)
            )
            .join(
              enter => {
                return enter
                  .append("text")
                  .attr("y", (d,i) => 40 + 20*i)
                  .attr("font-size", 12)
                  .text(field => {
                    if (d.data[field] != undefined) {
                      return field + " = " + d.data[field];
                    }
                    return "";
                  })
              },
              update => {
                return update
                  .text(field => {
                    if (d.data[field] != undefined) {
                      return field + " = " + d.data[field];
                    }
                    return "";
                  })
              },
              exit => {
                return exit.remove();
              }
            )
          ;

          let min_width = 0;
          let min_height = 0;
          tooltip
          .selectAll("text")
          .each(function() {
            const bbox = this.getBBox();
            min_width = Math.max(min_width, bbox.x + bbox.width)
            min_height = Math.max(min_height, bbox.y + bbox.height)
          })

          background
            .attr("x", -10)
            .attr("y", -20)
            .attr("rx", 7)
            .attr("fill", "white")
            .attr("width", min_width + 20)
            .attr("height", min_height + 30)
            .attr("color", "black")
            .attr("stroke", "black")
            .attr("stroke-width", 1)


          const mouse_x = x(d.x0) + pointer(event)[0];
          const mouse_y = y(d.y0) + pointer(event)[1];

          const pos_x_max = this.svgWidth - min_width - 20;
          const pos_y_max = this.svgHeight - min_height - 30;

          let pos_x = Math.min(mouse_x + 40, pos_x_max);
          let pos_y = Math.min(mouse_y + 50, pos_y_max);

          if (pos_x == pos_x_max && pos_y == pos_y_max) {
            pos_x = mouse_x - min_width - 20;
            pos_y = mouse_y - min_height - 20;
          }

          tooltip
            .attr("opacity", 0.6)
            .attr("transform", `translate(${pos_x}, ${pos_y})`)

        })
        .on("mouseleave", (event, d) => {
          const rect = select(event.currentTarget).select("rect");
          this.renderRect(rect, x, y, false)

          const tooltip = select(this.$refs.tooltip);
          tooltip
            .attr("opacity", 0)
        })
    },

    zoomin(child) {
      const old_data = this.getCurrentDataFromPath();
      // Find the associated child:
      const name = child.data.name;
      this.path.push(name);
      this.$emit("pathChanged", this.path);
      history.pushState({path: this.path}, "", `treemap#${this.path.join("/")}`);

      const new_data = this.getCurrentDataFromPath();
      this.zoom(old_data, new_data)
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

      const zoomin = (data_old.x1 - data_old.x0) > //
        (data_new.x1 - data_new.x0);
      select(this.$refs.content)
        .sort((a, b) => {
          if (a == old_content.node()) {
            return zoomin ? 1 : -1;
          }

          if (b == old_content.node()) {
            return zoomin ? -1 : 1;
          }

          return 0;
        })


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
        .sort((a,b) => {
          return b.height - a.height ||
            this.getFieldSize(b) - this.getFieldSize(a)
          ;
        })
      ;

      const map = treemap()
        .tile(treemapSquarify)
        .size([this.svgWidth, this.svgHeight])
        .round(true)

      return map(data_with_layout);
    },

    async fetchEntries() {
      const response = await fetch("./data/treemap/root.json");
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

    hashchange: function() {
      const data_old = this.getCurrentDataFromPath();
      this.path = window.location.hash
        .replace("#", "")
        .split("/")
        .filter(e => e.length != 0)
      this.$emit("pathChanged", this.path);
      const data_new = this.getCurrentDataFromPath();
      this.zoom(data_old, data_new)
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

    getCurrentDataFromPath() {
      let data = this.data;
      for(const name of this.path) {
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

      const data = this.getCurrentDataFromPath();

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
  },

  watch: {
    field_size: "paramsChanged",
    field_color: "paramsChanged",
    colormap: "refresh",
    colormapMin: "refresh",
    colormapMax: "refresh",
  },

  mounted() {
    this.path = window.location.hash
      .replace("#", "")
      .split("/")
      .filter(e => e.length != 0)
    this.$emit("pathChanged", this.path);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("hashchange", this.hashchange)
  },
}
</script>
