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
            <LineChart v-if="history?.length" :data="history" :milestones="milestones" />
            <p v-if="history?.length" class="source-note">{{ sourceNote }}</p>
          </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import {easeCubicInOut, easeLinear} from "d3-ease";
import {hierarchy, treemap, treemapSquarify} from "d3-hierarchy";
import {interpolateRgb} from "d3-interpolate";
import {scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {hsl} from "d3-color";
import "d3-transition";
import {transition} from "d3-transition";
import {format} from "d3-format";
import repositories_json from '../public/data/repositories.json'
import MILESTONES from '../utils/milestones.json'

const { $color_map } = useNuxtApp();

const container = ref<HTMLElement|null>(null);
const content = ref<HTMLElement|null>(null);
const tooltip = ref<HTMLElement|null>(null);
const tooltip_title = ref("Tooltip");
const tooltip_dir_dot = ref(".");
const tooltip_dir_dotdot = ref("..");

interface TreeNode {
  name: string;
  id: number;
  subtreeEnd: number;
  area: number;
  color: number;
  children?: TreeNode[];
}

interface TreeIndex {
  root: TreeNode;
  numNodes: number;
  parentId: Int32Array;
  excludeFlags: Uint8Array | null;
  isCompact: boolean;
}

interface MetricStore {
  kind: "latest" | "compact" | "legacy";
  rows?: number[][];
  legacy?: Record<string, [number, number][]>;
}

// Module-level caches so navigating or toggling options never re-fetches or
// re-decodes unchanged trees or metric histories.
const datesCache = new Map<string, Promise<Date[]>>();
const latestTreeCache = new Map<string, Promise<TreeIndex | null>>();
const fullTreeCache = new Map<string, Promise<TreeIndex | null>>();
const latestMetricCache = new Map<string, Promise<MetricStore | null>>();
const fullMetricCache = new Map<string, Promise<MetricStore | null>>();
const historySeriesCache = new Map<string, number[]>();

let activeTreeIndex: TreeIndex | null = null;
let dates: Date[] = [];
let metrics: Record<string, MetricStore> = {};
let metrics_accumulation: Record<string, Float64Array> = {};
let areaById = new Float64Array(0);
let colorById = new Float64Array(0);
const data = shallowRef<any>({});

let current_date_id = -1;

const history = shallowRef<any[]>([]);
const milestones = shallowRef<any[]>([]);
const sourceNote = ref("");

let colormapFunc = $color_map[0];

const number_format = format(",d");
const percent_format = format(".1%");

const props = defineProps({
  repositories: { type: Array[String], default: () => [repositories_json[0]?.dirname || "chromium"] },
  path: {},
  field_color: {},
  field_size: {},
  colormap: {},
  colormapMin: {},
  colormapMax: {},
  dates: {},
  animate: { type: Boolean, default: false },
  history_color: { type: Boolean, default: true },
  history_size: { type: Boolean, default: false },
  exclude_test: { type: Boolean, default: false },
  exclude_third_party: { type: Boolean, default: false },
});

const emits = defineEmits([
  "zoomin",
  "animationend",
]);

let is_rendering = false;
let next_render_task: (() => Promise<void>) | null = null;
const lock = (f: () => Promise<void>) => {
  next_render_task = f;
  if (is_rendering) return;
  is_rendering = true;
  (async () => {
    while (next_render_task) {
      const task = next_render_task;
      next_render_task = null;
      try {
        await task();
      } catch (e) {
        console.error(e);
      }
    }
    is_rendering = false;
  })();
};

function browserDownload(content: string, filename: string, contentType: string) {
  const a = document.createElement('a');
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
}

const getActiveExcludeMask = () =>
  (props.exclude_test ? 1 : 0) | (props.exclude_third_party ? 2 : 0);

const isNodeExcluded = (id: number) => {
  const mask = getActiveExcludeMask();
  if (!mask || !activeTreeIndex?.excludeFlags) return false;
  return (activeTreeIndex.excludeFlags[id] & mask) !== 0;
};

const hasVisibleChildren = (node: TreeNode) => {
  if (!node?.children) return false;
  const mask = getActiveExcludeMask();
  const flags = activeTreeIndex?.excludeFlags;
  if (!mask || !flags) return node.children.length > 0;
  for (let i = 0; i < node.children.length; i++) {
    if ((flags[node.children[i].id] & mask) === 0) return true;
  }
  return false;
};

const getTreeNodeFromPath = (pathArr: string[]): TreeNode | null => {
  if (!activeTreeIndex) return null;
  let current = activeTreeIndex.root;
  for (const name of (pathArr || [])) {
    const next = current.children?.find(c => c.name === name && !isNodeExcluded(c.id));
    if (!next) break;
    current = next;
  }
  return current;
};

function download(kind: string) {
  const fields: string[] = []
    .concat(props.field_size as any)
    .concat(props.field_color as any);

  if (kind == "temporal_json") {
    const out = [];
    for (const field of fields) {
      out.push({
        metric: field,
        values: computeHistoryForField(field).map((d, i) => ({
          date: formatDateInverse(i),
          count: d,
        })),
      });
    }
    browserDownload(JSON.stringify(out, null, 2), "temporal.json", "application/json");
    return;
  }

  if (kind == "temporal_csv") {
    const seriesByField = fields.map(field => computeHistoryForField(field));
    let out = "date," + fields.join(",") + "\n";
    for (let i = 0; i < dates.length; ++i) {
      const row: (string | number)[] = [formatDateInverse(i).toISOString().split("T")[0]];
      for (let f = 0; f < fields.length; ++f) {
        row.push(seriesByField[f][i]);
      }
      out += row.join(",") + "\n";
    }
    browserDownload(out, "temporal.csv", "text/csv");
    return;
  }

  const startNode = getTreeNodeFromPath(props.path as string[]);
  if (!startNode) return;

  if (kind == "spatial_json") {
    const get = (file: TreeNode): any => {
      if (isNodeExcluded(file.id)) return null;
      const out: any = {};
      let all_zero = true;
      for (const field of fields) {
        const v = metrics_accumulation[field]?.[file.id] || 0;
        out[field] = v;
        if (v != 0) all_zero = false;
      }
      if (all_zero) return null;
      if (file.children) {
        out.children = {};
        for (const child of file.children) {
          const child_out = get(child);
          if (child_out) out.children[child.name] = child_out;
        }
        if (Object.keys(out.children).length == 0) {
          delete out.children;
        }
      }
      return out;
    };
    const out = get(startNode);
    browserDownload(JSON.stringify(out, null, 2), "spatial.json", "application/json");
    return;
  }

  if (kind == "spatial_csv") {
    let out = "path," + fields.join(",") + "\n";
    const get = (file: TreeNode, p: string[]) => {
      if (isNodeExcluded(file.id)) return;
      const row: (string | number)[] = [p.join("/") || "/"];
      let all_zero = true;
      for (const field of fields) {
        const value = metrics_accumulation[field]?.[file.id] || 0;
        row.push(value);
        if (value != 0) all_zero = false;
      }
      if (!all_zero) {
        out += row.join(",") + "\n";
      }
      for (const child of file.children || []) {
        get(child, p.concat([child.name]));
      }
    };
    get(startNode, (props.path as string[]) || []);
    browserDownload(out, "spatial.csv", "text/csv");
    return;
  }
}

const svgWidth = () => container.value?.clientWidth || 0;
const svgHeight = () => container.value?.clientHeight || 0;

// The colormap domain. The bounds not given by the user are centered on the
// ratio of the displayed directory, so that its children contrast.
const color_domain = ref([0, 1]);
const parseBound = (value: any) => {
  const number = parseFloat(value);
  return isNaN(number) ? null : number;
};
const updateColorDomain = function(nodeData: any) {
  if (!nodeData?.data) return;
  const ratio = nodeData.data.area > 0 ? nodeData.data.color / nodeData.data.area : 0;
  color_domain.value = [
    parseBound(props.colormapMin) ?? 0,
    parseBound(props.colormapMax) ?? (2 * ratio || 1),
  ];
};

defineExpose({
  download,
  color_domain,
});

const renderGroup = function(group: any, x: any, y: any) {
  return group.attr("transform", (d: any) => `translate(${x(d.x0)}, ${y(d.y0)})`);
};

const renderRect = function(rect: any, x: any, y: any, hover: boolean) {
  const colorScale = scaleLinear()
    .domain(color_domain.value)
    .range([0, 1]);
  const blend = hover ? 0.5 : 0.9;

  return rect
    .attr("rx", 10)
    .attr("stroke", "white")
    .attr("stroke-width", 5)
    .attr("fill-opacity", 0.9)
    .attr("width", (d: any) => Math.max(0, x(d.x1) - x(d.x0)))
    .attr("height", (d: any) => Math.max(0, y(d.y1) - y(d.y0)))
    .style("fill", (d: any) => {
      const color = d.data.color;
      const size = d.data.area;
      const c2 = colormapFunc(colorScale(size > 0 ? color / size : 0));
      return interpolateRgb("gray", c2)(blend);
    });
};

const initText = function(text: any, index: number) {
  return text
    .attr("text-anchor", "start")
    .attr("alignment-baseline", "middle")
    .attr("x", 8)
    .attr("opacity", 0.5 - index * 0.2)
    .style("font-weight", index == 0 ? "bold" : "normal");
};

const renderText = function(text: any, index: number, parentNode: any, x: any) {
  const colorScale = scaleLinear()
    .domain(color_domain.value)
    .range([0, 1]);
  const total_size = parentNode.data.area;

  const font_size = (d: any) => {
    if (total_size == 0) return 0;
    const percent = (d.data.area / total_size) * 10;
    if (percent < 0.02) return 0;
    return Math.min(20, Math.sqrt(percent) * 30);
  };

  const label = (d: any) => {
    if (index == 0) {
      return d.data.name;
    }
    const color = d.data.color;
    const size = d.data.area;
    if (color <= size) {
      return `${number_format(color)}/${number_format(size)} (${percent_format(size > 0 ? color / size : 0)})`;
    }
    const multiple = (color / size).toFixed(1);
    return `${number_format(color)}/${number_format(size)} (${multiple}x)`;
  };

  // Truncate a label to the width of its tile, estimating the width of a
  // character from the font size. Hide it when too little would remain.
  const fit = (d: any, lbl: string) => {
    const width = x(d.x1) - x(d.x0) - 16;
    const fs = font_size(d);
    if (fs <= 0) return "";
    const max_chars = Math.floor(width / (fs * (4 - index) * 0.25 * 0.6));
    if (lbl.length <= max_chars) {
      return lbl;
    }
    return max_chars >= 4 ? lbl.slice(0, max_chars - 1) + "…" : "";
  };

  text
    .style("fill", (d: any) => {
      const color = d.data.color;
      const size = d.data.area;
      const c2 = colormapFunc(colorScale(size > 0 ? color / size : 0));
      return hsl(c2).l < 0.5 ? "white" : "black";
    })
    .style("font-size", (d: any) => font_size(d) * (4 - index) * 0.25)
    .attr("y", (d: any) => 5 + font_size(d) * (index + 1) * 1.2)
    .text((d: any) => fit(d, label(d)));
};

const render = function(group: any, nodeData: any, x: any, y: any, _is_zoom = false, trans: any) {
  const join = (d: any) => {
    return d.join(
      (enter: any) => {
        const g = enter.append("g");
        const rect = g.append("rect");
        const text_1 = g.append("text").classed("text-1", true);
        const text_2 = g.append("text").classed("text-2", true);
        renderGroup(g, x, y);
        renderRect(rect, x, y, false);
        initText(text_1, 0);
        initText(text_2, 1);
        renderText(text_1, 0, nodeData, x);
        renderText(text_2, 1, nodeData, x);
        return g;
      },
      (update: any) => {
        const g = trans ? update.transition(trans) : update;
        const rect = g.select("rect");
        renderGroup(g, x, y);
        renderRect(rect, x, y, false);
        const text_1 = g.select("text.text-1");
        const text_2 = g.select("text.text-2");
        renderText(text_1, 0, nodeData, x);
        renderText(text_2, 1, nodeData, x);
        return update;
      },
      (leave: any) => leave.remove()
    );
  };

  if (!nodeData?.children || nodeData.children.length === 0) {
    group.selectAll("g").remove();

    const w = svgWidth();
    const h = svgHeight();
    const text = group.selectAll("text").data([0], (d: any) => d);
    text.join(
      (enter: any) => {
        const t = enter.append("text");
        t.classed("no-data", true)
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
      (update: any) => update,
      (leave: any) => leave.remove()
    );
    return;
  }
  group.selectAll("text.no-data").remove();

  const child = join(
    group
      .selectAll("g")
      .data(nodeData.children, (d: any) => d.data.name)
  );

  child
    .filter((d: any) => hasVisibleChildren(d.data))
    .attr("cursor", "pointer")
    .on("click", (_event: any, d: any) => zoomin(d));

  child
    .on("mousemove", (event: MouseEvent, d: any) => {
      const rect = select(event.currentTarget as any).select("rect");
      renderRect(rect, x, y, true);

      tooltip_title.value = d.data.name;
      tooltip_dir_dot.value = d.data.name;
      tooltip_dir_dotdot.value = nodeData.data.name;
      select(tooltip.value).style("opacity", 1.0);

      const container_bounds = container.value?.getBoundingClientRect();
      if (!container_bounds || !content.value || !tooltip.value) return;
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
        .style("top", (mouse_y - bounds.top) + "px");

      const fields: string[] = []
        .concat(props.field_size as any)
        .concat(props.field_color as any);

      const update = (tr: any) => {
        const v1 = tr.select("td.v1");
        const v2 = tr.select("td.v2");
        const v3 = tr.select("td.v3");
        const v4 = tr.select("td.v4");
        v1.text((field: string) => field);
        v2.text((field: string) => number_format(metrics_accumulation[field]?.[nodeData.data.id] || 0));
        v3.text((field: string) => number_format(metrics_accumulation[field]?.[d.data.id] || 0));
        v4.text((field: string) => {
          const value = metrics_accumulation[field]?.[d.data.id] || 0;
          const total = metrics_accumulation[field]?.[nodeData.data.id] || 0;
          if (value > total) {
            const multiple = total > 0 ? (value / total).toFixed(1) : "0.0";
            return `${multiple}x`;
          } else {
            const percent = total > 0 ? Math.floor((100 * value) / total) : 0;
            return `${percent}%`;
          }
        });
        return tr;
      };

      select(tooltip.value)
        .select("tbody")
        .selectAll("tr")
        .data(fields)
        .join(
          (enter: any) => {
            const row = enter.append("tr");
            row.append("td").attr("class", "v1");
            row.append("td").attr("class", "v2");
            row.append("td").attr("class", "v3");
            row.append("td").attr("class", "v4");
            return update(row);
          },
          update,
          (exit: any) => exit.remove()
        );
    })
    .on("mouseleave", (event: MouseEvent, _d: any) => {
      const rect = select(event.currentTarget as any).select("rect");
      renderRect(rect, x, y, false);
      select(tooltip.value).style("opacity", 0.0);
    });
};

const zoomin = function(child: any) {
  emits("zoomin", child.data.name);
};

const zoom = async function(data_old: any, data_new: any) {
  if (!data_old || !data_new) return;
  updateColorDomain(data_new);

  const transition_zoom = transition()
    .duration(500)
    .ease(easeCubicInOut);

  const old_content = select(content.value).select("g");
  const new_content = select(content.value).append("g");

  // Draw the old and new contents from the old content zoom.
  {
    const x = scaleLinear()
      .domain([data_old.x0, data_old.x1])
      .rangeRound([0, svgWidth() - 20]);
    const y = scaleLinear()
      .domain([data_old.y0, data_old.y1])
      .rangeRound([0, svgHeight() - 20]);
    render(old_content, data_old, x, y, true, null);
    render(new_content, data_new, x, y, true, null);
  }

  // Draw the old and new contents from the new content zoom.
  {
    const x = scaleLinear()
      .domain([data_new.x0, data_new.x1])
      .rangeRound([0, svgWidth() - 20]);
    const y = scaleLinear()
      .domain([data_new.y0, data_new.y1])
      .rangeRound([0, svgHeight() - 20]);
    render(old_content, data_old, x, y, true, transition_zoom);
    render(new_content, data_new, x, y, true, transition_zoom);
  }

  // Transition the opacity of the old and new contents.
  {
    old_content
      .attr("opacity", 1)
      .transition(transition_zoom as any)
      .attr("opacity", 0);

    new_content
      .attr("opacity", 0)
      .transition(transition_zoom as any)
      .attr("opacity", 1);
  }

  old_content
    .transition(transition_zoom as any)
    .remove();

  const transition_end = transition_zoom.end();

  computeHistory();
  try {
    await transition_end;
  } catch (e) {}
};

// Build a path-scoped d3.hierarchy and treemap layout: only expands nodes along
// `pathsToExpand` (and their immediate children), avoiding laying out ~566,000
// invisible descendant nodes while producing identical coordinates.
const mytreemap = function(pathsToExpand: string[][] = [(props.path as string[]) || []]) {
  if (!activeTreeIndex) return null;
  const root = activeTreeIndex.root;
  root.area = areaById[root.id] || 0;
  root.color = colorById[root.id] || 0;

  const expandedSet = new Set<TreeNode>([root]);
  for (const p of pathsToExpand) {
    let cur = root;
    for (const name of (p || [])) {
      const child = cur.children?.find(c => c.name === name && !isNodeExcluded(c.id));
      if (!child) break;
      expandedSet.add(child);
      cur = child;
    }
  }

  const mask = getActiveExcludeMask();
  const flags = activeTreeIndex.excludeFlags;

  const data_with_layout = hierarchy(root, (d: TreeNode) => {
    if (!expandedSet.has(d) || !d.children) return null;
    const out: TreeNode[] = [];
    for (let i = 0; i < d.children.length; i++) {
      const c = d.children[i];
      if (mask && flags && (flags[c.id] & mask) !== 0) continue;
      c.area = areaById[c.id] || 0;
      c.color = colorById[c.id] || 0;
      out.push(c);
    }
    return out;
  })
    .each((d: any) => { d.value = d.data.area; })
    .sort((a: any, b: any) => b.value - a.value);

  const map = treemap<TreeNode>()
    .tile(treemapSquarify)
    .size([svgWidth() * 0.8, svgHeight()])
    .round(true);

  const out = map(data_with_layout)
    .sort((a: any, b: any) =>
      (hasVisibleChildren(b.data) ? 1 : 0) - (hasVisibleChildren(a.data) ? 1 : 0)
    );
  return out;
};

// Finds the best index for a given date.
const formatDate = (date: Date) => {
  let best_index = 0;
  let best_diff = Infinity;
  const t = date?.getTime?.() ?? 0;
  for (let i = 0; i < dates.length; ++i) {
    const diff = Math.abs(dates[i].getTime() - t);
    if (diff < best_diff) {
      best_diff = diff;
      best_index = i;
    }
  }
  return best_index;
};

const formatDateInverse = (dateIdx: number) => {
  return dates[dateIdx];
};

const computeHistoryForField = (field: string): number[] => {
  if (!activeTreeIndex || dates.length === 0) return [];
  const dirNode = getTreeNodeFromPath((props.path as string[]) || []);
  if (!dirNode) return new Array(dates.length).fill(0);

  const repo = (props.repositories as string[])?.[0] || repositories_json[0]?.dirname || "chromium";
  const mask = getActiveExcludeMask();
  const cacheKey = `${repo}|${field}|${dirNode.id}|${mask}|${dates.length}`;
  const cached = historySeriesCache.get(cacheKey);
  if (cached) return cached;

  const store = metrics[field];
  if (!store) return new Array(dates.length).fill(0);

  if (mask) {
    ensureExcludeFlags(activeTreeIndex);
  }
  const flags = activeTreeIndex.excludeFlags;
  const numDates = dates.length;
  const diff = new Float64Array(numDates);

  if (store.kind === "compact" && store.rows) {
    const rows = store.rows;
    const startId = dirNode.id;
    const endId = dirNode.subtreeEnd;
    let id = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      id += row[0];
      if (id < startId) continue;
      if (id >= endId) break;
      if (mask && flags && (flags[id] & mask) !== 0) continue;
      let d = 0;
      for (let i = 1; i < row.length; i += 2) {
        d += row[i];
        if (d < numDates) {
          diff[d] += row[i + 1];
        }
      }
    }
  } else if (store.kind === "legacy" && store.legacy) {
    const legacy = store.legacy;
    const walk = (entry: TreeNode) => {
      if (mask && flags && (flags[entry.id] & mask) !== 0) return;
      for (const child of entry.children || []) walk(child);
      const h = legacy[entry.id];
      if (!h) return;
      let prev = 0;
      for (let i = 0; i < h.length; i++) {
        const d = h[i][0];
        const v = h[i][1];
        if (d < numDates) {
          diff[d] += v - prev;
          prev = v;
        }
      }
    };
    walk(dirNode);
  }

  const values = new Array<number>(numDates);
  let sum = 0;
  for (let d = 0; d < numDates; d++) {
    sum += diff[d];
    values[d] = sum;
  }

  if (historySeriesCache.size > 200) {
    historySeriesCache.clear();
  }
  historySeriesCache.set(cacheKey, values);
  return values;
};

const computeHistory = () => {
  if (isSnapshot) {
    history.value = [];
    return;
  }
  let fields: string[] = [];
  const fSize = (props.field_size as string[]) || [];
  const fColor = (props.field_color as string[]) || [];

  if (fSize.length == 0) {
    fields = fColor;
  } else if (fColor.length == 0) {
    fields = fSize;
  } else if (props.history_color && props.history_size) {
    fields = ([] as string[]).concat(fSize).concat(fColor);
  } else if (props.history_color) {
    fields = fColor;
  } else if (props.history_size) {
    fields = fSize;
  } else {
    history.value = [];
    return;
  }

  milestones.value = MILESTONES.filter(m =>
    (props.repositories as string[]).includes(m.repository) &&
    m.metrics.some(metric => fields.includes(metric)));

  const d0 = (props.dates as Date[])?.[0];
  const d1 = (props.dates as Date[])?.[1];

  const out = [];
  for (const field of fields) {
    const values = computeHistoryForField(field);
    out.push({
      label: field,
      extra_label: " = " + format(",d")(values.at(-1) || 0),
      values: values
        .map((d, i) => ({
          x: formatDateInverse(i),
          y: d,
        }))
        .filter(d => d.x >= d0 && d.x <= d1),
    });
  }
  history.value = out;
  sourceNote.value = `Measured on the ${(props.repositories as string[])[0]} source tree at ` +
    `${dates.length} dates, the last on ${dates.at(-1)?.toISOString().slice(0, 10)}.`;
};

async function fetchJson(url: string) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type");
    if (response.ok && contentType && contentType.includes("application/json")) {
      return await response.json();
    }
  } catch (e) {
    console.error(`Error fetching ${url}`, e);
  }
  return null;
}

