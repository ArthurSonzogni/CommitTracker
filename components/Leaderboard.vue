<template>
  <div ref="container" align="center">
    <b-field grouped group-multiline label="time">
      <b-field>
      </b-field>
      <b-field>
        <b-select
          :value="Math.min(Math.max(0, timeIndex), date.length - 1)"
          @input="n => $emit('timeIndexChanged', n)"
          >
          <option v-for="(d, i) in date" :key="i" :value="i">{{ d }} </option>
        </b-select>
      </b-field>
      <b-field grouped>
        <b-button @click="previous" :disabled="timeIndex == 0">
          Previous
        </b-button>
        <b-button @click="next" :disabled="timeIndex == date.length - 1">
          Next
        </b-button>
      </b-field>
      <b-field v-if="!is_animating && grouping != 'forever' && timeIndex < date.length - 1">
        <b-button @click="animate(false)" class="is-success" >
          Animate
        </b-button>
      </b-field>
      <b-field v-if="!is_animating && grouping != 'forever' && timeIndex < date.length - 1">
        <b-button @click="animate(true)" class="is-warning">
          Animate with accumulation
        </b-button>
      </b-field>

      <b-field v-if="is_animating">
        <b-button @click="stop" class="is-danger" >
          Stop
        </b-button>
      </b-field>
    </b-field>

    <svg ref="svg_axis" :width="svgWidth" :height="31" class="sticky-top"></svg>
    <svg ref="svg" :width="svgWidth" :height="svgHeight"></svg>
    <svg ref="svg_title" :width="svgWidth" :height="80" class="sticky-bottom"> </svg>
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
    timeIndex: { type:Number, default: 0},
  },

  data() {
    this.take_n = 100;
    return {
      animateWithAccu: 'instant',
      svgWidth: 300,
      svgHeight: 300,
      date: [],
      is_animating: false,
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
      this.date = Array.from(dateSet).sort();
      if (this.timeIndex >= this.date.length) {
        this.$emit("timeIndexChange", this.date.length - 1);
      }
      for(const date of this.date) {
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
        entry.users.splice(this.take_n * 2);
        out.push(entry);
      }
      return out;
    },

    async fetchData() {
      this.is_animating = false;
      const async_data = this.repositories.map(this.$usersInfo);
      const data = await Promise.all(async_data);
      const filtered_data = data.map(this.filterKind);
      const merged = this.mergeDataForRepositories(filtered_data);
      const grouped = this.groupByDate(merged);
      const ordered = this.orderByDate(grouped);
      ordered.sort((a,b) => b.date > a.date ? -1 : 1);

      const t = transition().duration(500);

      const timeIndex = Math.min(Math.max(this.timeIndex, 0), ordered.length - 1);
      if (timeIndex != this.timeIndex) {
        this.$emit("timeIndexChange", timeIndex);
      }
      this.render(ordered[timeIndex], t);
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
        const max_users = frame.users.length;

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
              .attr("transform", `translate(0, ${y(max_users)})`)
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
                .attr("transform", `translate(0, ${y(max_users)})`)
                .attr("opacity", 0)
                .remove()
              return group;
            }
          )
        ;
      }
    },

    render(frame, transition) {
      if (!frame) {
        return;
      }

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

      const max_users = frame.users.length;
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

    // Multiply the number of frames by 10 to add a transition between each frame.
    addFrames(frames, n = 10) {
      const out = [];
      for(let i = 0; i < frames.length; i++) {
        out.push(frames[i]);
        if(i >= frames.length - 1) {
          continue;
        }
        const before = {}
        const after = {};
        for(const [user, value] of frames[i].users) {
          before[user] = value;
        }
        for(const [user, value] of frames[i+1].users) {
          after[user] = value;
        }
        const userList = new Set([
          ...Object.keys(before),
          ...Object.keys(after)],
        );
        for(let j = 1; j < n; j++) {
          const users = [];
          for(const user of userList) {
            users.push([
              user,
              ((n - j) / n) * (before[user] || 0) +
              ((0  + j) / n) * (after[user] || 0),
            ]);
          }
          users.sort((a,b) => b[1] - a[1]);
          out.push({
            date: frames[i].date,
            users: users,
          });
        }
      }
      return out;
    },

    accumulate(data) {
      console.log("accumulate", data);
      const accu = {};
      for(const frame of data) {
        for(const [user, value] of frame.users) {
          accu[user] ||= 0;
          accu[user] += value;
        }
        frame.users = [];
        for(const [user, value] of Object.entries(accu)) {
          frame.users.push([user, value]);
        }
        frame.users.sort((a,b) => b[1] - a[1]);
      }
    },

    previous() {
      if(this.timeIndex > 0) {
        this.$emit("timeIndexChanged", this.timeIndex - 1);
      }
    },

    next() {
      if (this.timeIndex < this.date.length - 1) {
        this.$emit("timeIndexChanged", this.timeIndex + 1);
      }
    },

    stop() {
      this.is_animating = false;
    },

    async animate(accumulate = false) {
      if (this.is_animating) {
        this.is_animating = false;
        return;
      }
      const async_data = this.repositories.map(this.$usersInfo);
      const data = await Promise.all(async_data);
      const filtered_data = data.map(this.filterKind);
      const merged = this.mergeDataForRepositories(filtered_data);
      const grouped = this.groupByDate(merged);
      const ordered = this.orderByDate(grouped).splice(this.timeIndex);
      if (accumulate) {
        this.accumulate(ordered);
      }
      ordered.sort((a,b) => b.date > a.date ? -1 : 1);
      let timeIndex = 0

      const n = 5;
      const ordered_with_added_frames = this.addFrames(ordered, n);
      timeIndex *= n;

      this.is_animating = true;
      while(timeIndex < ordered_with_added_frames.length - 1 && this.is_animating) {
        timeIndex++;
        const t = transition()
          .duration(2000 / n)
          .ease(easeLinear);

        const frame = ordered_with_added_frames[timeIndex];
        this.render(ordered_with_added_frames[timeIndex], t);
        await t.end();
      }

      this.is_animating = false;
    },
  },

  mounted() {
    this.initialize();
  },

  watch: {
    "repositories": "fetchData",
      "grouping": "fetchData",
      "kind": "fetchData",
      "timeIndex": "fetchData",
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
