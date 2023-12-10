<template>
  <div ref="container" align="center">
    <svg ref="svg_axis" :width="svgWidth" :height="31" class="sticky-top"/>
    <svg ref="svg" :width="svgWidth" :height="svgHeight"/>
    <svg ref="svg_title" :width="svgWidth" :height="80" class="sticky-bottom">
    </svg>
  </div>
</template>

<script>

import {axisTop} from "d3-axis";
import {format} from "d3-format";
import {scaleBand} from "d3-scale";
import {scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {transition} from "d3-transition";
import {range} from "d3-array";
import {easeLinear} from "d3-ease";
import {interpolate} from "d3-interpolate";

export default {
  props: {
    repositories: { type:Array[String], default: ["chrome"]},
    grouping: { type:String, default: "yearly"},
    kind: { type:String, default: "author"},
  },

  data() {
    this.take_n = 100;
    return {
      svgWidth: 300,
      svgHeight: 300,
    }
  },

  computed: {
    timeLabel() {
      if (this.grouping == "forever") {
        return "Forever";
      } else if (this.grouping == "yearly") {
        return "Year";
      } else if (this.grouping == "quarterly") {
        return "Quarter";
      } else if (this.grouping == "monthly") {
        return "Month";
      }
      return "N/A"
    },
  },

  methods: {
    initialize() {
      const svg = select(this.$refs.svg);
      const svg_axis = select(this.$refs.svg_axis);
      this.updateBars = this.bars(svg)
      this.updateAxis = this.axis(svg);
      this.updateAxisSticky = this.axisSticky(svg_axis);
      this.onResize();
    },

    onResize() {
      this.svgWidth = this.$refs.container.clientWidth;
      this.svgHeight = this.take_n * 50;
      window.addEventListener("resize", this.onResize);

      this.fetchData();
    },

    // Filter the data to only include the kind of data we want.
    filterKind(data) {
      const out = {}
      if (this.kind == "author") {
        for(const [key, value] of Object.entries(data)) {
          if (value.author) {
            out[key] = value.author;
          }
        }
      }

      if (this.kind == "review") {
        for(const [key, value] of Object.entries(data)) {
          if (value.review) {
            out[key] = value.review;
          }
        }
      }

      if (this.kind == "both") {
        for(const [key, value] of Object.entries(data)) {
          out[key] = {}
          for(const [date, commit] of Object.entries(value.author || {})) {
            out[key][date] ||= 0;
            out[key][date] += commit;
          }
          for(const [date, commit] of Object.entries(value.review || {})) {
            out[key][date] ||= 0;
            out[key][date] += commit;
          }
        }
      }

      return out;
    },

    // Merge the data from multiple repositories into a single object.
    mergeDataForRepositories(repositories) {
      const out = {}
      for(const data of repositories) {
        Object.entries(data).forEach(([developer, timevalue]) => {
          out[developer] ||= {}
          Object.entries(timevalue).forEach(([time, value]) => {
            out[developer][time] ||= 0;
            out[developer][time] += value;
          });
        });
      }
      return out;
    },

    // Return a function that can be used to group the data by date.
    groupingFunction: function() {
      switch(this.grouping) {
        case "forever":
          return x => "forever";

        case "yearly":
          return x => x.substr(0,4);

        case "quarterly":
          return x => {
            const year = x.substr(0,4)
            const month = x.substr(5,2);
            const quarter = Math.floor((month - 1) / 3) + 1;
            return `${year}Q${quarter}`;
          }

        case "monthly":
          return x => x.substr(0,7);
      }

      return x => x;
    },

    // Group the data by grouped date.
    groupByDate(data) {
      const out = {}
      const group = this.groupingFunction();
      for(const user in data) {
        const old_data = data[user];
        const new_data = {}
        for(const key in old_data) {
          const new_key = group(key);
          new_data[new_key] |= 0;
          new_data[new_key] += old_data[key]
        }
        out[user] = new_data;
      }
      return out;
    },

    // Turn the data into an array of indexed by date.
    // [
    //   {
    //     date: string
    //     users: {
    //       user: number,
    //     }
    //   }
    // ]
    orderByDate(data) {
      const out = [];
      const userList = Object.keys(data);
      const dateSet = new Set();
      for(const user of userList) {
        for(const date of Object.keys(data[user])) {
          dateSet.add(date);
        }
      }
      for(const date of dateSet) {
        const entry = {
          date: date,
          users: [],
        };
        for(const user of userList) {
          if (data[user][date]) {
            entry.users.push([user, data[user][date]]);
          }
        }
        entry.users.sort((a,b) => b[1] - a[1]);
        entry.users.splice(this.take_n);
        out.push(entry);
      }
      return out;
    },

    async fetchData() {
      const async_data = this.repositories.map(this.$usersInfo);
      const data = await Promise.all(async_data);
      const filtered_data = data.map(this.filterKind);
      const merged = this.mergeDataForRepositories(filtered_data);
      const grouped = this.groupByDate(merged);
      const ordered = this.orderByDate(grouped);
      ordered.sort((a,b) => b.date > a.date ? -1 : 1);

      const t = transition().duration(500);
      this.render(ordered[ordered.length - 1], t);
    },

    axis(svg) {
      const g = svg
        .append("g")

      return (x, transition) => {
        const axis = axisTop(x)
          .ticks(this.svgWidth / 100)
          .tickSizeOuter(0)
          .tickSizeInner(-this.svgHeight + 100)
          .tickFormat(d => format(".2s")(d).replace("G", "B"))

        g.transition(transition).call(axis)
        g.select(".tick:first-of-type text").remove();
        g.selectAll(".tick:not(:first-of-type) line").attr("stroke", "white");
        g.select(".domain").remove();
        g.attr("opacity", 0.2)
      };
    },

    axisSticky(svg) {
      const g = svg
        .append("g")
        .attr("transform", `translate(0, 30)`)

      return (x, transition) => {
        const axis = axisTop(x)
          .ticks(this.svgWidth / 100)

        g.transition(transition).call(axis)
      };
    },


    bars(svg) {
      const g = svg.append("g")

      return (x, y, frame, transition) => {
        const updateRect = rect => {
          return rect
            .transition(transition)
            .attr("width", d => x(d[1]) - x(0))
        };

        const updateName = name => {
          return name
            .transition(transition)
            .attr("x", d => x(d[1]) + (x(d[1]) < 80 ? 7 : -7))
            .attr("text-anchor", d => x(d[1]) < 80 ? "start" : "end")
            .text(d => d[0])
        };

        const updateCommit = commit => {
          return commit
            .transition(transition)
            .attr("x", d => x(d[1]) + (x(d[1]) < 80 ? 7 : -7))
            .attr("text-anchor", d => x(d[1]) < 80 ? "start" : "end")
            .textTween(function(d) {
              const new_value = d[1];
              this._current ||= 0;
              const interpolator = interpolate(
                this._current,
                new_value
              );
              this._current = new_value;
              return t => {
                const value = Math.round(interpolator(t));
                if (value < 100) {
                  return Math.round(value);
                }
                return format(".3s")(value);
              }
            })
        };

        const updateIndex = index => {
          return index
            .transition(transition)
            .textTween(function(d, i) {
              const new_value = i + 1;
              this._current ||= 0;
              const interpolator = interpolate(
                this._current,
                new_value
              );
              this._current = new_value;
              return t => {
                return Math.round(interpolator(t));
              }
            })
        };

        g
          .selectAll("g")
          .data(frame.users.slice(0, this.take_n), (d, i) => d[0])
          .join(enter => {
              const group = enter.append("g")
              group
                .attr("transform", `translate(0, ${y(this.take_n)})`)
                .attr("opacity", 0)
                .transition(transition)
                .attr("opacity", 1)
                .attr("transform", (d, i) => `translate(0, ${y(i)})`)

              const rect = group.append("rect")
              rect
                .attr("fill", d => this.$color(d[0]))
                .attr("opacity", 0.5)
                .attr("x", x(0))
                .attr("height", y.bandwidth())
                .call(updateRect)

              const index = group.append("text")
              index
                .classed("index", true)
                .attr("fill", "black")
                .attr("dy", "0.35em")
                .attr("dx", 0)
                .attr("dy", y.bandwidth() / 2)
                .attr("alignment-baseline", "middle")
                .call(updateIndex)

              const name = group.append("text")
              name
                .classed("name", true)
                .attr("fill", "black")
                .attr("dy", "0.35em")
                .attr("dx", 5)
                .attr("y", 10)
                .call(updateName)

              const commit = group.append("text")
              commit
                .classed("commit", true)
                .attr("fill", "gray")
                .attr("dy", "0.35em")
                .attr("dx", 5)
                .attr("y", 30)
                .text(0)
                .call(updateCommit)

              return group;
            },
            update => {
              const group = update;
              group
                .transition(transition)
                .attr("transform", (d, i) => `translate(0, ${y(i)})`)

              update.select("rect").call(updateRect)
              update.select(".index").call(updateIndex)
              update.select(".name").call(updateName)
              update.select(".commit").call(updateCommit)

              return update;
            },
            exit => {
              const group = exit;
              exit
                .transition(transition)
                .attr("transform", `translate(0, ${y(this.take_n)})`)
                .attr("opacity", 0)
                .remove()
              return group;
            }
          )
          ;
      }
    },

    render(frame, transition) {
      // Update the title:
      select(this.$refs.svg_title)
        .selectAll("text")
        .data([frame.date], d => d)
        .join(
          enter => {
            const text = enter.append("text");
            text
              .text(d => d)
              .attr("text-anchor", "end")
              .attr("transform", `translate(0, 32)`)
              .attr("x", this.svgWidth - 10)
              .attr("y", 80-32)
              .attr("opacity", 0)
              .attr("font-size", "2em")

            text
              .transition(transition)
              .attr("transform", `translate(0, 0)`)
              .attr("opacity", 1)
            return text;
          },
          update => update,
          exit => {
            return exit
              .transition(transition)
              .attr("transform", `translate(0, -32)`)
              .attr("opacity", 0)
              .remove()
          }
        );

      const max_commit = Math.max(...frame.users.map(d => d[1]));

      const x = scaleLinear()
        .domain([0, max_commit])
        .range([25, this.svgWidth - 10]);

      const y = scaleBand()
        .domain(range(this.take_n+1))
        .range([0, this.svgHeight - 60])
        .padding(0.1);

      this.updateBars(x, y, frame, transition);
      this.updateAxis(x, transition);
      this.updateAxisSticky(x, transition);
    },
  },

  mounted() {
    this.initialize();
  },

  watch: {
    "repositories": "fetchData",
    "grouping": "fetchData",
    "kind": "fetchData",
  },
}

</script>

<style scoped>

.svg {
  padding:0;
  margin:0;
}

.sticky-top {
  position:sticky;
  top:0;
}

.sticky-bottom{
  position:sticky;
  bottom:0;
}
</style>