async function FetchDates() {
  const repo = (props.repositories as string[])?.[0] || repositories_json[0]?.dirname || "chromium";
  if (!datesCache.has(repo)) {
    datesCache.set(repo, (async () => {
      const json = await fetchJson(`/treemap/${repo}/dates.json`);
      return Array.isArray(json) ? json.map((d: string) => new Date(d)) : [];
    })());
  }
  dates = await datesCache.get(repo)!;
}

const buildTreeIndexFromCompact = (compact: any): TreeIndex => {
  let cap = 65536;
  let parentId = new Int32Array(cap);
  parentId[0] = -1;
  let nextId = 0;

  const decode = (node: any, pId: number): TreeNode => {
    const id = nextId++;
    if (id >= cap) {
      cap *= 2;
      const next = new Int32Array(cap);
      next.set(parentId);
      parentId = next;
    }
    parentId[id] = pId;

    if (typeof node === "string") {
      return { name: node, id, subtreeEnd: id + 1, area: 0, color: 0 };
    }
    const len = node.length - 1;
    const children = new Array<TreeNode>(len);
    for (let i = 0; i < len; ++i) {
      children[i] = decode(node[i + 1], id);
    }
    return {
      name: node[0],
      id,
      subtreeEnd: nextId,
      area: 0,
      color: 0,
      children,
    };
  };

  const root = decode(compact, -1);
  return {
    root,
    numNodes: nextId,
    parentId: parentId.subarray(0, nextId),
    excludeFlags: null,
    isCompact: true,
  };
};

