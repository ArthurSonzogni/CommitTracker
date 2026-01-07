<template>
  <svg ref="svg_ref">
    <path ref="svg_graph_projection_low_ref"></path>
    <path ref="svg_graph_projection_high_ref"></path>
    <path ref="svg_graph_ref"></path>
    <g ref="axis_x_ref"></g>
    <g ref="axis_y1_ref"></g>
    <g ref="axis_y2_ref"></g>

    <g>
      <rect x="45" y="10" width="10" height="10" fill="blue"></rect>
      <text x="60" y="20">Historical</text>
      <template v-if="projection">
        <rect x="45" y="30" width="10" height="10" fill="#FFA500"></rect>
        <text x="60" y="40">Projection</text>
      </template>
    </g>

    <line
      ref="svg_year_split_vertical_ref"
      y1="0"
      y2="380"
      stroke="black"
      stroke-width="1"
      stroke-dasharray="5,5"
    />

    <line
      ref="svg_split_horizontal_ref"
      x1="30"
      x2="770"
      y1="190"
      y2="190"
      stroke="black"
      stroke-width="1"
      stroke-dasharray="5,5"
    />

    <text
      ref="previous_year_label_ref"
      x="200"
      y="150"
      class="previous_year_label"
      font-size="19"
      font-weight="bold"
      fill="black"
      text-anchor="middle"
    >{{ year - 1 }}</text>

    <text
      ref="current_year_label_ref"
      x="600"
      y="150"
      class="current_year_label"
      font-size="19"
      font-weight="bold"
      fill="black"
      text-anchor="middle"
    >
      {{ year }}
    </text>

    <filter :id="`glow-${year}`" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="13" result="coloredBlur"/>
      <feGaussianBlur stdDeviation="5" result="coloredBlur2"/>
      <feGaussianBlur stdDeviation="3" result="coloredBlur3"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="coloredBlur2"/>
        <feMergeNode in="coloredBlur2"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </svg>
</template>

<script lang="ts" setup>
import { select } from "d3-selection";
import { scaleTime, scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axisBottom, axisLeft, axisRight } from "d3-axis";
import { transition } from "d3-transition";
import { interpolatePath } from "d3-interpolate-path";
import { easeCircleOut } from "d3-ease";

const props = defineProps<{
  year: number;
  data: any[];
  totalPrevious: number;
  projection?: { low: number; high: number };
}>();

const svg_ref = ref<HTMLSvgElement | null>(null);
const svg_graph_ref = ref<SVGPathElement | null>(null);
const svg_graph_projection_low_ref = ref<SVGPathElement | null>(null);
const svg_graph_projection_high_ref = ref<SVGPathElement | null>(null);
const axis_x_ref = ref<SVGGElement | null>(null);
const axis_y1_ref = ref<SVGGElement | null>(null);
const axis_y2_ref = ref<SVGGElement | null>(null);
const svg_split_horizontal_ref = ref<SVGLineElement | null>(null);
const svg_year_split_vertical_ref = ref<SVGLineElement | null>(null);
const previous_year_label_ref = ref<SVGTextElement | null>(null);
const current_year_label_ref = ref<SVGTextElement | null>(null);

let first_render = true;

