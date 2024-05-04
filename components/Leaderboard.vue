<template>
  <div ref="container" align="center">
    <b-field grouped group-multiline label="time">
      <b-field>
      </b-field>
      <b-field>
        <b-select v-model="timeIndexModel" >
          <option v-for="(d, i) in date" :key="i" :value="i">{{ d }} </option>
        </b-select>
      </b-field>
      <b-field grouped>
        <b-button @click="previous" :disabled="timeIndexModel == date.length - 1">
          Previous
        </b-button>
        <b-button @click="next" :disabled="timeIndexModel == 0">
          Next
        </b-button>
      </b-field>
      <b-field v-if="!is_animating && grouping != 'forever' && timeIndexModel > 0">
        <b-button @click="animate(false)" class="is-success" >
          Animate
        </b-button>
      </b-field>
      <b-field v-if="!is_animating && grouping != 'forever' && timeIndexModel > 0">
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

<script setup lang="ts">

import {axisTop} from "d3-axis";
import {format} from "d3-format";
import {scaleBand} from "d3-scale";
import {scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {transition} from "d3-transition";
import {range} from "d3-array";
import {easeLinear} from "d3-ease";
import {interpolate} from "d3-interpolate";

const { $usersInfo } = useNuxtApp();
const { $color } = useNuxtApp();

let timeIndexModel = defineModel("timeIndex")

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"]},
  grouping: { type:String, default: "yearly"},
  kind: { type:String, default: "author"},
});

const container = ref(null);
const svg = ref(null);
const svg_axis = ref(null);
const svg_title = ref(null);

const take_n = 100;

const animateWithAccu = ref<string>('instant');
const svgWidth = ref<number>(300);
const svgHeight = ref<number>(300);
const date = ref<string[]>([]);
const is_animating = ref<boolean>(false);

const timeLabel = computed(() => {
  switch(props.grouping) {
    case "forever"   : return "Forever";
    case "yearly"    : return "Year";
    case "decennial" : return "Decade";
    case "quarterly" : return "Quarter";
    case "monthly"   : return "Month";
  }
  return "N/A"
});

const mergeDataForRepositories = (repositories) => {
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
};

const groupingFunction = () => {
  switch(props.grouping) {
    case "forever"   : return () => "forever";
    case "yearly"    : return x => x.substr(0,4);
    case "decennial" : return x => x.substr(0,3) + "0s";
    case "quarterly" : return x => {
      const year = x.substr(0,4)
      const month = x.substr(5,2);
      const quarter = Math.floor((month - 1) / 3) + 1;
      return `${year}Q${quarter}`;
    }
    case "monthly"   : return x => x.substr(0,7);
  }
  return x => x;
};

const groupByDate = (data) => {
  const out = {}
  const group = groupingFunction();
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
};

const orderByDate = (data) => {
  const out = [];
  const userList = Object.keys(data);
  const dateSet = new Set();
  for(const user of userList) {
    for(const date of Object.keys(data[user])) {
      dateSet.add(date);
    }
  }
  date.value = Array.from(dateSet).sort((a,b) => a < b ? 1 : -1);
  if (timeIndexModel.value >= date.value.length) {
    timeIndexModel.value =  date.value.length - 1;
  }
  for(const date_it of date.value) {
    const entry = {
      date: date_it,
      users: [],
    };
    for(const user of userList) {
      if (data[user][date_it]) {
        entry.users.push([user, data[user][date_it]]);
      }
    }
    entry.users.sort((a,b) => b[1] - a[1]);
    entry.users.splice(take_n * 2);
    out.push(entry);
  }
  return out;
};

const fetchData = async () => {
  is_animating.value = false;
  const async_data = props.repositories.map($usersInfo);
  const data = await Promise.all(async_data);
  const filtered_data = data.map(filterKind);
  const merged = mergeDataForRepositories(filtered_data);
  const grouped = groupByDate(merged);
  const ordered = orderByDate(grouped);
  ordered.sort((a,b) => b.date > a.date ? -1 : 1);

  const t = transition().duration(500);

  const timeIndex = Math.min(Math.max(timeIndexModel.value, 0), ordered.length - 1);
  if (timeIndexModel.value != timeIndex) {
    timeIndexModel.value = timeIndex;
  }
  render(ordered[ordered.length - timeIndexModel.value - 1], t);
};

const axis = (svg) => {
  const g = svg.append("g")

  return (x, transition) => {
    const axis = axisTop(x)
      .ticks(svgWidth.value / 100)
      .tickSizeOuter(0)
      .tickSizeInner(-svgHeight.value + 100)
      .tickFormat(d => format(".2s")(d).replace("G", "B"))

    g.transition(transition).call(axis)
    g.select(".tick:first-of-type text").remove();
    g.selectAll(".tick:not(:first-of-type) line").attr("stroke", "white");
    g.select(".domain").remove();
    g.attr("opacity", 0.2)
  };
};