const buildTreeIndexFromLegacy = (rawRoot: any): TreeIndex => {
  let maxId = 0;
  const findMax = (n: any) => {
    if (n.id > maxId) maxId = n.id;
    for (const c of n.children || []) findMax(c);
  };
  findMax(rawRoot);
  const numNodes = maxId + 1;
  const parentId = new Int32Array(numNodes).fill(-1);

  const convert = (n: any, pId: number): TreeNode => {
    const id = n.id;
    parentId[id] = pId;
    if (!n.children || n.children.length === 0) {
      return { name: n.name, id, subtreeEnd: id + 1, area: 0, color: 0 };
    }
    const children = n.children.map((c: any) => convert(c, id));
    return { name: n.name, id, subtreeEnd: id + 1, area: 0, color: 0, children };
  };

  const root = convert(rawRoot, -1);
  return {
    root,
    numNodes,
    parentId,
    excludeFlags: null,
    isCompact: false,
  };
};

// Lazily compute the 2-bit exclusion flags (bit 1 = test, bit 2 = third_party)
// only when exclude_test or exclude_third_party is actually checked.
const ensureExcludeFlags = (treeIndex: TreeIndex) => {
  if (treeIndex.excludeFlags) return;
  const flags = new Uint8Array(treeIndex.numNodes);

  const isTestName = (name: string) => {
    const n = name.toLowerCase();
    return n.includes("test") || n.includes("mock") || n.includes("example");
  };

  const walk = (node: TreeNode, isThirdPartyParent: boolean, inhFlags: number) => {
    let f = inhFlags;
    if (node.id > 0 && node.name) {
      if ((f & 1) === 0 && isTestName(node.name)) {
        f |= 1;
      }
      if (isThirdPartyParent && node.name.toLowerCase() !== "blink") {
        f |= 2;
      }
    }
    flags[node.id] = f;
    if (node.children) {
      const tpParent = node.name?.toLowerCase() === "third_party";
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], tpParent, f);
      }
    }
  };

  walk(treeIndex.root, false, 0);
  treeIndex.excludeFlags = flags;
};

