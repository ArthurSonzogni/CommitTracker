<template>
  <div class="container" ref="container" align="center">
    <svg>
      <g ref="content">
        <g ref="tooltip" />
        <g ref="legend" />
      </g>
      <g ref="xAxis" />
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

const { $color } = useNuxtApp();

const container = ref<HTMLElement | null>(null);
const xAxis = ref<SVGGElement | null>(null);
const yAxis = ref<SVGGElement | null>(null);
const content = ref<SVGGElement | null>(null);
const tooltip = ref<SVGGElement | null>(null);
const legend = ref<SVGGElement | null>(null);

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
    default: d => "" + d,
  },
});

const dateExtent = computed(() => {
  return extent(props.data.map(e => e.values).flat().map(d => d.x))
});
const patchExtent = computed(() => {
  return [0, max(props.data.map(e => e.values).flat().map(d => d.y))]
});

const render = () => {
  const margin = {
    top: 10,
    right: 30,
    bottom: 30,
    left: 60,
  };

  const innerWidth = container.value?.clientWidth - margin.left - margin.right || 0;
  const innerHeight = container.value?.clientHeight - margin.top - margin.bottom || 0;

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

  select(xAxis.value)
    .transition()
    .duration(500)
    .call(axisBottom(x).ticks(7));

  select(yAxis.value)
    .transition()
    .duration(500)
    .call(axisLeft(y));

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
              .attr("fill", d => $color(d.label))
              .text(d =>  d.label + ":  " + props.formatter(d.y))

            group.append("circle")
              .attr("r", 3)
              .attr("fill", d => $color(d.label))
            return group;
          },

          update => {
            update
              .attr("transform", d => `translate(${x(d.x)}, ${y(d.y)})`)
              .select("text")
              .text(d =>  d.label + ":  " + props.formatter(d.y))
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
      select(tooltip.value)
        .selectAll(".tooltipData")
        .transition()
        .duration(500)
        .attr("opacity", 0)
        .remove()
    })
    .on("touchstart", event => event.preventDefault())
  ;

  select(content.value)
    .selectAll(".line")
    .data(props.data, d => d.label)
    .join(
      enter => enter
      .insert("path", ":first-child")
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", d => $color(d.label))
      .attr("stroke-width", 0)
      .attr("d", d => valueZero(d.values))
      .transition(500)
      .duration(500)
      .attr("d", d => valueLines(d.values))
      .attr("stroke-width", 1.5),

      update => update
      .transition()
      .duration(500)
      .attrTween('d', function (d) {
        var previous = select(this).attr('d');
        var current = valueLines(d.values);
        return interpolatePath(previous, current);
      })
      ,

      exit => exit
      .transition(500)
      .duration(500)
      .attr("d", d => valueZero(d.values))
      .remove()
    )

  select(legend.value)
    .selectAll(".legend")
    .data(props.data, d => (d.label + (d.extra_label || "")))
    .join(
      enter => {enter
        const group = enter
          .append("g")
          .attr("class", "legend")

        group
          .attr("opacity", 0)
          .attr("transform", (d, i) => `translate(100, ${i*20})`)
          .transition()
          .duration(500)
          .attr("transform", (d, i) => `translate(10, ${i*20})`)
          .attr("opacity", 1)

        group
          .append("text")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("fill", d => $color(d.label))
          .text(d => d.label + (d.extra_label || ""))
        return group;
      },
      update => {
        update
          .transition()
          .duration(1000)
          .attr("transform", (d, i) => `translate(10, ${i*20})`)
          .attr("opacity", 1)
        return update;
      },
      exit => {
        exit
          .transition()
          .duration(500)
          .attr("transform", (d, i) => `translate(100, ${i*20})`)
          .attr("opacity", 0)
          .remove()
      }
    )

};

onMounted(() => {
  render();
  (new ResizeObserver(render)).observe(container.value);
});

watch(() => props.data, render);

</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
}

svg {
  width: 100%;
  height: 100%;
}

</style>
