<template>
  <div class="component-container">

    <div class="section" style="padding-top: 0;">
        <div class="split-view">
          <div ref="container" class="treemap-container">
            <!-- Tooltip -->
            <table class="treemap-tooltip" ref="tooltip">
              <thead>
                <tr>
                  <td> {{tooltip_title}} </td>
                  <td> . </td>
                  <td> .. </td>
                  <td> % </td>
                </tr>
              </thead>
              <tbody>
              </tbody>
            </table>

            <!-- Treemap -->
            <svg width="100%" height="100%">
              <g ref="content"/>
            </svg>
          </div>

          <div>
            <LineChart v-if="history" :data="history" />
          </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import {easeCubicInOut} from "d3-ease";
import {easeLinear} from "d3-ease";
import {hierarchy} from "d3-hierarchy";
import {interpolateRgb} from "d3-interpolate";
import {scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {treemapBinary} from "d3-hierarchy";
import {treemap} from "d3-hierarchy";
import {hsl} from "d3-color";
import "d3-transition";
import {transition} from "d3-transition";
import {format} from "d3-format";

const { $color_map } = useNuxtApp();

const container = ref<HTMLElement|null>(null);
const content = ref<HTMLElement|null>(null);
const tooltip = ref<HTMLElement|null>(null);
const component_name = ref<HTMLElement|null>(null);
const tooltip_title = ref("Tooltip");

const fetchedData = shallowRef(undefined);
const data = shallowRef({});

const history = shallowRef([]);

let colormapFunc = $color_map[0];

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  path: {},
  field_color: {},
  field_size: {},
  colormap: {},
  colormapMin: {},
  colormapMax: {},
  dates: {},
  animate: { type:Boolean, default: false },
});

const emits = defineEmits([
  "zoomin",
  "animationend",
]);

const svgWidth = () => {
  return container.value?.clientWidth;
}

const svgHeight = () => {
  return container.value?.clientHeight;
}

const getFieldColor = function(d) {
  let sum = 0;

  const props_field_color = props.field_color.length
    ? props.field_color
    : props.field_size;

  for(const field of props_field_color) {
    sum += d.summed_data[field] || 0;
  }
  return sum;
};

const getFieldSize = function(d) {
  let sum = 0;

  const props_field_size = props.field_size.length
    ? props.field_size
    : props.field_color;

  for(const field of props_field_size) {
    sum += d.summed_data[field] || 0;
  }
  return sum;
};

const renderGroup = function(group, x, y) {
  return group.attr("transform", d => `translate(${x(d.x0)}, ${y(d.y0)})`) ;
};

const renderRect = function(rect, x, y, hover) {
  return rect
    .attr("rx", 10)
    .attr("stroke", "white")
    .attr("stroke-width", 5)
    .attr("fill-opacity", 0.9)
    .attr('width', d => x(d.x1) - x(d.x0))
    .attr('height', d => y(d.y1) - y(d.y0))
    .style("fill", d => {
      const colorScale = scaleLinear()
        .domain([props.colormapMin || 0, props.colormapMax || 1])
        .range([0, 1])
      ;
      const color = getFieldColor(d.data);
      const size = getFieldSize(d.data);
      const c1 = "gray";
      const c2 = colormapFunc(colorScale(color / size));
      return interpolateRgb(c1, c2)(hover ? 0.5 : 0.9);
    })
};

const initText = function(text, index) {
  return text
    .attr("text-anchor", "start")
    .attr("alignment-baseline", "middle")
    .attr("x", 8)
    .attr("opacity", 0.5 - index * 0.2)
    .style("font-weight", index == 0 ? "bold" : "normal")
  ;
};