const getLatestTreeIndex = (repo: string): Promise<TreeIndex | null> => {
  if (!latestTreeCache.has(repo)) {
    latestTreeCache.set(repo, (async () => {
      const index = await fetchJson(`/treemap/${repo}/file_index.latest.json`);
      return index ? buildTreeIndexFromCompact(index) : null;
    })());
  }
  return latestTreeCache.get(repo)!;
};

const getFullTreeIndex = (repo: string): Promise<TreeIndex | null> => {
  if (!fullTreeCache.has(repo)) {
    fullTreeCache.set(repo, (async () => {
      const compact = await fetchJson(`/treemap/${repo}/file_index.compact.json`);
      if (compact) return buildTreeIndexFromCompact(compact);
      const legacy = await fetchJson(`/treemap/${repo}/file_index.json`);
      return legacy ? buildTreeIndexFromLegacy(legacy) : null;
    })());
  }
  return fullTreeCache.get(repo)!;
};

const getLatestMetric = (repo: string, field: string): Promise<MetricStore | null> => {
  const key = `${repo}/${field}`;
  if (!latestMetricCache.has(key)) {
    latestMetricCache.set(key, (async () => {
      const rows = await fetchJson(`/treemap/${repo}/metrics/${field}.latest.json`);
      return rows ? { kind: "latest", rows } : null;
    })());
  }
  return latestMetricCache.get(key)!;
};

