<template>
  <div class="container" ref="container" align="center">
    <!-- Placeholder, until the first data arrives. -->
    <div v-if="!loaded" class="skeleton line-skeleton" aria-hidden="true" />
    <svg>
      <g ref="content">
        <g ref="milestonesGroup" />
        <g ref="endLabelsGroup" />
        <g ref="tooltip" />
        <g ref="legend" />
      </g>
      <g ref="xAxis" />
      <g ref="releaseAxis" />
      <g ref="yAxis" />
    </svg>
  </div>
</template>

<script setup lang="ts">

import {axisBottom, axisLeft} from "d3-axis";
import {extent, max} from "d3-array";
import {scaleTime, scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {line} from "d3-shape";
import {interpolatePath} from "d3-interpolate-path";
import {pointer} from "d3-selection";
import {bisector} from "d3-array";
import "d3-transition";
import {curveMonotoneX} from "d3-shape"
import {curveLinear} from "d3-shape"
import { chromeReleases } from "~/utils/chrome-releases";

const { $color } = useNuxtApp();

const container = ref<HTMLElement | null>(null);
const xAxis = ref<SVGGElement | null>(null);
const yAxis = ref<SVGGElement | null>(null);
const content = ref<SVGGElement | null>(null);
const tooltip = ref<SVGGElement | null>(null);
const legend = ref<SVGGElement | null>(null);
const milestonesGroup = ref<SVGGElement | null>(null);
const endLabelsGroup = ref<SVGGElement | null>(null);
const releaseAxis = ref<SVGGElement | null>(null);

interface Point {
  x: Date;
  y: number | null; // null leaves a gap in the line.
}

interface Data {
  label: string;
  extra_label?: string;
  color?: string;
  dashed?: boolean;
  strokeWidth?: number;
  endLabel?: string;
  values: Array<Point>;
}

const props = defineProps({
  data: { type: Array },
  formatter: {
    type: Function,
    default: null,
  },
  // Hand-picked events explaining the inflection points:
  // { date, label, color?, anchor?: 'start' | 'end', pill?: boolean, yRatio?: number }.
  milestones: { type: Array, default: () => [] },
  animate: { type: Boolean, default: true },
});
const formatValue = d => props.formatter ? props.formatter(d) : "" + d;
const milestoneWidthCache = new Map<string, number>();

const dateExtent = computed(() => {
  if (!props.data || props.data.length === 0) return [new Date(), new Date()];
  const allValues = (props.data as Data[]).map(e => e.values).flat();
  if (allValues.length === 0) return [new Date(), new Date()];
  return extent(allValues.map(d => d.x));
});
const patchExtent = computed(() => {
  if (!props.data || props.data.length === 0) return [0, 0];
  const allValues = (props.data as Data[]).map(e => e.values).flat();
  if (allValues.length === 0) return [0, 0];
  return [0, max(allValues.map(d => d.y))];
});

const render = () => {
  if (!props.data || props.data.length === 0) return;
  const seriesList = props.data as Data[];
  const margin = {
    top: 10,
    right: 32,
    bottom: 44,
    left: 60,
  };

  const width = lastWidth || container.value?.clientWidth || 0;
  const height = lastHeight || container.value?.clientHeight || 0;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  select(content.value)
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  select(xAxis.value)
    .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight})`);
  select(yAxis.value)
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const x = scaleTime()
    .range([0, innerWidth])
    .domain(dateExtent.value as [Date, Date]);

  const y = scaleLinear()
    .range([innerHeight, 0])
    .domain(patchExtent.value as [number, number]);

  const bottomAxis = axisBottom(x).ticks(7);
  const leftAxis = axisLeft(y);
  if (props.formatter) leftAxis.tickFormat(props.formatter as any);

  if (props.animate) {
    select(xAxis.value)
      .transition()
      .duration(500)
      .call(bottomAxis);
    select(yAxis.value)
      .transition()
      .duration(500)
      .call(leftAxis);
  } else {
    select(xAxis.value).interrupt().call(bottomAxis);
    select(yAxis.value).interrupt().call(leftAxis);
  }

  // Chrome releases, every 10 milestones, under the years. Labels without
  // room are skipped.
  let lastLabel = -Infinity;
  const releases = chromeReleases
    .filter(release => release.milestone % 10 == 0)
    .map(release => ({ ...release, x: x(release.date) }))
    .filter(release => {
      if (release.x < 0 || release.x > innerWidth || release.x - lastLabel < 40) {
        return false;
      }
      lastLabel = release.x;
      return true;
    });
  select(releaseAxis.value)
    .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight + 34})`)
    .selectAll("text")
    .data(releases, (release: any) => release.milestone)
    .join("text")
    .attr("x", release => release.x)
    .attr("text-anchor", "middle")
    .attr("font-size", "10px")
    .style("fill", "var(--faint)")
    .text(release => `M${release.milestone}`);

  // The milestones: a dashed line, labeled near the bottom (or at yRatio for
  // callout pills), in lanes avoiding overlaps.
  const milestones = (props.milestones as any[])
    .map(m => ({ ...m, x: x(new Date(m.date)) }))
    .filter(m => m.x >= 0 && m.x <= innerWidth);
  select(milestonesGroup.value)
    .selectAll(".milestone")
    .data(milestones, (m: any) => `${m.date}:${m.label}`)
    .join(enter => {
      const group = enter.append("g").attr("class", "milestone");
      group.append("line");
      group.append("rect").attr("class", "milestone-pill");
      group.append("text").attr("font-size", "11px");
      return group;
    })
    .call(group => {
      group.select("line")
        .attr("x1", (m: any) => m.x)
        .attr("x2", (m: any) => m.x)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .style("stroke", (m: any) => m.color || "var(--faint)")
        .attr("stroke-width", (m: any) => m.pill ? 1.75 : (m.color ? 1.3 : 1))
        .attr("stroke-dasharray", (m: any) => m.pill ? "5 3" : "3 3");

      const texts = group.select("text")
        .text((m: any) => m.label)
        .attr("font-style", (m: any) => m.pill ? "normal" : "italic")
        .attr("font-weight", (m: any) => m.pill ? "650" : (m.color ? "560" : "normal"))
        .style("fill", (m: any) => m.color || "var(--muted)");

      const widths = texts.nodes().map((node: any, i: number) => {
        const key = `${milestones[i].pill ? "P:" : ""}${milestones[i].label}`;
        let w = milestoneWidthCache.get(key);
        if (w === undefined || w === 0) {
          w = node.getComputedTextLength() || milestones[i].label.length * 6.2;
          milestoneWidthCache.set(key, w);
        }
        return w;
      });

      const placement = labelLanes(milestones.map((m, i) => ({
        x: m.x,
        width: widths[i] + (m.pill ? 12 : 0),
        preferredAnchor: m.anchor,
      })), innerWidth, 5);

      const textPos = milestones.map((m, i) => {
        const anchor = m.anchor || placement[i].anchor;
        const pad = m.pill ? 9 : 4;
        const tx = anchor === "start" ? m.x + pad : m.x - pad;
        const ty = typeof m.yRatio === "number"
          ? Math.max(18, Math.min(innerHeight - 10, Math.round(innerHeight * m.yRatio)))
          : innerHeight - 6 - placement[i].lane * 15;
        return { anchor, tx, ty, w: widths[i] };
      });

      texts
        .attr("text-anchor", (_, i) => textPos[i].anchor)
        .attr("x", (_, i) => textPos[i].tx)
        .attr("y", (_, i) => textPos[i].ty);

      group.select("rect.milestone-pill")
        .attr("display", (m: any) => m.pill ? null : "none")
        .attr("x", (_, i) => textPos[i].anchor === "start" ? textPos[i].tx - 5 : textPos[i].tx - textPos[i].w - 5)
        .attr("y", (_, i) => textPos[i].ty - 12)
        .attr("width", (_, i) => textPos[i].w + 10)
        .attr("height", 17)
        .attr("rx", 4)
        .style("fill", "var(--surface)")
        .style("stroke", (m: any) => m.color || "var(--line-strong)")
        .attr("stroke-width", 1)
        .attr("opacity", 0.96);
    });

  const max_curve_length = seriesList.reduce((acc, d) => Math.max(acc, d.values.length), 0);

  const defined = (d: Point) => d.y !== null;
  const smoothLine = line<Point>()
    .defined(defined)
    .x(d => x(d.x))
    .y(d => y(d.y))
    .curve(max_curve_length < 400 ? curveMonotoneX : curveLinear);
  const straightLine = line<Point>()
    .defined(defined)
    .x(d => x(d.x))
    .y(d => y(d.y))
    .curve(curveLinear);
  const pathFor = (d: Data) => d.dashed ? straightLine(d.values) : smoothLine(d.values);
  const strokeWidthFor = (d: Data) => d.strokeWidth || (d.dashed ? 2 : 1.75);
  const colorFor = (d: { label: string; color?: string }) => d.color || $color(d.label);

  const valueZero = line<Point>()
    .defined(defined)
    .x(d => x(d.x))
    .y(() => y(0));

  select(container.value)
    .on("pointerenter pointermove", event => {
      const bisectDate = bisector((d: Point) => d.x).left;
      const date = x.invert(pointer(event)[0] - margin.left);

      const references = seriesList
        .map(d => {
          const i = bisectDate(d.values, date);
          if (i <= 0 || i >= d.values.length || d.values[i].y === null) {
            return null;
          }
          return {
            label: d.label,
            color: d.color,
            x: d.values[i].x,
            y: d.values[i].y,
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      select(tooltip.value)
        .selectAll(".tooltipData")
        .data(references, (reference: any) => reference.label)
        .join(
          enter => {
            const group = enter
              .append("g")
              .attr("class", "tooltipData")
              .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)})`);

            group
              .attr("opacity", 0)
              .transition()
              .duration(300)
              .attr("opacity", 1);

            group
              .append("text")
              .attr("font-size", "12px")
              .attr("font-weight", "bold")
              .attr("x", d => x(d.x) < 140 ? 6 : -6)
              .attr("y", -6)
              .attr("text-anchor", d => x(d.x) < 140 ? "start" : "end")
              .attr("alignment-baseline", "bottom")
              .style("fill", d => colorFor(d))
              .text(d => d.label + ":  " + formatValue(d.y));

            group.append("circle")
              .attr("r", 3.2)
              .style("fill", d => colorFor(d));
            return group;
          },

          update => {
            update
              .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)})`);
            update
              .select("text")
              .attr("x", d => x(d.x) < 140 ? 6 : -6)
              .attr("text-anchor", d => x(d.x) < 140 ? "start" : "end")
              .style("fill", d => colorFor(d))
              .text(d => d.label + ":  " + formatValue(d.y));
            update
              .select("circle")
              .style("fill", d => colorFor(d));
            return update;
          },
          exit => exit
            .attr("opacity", 1)
            .transition()
            .duration(200)
            .attr("opacity", 0)
            .remove()
        );
    })
    .on("pointerleave", event => {
      // On touch screens, keep the tooltip of the last tap.
      if (event.pointerType === "touch") {
        return;
      }
      select(tooltip.value)
        .selectAll(".tooltipData")
        .transition()
        .duration(500)
        .attr("opacity", 0)
        .remove();
    });

  select(content.value)
    .selectAll(".line")
    .data(seriesList, (d: Data) => d.label)
    .join(
      enter => {
        const path = enter
          .insert("path", ":first-child")
          .attr("class", "line")
          .attr("fill", "none")
          .style("stroke", d => colorFor(d))
          .attr("stroke-dasharray", d => d.dashed ? "6 4" : null);
        if (!props.animate) {
          return path
            .attr("stroke-width", d => strokeWidthFor(d))
            .attr("d", d => pathFor(d));
        }
        return path
          .attr("stroke-width", 0)
          .attr("d", d => valueZero(d.values))
          .transition()
          .duration(500)
          .attr("d", d => pathFor(d))
          .attr("stroke-width", d => strokeWidthFor(d));
      },

      update => {
        update
          .style("stroke", d => colorFor(d))
          .attr("stroke-dasharray", d => d.dashed ? "6 4" : null);
        if (!props.animate) {
          return update
            .interrupt()
            .attr("stroke-width", d => strokeWidthFor(d))
            .attr("d", d => pathFor(d));
        }
        return update
          .transition()
          .duration(500)
          .attr("stroke-width", d => strokeWidthFor(d))
          .attrTween('d', function (d) {
            const previous = select(this).attr('d');
            const current = pathFor(d) || "";
            return interpolatePath(previous, current);
          });
      },

      exit => props.animate
        ? exit
          .transition()
          .duration(500)
          .attr("d", (d: Data) => valueZero(d.values))
          .remove()
        : exit.remove()
    );

  // Optional end-of-line callout pills (e.g. projected 0-crossing ETA on dashed trend lines).
  const endLabeled = seriesList
    .filter(d => d.endLabel && d.values.length > 0)
    .map(d => {
      const lastPt = d.values[d.values.length - 1];
      return {
        key: d.label,
        text: d.endLabel!,
        color: colorFor(d),
        px: x(lastPt.x),
        py: y(lastPt.y),
      };
    });

  select(endLabelsGroup.value)
    .selectAll(".end-callout")
    .data(endLabeled, (d: any) => d.key)
    .join(enter => {
      const g = enter.append("g").attr("class", "end-callout");
      g.append("circle").attr("r", 3.5);
      g.append("rect").attr("rx", 4);
      g.append("text")
        .attr("font-size", "11px")
        .attr("font-weight", "650");
      return g;
    })
    .call(g => {
      g.select("circle")
        .attr("cx", d => d.px)
        .attr("cy", d => d.py)
        .style("fill", d => d.color);

      const texts = g.select("text")
        .text(d => d.text)
        .style("fill", d => d.color);

      const boxPos = endLabeled.map((d, i) => {
        const node = texts.nodes()[i] as SVGTextElement | undefined;
        const w = (node && node.getComputedTextLength()) || d.text.length * 6.4;
        const anchorEnd = d.px > innerWidth * 0.45;
        const tx = anchorEnd ? d.px - 8 : d.px + 8;
        const ty = Math.min(innerHeight - 10, Math.max(16, d.py - 8));
        return { anchor: anchorEnd ? "end" : "start", tx, ty, w };
      });

      texts
        .attr("text-anchor", (_, i) => boxPos[i].anchor)
        .attr("x", (_, i) => boxPos[i].tx)
        .attr("y", (_, i) => boxPos[i].ty);

      g.select("rect")
        .attr("x", (_, i) => boxPos[i].anchor === "end" ? boxPos[i].tx - boxPos[i].w - 5 : boxPos[i].tx - 5)
        .attr("y", (_, i) => boxPos[i].ty - 12)
        .attr("width", (_, i) => boxPos[i].w + 10)
        .attr("height", 17)
        .style("fill", "var(--surface)")
        .style("stroke", d => d.color)
        .attr("stroke-width", 1)
        .attr("opacity", 0.96);
    });

  select(legend.value)
    .selectAll(".legend")
    .data(seriesList, (d: Data) => (d.label + (d.extra_label || "")))
    .join(
      enter => {
        const group = enter
          .append("g")
          .attr("class", "legend");

        if (props.animate) {
          group
            .attr("opacity", 0)
            .attr("transform", (d, i) => `translate(100, ${i * 19})`)
            .transition()
            .duration(500)
            .attr("transform", (d, i) => `translate(10, ${i * 19})`)
            .attr("opacity", 1);
        } else {
          group
            .attr("opacity", 1)
            .attr("transform", (d, i) => `translate(10, ${i * 19})`);
        }

        group
          .append("line")
          .attr("class", "legend-swatch")
          .attr("x1", 0)
          .attr("x2", 13)
          .attr("y1", -4)
          .attr("y2", -4)
          .attr("stroke-width", 2.2)
          .attr("stroke-dasharray", d => d.dashed ? "4 2.5" : null)
          .style("stroke", d => colorFor(d));

        group
          .append("text")
          .attr("x", 18)
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .style("fill", d => colorFor(d))
          .text(d => d.label + (d.extra_label || ""));
        return group;
      },
      update => {
        update.select("line.legend-swatch")
          .attr("stroke-dasharray", d => d.dashed ? "4 2.5" : null)
          .style("stroke", d => colorFor(d));
        update.select("text")
          .style("fill", d => colorFor(d))
          .text(d => d.label + (d.extra_label || ""));
        if (!props.animate) {
          return update
            .interrupt()
            .attr("transform", (d, i) => `translate(10, ${i * 19})`)
            .attr("opacity", 1);
        }
        update
          .transition()
          .duration(500)
          .attr("transform", (d, i) => `translate(10, ${i * 19})`)
          .attr("opacity", 1);
        return update;
      },
      exit => {
        if (!props.animate) {
          return exit.remove();
        }
        return exit
          .transition()
          .duration(500)
          .attr("transform", (d, i) => `translate(100, ${i * 19})`)
          .attr("opacity", 0)
          .remove();
      }
    );

};

let lastWidth = 0;
let lastHeight = 0;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  lastWidth = container.value?.clientWidth || 0;
  lastHeight = container.value?.clientHeight || 0;
  render();
  if (container.value) {
    resizeObserver = new ResizeObserver(() => {
      const w = container.value?.clientWidth || 0;
      const h = container.value?.clientHeight || 0;
      if (w <= 0 || h <= 0 || (w === lastWidth && h === lastHeight)) return;
      lastWidth = w;
      lastHeight = h;
      render();
    });
    resizeObserver.observe(container.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(() => [props.data, props.milestones, props.formatter], render);

const loaded = ref(false);
watchEffect(() => {
  if (props.data?.length) {
    loaded.value = true;
  }
});

</script>

<style scoped>
.container {
  height: 100%;
  position: relative;
  width: 100%;
}

.line-skeleton {
  inset: 0;
  min-height: 12rem;
  position: absolute;
}

svg {
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}

svg :deep(.tooltipData text),
svg :deep(.legend text),
svg :deep(.milestone text) {
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 3.2px;
  stroke-linejoin: round;
}
</style>
