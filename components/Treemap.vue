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
            <div ref="content" class="treemap-stage" />
          </div>

          <div>
            <LineChart v-if="history?.length" :data="history" :milestones="milestones" :animate="!props.animate" />
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

const setAttrIfChanged = (el: Element, name: string, value: string) => {
  if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
};

const prepareTiles = function(children: any[], parentNode: any, x: any, y: any) {
  const colorScale = scaleLinear()
    .domain(color_domain.value)
    .range([0, 1]);
  const total_size = parentNode.data.area;
  const visible: any[] = [];

  for (let i = 0; i < children.length; i++) {
    const d = children[i];
    const x0 = x(d.x0);
    const y0 = y(d.y0);
    const w = x(d.x1) - x0;
    const h = y(d.y1) - y0;
    if (w < 2 || h < 2) continue;

    const color = d.data.color;
    const size = d.data.area;
    const ratio = size > 0 ? color / size : 0;
    const c2 = colormapFunc(colorScale(ratio));
    const isDark = hsl(c2).l < 0.5;

    let fs = 0;
    if (total_size > 0) {
      const percent = (size / total_size) * 10;
      if (percent >= 0.02) {
        fs = Math.min(20, Math.sqrt(percent) * 30);
      }
    }

    const fit = (lbl: string, index: number) => {
      if (fs <= 0) return "";
      const availWidth = w - 16;
      if (availWidth <= 0) return "";
      const max_chars = Math.floor(availWidth / (fs * (4 - index) * 0.25 * 0.6));
      if (lbl.length <= max_chars) return lbl;
      return max_chars >= 4 ? lbl.slice(0, max_chars - 1) + "…" : "";
    };

    const label1 = fs > 0 ? fit(d.data.name, 0) : "";
    let label2 = "";
    if (fs > 0) {
      const raw2 = color <= size
        ? `${number_format(color)}/${number_format(size)} (${percent_format(ratio)})`
        : `${number_format(color)}/${number_format(size)} (${ratio.toFixed(1)}x)`;
      label2 = fit(raw2, 1);
    }

    d._x = x0;
    d._y = y0;
    d._w = w;
    d._h = h;
    d._fill = interpolateRgb("gray", c2)(0.9);
    d._hoverFill = interpolateRgb("gray", c2)(0.5);
    d._isDark = isDark;
    d._fs = fs;
    d._label1 = label1;
    d._label2 = label2;
    d._clickable = hasVisibleChildren(d.data);
    visible.push(d);
  }

  if (visible.length === 0 && children.length > 0) {
    const d = children[0];
    d._x = x(d.x0);
    d._y = y(d.y0);
    d._w = Math.max(1, x(d.x1) - d._x);
    d._h = Math.max(1, y(d.y1) - d._y);
    const ratio = d.data.area > 0 ? d.data.color / d.data.area : 0;
    const c2 = colormapFunc(colorScale(ratio));
    d._fill = interpolateRgb("gray", c2)(0.9);
    d._hoverFill = interpolateRgb("gray", c2)(0.5);
    d._isDark = hsl(c2).l < 0.5;
    d._fs = 0;
    d._label1 = "";
    d._label2 = "";
    d._clickable = hasVisibleChildren(d.data);
    visible.push(d);
  }

  return visible;
};

const syncTileTexts = function(gSelection: any) {
  gSelection.each(function(this: SVGGElement, d: any) {
    let t1 = this.querySelector(":scope > text.text-1") as SVGTextElement | null;
    if (d._label1) {
      if (!t1) {
        t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t1.setAttribute("class", "text-1");
        t1.setAttribute("text-anchor", "start");
        t1.setAttribute("alignment-baseline", "middle");
        t1.setAttribute("x", "8");
        this.appendChild(t1);
      }
      setAttrIfChanged(t1, "font-size", String(+d._fs.toFixed(1)));
      setAttrIfChanged(t1, "y", String(+(5 + d._fs * 1.2).toFixed(1)));
      if (t1.textContent !== d._label1) t1.textContent = d._label1;
    } else if (t1) {
      t1.remove();
    }

    let t2 = this.querySelector(":scope > text.text-2") as SVGTextElement | null;
    if (d._label2) {
      if (!t2) {
        t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t2.setAttribute("class", "text-2");
        t2.setAttribute("text-anchor", "start");
        t2.setAttribute("alignment-baseline", "middle");
        t2.setAttribute("x", "8");
        this.appendChild(t2);
      }
      setAttrIfChanged(t2, "font-size", String(+(d._fs * 0.75).toFixed(1)));
      setAttrIfChanged(t2, "y", String(+(5 + d._fs * 2.4).toFixed(1)));
      if (t2.textContent !== d._label2) t2.textContent = d._label2;
    } else if (t2) {
      t2.remove();
    }
  });
};

const tileClass = (d: any) =>
  "treemap-tile" +
  (d._clickable ? " is-clickable" : "") +
  (d._isDark ? " is-dark-tile" : "");