const getFullMetric = (repo: string, field: string, isCompact: boolean): Promise<MetricStore | null> => {
  const key = `${repo}/${field}/${isCompact ? "c" : "l"}`;
  if (!fullMetricCache.has(key)) {
    fullMetricCache.set(key, (async () => {
      if (isCompact) {
        const rows = await fetchJson(`/treemap/${repo}/metrics/${field}.compact.json`);
        return rows ? { kind: "compact", rows } : null;
      }
      const legacy = await fetchJson(`/treemap/${repo}/metrics/${field}.json`);
      return legacy ? { kind: "legacy", legacy } : null;
    })());
  }
  return fullMetricCache.get(key)!;
};

async function FetchMetrics(latest = false) {
  metrics = {};
  const repo = (props.repositories as string[])?.[0] || repositories_json[0]?.dirname || "chromium";
  const fields = Array.from(new Set(
    ([] as string[])
      .concat(props.field_size as any)
      .concat(props.field_color as any)
      .filter(Boolean)
  ));

  if (latest) {
    await Promise.all(fields.map(async field => {
      const store = await getLatestMetric(repo, field);
      if (store) metrics[field] = store;
    }));
    return;
  }

  const isCompact = activeTreeIndex?.isCompact ?? true;
  await Promise.all(fields.map(async field => {
    const store = await getFullMetric(repo, field, isCompact);
    if (store) metrics[field] = store;
  }));
}

