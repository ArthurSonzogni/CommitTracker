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
            <LineChart v-if="history?.length" :data="history" :milestones="milestones" :animate="false" />
            <p v-if="history?.length" class="source-note">{{ sourceNote }}</p>
          </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import {easeLinear} from "d3-ease";
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
import { callTreemapWorker } from '~/utils/treemapWorkerClient'
import type { PrunedTreemapNode } from '~/utils/treemap.worker'

const { $color_map } = useNuxtApp();

const container = ref<HTMLElement|null>(null);
const content = ref<HTMLElement|null>(null);
const tooltip = ref<HTMLElement|null>(null);
const tooltip_title = ref("Tooltip");
const tooltip_dir_dot = ref(".");
const tooltip_dir_dotdot = ref("..");

let dates: Date[] = [];
let lastPrunedRoot: PrunedTreemapNode | null = null;
let lastHistorySeries: Record<string, number[]> = {};
const data = shallowRef<any>(null);

let current_date_id = -1;
let isSnapshot = false;

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

const activeRepo = () =>
  (props.repositories as string[])?.[0] || repositories_json[0]?.dirname || "chromium";

const getActiveExcludeMask = () =>
  (props.exclude_test ? 1 : 0) | (props.exclude_third_party ? 2 : 0);

const getHistoryFields = (): string[] => {
  const fSize = (props.field_size as string[]) || [];
  const fColor = (props.field_color as string[]) || [];
  if (fSize.length === 0) return Array.from(new Set(fColor));
  if (fColor.length === 0) return Array.from(new Set(fSize));
  if (props.history_color && props.history_size) {
    return Array.from(new Set([...fSize, ...fColor]));
  }
  if (props.history_color) return Array.from(new Set(fColor));
  if (props.history_size) return Array.from(new Set(fSize));
  return [];
};

async function download(kind: string) {
  const res = await callTreemapWorker({
    type: "download",
    repo: String(activeRepo()),
    kind,
    fieldSize: Array.from((props.field_size as string[]) || []),
    fieldColor: Array.from((props.field_color as string[]) || []),
    path: Array.from((props.path as string[]) || []),
    excludeMask: getActiveExcludeMask(),
    dateEndMs: ((props.dates as Date[])?.[1] ?? new Date()).getTime(),
  });
  if (res) {
    browserDownload(res.content, res.filename, res.contentType);
  }
}

