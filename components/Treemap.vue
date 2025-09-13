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
                  <td> {{tooltip_dir_dotdot}} </td>
                  <td> {{tooltip_dir_dot}} </td>
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
import {treemapSquarify} from "d3-hierarchy";
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
const tooltip_dir_dot = ref(".");
const tooltip_dir_dotdot = ref("..");

const fetchedData = shallowRef(undefined);
let dates = [];
let file_index = {};
const metrics = {};
const metrics_accumulation = {};
const data = shallowRef({});

let current_date_id = -1;

const history = shallowRef([]);

let colormapFunc = $color_map[0];

const number_format = format(",d");

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

function browserDownload(content, filename, contentType) {
  const a = document.createElement('a');
  const file = new Blob([content], {type: contentType});
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
}

function download(kind) {
  console.log("Download", kind);

  if (kind == "temporal_json") {
    const fields = []
      .concat(props.field_size)
      .concat(props.field_color)
    ;
    const out = [];
    for(const field of fields) {
      out.push({
        metric: field,
        values: computeHistoryForField(field).map((d, i) => {
          return {
            date: formatDateInverse(i),
            count: d,
          };
        }),
      });
    }

    browserDownload(JSON.stringify(out, null, 2), "temporal.json", "application/json");
    return;
  }

  if (kind == "temporal_csv") {
    const fields = []
      .concat(props.field_size)
      .concat(props.field_color)
    ;
    let out = "date," + fields.join(",") + "\n";
    for(let i = 0; i < dates.length; ++i) {
      const row = [formatDateInverse(i).toISOString().split("T")[0]];
      for(const field of fields) {
        const values = computeHistoryForField(field);
        row.push(values[i]);
      }
      out += row.join(",") + "\n";
    }

    browserDownload(out, "temporal.csv", "text/csv");
    return;
  }

  if (kind == "spatial_json") {
    // Build a JSON with the current metrics_accumulation for each field.
    const fields = []
      .concat(props.field_size)
      .concat(props.field_color)
    ;
    const get = (file) => {
      const out = {}
      for(const field of fields) {
        out[field] = metrics_accumulation[field][file.id] || 0;
      }
      // If none of the fields are non-zero, return null.
      let all_zero = true;
      for(const field of fields) {
        if (out[field] != 0) {
          all_zero = false;
          break;
        }
      }
      if (all_zero) {
        return null;
      }
      out.children = {}
      for(const child of file.children || []) {
        const child_out = get(child);
        if (child_out)
          out.children[child.name] = child_out;
      }
      if (Object.keys(out.children).length == 0) {
        delete out.children;
      }
      return out;
    }
    const out = get(getCurrentDataFromPath(props.path).data);
    browserDownload(JSON.stringify(out, null, 2), "spatial.json", "application/json");
    return;
  }

  if (kind == "spatial_csv") {
    const fields = []
      .concat(props.field_size)
      .concat(props.field_color)
    ;
    let out = "path," + fields.join(",") + "\n";
    const get = (file, path) => {
      const row = [path.join("/") || "/"];
      let all_zero = true;
      for(const field of fields) {
        const value = metrics_accumulation[field][file.id] || 0;
        row.push(value);
        if (value != 0) {
          all_zero = false;
        }
      }
      if (!all_zero) {
        out += row.join(",") + "\n";
      }
      for(const child of file.children || []) {
        get(child, path.concat([child.name]));
      }
    }
    get(getCurrentDataFromPath(props.path).data, props.path);
    browserDownload(out, "spatial.json", "text/json");
    return;
  }

}

defineExpose({
  download,
});


const metric_current_value = (field, file_id) => {
  let value = 0;
  for(const [d, v] of metrics[field][file_id] || []) {
    if (d <= current_date_id) {
      value = v;
      continue;
    }
    break;
  }
  return value;
}

const svgWidth = () => {
  return container.value?.clientWidth;
}

