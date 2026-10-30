<template>
  <div class="container" ref="container" align="center">
    <!-- Placeholder, until the first data arrives. -->
    <div v-if="!loaded" class="skeleton line-skeleton" aria-hidden="true" />
    <svg>
      <g ref="content">
        <g ref="milestonesGroup" />
        <g ref="tooltip" />
        <g ref="legend" />
      </g>
      <g ref="xAxis" />
      <g ref="releaseAxis" />
      <g ref="yAxis" />

      <!--
        Filter for the tooltip, it creates a white glow around the text to
        make it more readable
      -->
      <filter id="highlightText" x="0" y="0" width="100%" height="100%">
        <!-- Dilate the source alpha channel to create a border -->
        <feMorphology in="SourceAlpha" result="dilated" operator="dilate" radius="2" />
        <!-- Fill the dilated shape with white -->
        <feFlood flood-color="white" result="glow" />
        <!-- Composite "glow" and "dilated" to create the final background -->
        <feComposite in="glow" in2="dilated" operator="in" result="softGlow" />
        <!-- Put the original text on top of the glowing background -->
        <feMerge>
          <!-- Glow first -->
          <feMergeNode in="softGlow"/>
          <!-- Original on top -->
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
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
const releaseAxis = ref<SVGGElement | null>(null);

interface Point {
  x: Date;
  y: number;
}

interface Data {
  label: string;
  extra_label?: string;
  values: Array<Point>;
}

const props = defineProps({
  data: { type: Array },
  formatter: {
    type: Function,
    default: null,
  },
  // Hand-picked events explaining the inflection points: { date, label }.
  milestones: { type: Array, default: () => [] },
  animate: { type: Boolean, default: true },
});
const formatValue = d => props.formatter ? props.formatter(d) : "" + d;
const milestoneWidthCache = new Map<string, number>();

const dateExtent = computed(() => {
  if (!props.data || props.data.length === 0) return [new Date(), new Date()];
  const allValues = props.data.map(e => e.values).flat();
  if (allValues.length === 0) return [new Date(), new Date()];
  return extent(allValues.map(d => d.x))
});
const patchExtent = computed(() => {
  if (!props.data || props.data.length === 0) return [0, 0];
  const allValues = props.data.map(e => e.values).flat();
  if (allValues.length === 0) return [0, 0];
  return [0, max(allValues.map(d => d.y))]
});