let lastWidth = 0;
let lastHeight = 0;
const svgWidth = () => lastWidth || (lastWidth = container.value?.clientWidth || 0);
const svgHeight = () => lastHeight || (lastHeight = container.value?.clientHeight || 0);

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
        fs = Math.max(6, Math.round(Math.min(20, Math.sqrt(percent) * 30)));
      }
    }

    const fit = (lbl: string, charScale: number) => {
      if (fs <= 0) return "";
      const availWidth = w - 16;
      if (availWidth <= 0) return "";
      const max_chars = Math.floor(availWidth / (fs * charScale * 0.6));
      if (lbl.length <= max_chars) return lbl;
      return max_chars >= 4 ? lbl.slice(0, max_chars - 1) + "…" : "";
    };

    const label1 = fs > 0 ? fit(d.data.name, 1) : "";
    let label2 = "";
    if (fs > 0) {
      const raw2 = color <= size
        ? `${number_format(color)}/${number_format(size)} (${percent_format(ratio)})`
        : `${number_format(color)}/${number_format(size)} (${ratio.toFixed(1)}x)`;
      label2 = fit(raw2, 0.75);
    }

    d._x = x0;
    d._y = y0;
    d._w = w;
    d._h = h;
    d._fill = interpolateRgb("gray", c2)(0.9);
    d._hoverFill = interpolateRgb("gray", c2)(0.5);
    d._isDark = isDark;
    d._fs = fs;
    d._fs2 = fs > 0 ? Math.max(6, Math.round(fs * 0.75)) : 0;
    d._label1 = label1;
    d._label2 = label2;
    d._clickable = !!d.data.clickable;
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
    d._fs2 = 0;
    d._label1 = "";
    d._label2 = "";
    d._clickable = !!d.data.clickable;
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
        t1.setAttribute("x", "8");
        this.appendChild(t1);
      }
      setAttrIfChanged(t1, "font-size", String(d._fs));
      setAttrIfChanged(t1, "y", String(Math.round(5 + d._fs * 1.2)));
      if (t1.textContent !== d._label1) t1.textContent = d._label1;
    } else if (t1) {
      t1.remove();
    }

    let t2 = this.querySelector(":scope > text.text-2") as SVGTextElement | null;
    if (d._label2) {
      if (!t2) {
        t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t2.setAttribute("class", "text-2");
        t2.setAttribute("x", "8");
        this.appendChild(t2);
      }
      setAttrIfChanged(t2, "font-size", String(d._fs2));
      setAttrIfChanged(t2, "y", String(Math.round(5 + d._fs * 2.4)));
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

const render = function(group: any, nodeData: any, x: any, y: any, _is_zoom = false, trans: any): number {
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
          .attr("dominant-baseline", "central")
          .attr("x", w / 2)
          .attr("y", h / 2)
          .style("font-size", "20px")
          .style("font-weight", "bold")
          .style("fill", "var(--muted)")
          .text("Zero data recorded at this directory and date");
        return t;
      },
      (update: any) => update,
      (leave: any) => leave.remove()
    );
    return 0;
  }
  group.selectAll("text.no-data").remove();

  const visibleChildren = prepareTiles(nodeData.children, nodeData, x, y);
  let animatedCount = 0;

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
          .style("fill", (d: any) => d._fill);
        syncTileTexts(g);
        return g;
      },
      (update: any) => {
        update.each(function(this: SVGGElement, d: any) {
          setAttrIfChanged(this, "class", tileClass(d));
        });
        syncTileTexts(update);
        if (trans) {
          const changed = update.filter(function(this: SVGGElement, d: any) {
            const tf = `translate(${d._x}, ${d._y})`;
            if (this.getAttribute("transform") !== tf) return true;
            const r = this.querySelector(":scope > rect") as SVGRectElement | null;
            if (!r) return true;
            return (
              r.getAttribute("width") !== String(d._w) ||
              r.getAttribute("height") !== String(d._h) ||
              r.style.fill !== d._fill
            );
          });
          animatedCount = changed.size();
          if (animatedCount > 0) {
            const g = changed.transition(trans);
            g.attr("transform", (d: any) => `translate(${d._x}, ${d._y})`);
            g.select("rect")
              .attr("width", (d: any) => d._w)
              .attr("height", (d: any) => d._h)
              .style("fill", (d: any) => d._fill);
          }
        } else {
          update.each(function(this: SVGGElement, d: any) {
            setAttrIfChanged(this, "transform", `translate(${d._x}, ${d._y})`);
            const r = this.querySelector(":scope > rect") as SVGRectElement | null;
            if (r) {
              setAttrIfChanged(r, "width", String(d._w));
              setAttrIfChanged(r, "height", String(d._h));
              if (r.style.fill !== d._fill) r.style.fill = d._fill;
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
      const rectEl = (event.currentTarget as SVGGElement).querySelector(":scope > rect") as SVGRectElement | null;
      if (rectEl) rectEl.style.fill = d._hoverFill;

      tooltip_title.value = d.data.name;
      tooltip_dir_dot.value = d.data.name;
      tooltip_dir_dotdot.value = nodeData.data.name;

      const fields: string[] = []
        .concat(props.field_size as any)
        .concat(props.field_color as any);

      const updateRow = (tr: any) => {
        tr.select("td.v1").text((field: string) => field);
        tr.select("td.v2").text((field: string) => number_format(nodeData.data.metrics?.[field] || 0));
        tr.select("td.v3").text((field: string) => number_format(d.data.metrics?.[field] || 0));
        tr.select("td.v4").text((field: string) => {
          const value = d.data.metrics?.[field] || 0;
          const total = nodeData.data.metrics?.[field] || 0;
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
      const rectEl = (event.currentTarget as SVGGElement).querySelector(":scope > rect") as SVGRectElement | null;
      if (rectEl) rectEl.style.fill = d._fill;
      if (tooltip.value) tooltip.value.style.opacity = "0";
    });

  return animatedCount;
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

const zoom = async function(data_old: any, data_new: any, historySeries: Record<string, number[]>) {
  if (!data_old || !data_new || !content.value) return;
  const w = Math.max(0, svgWidth() - 20);
  const h = Math.max(0, svgHeight() - 20);
  updateColorDomain(data_new);

  cancelLayerAnimations();
  select(content.value).selectAll("*").interrupt();
  if (tooltip.value) tooltip.value.style.opacity = "0";

  const svgs = select(content.value).selectAll(":scope > svg");
  if (svgs.size() > 1) {
    svgs.filter((_d, i) => i < svgs.size() - 1).remove();
  }

  const old_content = select(content.value).select(":scope > svg");
  const newNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  newNode.setAttribute("class", "treemap-layer");

  const xNew = scaleLinear()
    .domain([data_new.x0, data_new.x1])
    .rangeRound([0, w]);
  const yNew = scaleLinear()
    .domain([data_new.y0, data_new.y1])
    .rangeRound([0, h]);
  render(select(newNode), data_new, xNew, yNew, true, null);
  content.value.appendChild(newNode);

  const oldNode = old_content.node() as SVGSVGElement | null;
  const oldW = data_old.x1 - data_old.x0;
  const oldH = data_old.y1 - data_old.y0;
  const newW = data_new.x1 - data_new.x0;
  const newH = data_new.y1 - data_new.y0;
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (!reducedMotion && oldNode && w > 0 && h > 0 && oldW > 0 && oldH > 0 && newW > 0 && newH > 0) {
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

    applyHistorySeries(historySeries);
    try {
      await Promise.all([animOld.finished, animNew.finished]);
    } catch (e) {}
    animNew.cancel();
    old_content.remove();
  } else {
    old_content.remove();
    applyHistorySeries(historySeries);
  }
};

const mytreemap = function(prunedRoot: PrunedTreemapNode | null) {
  if (!prunedRoot) return null;
  const w = svgWidth();
  const h = svgHeight();

  const data_with_layout = hierarchy(prunedRoot)
    .each((d: any) => { d.value = d.data.area; })
    .sort((a: any, b: any) => b.value - a.value);

  const map = treemap<PrunedTreemapNode>()
    .tile(treemapSquarify)
    .size([w * 0.8, h])
    .round(true);

  return map(data_with_layout)
    .sort((a: any, b: any) =>
      (b.data.clickable ? 1 : 0) - (a.data.clickable ? 1 : 0)
    );
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

const applyHistorySeries = (seriesMap: Record<string, number[]>) => {
  lastHistorySeries = seriesMap;
  if (isSnapshot) {
    history.value = [];
    return;
  }
  const fields = getHistoryFields();
  if (fields.length === 0) {
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
    const values = seriesMap[field] || [];
    const filtered: { x: Date; y: number }[] = [];
    for (let i = 0; i < values.length && i < dates.length; i++) {
      const xDate = dates[i];
      if ((!d0 || xDate >= d0) && (!d1 || xDate <= d1)) {
        filtered.push({ x: xDate, y: values[i] });
      }
    }
    out.push({
      label: field,
      extra_label: " = " + format(",d")(values.at(-1) || 0),
      values: filtered,
    });
  }
  history.value = out;
  if (dates.length > 0) {
    sourceNote.value = `Measured on the ${activeRepo()} source tree at ` +
      `${dates.length} dates, the last on ${dates.at(-1)?.toISOString().slice(0, 10)}.`;
  }
};

async function queryAndLoad(mode: "latest" | "full", pathsToExpand: string[][] | null) {
  const res = await callTreemapWorker({
    type: "query",
    repo: String(activeRepo()),
    mode,
    fieldColor: Array.from((props.field_color as string[]) || []),
    fieldSize: Array.from((props.field_size as string[]) || []),
    historyFields: mode === "full" ? Array.from(getHistoryFields()) : [],
    dateEndMs: ((props.dates as Date[])?.[1] ?? new Date()).getTime(),
    excludeMask: getActiveExcludeMask(),
    pathsToExpand: pathsToExpand ? pathsToExpand.map(p => Array.from(p || [])) : null,
    path: Array.from((props.path as string[]) || []),
  });
  if (!res?.ok) return null;
  if (res.datesMs && res.datesMs.length !== dates.length) {
    dates = res.datesMs.map((ms: number) => new Date(ms));
  }
  current_date_id = res.dateId;
  isSnapshot = mode === "latest";
  if (res.root) {
    lastPrunedRoot = res.root;
  }
  return res;
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
  const {
    withHistory = true,
    emitEnd = true,
    animateTransition = Boolean(props.animate),
  } = options;
  colormapFunc = $color_map[props.colormap as string];

  if (!content.value) return;
  const w = Math.max(0, svgWidth() - 20);
  const h = Math.max(0, svgHeight() - 20);
  cancelLayerAnimations();
  select(content.value).selectAll("*").interrupt();

  const svgs = select(content.value).selectAll(":scope > svg");
  if (svgs.size() > 1) {
    svgs.filter((_d, i) => i < svgs.size() - 1).remove();
  }

  let svgNode = content.value.querySelector(":scope > svg") as SVGSVGElement | null;
  const isInitialInsert = !svgNode;
  if (!svgNode) {
    svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgNode.setAttribute("class", "treemap-layer");
  }

  const nodeData = getCurrentDataFromPath(props.path as string[]);
  if (!nodeData) return;
  updateColorDomain(nodeData);

  const group = select(svgNode);

  const x = scaleLinear()
    .domain([nodeData.x0, nodeData.x1])
    .rangeRound([0, w]);
  const y = scaleLinear()
    .domain([nodeData.y0, nodeData.y1])
    .rangeRound([0, h]);

  if (animateTransition && !isInitialInsert) {
    const transition_refresh = transition()
      .duration(200)
      .ease(easeLinear);

    const animatedCount = render(group, nodeData, x, y, false, transition_refresh);

    if (animatedCount > 0) {
      try {
        await transition_refresh.end();
      } catch (e) {}
    } else {
      await new Promise(requestAnimationFrame);
    }
  } else {
    render(group, nodeData, x, y, false, null);
    if (isInitialInsert) {
      content.value.appendChild(svgNode);
    }
  }

  if (withHistory) {
    applyHistorySeries(lastHistorySeries);
  }

  if (emitEnd) {
    emits("animationend");
  }
}

async function render_refresh(options: { withHistory?: boolean; emitEnd?: boolean; animateTransition?: boolean } = {}) {
  data.value = mytreemap(lastPrunedRoot);
  await refresh(options);
}

const pathChanged = async function(new_path: string[], old_path: string[]) {
  const mode = isSnapshot ? "latest" : "full";
  const res = await queryAndLoad(mode, [old_path || [], new_path || []]);
  if (!res?.root) return;
  data.value = mytreemap(res.root);
  const data_old = getCurrentDataFromPath(old_path);
  const data_new = getCurrentDataFromPath(new_path);
  await zoom(data_old, data_new, res.historySeries || {});
};

const path_wrapped = computed(() => [...((props.path as string[]) || [])]);

// Repository or metric selection changed: load any new files and refresh.
watch(() => [
  props.repositories,
  props.field_size,
  props.field_color,
], () => lock(async () => {
  dates = [];
  const res = await queryAndLoad("full", [(props.path as string[]) || []]);
  if (res) {
    lastHistorySeries = res.historySeries || {};
    await render_refresh({ animateTransition: false });
  }
}));

// Exclusion checkboxes changed: recompute accumulation in worker.
watch(() => [
  props.exclude_test,
  props.exclude_third_party,
], () => lock(async () => {
  const res = await queryAndLoad("full", [(props.path as string[]) || []]);
  if (res) {
    lastHistorySeries = res.historySeries || {};
    await render_refresh({ animateTransition: false });
  }
}));

// Date range changed: if the end date_id changed, re-accumulate in worker; if
// only the start date changed, re-slice the cached history series locally.
watch(() => props.dates, () => lock(async () => {
  if (!isSnapshot && dates.length > 0 && formatDate((props.dates as Date[])?.[1]) === current_date_id) {
    applyHistorySeries(lastHistorySeries);
    emits("animationend");
    return;
  }
  const res = await queryAndLoad("full", [(props.path as string[]) || []]);
  if (res) {
    lastHistorySeries = res.historySeries || {};
    await render_refresh();
  }
}));

// History chart checkboxes only affect the LineChart series.
watch(() => [
  props.history_color,
  props.history_size,
], () => lock(async () => {
  if (isSnapshot) return;
  const needed = getHistoryFields();
  if (needed.every(f => lastHistorySeries[f])) {
    applyHistorySeries(lastHistorySeries);
    return;
  }
  const res = await queryAndLoad("full", null);
  if (res) {
    applyHistorySeries(res.historySeries || {});
  }
}));

// Colormap settings only affect tile colors.
watch(() => [
  props.colormap,
  props.colormapMin,
  props.colormapMax,
], () => lock(() => refresh({ withHistory: false, emitEnd: false, animateTransition: false })));

watch(path_wrapped, (new_path, old_path) => lock(() => pathChanged(new_path, old_path)));

let resizeObserver: ResizeObserver | null = null;
let unmounted = false;

onMounted(() => {
  if (container.value) {
    lastWidth = container.value.clientWidth || 0;
    lastHeight = container.value.clientHeight || 0;
    resizeObserver = new ResizeObserver(() => {
      const w = container.value?.clientWidth || 0;
      const h = container.value?.clientHeight || 0;
      if (w <= 0 || h <= 0 || (w === lastWidth && h === lastHeight)) return;
      lastWidth = w;
      lastHeight = h;
      lock(() => render_refresh({ withHistory: false, emitEnd: false, animateTransition: false }));
    });
    resizeObserver.observe(container.value);
  }

  lock(async () => {
    const snapRes = await queryAndLoad("latest", [(props.path as string[]) || []]);
    if (unmounted) return;
    if (snapRes?.root) {
      await render_refresh({ withHistory: false, emitEnd: false, animateTransition: false });
    }
    const snapshotDateId = current_date_id;
    const fullRes = await queryAndLoad("full", [(props.path as string[]) || []]);
    if (unmounted || !fullRes) return;
    lastHistorySeries = fullRes.historySeries || {};
    if (snapRes?.root && current_date_id === snapshotDateId) {
      await render_refresh({ withHistory: true, emitEnd: true, animateTransition: false });
    } else {
      await render_refresh({ animateTransition: false });
    }
  });
});

onBeforeUnmount(() => {
  unmounted = true;
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
  dominant-baseline: central;
  fill: #000;
  pointer-events: none;
  text-anchor: start;
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