let hoveredContainerRect: DOMRect | null = null;
let hoveredTooltipWidth = 0;
let hoveredTooltipHeight = 0;

const render = function(group: any, nodeData: any, x: any, y: any, _is_zoom = false, trans: any) {
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

  const visibleChildren = prepareTiles(nodeData.children, nodeData, x, y);

  const child = group
    .selectAll(":scope > g")
    .data(visibleChildren, (d: any) => d.data.name)
    .join(
      (enter: any) => {
        const g = enter.append("g")
          .attr("class", tileClass)
          .attr("transform", (d: any) => `translate(${d._x}, ${d._y})`);
        g.append("rect")
          .attr("rx", 10)
          .attr("width", (d: any) => d._w)
          .attr("height", (d: any) => d._h)
          .attr("fill", (d: any) => d._fill);
        syncTileTexts(g);
        return g;
      },
      (update: any) => {
        update.each(function(this: SVGGElement, d: any) {
          setAttrIfChanged(this, "class", tileClass(d));
        });
        syncTileTexts(update);
        if (trans) {
          const g = update.transition(trans);
          g.attr("transform", (d: any) => `translate(${d._x}, ${d._y})`);
          g.select("rect")
            .attr("width", (d: any) => d._w)
            .attr("height", (d: any) => d._h)
            .attr("fill", (d: any) => d._fill);
        } else {
          update.each(function(this: SVGGElement, d: any) {
            setAttrIfChanged(this, "transform", `translate(${d._x}, ${d._y})`);
            const r = this.querySelector(":scope > rect");
            if (r) {
              setAttrIfChanged(r, "width", String(d._w));
              setAttrIfChanged(r, "height", String(d._h));
              setAttrIfChanged(r, "fill", d._fill);
            }
          });
        }
        return update;
      },
      (leave: any) => leave.remove()
    );

  child
    .on("click", (_event: MouseEvent, d: any) => {
      if (d._clickable) zoomin(d);
    })
    .on("mouseenter", (event: MouseEvent, d: any) => {
      hoveredContainerRect = container.value?.getBoundingClientRect() ?? null;
      const rectEl = (event.currentTarget as SVGGElement).querySelector(":scope > rect");
      if (rectEl) rectEl.setAttribute("fill", d._hoverFill);

      tooltip_title.value = d.data.name;
      tooltip_dir_dot.value = d.data.name;
      tooltip_dir_dotdot.value = nodeData.data.name;

      const fields: string[] = []
        .concat(props.field_size as any)
        .concat(props.field_color as any);

      const updateRow = (tr: any) => {
        tr.select("td.v1").text((field: string) => field);
        tr.select("td.v2").text((field: string) => number_format(metrics_accumulation[field]?.[nodeData.data.id] || 0));
        tr.select("td.v3").text((field: string) => number_format(metrics_accumulation[field]?.[d.data.id] || 0));
        tr.select("td.v4").text((field: string) => {
          const value = metrics_accumulation[field]?.[d.data.id] || 0;
          const total = metrics_accumulation[field]?.[nodeData.data.id] || 0;
          if (value > total) {
            const multiple = total > 0 ? (value / total).toFixed(1) : "0.0";
            return `${multiple}x`;
          }
          const percent = total > 0 ? Math.floor((100 * value) / total) : 0;
          return `${percent}%`;
        });
        return tr;
      };

      if (tooltip.value) {
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
              return updateRow(row);
            },
            updateRow,
            (exit: any) => exit.remove()
          );
        tooltip.value.style.opacity = "1";
        hoveredTooltipWidth = tooltip.value.offsetWidth;
        hoveredTooltipHeight = tooltip.value.offsetHeight;
      }
    })
    .on("mousemove", (event: MouseEvent) => {
      if (!hoveredContainerRect || !tooltip.value) return;
      const pad = 10;
      const max_right = hoveredContainerRect.right - pad - hoveredTooltipWidth;
      const max_bottom = hoveredContainerRect.bottom - pad - hoveredTooltipHeight;
      let mouse_x = Math.min(event.clientX + 20, max_right);
      let mouse_y = Math.min(event.clientY + 20, max_bottom);

      if (mouse_x === max_right && mouse_y === max_bottom) {
        mouse_x = event.clientX - hoveredTooltipWidth - 20;
        mouse_y = event.clientY - hoveredTooltipHeight - 20;
      }

      const tx = Math.max(0, mouse_x - hoveredContainerRect.left);
      const ty = Math.max(0, mouse_y - hoveredContainerRect.top);
      tooltip.value.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    })
    .on("mouseleave", (event: MouseEvent, d: any) => {
      const rectEl = (event.currentTarget as SVGGElement).querySelector(":scope > rect");
      if (rectEl) rectEl.setAttribute("fill", d._fill);
      if (tooltip.value) tooltip.value.style.opacity = "0";
    });
};

const zoomin = function(child: any) {
  emits("zoomin", child.data.name);
};

