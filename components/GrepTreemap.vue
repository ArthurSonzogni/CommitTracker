<template>
  <div ref="container" align="center">
    <svg :width="svgWidth" :height="svgHeight">
      <g ref="content"/>
    </svg>
  </div>
</template>

<script>

import {extent, max} from "d3-array";
import {interpolateRgb} from "d3-interpolate";
import {interpolateTurbo} from "d3-scale-chromatic";
import {scaleLinear, scaleRadial} from "d3-scale";
import {select} from "d3-selection";
import {transition} from "d3-transition";
import {treemap, treemapBinary, hierarchy} from "d3-hierarchy";
import {easeCubicInOut} from "d3-ease";

export default {

  props: [
    "field_color",
    "field_size"
  ],

  data() {
    return {
      svgWidth: 600,
      svgHeight: 600,
    };
  },

  methods: {
    initialize() {
      try {
        this.svgWidth = this.$refs.container.clientWidth;
        this.svgHeight = this.svgWidth * 0.5;
        this.refresh();
      } catch (e) {
        console.log(e);
      }
      window.addEventListener("resize", this.initialize);

    },

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

    renderRect: function(rect, x, y) {
      return rect
        .attr("stroke", "white")
        .attr("stroke-width", "1px")
        .attr("rx", 10)
        .attr('width', d => x(d.x1) - x(d.x0))
        .attr('height', d => y(d.y1) - y(d.y0))
        .style("fill", d => {
          const colorScale = scaleLinear()
            .range([0, 1])
            .domain([0, 0.5])
          ;
          const color = this.getFieldColor(d.data);
          const size = this.getFieldSize(d.data);
          const c1 = "white";
          const c2 = interpolateTurbo(colorScale(color / size));
          return interpolateRgb(c1, c2)(0.5);
        })
    },

    renderText: function(text, x, y) {
      return text
        .attr("text-anchor", "start")
        .attr("alignment-baseline", "bottom")
        .attr("font-size", "12px")
        //.attr("x", d => 0.5 * (x(d.x1) - x(d.x0)))
        .attr("x", 6)
        .attr("y", 18)
        .text(d => {
          if ((y(d.y1) - y(d.y0) <= 20)) {
            return "...";
          }

          if ((x(d.x1) - x(d.x0)) <= 8 * d.data.name.length) {
            return "...";
          }

          const name = d.data.name;
          const color = this.getFieldColor(d.data);
          const size = this.getFieldSize(d.data);
          const percent =  Math.floor(100 * color / size);
          return `${name} (${percent}%) [${color}/${size}]`;
        })
      ;
    },

    render(group, data, x, y) {
      const join = d => {
        return d.join(
          enter => {
            const group = enter.append("g");
            const rect = group.append("rect")
            const text = group.append("text")
            this.renderGroup(group, x, y);
            this.renderRect(rect, x, y)
            this.renderText(text, x, y);
            return group;
          },

          update => {
            const group = this.transition(update);
            const rect = this.transition(update.select("rect"));
            const text = this.transition(update.select("text"));
            this.renderGroup(group, x, y);
            this.renderRect(rect, x, y)
            this.renderText(text, x, y)
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
        .on("click", (event, d) => this.zoomin(data, d))
      ;
    },

    zoomin(data, d) {
      // Find the associated child:
      const name = d.data.name;

      let index_treemap = 0;
      for(let i = 0; i<data.children.length; ++i) {
        if (data.children[i].data.name == name) {
          index_treemap = i;
          break;
        }
      }
      const child = data.children[index_treemap];

      let index_data = 0;
      for(let i = 0; i<this.data.children.length; ++i) {
        if (this.data.children[i].name == name) {
          index_data = i;
          break;
        }
      }

      console.log(index_treemap, index_data);
      this.data = this.data.children[index_data];
      console.log(this.data);

      // Remove the previous content by fading them out.
      const old_content = select(this.$refs.content)
        .select('g')
      const new_content =
        select(this.$refs.content)
        .append("g")

      {
        const x = scaleLinear()
          .domain([data.x0, data.x1])
          .rangeRound([0, this.svgWidth])
        ;
        const y = scaleLinear()
          .domain([data.y0, data.y1])
          .rangeRound([0, this.svgHeight])
        ;
        this.render(old_content, data, x, y)
        this.render(new_content, child, x, y)
      }

      {
        const x = scaleLinear()
          .domain([child.x0, child.x1])
          .rangeRound([0, this.svgWidth])
        ;
        const y = scaleLinear()
          .domain([child.y0, child.y1])
          .rangeRound([0, this.svgHeight])
        ;
        this.render(old_content, data, x, y)
        this.render(new_content, child , x, y)

        new_content
          .attr("opacity", 0)
          .transition()
          .duration(600)
          .attr("opacity", 1)
        old_content 
          .transition()
          .duration(600)
          .remove()

        setTimeout(this.refresh, 1500);
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
        .sort((a,b) => {
          return b.height - a.height ||
            this.getFieldSize(b) - this.getFieldSize(a)
          ;
        })
      ;

      const map = treemap();

      return map(data_with_layout);
    },

    async fetchEntries() {
      const response = await fetch("./data/grep/root.json");
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
      this.data = data;

      this.refresh();
    },

    refresh: function() {

      if (!select(this.$refs.content).select("g").node()) {
        select(this.$refs.content).append("g")
      }

      const group =
        select(this.$refs.content)
        .select("g")

        const map = this.mytreemap(this.data);
        const x = scaleLinear()
          .domain([map.x0, map.x1])
          .rangeRound([0, this.svgWidth])
        ;
        const y = scaleLinear()
          .domain([map.y0, map.y1])
          .rangeRound([0, this.svgHeight])
        ;
        this.render(group, map, x, y);
    },
  },

  watch: {
    field_size: "refresh",
    field_color: "refresh",
  },

  mounted() {
    this.initialize();
    this.fetchEntries();
  },
}
</script>