function computeMetricsAccumulation() {
  if (!activeTreeIndex) return;
  const numNodes = activeTreeIndex.numNodes;
  const parentId = activeTreeIndex.parentId;
  const mask = getActiveExcludeMask();
  if (mask) {
    ensureExcludeFlags(activeTreeIndex);
  }
  const flags = activeTreeIndex.excludeFlags;

  for (const field in metrics) {
    const store = metrics[field];
    let acc = metrics_accumulation[field];
    if (!acc || acc.length !== numNodes) {
      acc = new Float64Array(numNodes);
      metrics_accumulation[field] = acc;
    } else {
      acc.fill(0);
    }

    if (store.kind === "latest" && store.rows) {
      const rows = store.rows;
      let id = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        id += row[0];
        if (mask && flags && (flags[id] & mask) !== 0) continue;
        acc[id] = row[1];
      }
    } else if (store.kind === "compact" && store.rows) {
      const rows = store.rows;
      let id = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        id += row[0];
        if (mask && flags && (flags[id] & mask) !== 0) continue;
        let d = 0;
        let val = 0;
        for (let i = 1; i < row.length; i += 2) {
          d += row[i];
          if (d > current_date_id) break;
          val += row[i + 1];
        }
        acc[id] = val;
      }
    } else if (store.kind === "legacy" && store.legacy) {
      for (const file_id in store.legacy) {
        const id = Number(file_id);
        if (mask && flags && (flags[id] & mask) !== 0) continue;
        const hist = store.legacy[file_id];
        let val = 0;
        for (let i = 0; i < hist.length; i++) {
          if (hist[i][0] <= current_date_id) val = hist[i][1];
          else break;
        }
        acc[id] = val;
      }
    }

    if (activeTreeIndex.isCompact) {
      // Preorder numbering guarantees parentId[i] < i for all i > 0, so a single
      // reverse pass accumulates the entire tree without recursion.
      for (let i = numNodes - 1; i > 0; i--) {
        const v = acc[i];
        if (v !== 0) {
          acc[parentId[i]] += v;
        }
      }
    } else {
      const accWalk = (entry: TreeNode) => {
        if (!entry.children) return;
        for (const child of entry.children) {
          accWalk(child);
          acc[entry.id] += acc[child.id];
        }
      };
      accWalk(activeTreeIndex.root);
    }

    metrics_accumulation[field] = acc;
  }
}