const renderText = function(text, index, data) {
  const colorScale = scaleLinear()
    .domain([props.colormapMin || 0, props.colormapMax || 1])
    .range([0, 1])
  ;

  const font_size = d => {
    const total_size = getFieldSize(data.data);
    const size = getFieldSize(d.data);
    if (total_size == 0) {
      return 0;
    }
    const percent = size / total_size * 10;
    if (percent < 0.02) {
      return 0;
    }
    return Math.min(20, Math.sqrt(percent) * 30);
  }

  text
    .style("fill", d => {
      const color = getFieldColor(d.data);
      const size = getFieldSize(d.data);
      const c2 = colormapFunc(colorScale(color / size));
      // Try to get a good contrast between the text and the background.
      const c1 = hsl(c2).l < 0.5 ? "white" : "black";
      return c1;
    })
    .style("font-size", font_size)
    .attr("y", d => 5 + font_size(d) * (index + 1) * 1.2)
    .text(d => {
      const name = d.data.name;
      const color = getFieldColor(d.data);
      const size = getFieldSize(d.data);
      const percent =  Math.floor(100 * color / size);
      if (index == 0) {
        return `${name}`;
      }
      else {
        return `${color}/${size} = ${percent}%`;
      }
    })
  ;
};

const render = function(group, data, x, y, is_zoom = false, transition) {
  const join = d => {
    return d.join(
      enter => {
        const group = enter.append("g");
        const rect = group.append("rect")
        const text_1 = group.append("text")
        const text_2 = group.append("text")
        renderGroup(group, x, y);
        renderRect(rect, x, y, false)
        initText(text_1, 0);
        initText(text_2, 1);
        renderText(text_1, 0, data);
        renderText(text_2, 1, data);
        return group;
      },

      update => {
        const group = update.transition(transition);
        const rect = group.select("rect");
        const text = group.selectAll("text");
        renderGroup(group, x, y);
        renderRect(rect, x, y, false)
        text.each((_d, i, nodes) => {
          const node = select(nodes[i]);
          const n = is_zoom ? node : node.transition(transition);
          renderText(n, i, data);
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
    .on("click", (_event, d) => zoomin(d))

  child
    .on("mousemove", (event, d) => {
      const rect = select(event.currentTarget).select("rect");
      renderRect(rect, x, y, true)

      tooltip_title.value = d.data.name;
      select(tooltip.value).style("opacity", 1.0)

      const container_bounds = container.value.getBoundingClientRect();
      const bounds = content.value.getBoundingClientRect();
      const tooltip_bounds = tooltip.value.getBoundingClientRect();

      const max_right = bounds.right - tooltip_bounds.width;
      const max_bottom = bounds.bottom - tooltip_bounds.height;
      let mouse_x = Math.min(event.clientX + 20, max_right);
      let mouse_y = Math.min(event.clientY + 20, max_bottom);

      if (mouse_x == max_right && mouse_y == max_bottom) {
        mouse_x = event.clientX - tooltip_bounds.width - 20;
        mouse_y = event.clientY - tooltip_bounds.height - 20;
      }

      select(tooltip.value)
        .style("left", (mouse_x - bounds.left) + "px")
        .style("top", (mouse_y - bounds.top)+ "px")

      const fields = []
        .concat(props.field_size)
        .concat(props.field_color)

      const update = tr => {
        const v1 = tr.select("td.v1");
        const v2 = tr.select("td.v2");
        const v3 = tr.select("td.v3");
        const v4 = tr.select("td.v4");
        v1.text(field => field)
        v2.text(field => d.data.summed_data[field] || 0)
        v3.text(field => data.data.summed_data[field] || 0)
        v4.text(field => {
          const value = d.data.summed_data[field] || 0;
          const total = data.data.summed_data[field] || 0;
          const percent = Math.floor(100 * value / total);
          return percent + "%";
        });
        return tr;
      }

      select(tooltip.value)
        .select("tbody")
        .selectAll("tr")
        .data(fields)
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
            return update(row)
          },
          update,
          exit => exit.remove(),
        )
    })
    .on("mouseleave", (event, _d) => {
      const rect = select(event.currentTarget).select("rect");
      renderRect(rect, x, y, false)

      select(tooltip.value).style("opacity", 0.0)
    })
};

const zoomin = function(child) {
  emits("zoomin", child.data.name)
};

const zoom = async function(data_old, data_new) {
  const transition_imm = transition()
    .duration(0)
    .ease(easeCubicInOut)

  const transition_zoom = transition()
    .duration(500)
    .ease(easeCubicInOut)

  // Remove the previous content by fading them out.
  const old_content = select(content.value).select('g')
  const new_content = select(content.value).append("g")

  // Draw the old and new contents from the old content zoom.
  {
    const x = scaleLinear()
      .domain([data_old.x0, data_old.x1])
      .rangeRound([0, svgWidth()-20])
    ;
    const y = scaleLinear()
      .domain([data_old.y0, data_old.y1])
      .rangeRound([0, svgHeight()-20])
    ;
    render(old_content, data_old, x, y, true, transition_imm)
    render(new_content, data_new, x, y, true, transition_imm)
  }

  // Draw the old and new contents from the new content zoom.
  {
    const x = scaleLinear()
      .domain([data_new.x0, data_new.x1])
      .rangeRound([0, svgWidth()-20])
    ;
    const y = scaleLinear()
      .domain([data_new.y0, data_new.y1])
      .rangeRound([0, svgHeight()-20])
    ;
    render(old_content, data_old, x, y, true, transition_zoom)
    render(new_content, data_new, x, y, true, transition_zoom)
  }


  // Transition the opacity of the old and new contents.
  {
    old_content
      .attr("opacity", 1)
      .transition(transition_zoom)
      .attr("opacity", 0)

    new_content
      .attr("opacity", 0)
      .transition(transition_zoom)
      .attr("opacity", 1)
  }

  // Delete the old content after the transition.
  old_content
    .transition(transition_zoom)
    .remove()

  // Delay the historical data computation to avoid blocking the rendering.
  await computeHistoricalData(data_new.data);
  await transition_zoom.end();
};

const mytreemap = function(data) {
  const data_with_layout = hierarchy(data).sum(d => {
    return d.children.length ? 0 : getFieldSize(d);
  });
  const map = treemap()
    .tile(treemapBinary)
    .size([svgWidth(), svgHeight()])
    .round(true)

  const out = map(data_with_layout);
  return out;
};

const date_2020 = new Date("2020-01-01");

// Updates are done weekly. To compress the temporal, dimension, we count the
// number of week since 2020.
const formatDate = date => {
  return Math.floor((date - date_2020) / (7 * 24 * 60 * 60 * 1000));
}

const formatDateInverse = date => {
  return new Date(date_2020.getTime() + date * 7 * 24 * 60 * 60 *
    1000);
}

const computedSummedData = function(entry) {
  const date = formatDate(props.dates[1]);
  // Propagate the field values to the parents:
  const propagate = entry => {
    entry.children ||= [];

    const summed_data = {};
    if (entry.data) {
      Object
        .keys(entry.data)
        .sort((a,b) => parseInt(a) - parseInt(b))
        .filter(key => parseInt(key) <= date)
        .forEach(datapoint => {
          for(const field in entry.data[datapoint]) {
            summed_data[field] = entry.data[datapoint][field];
          }
        })
    }

    for(const child of entry.children) {
      propagate(child)
      for(const field in child.summed_data) {
        summed_data[field] ||= 0;
        summed_data[field] += child.summed_data[field];
      }
    }
    entry.summed_data = summed_data;
  };
  propagate(entry);
};

const computeHistoricalData = async (raw_data) => {
  const start = new Date()

  const min_date = formatDate(props.dates[0]);
  const max_date = formatDate(props.dates[1]);

  let fields = [];

  if (props.field_color.length) {
    fields = props.field_color;
  } else {
    fields = props.field_size;
  }

  const out = [];
  for(const field of fields) {
    // Yield in order to avoid blocking the rendering.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Initially, this contains the data for each day.
    const data = Array(max_date + 1).fill(0);

    const stack = [raw_data];
    while(stack.length > 0) {
      const entry = stack.pop();
      for(const child of entry.children) {
        stack.push(child);
      }

      if (!entry.data) {
        continue;
      }

      let prev = 0;
      Object
        .keys(entry.data)
        .sort((a,b) => a-b)
        .forEach(datapoint => {
          // Update the current values.
          const proposed = entry.data[datapoint]?.[field];
          if (proposed === undefined) {
            return;
          }
          const datapoint_int = parseInt(datapoint);
          if (datapoint_int <= max_date) {
            data[datapoint_int] += proposed - prev;
          }
          // Add the current values to the data.
          prev = proposed;
        })
    }

    // Integration of the data.
    data.forEach((value, index) => {
      if (index > 0) {
        data[index] += data[index - 1];
      }
    });
    data.splice(0, min_date);

    out.push({
      label: field,
      extra_label: " = " + format(",d")(data.slice(-1)[0]),
      formatter: format(",d"),
      values: data.map((value, index) => {
        return {
          x:formatDateInverse(min_date + index),
          y:value
        };
      })
    });
  };
  history.value = out;
  console.log(history.value);

  const end = new Date();
}

const fetchEntries = async function() {
  if (fetchedData.value) {
    return;
  }
  // Filter cpp files:
  const filter = entry => {
    if (!entry.children) {
      for(const extension of [".h", ".cc", ".cpp", ".c", ".hpp"]) {
        if (entry.name.endsWith(extension)) {
          return entry;
        }
      }
      return null;
    }

    const children = entry.children.map(filter).filter(x => x);
    if (children.length == 0) {
      return null;
    }
    return { ...entry, children };
  }

  const response = await fetch(`/treemap/${props.repositories[0]}/latest.json`);
  const data = filter(await response.json());
  computedSummedData(data);
  fetchedData.value = data;
};

const getCurrentDataFromPath = function(path) {
  let current_data = data.value
  for(const name of path) {
    for(let child of current_data.children) {
      if (child.data.name == name) {
        current_data = child;
        break;
      }
    }
  }
  return current_data;
};

const refresh = async function() {
  colormapFunc = $color_map[props.colormap];

  if (!select(content.value).select("g").node()) {
    select(content.value).append("g")
  }

  const data = getCurrentDataFromPath(props.path);

  const group =
    select(content.value)
    .select("g")

  const x = scaleLinear()
    .domain([data.x0, data.x1])
    .rangeRound([0, svgWidth()-20])
  ;
  const y = scaleLinear()
    .domain([data.y0, data.y1])
    .rangeRound([0, svgHeight()-20])
  ;

  const transition_refresh =
    transition()
    .duration(300)
    .ease(props.animate? easeCubicInOut : easeLinear)

  render(group, data, x, y, false, transition_refresh)

  // Delay the historical data computation to avoid blocking the rendering.
  await transition_refresh.end();
  await computeHistoricalData(data.data);

  emits("animationend");
};

const full_refresh = function() {
  computedSummedData(fetchedData.value);
  data.value = mytreemap(fetchedData.value);
  refresh();
};

const pathChanged = async function(new_path, old_path) {
  const data_old = getCurrentDataFromPath(old_path);
  const data_new = getCurrentDataFromPath(new_path);
  await zoom(data_old, data_new)
};

const path_wrapped = computed(() => [...props.path]);

watch(() => [
  props.repositories,
  props.field_size,
  props.field_color,
  props.dates,
], full_refresh);

watch(() => [
  props.colormap,
  props.colormapMin,
  props.colormapMax,
], refresh);

watch(path_wrapped, pathChanged);

onMounted(async () => {
  await fetchEntries();
  full_refresh();
  (new ResizeObserver(full_refresh)).observe(container.value);
});

</script>

<style lang="scss">

.treemap-tooltip {
  backdrop-filter: blur(5px);
  position: absolute;
  pointer-events: none;
  color: black;
  z-index: 1;
  opacity: 0;
  box-shadow:
  0 2px 10px rgba(0, 0, 0, 0.5),
  inset 0 2px 10px rgba(255, 255, 255, 0.9);

  thead {
    font-weight: bold;
    background-color:rgba(255, 128, 0, 0.35);
  }

  td {
    border: 1px solid black;
    padding: 5px;
    text-align: left;
  }

  tbody {
    tr:nth-child(even) {
      background-color:rgba(255, 255, 255, 0.35);
    }

    tr:nth-child(odd) {
      background-color:rgba(128, 128, 128, 0.35);
    }
  }
}

.component-container {
  container-type: inline-size;
}

.split-view {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  height: 75vh;
}

.split-view > div {
  flex: 1;
  padding: 10px;
}

@container (width < 800px) {
  .split-view {
    flex-direction: column;
    height: 150vh;
  }
}


</style>