const axisSticky = (svg) => {
  const g = svg
    .append("g")
    .attr("transform", `translate(0, 30)`)

  return (x, transition) => {
    const axis = axisTop(x)
      .ticks(svgWidth.value / 100)

    g.transition(transition).call(axis)
  };
};

const bars = (svg) => {
  const g = svg.append("g")

  return (x, y, frame, transition) => {
    const max_users = frame.users.length;

    const updateGroup = group => {
      return group
        .transition(transition)
        .attr("transform", (_d, i) => `translate(0, ${y(i)})`)
        .attr("opacity", 1)
    };

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
        .textTween(function(_d, i) {
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
      .data(frame.users.slice(0, take_n), (d) => d[0])
      .join(enter => {
        const group = enter.append("g")
        group
          .attr("transform", `translate(1, ${y.bandwidth() * max_users})`)
          .attr("opacity", 0)
          .call(updateGroup)

        const rect = group.append("rect")
        rect
          .attr("fill", d => $color(d[0]))
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

        group.call(updateGroup)
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
          .attr("transform", `translate(1, ${y.bandwidth() * max_users})`)
          .attr("opacity", 0)
          .remove()
        return group;
      }
    )
  };
}

const filterKind = (data) => {
  if (props.kind == "author") {
    const out = {}
    for(const [developer, value] of Object.entries(data)) {
      out[developer] = value.author.commit
    }
    return out;
  }

  if (props.kind == "review") {
    const out = {}
    for(const [developer, value] of Object.entries(data)) {
      out[developer] = value.review.commit
    }
    return out;
  }

  if (props.kind == "both") {
    const out = {}
    for(const [key, value] of Object.entries(data)) {
      out[key] = {}
      for(const [date, commit] of Object.entries(value.author.commit)) {
        out[key][date] ||= 0;
        out[key][date] += commit;
      }
      for(const [date, commit] of Object.entries(value.review.commit)) {
        out[key][date] ||= 0;
        out[key][date] += commit;
      }
    }
    return out;
  }

  console.error("Not reached");
};

const addFrames = (frames, n = 10) => {
  const out = [];
  for(let i = 0; i < frames.length - 1; i++) {
    out.push(frames[i]);
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
  out.push(frames[frames.length - 1]);
  return out;
}


const accumulate = (data) => {
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
};

const animate = async (should_accumulate = false) => {
  if (is_animating.value) {
    is_animating.value = false;
    return;
  }
  const async_data = props.repositories.map($usersInfo);
  const data = await Promise.all(async_data);
  const filtered_data = data.map(filterKind);
  const merged = mergeDataForRepositories(filtered_data);
  const grouped = groupByDate(merged);
  const ordered = orderByDate(grouped)
  ordered.sort((a,b) => a.date > b.date ? -1 : 1);
  ordered.length = Math.min(ordered.length, Math.max(2, timeIndexModel.value + 1));
  ordered.sort((a,b) => a.date < b.date ? -1 : 1);
  if (should_accumulate) {
    accumulate(ordered);
  }
  let timeIndex = 0

  const n = 5;
  const ordered_with_added_frames = addFrames(ordered, n);
  timeIndex *= n;

  is_animating.value = true;
  while(timeIndex < ordered_with_added_frames.length - 1 && is_animating.value) {
    timeIndex++;
    const t = transition()
      .duration(2000 / n)
      .ease(easeLinear);

    render(ordered_with_added_frames[timeIndex], t);
    await t.end();
  }

  is_animating.value = false;
};

const stop = () => {
  is_animating.value = false;
};

const previous = () => {
  timeIndexModel.value = Math.min(timeIndexModel.value + 1, date.value.length - 1);
}

const next = () => {
  timeIndexModel.value = Math.max(timeIndexModel.value - 1, 0);
};

watch(() => [
  props.repositories,
  props.grouping,
  props.kind,
  timeIndexModel.value,
], fetchData);

let updateBars = null;
let updateAxis = null;
let updateAxisSticky = null;

const render = (frame, transition) => {
  if (!frame) {
    return;
  }

  // Update the title:
  select(svg_title.value)
    .selectAll("text")
    .data([frame.date], d => d)
    .join(
      enter => {
        const text = enter.append("text");
        text
          .text(d => d)
          .attr("text-anchor", "end")
          .attr("transform", `translate(0, 32)`)
          .attr("x", svgWidth.value - 10)
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
    .range([25, svgWidth.value - 10]);

  const y = scaleBand()
    .domain(range(take_n+1))
    .range([0, svgHeight.value - 60])
    .padding(0.1);

  updateBars(x, y, frame, transition);
  updateAxis(x, transition);
  updateAxisSticky(x, transition);
};

const onResize = () => {
  svgWidth.value = container.value.clientWidth;
  svgHeight.value = take_n * 50;
  fetchData();
};
window.addEventListener("resize", onResize);

onMounted(() => {
  updateBars = bars(select(svg.value));
  updateAxis = axis(select(svg.value));
  updateAxisSticky = axisSticky(select(svg_axis.value))

  onResize();
});


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