function computeFetchedData() {
  if (!activeTreeIndex) return;
  const numNodes = activeTreeIndex.numNodes;
  if (areaById.length !== numNodes) {
    areaById = new Float64Array(numNodes);
  } else {
    areaById.fill(0);
  }
  if (colorById.length !== numNodes) {
    colorById = new Float64Array(numNodes);
  } else {
    colorById.fill(0);
  }

  const fSize = (props.field_size as string[]) || [];
  const fColor = (props.field_color as string[]) || [];
  const props_field_size = fSize.length ? fSize : fColor;
  const props_field_color = fColor.length ? fColor : fSize;

  for (const field of props_field_size) {
    const acc = metrics_accumulation[field];
    if (acc) {
      for (let i = 0; i < numNodes; i++) {
        areaById[i] += acc[i];
      }
    }
  }
  for (const field of props_field_color) {
    const acc = metrics_accumulation[field];
    if (acc) {
      for (let i = 0; i < numNodes; i++) {
        colorById[i] += acc[i];
      }
    }
  }
}

// While only the snapshot of the last date is loaded: the history is unknown.
let isSnapshot = false;

const prefetchHistory = (repo: string) => {
  getFullTreeIndex(repo);
  const fields = Array.from(new Set(
    ([] as string[])
      .concat(props.field_size as any)
      .concat(props.field_color as any)
      .filter(Boolean)
  ));
  for (const field of fields) {
    getFullMetric(repo, field, true);
  }
};

async function fetchLatestEntries() {
  const repo = (props.repositories as string[])?.[0] || repositories_json[0]?.dirname || "chromium";
  await FetchDates();
  if (dates.length == 0 || formatDate((props.dates as Date[])[1]) != dates.length - 1) {
    return false;
  }
  const treeIdx = await getLatestTreeIndex(repo);
  if (!treeIdx) {
    return false;
  }
  activeTreeIndex = treeIdx;
  await FetchMetrics(true);
  prefetchHistory(repo);
  isSnapshot = true;
  current_date_id = dates.length - 1;
  computeMetricsAccumulation();
  computeFetchedData();
  return true;
}

async function fetchEntries() {
  const repo = (props.repositories as string[])?.[0] || repositories_json[0]?.dirname || "chromium";
  isSnapshot = false;
  await FetchDates();
  activeTreeIndex = await getFullTreeIndex(repo);
  await FetchMetrics(false);
  current_date_id = formatDate((props.dates as Date[])[1]);
  computeMetricsAccumulation();
  computeFetchedData();
}

const getCurrentDataFromPath = function(pathArr: string[]) {
  let current_data = data.value;
  if (!current_data) return null;
  for (const name of (pathArr || [])) {
    if (!current_data.children) break;
    for (const child of current_data.children) {
      if (child.data.name == name) {
        current_data = child;
        break;
      }
    }
  }
  return current_data;
};