const cancelLayerAnimations = () => {
  if (!content.value) return;
  for (const svgEl of content.value.querySelectorAll(":scope > svg")) {
    svgEl.getAnimations?.().forEach(a => a.cancel());
  }
};

const zoom = async function(data_old: any, data_new: any) {
  if (!data_old || !data_new || !content.value) return;
  updateColorDomain(data_new);

  cancelLayerAnimations();
  select(content.value).selectAll("*").interrupt();
  if (tooltip.value) tooltip.value.style.opacity = "0";

  const svgs = select(content.value).selectAll(":scope > svg");
  if (svgs.size() > 1) {
    svgs.filter((_d, i) => i < svgs.size() - 1).remove();
  }

  const old_content = select(content.value).select(":scope > svg");
  const new_content = select(content.value)
    .append("svg")
    .attr("class", "treemap-layer");

  const w = Math.max(0, svgWidth() - 20);
  const h = Math.max(0, svgHeight() - 20);
  const xNew = scaleLinear()
    .domain([data_new.x0, data_new.x1])
    .rangeRound([0, w]);
  const yNew = scaleLinear()
    .domain([data_new.y0, data_new.y1])
    .rangeRound([0, h]);
  render(new_content, data_new, xNew, yNew, true, null);

  const oldNode = old_content.node() as SVGSVGElement | null;
  const newNode = new_content.node() as SVGSVGElement | null;
  const oldW = data_old.x1 - data_old.x0;
  const oldH = data_old.y1 - data_old.y0;
  const newW = data_new.x1 - data_new.x0;
  const newH = data_new.y1 - data_new.y0;
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (!reducedMotion && oldNode && newNode && w > 0 && h > 0 && oldW > 0 && oldH > 0 && newW > 0 && newH > 0) {
    const sxNew = newW / oldW;
    const syNew = newH / oldH;
    const txNew = ((data_new.x0 - data_old.x0) / oldW) * w;
    const tyNew = ((data_new.y0 - data_old.y0) / oldH) * h;

    const sxOld = oldW / newW;
    const syOld = oldH / newH;
    const txOld = ((data_old.x0 - data_new.x0) / newW) * w;
    const tyOld = ((data_old.y0 - data_new.y0) / newH) * h;

    const opts: KeyframeAnimationOptions = {
      duration: 500,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      fill: "forwards",
    };
    const animOld = oldNode.animate([
      { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
      { transform: `translate(${txOld}px, ${tyOld}px) scale(${sxOld}, ${syOld})`, opacity: 0 },
    ], opts);
    const animNew = newNode.animate([
      { transform: `translate(${txNew}px, ${tyNew}px) scale(${sxNew}, ${syNew})`, opacity: 0 },
      { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1 },
    ], opts);

    computeHistory();
    try {
      await Promise.all([animOld.finished, animNew.finished]);
    } catch (e) {}
    animNew.cancel();
    old_content.remove();
  } else {
    old_content.remove();
    computeHistory();
  }
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
      if (c.area <= 0 && !expandedSet.has(c)) continue;
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
  cancelLayerAnimations();
  select(content.value).selectAll("*").interrupt();

  const svgs = select(content.value).selectAll(":scope > svg");
  if (svgs.size() > 1) {
    svgs.filter((_d, i) => i < svgs.size() - 1).remove();
  }

  if (!select(content.value).select(":scope > svg").node()) {
    select(content.value).append("svg").attr("class", "treemap-layer");
  }

  const nodeData = getCurrentDataFromPath(props.path as string[]);
  if (!nodeData) return;
  updateColorDomain(nodeData);

  const group = select(content.value).select(":scope > svg");

  const x = scaleLinear()
    .domain([nodeData.x0, nodeData.x1])
    .rangeRound([0, svgWidth() - 20]);
  const y = scaleLinear()
    .domain([nodeData.y0, nodeData.y1])
    .rangeRound([0, svgHeight() - 20]);

  if (animateTransition) {
    const transition_refresh = transition()
      .duration(300)
      .ease(props.animate ? easeLinear : easeCubicInOut);

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
    await render_refresh({ withHistory: false, emitEnd: false, animateTransition: false });
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


.treemap-container {
  position: relative;
}

.treemap-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.treemap-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  will-change: transform, opacity;
}

.treemap-tile rect {
  stroke: var(--surface);
  stroke-width: 5px;
  fill-opacity: 0.9;
}

.treemap-tile.is-clickable {
  cursor: pointer;
}

.treemap-tile text {
  fill: #000;
  pointer-events: none;
  user-select: none;
}

.treemap-tile.is-dark-tile text {
  fill: #fff;
}

.treemap-tile text.text-1 {
  font-weight: bold;
  opacity: 0.5;
}

.treemap-tile text.text-2 {
  font-weight: normal;
  opacity: 0.3;
}

.treemap-tooltip {
  backdrop-filter: blur(5px);
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  color: var(--ink);
  z-index: 1;
  opacity: 0;
  will-change: transform, opacity;
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

@media (max-width: 800px) {
  .split-view {
    flex-direction: column;
    height: 150vh;
  }
}


</style>