const render = () => {
  if (!props.data || props.data.length === 0) return;
  const margin = {
    top: 10,
    right: 30,
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
    .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight})`)
  select(yAxis.value)
    .attr("transform", `translate(${margin.left}, ${margin.top})`)

  const x = scaleTime()
    .range([ 0, innerWidth])
    .domain(dateExtent.value);

  const y = scaleLinear()
    .range([ innerHeight, 0 ])
    .domain(patchExtent.value);

  const bottomAxis = axisBottom(x).ticks(7);
  const leftAxis = axisLeft(y);
  if (props.formatter) leftAxis.tickFormat(props.formatter);

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
    .data(releases, release => release.milestone)
    .join("text")
    .attr("x", release => release.x)
    .attr("text-anchor", "middle")
    .attr("font-size", "10px")
    .style("fill", "var(--faint)")
    .text(release => `M${release.milestone}`);

  // The milestones: a dashed line, labeled near the bottom, in lanes avoiding
  // the overlaps.
  const milestones = props.milestones
    .map(m => ({ ...m, x: x(new Date(m.date)) }))
    .filter(m => m.x >= 0 && m.x <= innerWidth);
  select(milestonesGroup.value)
    .selectAll(".milestone")
    .data(milestones, m => m.label)
    .join(enter => {
      const group = enter.append("g").attr("class", "milestone");
      group.append("line")
        .style("stroke", "var(--faint)")
        .attr("stroke-dasharray", "3 3");
      group.append("text")
        .attr("font-size", "11px")
        .attr("font-style", "italic")
        .style("fill", "var(--muted)");
      return group;
    })
    .call(group => {
      group.select("line")
        .attr("x1", m => m.x)
        .attr("x2", m => m.x)
        .attr("y1", 0)
        .attr("y2", innerHeight);
      const texts = group.select("text").text(m => m.label);
      const placement = labelLanes(texts.nodes().map((node, i) => {
        const label = milestones[i].label;
        let width = milestoneWidthCache.get(label);
        if (width === undefined) {
          width = node.getComputedTextLength();
          milestoneWidthCache.set(label, width);
        }
        return { x: milestones[i].x, width };
      }), innerWidth);
      texts
        .attr("text-anchor", (m, i) => placement[i].anchor)
        .attr("x", (m, i) => placement[i].anchor === "start" ? m.x + 4 : m.x - 4)
        .attr("y", (m, i) => innerHeight - 6 - placement[i].lane * 14);
    });

  const max_curve_length = props.data.reduce((acc, d) => Math.max(acc, d.values.length), 0);

  const valueLines = line()
    .x(d => x(d.x))
    .y(d => y(d.y))
    .curve(max_curve_length < 400 ? curveMonotoneX : curveLinear)
  const valueZero = line()
    .x(d => x(d.x))
    .y(d => y(0))

  select(container.value)
    .on("pointerenter pointermove", event => {
      const bisectDate = bisector(d => d.x).left;
      const date = x.invert(pointer(event)[0] - margin.left);

      const references = props.data
        .map(d => {
          const i = bisectDate(d.values, date);
          if (i <= 0 || i >= d.values.length) {
            return null;
          }
          return {
            label: d.label,
            x: d.values[i].x,
            y: d.values[i].y,
          };
        })
        .filter(d => d !== null);

      select(tooltip.value)
        .selectAll(".tooltipData")
        .data(references, reference => reference.label)
        .join(
          enter => {
            const group = enter
              .append("g")
              .attr("class", "tooltipData")
              .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)}`)

            group
              .attr("opacity", 0)
              .transition()
              .duration(300)
              .attr("opacity", 1)

            group
              .append("text")
              .attr("text-anchor", "middle")
              .attr("font-size", "12px")
              .attr("font-weight", "bold")
              .attr("x", -5)
              .attr("y", -5)
              .attr("text-anchor", "end")
              .attr("alignment-baseline", "bottom")
              .attr("filter", "url(#highlightText)")
              .attr("fill", d => d.color || $color(d.label))
              .text(d =>  d.label + ":  " + formatValue(d.y))

            group.append("circle")
              .attr("r", 3)
              .attr("fill", d => d.color || $color(d.label))
            return group;
          },

          update => {
            update
              .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)})`)
              .select("text")
              .text(d =>  d.label + ":  " + formatValue(d.y))
          },
          exit => exit
          .attr("opacity", 1)
          .transition()
          .duration(200)
          .attr("opacity", 0)
          .remove()
        )
      ;
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
        .remove()
    })
  ;

  select(content.value)
    .selectAll(".line")
    .data(props.data, d => d.label)
    .join(
      enter => {
        const path = enter
          .insert("path", ":first-child")
          .attr("class", "line")
          .attr("fill", "none")
          .attr("stroke", d => d.color || $color(d.label));
        if (!props.animate) {
          return path
            .attr("stroke-width", 1.5)
            .attr("d", d => valueLines(d.values));
        }
        return path
          .attr("stroke-width", 0)
          .attr("d", d => valueZero(d.values))
          .transition()
          .duration(500)
          .attr("d", d => valueLines(d.values))
          .attr("stroke-width", 1.5);
      },

      update => {
        update.attr("stroke", d => d.color || $color(d.label));
        if (!props.animate) {
          return update
            .interrupt()
            .attr("stroke-width", 1.5)
            .attr("d", d => valueLines(d.values));
        }
        return update
          .transition()
          .duration(500)
          .attr("stroke-width", 1.5)
          .attrTween('d', function (d) {
            var previous = select(this).attr('d');
            var current = valueLines(d.values);
            return interpolatePath(previous, current);
          });
      },

      exit => props.animate
        ? exit
          .transition(500)
          .duration(500)
          .attr("d", d => valueZero(d.values))
          .remove()
        : exit.remove()
    )

  select(legend.value)
    .selectAll(".legend")
    .data(props.data, d => (d.label + (d.extra_label || "")))
    .join(
      enter => {
        const group = enter
          .append("g")
          .attr("class", "legend")

        if (props.animate) {
          group
            .attr("opacity", 0)
            .attr("transform", (d, i) => `translate(100, ${i*20})`)
            .transition()
            .duration(500)
            .attr("transform", (d, i) => `translate(10, ${i*20})`)
            .attr("opacity", 1)
        } else {
          group
            .attr("opacity", 1)
            .attr("transform", (d, i) => `translate(10, ${i*20})`)
        }

        group
          .append("text")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("fill", d => d.color || $color(d.label))
          .text(d => d.label + (d.extra_label || ""))
        return group;
      },
      update => {
        if (!props.animate) {
          return update
            .interrupt()
            .attr("transform", (d, i) => `translate(10, ${i*20})`)
            .attr("opacity", 1);
        }
        update
          .transition()
          .duration(1000)
          .attr("transform", (d, i) => `translate(10, ${i*20})`)
          .attr("opacity", 1)
        return update;
      },
      exit => {
        if (!props.animate) {
          return exit.remove();
        }
        exit
          .transition()
          .duration(500)
          .attr("transform", (d, i) => `translate(100, ${i*20})`)
          .attr("opacity", 0)
          .remove()
      }
    )

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

/* Scrub horizontally, while still scrolling the page vertically. */
svg {
  touch-action: pan-y;
}

.line-skeleton {
  inset: 0;
  min-height: 12rem;
  position: absolute;
}

svg {
  width: 100%;
  height: 100%;
}

</style>