async function refresh(options: { withHistory?: boolean; emitEnd?: boolean; animateTransition?: boolean } = {}) {
  const { withHistory = true, emitEnd = true, animateTransition = true } = options;
  colormapFunc = $color_map[props.colormap as string];

  if (!content.value) return;
  select(content.value).selectAll("*").interrupt();

  const gs = select(content.value).selectAll("g");
  if (gs.size() > 1) {
    gs.filter((_d, i) => i < gs.size() - 1).remove();
  }

  if (!select(content.value).select("g").node()) {
    select(content.value).append("g");
  }

  const nodeData = getCurrentDataFromPath(props.path as string[]);
  if (!nodeData) return;
  updateColorDomain(nodeData);

  const group = select(content.value).select("g");

  const x = scaleLinear()
    .domain([nodeData.x0, nodeData.x1])
    .rangeRound([0, svgWidth() - 20]);
  const y = scaleLinear()
    .domain([nodeData.y0, nodeData.y1])
    .rangeRound([0, svgHeight() - 20]);

  if (animateTransition) {
    const transition_refresh = transition()
      .duration(300)
      .ease(props.animate ? easeCubicInOut : easeLinear);

    render(group, nodeData, x, y, false, transition_refresh);

    try {
      await transition_refresh.end();
    } catch (e) {}
  } else {
    render(group, nodeData, x, y, false, null);
  }

  if (withHistory) {
    computeHistory();
  }

  if (emitEnd) {
    emits("animationend");
  }
}

async function render_refresh(options: { withHistory?: boolean; emitEnd?: boolean; animateTransition?: boolean } = {}) {
  data.value = mytreemap([(props.path as string[]) || []]);
  await refresh(options);
}

const pathChanged = async function(new_path: string[], old_path: string[]) {
  data.value = mytreemap([old_path || [], new_path || []]);
  const data_old = getCurrentDataFromPath(old_path);
  const data_new = getCurrentDataFromPath(new_path);
  await zoom(data_old, data_new);
};

const path_wrapped = computed(() => [...((props.path as string[]) || [])]);

// Repository or metric selection changed: load any new files and refresh.
watch(() => [
  props.repositories,
  props.field_size,
  props.field_color,
], () => lock(async () => {
  metrics_accumulation = {};
  historySeriesCache.clear();
  await fetchEntries();
  await render_refresh();
}));

// Exclusion checkboxes changed: recompute accumulation from cached metrics.
watch(() => [
  props.exclude_test,
  props.exclude_third_party,
], () => lock(async () => {
  if (isSnapshot) {
    await fetchEntries();
  } else {
    computeMetricsAccumulation();
    computeFetchedData();
  }
  await render_refresh();
}));

// Date range changed: if the end date_id changed, re-accumulate; if only the
// start date changed, only re-filter the history chart.
watch(() => props.dates, () => lock(async () => {
  if (isSnapshot) {
    await fetchEntries();
    await render_refresh();
    return;
  }
  const newDateId = formatDate((props.dates as Date[])?.[1]);
  if (newDateId !== current_date_id) {
    current_date_id = newDateId;
    computeMetricsAccumulation();
    computeFetchedData();
    await render_refresh();
  } else {
    computeHistory();
    emits("animationend");
  }
}));

// History chart checkboxes only affect the LineChart series.
watch(() => [
  props.history_color,
  props.history_size,
], () => lock(async () => {
  computeHistory();
}));

// Colormap settings only affect tile colors.
watch(() => [
  props.colormap,
  props.colormapMin,
  props.colormapMax,
], () => lock(() => refresh({ withHistory: false, emitEnd: false })));

watch(path_wrapped, (new_path, old_path) => lock(() => pathChanged(new_path, old_path)));

let resizeObserver: ResizeObserver | null = null;
let lastWidth = 0;
let lastHeight = 0;

onMounted(() => lock(async () => {
  const renderedSnapshot = await fetchLatestEntries();
  if (renderedSnapshot) {
    await render_refresh({ withHistory: false, emitEnd: false });
  }
  const snapshotDateId = current_date_id;
  await fetchEntries();
  if (renderedSnapshot && current_date_id === snapshotDateId) {
    // The treemap tiles are already showing the latest snapshot; update the
    // backing node ids for tooltips/zooming without running a second transition,
    // and populate the history chart.
    await render_refresh({ withHistory: true, emitEnd: true, animateTransition: false });
  } else {
    await render_refresh();
  }
  if (container.value) {
    lastWidth = svgWidth();
    lastHeight = svgHeight();
    resizeObserver = new ResizeObserver(() => {
      const w = svgWidth();
      const h = svgHeight();
      if (w === lastWidth && h === lastHeight) return;
      lastWidth = w;
      lastHeight = h;
      lock(() => render_refresh({ withHistory: false, emitEnd: false, animateTransition: false }));
    });
    resizeObserver.observe(container.value);
  }
}));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

</script>

<style lang="scss">
.source-note {
  color: var(--muted);
  font-size: 0.75rem;
  font-style: italic;
  margin-top: 0.25rem;
  text-align: right;
}


.treemap-tooltip {
  backdrop-filter: blur(5px);
  position: absolute;
  pointer-events: none;
  color: var(--ink);
  z-index: 1;
  opacity: 0;
  box-shadow:
  0 2px 10px rgba(0, 0, 0, 0.5),
  inset 0 2px 10px color-mix(in srgb, var(--surface) 90%, transparent);

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
      background-color:color-mix(in srgb, var(--surface) 35%, transparent);
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
  min-width: 0;
  padding: 10px;
}

@container (width < 800px) {
  .split-view {
    flex-direction: column;
    height: 150vh;
  }
}


</style>