const svgHeight = () => {
  return container.value?.clientHeight;
}

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
      const color = d.data.color;
      const size = d.data.area;
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
    const total_size = data.data.area;
    const size = d.data.area;
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
      const color = d.data.color;
      const size = d.data.area;
      const c2 = colormapFunc(colorScale(color / size));
      // Try to get a good contrast between the text and the background.
      const c1 = hsl(c2).l < 0.5 ? "white" : "black";
      return c1;
    })
    .style("font-size", d => font_size(d) * (4-index) * 0.25)
    .attr("y", d => 5 + font_size(d) * (index + 1) * 1.2)
    .text(d => {
      if (index == 0) {
        const name = d.data.name;
        return `${name}`;
      } else {
        const color = d.data.color;
        const size = d.data.area;
        if (color <= size) {
          const percent = Math.floor(100 * color / size);
          return `${number_format(color)}/${number_format(size)} (${percent}%)`;
        } else {
          const multiple = (color / size).toFixed(1);
          return `${number_format(color)}/${number_format(size)} (${multiple}x)`;
        }
        if (percent <= 100) {
        } else {
          return `${number_format(color)}/${number_format(size)} = ${percent}%`;
        }
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

  // There might be no children.
  if (!data.children) {
    group.selectAll("g").remove();

    // Display some text in the middle saying there are zero data recorded
    // at this directory and date.
    const w = svgWidth();
    const h = svgHeight();
    const text = group.selectAll("text").data([0], d => d);
    text.join(
      enter => {
        const t = enter.append("text");
        t
         .classed("no-data", true)
         .attr("text-anchor", "middle")
         .attr("alignment-baseline", "middle")
         .attr("x", w / 2)
         .attr("y", h / 2)
         .style("font-size", 20)
         .style("font-weight", "bold")
         .style("fill", "gray")
         .text("Zero data recorded at this directory and date");
        return t;
      },
      update => update,
      leave => leave.remove()
    );

    return;
  }
  group.selectAll("text.no-data").remove();

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
      tooltip_dir_dot.value = d.data.name;
      tooltip_dir_dotdot.value = data.data.name;
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
        v2.text(field => number_format(metrics_accumulation[field][data.data.id] || 0))
        v3.text(field => number_format(metrics_accumulation[field][d.data.id] || 0))
        v4.text(field => {
          const value = metrics_accumulation[field][d.data.id] || 0;
          const total = metrics_accumulation[field][data.data.id] || 0;
          if (value > total) {
            const multiple = (value / total).toFixed(1);
            return `${multiple}x`;
          } else {
            const percent = Math.floor(100 * value / total);
            return `${percent}%`;
          }
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

  const transition_end = transition_zoom.end();

  // Delay the historical data computation to avoid blocking the rendering.
  computeHistory();
  await transition_end;
};

const mytreemap = function(data) {
  // Sort children by area.
  const data_with_layout =
    hierarchy(data)
    .each(d => d.value = d.data.area)
    .sort((a, b) => b.value - a.value)
  ;

  // Each node value is i
  const map = treemap()
    .tile(treemapSquarify)
    .size([svgWidth()*0.8, svgHeight()])
    .round(true)

  const out = map(data_with_layout)
    .sort((a, b) => b.height - a.height)
  return out;
};

// Finds the best index for a given date.
const formatDate = date => {
  let best_index = 0;
  let best_diff = Infinity;
  for(let i = 0; i < dates.length; ++i) {
    const diff = Math.abs(dates[i] - date);
    if (diff < best_diff) {
      best_diff = diff;
      best_index = i;
    }
  }
  return best_index;
}

const formatDateInverse = date => {
  return dates[date];
}

const computeHistoryForField = (field) => {
  // For each date in [min_date, max_date], we need to accumulate the value
  // for the current directory (data.data.id), which is the sum of all its
  // children.
  // We have already computed metrics_accumulation for each field and each
  // but this is only for the current date (current_date_id).
  // We need to do this for each date in [min_date, max_date].

  const values = new Array(dates.length).fill(0);
  const accumulate = (entry) => {
    for(const child of entry.children || []) {
      accumulate(child)
    }

    const history = metrics[field][entry.id];
    if (!history) {
      return;
    }

    let current_value = 0;
    let i = 0;
    for(let date_id = 0; date_id < dates.length; ++date_id) {
      while(i < history.length && history[i][0] <= date_id) {
        current_value = history[i][1];
        i += 1;
      }
      values[date_id] += current_value;
    }
  };
  accumulate(getCurrentDataFromPath(props.path).data);
  return values;
}

const computeHistory = () => {
  let fields = [];

  if (props.field_color.length) {
    fields = props.field_color;
  } else {
    fields = props.field_size;
  }

  const out = [];
  for(const field of fields) {
    const values = computeHistoryForField(field);

    out.push({
      label: field,
      extra_label: " = " + format(",d")(values.at(-1)),
      values: values
        .map((d, i) => {
          return {
            x: formatDateInverse(i),
            y: d,
          }
        })
        .filter(d => {
          return d.x >= props.dates[0] && d.x <= props.dates[1];
        })
    });
  };
  history.value = out;
}

// Fetch dates.json
//
// Format:
// [
//   "2020-01-01",
//   "2020-01-02",
//   ...
// ]
async function FetchDates() {
  if (dates.length) {
    return;
  }

  const response = await
    fetch(`/treemap/${props.repositories[0]}/dates.json`);
  const json = await response.json();
  dates = json.map(d => new Date(d));
};

// Fetch file_index.json
//
// Format:
// {
//   "name": "root",
//   "id": 0,
//   "children": [...]
// }
async function FetchFileIndex() {
  if (file_index.name) {
    return;
  }

  const response = await
    fetch(`/treemap/${props.repositories[0]}/file_index.json`);
  file_index = await response.json();
}

  // Fetch all the metrics files:
  //
  // Format:
  // {
  //  "<id>": [[<date_id>, value], ...],
  //  ...
// }
async function FetchMetrics()  {
  // Metrics to fetch:
  const fields = []
    .concat(props.field_size)
    .concat(props.field_color)

  for(const field of fields) {
    if (metrics[field]) {
      continue;
    }

    const response = await
      fetch(`/treemap/${props.repositories[0]}/metrics/${field}.json`);
    metrics[field] = await response.json();
  }
}

function computeMetricsAccumulation() {
  // Compute the metrics_accumulation for each field and each file.
  for(const field in metrics) {
    metrics_accumulation[field] = {};

    // Initialize the metrics_accumulation with the current values.
    for(const file_id in metrics[field]) {
      metrics_accumulation[field][file_id] = metric_current_value(field, file_id);
    }

    // Accumulate the metrics for each directory.
    const accumulate = entry => {
      metrics_accumulation[field][entry.id] ||= 0;
      if (!entry.children) {
        return;
      }

      for(const child of entry.children) {
        accumulate(child);

        metrics_accumulation[field][entry.id] +=
          metrics_accumulation[field][child.id];
      }
    }
    accumulate(file_index);
  }
}

function computeFetchedData() {
  // Finally, compute the value for each file.
  const out = structuredClone(file_index);

  // Compute area and color:
  const props_field_size = props.field_size.length
    ? props.field_size
    : props.field_color;
  const props_field_color = props.field_color.length
    ? props.field_color
    : props.field_size;

  const compute = entry => {
    // Recurse on children:
    for(const child of entry.children || []) {
      compute(child);
    }

    // Drop children with zero area or zero color:
    //entry.children = (entry.children || []).filter(c => c.area > 0);

    entry.area = 0;
    entry.color = 0;
    for(const field of props_field_size) {
      entry.area += metrics_accumulation[field][entry.id]
    }
    for(const field of props_field_color) {
      entry.color += metrics_accumulation[field][entry.id]
    }
  }
  compute(out);

  // Display the metrics_accumulation for the root and the sum of the
  // metrics_accumulation for all its children.
  for(const field in metrics_accumulation) {
    let sum = 0;
    for(const child of file_index.children) {
      sum += metrics_accumulation[field][child.id] || 0;
    }
  }

  fetchedData.value = out;
  return;
}

async function fetchEntries() {
  await Promise.all([
    FetchDates(),
    FetchFileIndex(),
    FetchMetrics(),
  ]);
  // From the dates, find the date_id to display.
  current_date_id = formatDate(props.dates[1]);

  computeMetricsAccumulation();
  computeFetchedData();
}


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

async function refresh() {
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
  computeHistory();

  emits("animationend");
};

async function render_refresh() {
  data.value = mytreemap(fetchedData.value);
  await refresh();
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
], async () => {
  await fetchEntries();
  await render_refresh();
});

watch(() => [
  props.colormap,
  props.colormapMin,
  props.colormapMax,
], refresh);

watch(path_wrapped, pathChanged);

onMounted(async () => {
  await fetchEntries();
  await render_refresh();
  (new ResizeObserver(render_refresh)).observe(container.value);
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