const render = () => {
  if (!svg_ref.value) return;

  const current_year = props.year;
  const previous_year_date_start = new Date(`${current_year - 1}-01-01`);
  const current_year_date_start = new Date(`${current_year}-01-01`);
  const next_year_date_start = new Date(`${current_year + 1}-01-01`);

  const min_date = previous_year_date_start;
  const max_date = next_year_date_start;

  // Filter data for the relevant years (Year-1 and Year)
  let cve_dates = props.data
    .filter(cve => {
      const cveYear = parseInt(cve.id.slice(0, 4));
      return cveYear === current_year || cveYear === current_year - 1;
    })
    .map(cve => new Date(cve.published))
    .filter(date => date >= min_date && date < max_date)
    .sort((a, b) => a.getTime() - b.getTime())
    .map((date, i) => [date, i + 1 - props.totalPrevious]);

  // Add pivot point at the start of the current year to ensure continuity/crossing
  cve_dates.push([current_year_date_start, 0]);
  cve_dates.sort((a, b) => a[0].getTime() - b[0].getTime());

  // Extend line to current date or end of year
  if (cve_dates.length > 0) {
    const last_entry = cve_dates[cve_dates.length - 1];
    const last_date = last_entry[0];
    const last_val = last_entry[1];
    
    const now = new Date();
    let end_limit = new Date(`${current_year}-12-31`);
    
    // If we are strictly in the current year, clamp to now.
    if (current_year === now.getFullYear()) {
        end_limit = now;
    }
    
    // Only extend if we haven't reached the limit (and don't go backwards)
    if (last_date < end_limit) {
        cve_dates.push([end_limit, last_val]);
    }
  }

  let projection_dates_low: [Date, number][] = [];
  let projection_dates_high: [Date, number][] = [];
  let max_count = 0;

  if (cve_dates.length > 0) {
    if (props.projection) {
      const last_point = cve_dates[cve_dates.length - 1];
      projection_dates_low = [
        last_point,
        [next_year_date_start, props.projection.low + 0.01]
      ];
      projection_dates_high = [
        last_point,
        [next_year_date_start, props.projection.high]
      ];
      max_count = props.projection.high;
    } else {
      max_count = Math.max(...cve_dates.map(d => d[1]));
      if (max_count < 10) max_count = 10;
    }
  }

  const svg = select(svg_ref.value);
  svg.attr("width", 800);
  svg.attr("height", 400);

  const margin = {top: 20, right: 30, bottom: 20, left: 30};
  const width = 800 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const x_scale = scaleTime()
    .domain([
      new Date(`${current_year - 2}-12-31`),
      new Date(`${current_year + 1}-01-02`)
    ])
    .range([0, width]);
  
  const min_val = cve_dates.length > 0 ? cve_dates[0][1] : -props.totalPrevious;
  const effective_min = Math.min(min_val, -props.totalPrevious);
  
  const y_scale = scaleLinear()
    .domain([effective_min, max_count])
    .range([height, 0]);

  const t = transition()
    .duration(first_render ? 0 : 500)
    .ease(easeCircleOut);
  first_render = false;

  const line_generator = line()
    .x(d => x_scale(d[0]))
    .y(d => y_scale(d[1]));

  const graph = select(svg_graph_ref.value);
  graph
    .attr("style", `filter: url(#glow-${props.year});`)
    .attr("fill", "none")
    .attr("stroke", "blue")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .data([cve_dates])
    .transition(t)
    .attrTween('d', function (d) {
      const previous = select(this).attr('d') || "";
      const current = line_generator(d) || "";
      return interpolatePath(previous, current);
    });

  // Projections
  const proj_low = select(svg_graph_projection_low_ref.value);
  if (props.projection) {
      proj_low
        .attr("style", `filter: url(#glow-${props.year});`)
        .attr("fill", "none")
        .attr("stroke", "#FFA500")
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .attr("stroke-dasharray", "5,5")
        .data([projection_dates_low])
        .transition()
        .attrTween('d', function (d) {
            const previous = select(this).attr('d') || "";
            const current = line_generator(d) || "";
            return interpolatePath(previous, current);
        });
  } else {
      proj_low.attr("d", null);
  }

  const proj_high = select(svg_graph_projection_high_ref.value);
  if (props.projection) {
      proj_high
        .attr("style", `filter: url(#glow-${props.year});`)
        .attr("fill", "none")
        .attr("stroke", "#FFA500")
        .attr("transform", `translate(${margin.left}, ${margin.top})`)
        .attr("stroke-dasharray", "5,5")
        .data([projection_dates_high])
        .transition()
        .attrTween('d', function (d) {
            const previous = select(this).attr('d') || "";
            const current = line_generator(d) || "";
            return interpolatePath(previous, current);
        });
  } else {
      proj_high.attr("d", null);
  }

  // Axes
  const y1 = scaleLinear()
    .domain([0, props.totalPrevious])
    .range([y_scale(-props.totalPrevious), y_scale(0)]);

  const y2 = scaleLinear()
    .domain([0, max_count])
    .range([y_scale(0), y_scale(max_count)]);

  const axis_x = select(axis_x_ref.value);
  const axis_y1 = select(axis_y1_ref.value);
  const axis_y2 = select(axis_y2_ref.value);

  axis_x.transition(t).call(axisBottom(x_scale));
  axis_x.attr("transform", `translate(${margin.left}, ${height + margin.top})`);

  axis_y1.transition(t).call(axisLeft(y1));
  axis_y1.attr("transform", `translate(${margin.left}, ${margin.top})`);

  axis_y2.transition(t).call(axisRight(y2));
  axis_y2.attr("transform", `translate(${margin.left + width}, ${margin.top})`);

  // Vertical split line
  const year_split_x = x_scale(current_year_date_start);
  select(svg_year_split_vertical_ref.value)
    .transition(t)
    .attr("x1", year_split_x)
    .attr("x2", year_split_x)
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const split_horizontal = select(svg_split_horizontal_ref.value);
  split_horizontal
    .transition(t)
    .attr("y1", y_scale(0))
    .attr("y2", y_scale(0))
    .attr("x1", x_scale(min_date))
    .attr("x2", x_scale(max_date))
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  select(previous_year_label_ref.value)
    .transition(t)
    .attr("y", y_scale(0));

  select(current_year_label_ref.value)
    .transition(t)
    .attr("y", y_scale(0) + 19 * 3);
}

watch(() => [props.data, props.year, props.totalPrevious], render, { deep: true });
onMounted(render);
</script>