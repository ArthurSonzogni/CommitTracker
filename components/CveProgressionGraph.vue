<template>
  <div ref="container_ref" class="cve-progression-graph-container">
    <div v-if="!isVisible" class="placeholder"></div>
    <svg v-else ref="svg_ref" viewBox="0 0 800 400" @mouseleave="onMouseLeave" @mousemove="onMouseMove" @touchmove="onMouseMove" @touchstart="onMouseMove">
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

      <g ref="tooltip_indicators_group_ref" style="display: none; pointer-events: none;">
        <line ref="tooltip_line_ref" stroke="black" stroke-width="1" stroke-dasharray="3,3" y1="0" y2="400"></line>
        <circle ref="tooltip_circle_ref" r="4" fill="blue" stroke="white" stroke-width="2"></circle>
      </g>

      <g ref="tooltip_label_group_ref" style="display: none; pointer-events: none;">
        <rect ref="tooltip_rect_bg_ref" fill="white" stroke="#ccc" rx="4" ry="4" fill-opacity="0.9"></rect>
        <text ref="tooltip_text_ref" font-size="12" fill="black"></text>
      </g>

      <g ref="tooltip_indicators_group_ref_2" style="display: none; pointer-events: none;">
        <line ref="tooltip_line_ref_2" stroke="black" stroke-width="1" stroke-dasharray="3,3" y1="0" y2="400"></line>
        <circle ref="tooltip_circle_ref_2" r="4" fill="blue" stroke="white" stroke-width="2"></circle>
      </g>

      <g ref="tooltip_label_group_ref_2" style="display: none; pointer-events: none;">
        <rect ref="tooltip_rect_bg_ref_2" fill="white" stroke="#ccc" rx="4" ry="4" fill-opacity="0.9"></rect>
        <text ref="tooltip_text_ref_2" font-size="12" fill="black"></text>
      </g>

      <rect ref="overlay_rect_ref" fill="transparent" x="0" y="0" width="800" height="400"></rect>

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
  </div>
</template>

<script lang="ts" setup>
import { select, pointer } from "d3-selection";
import { scaleTime, scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axisBottom, axisLeft, axisRight } from "d3-axis";
import { transition } from "d3-transition";
import { interpolatePath } from "d3-interpolate-path";
import { easeCircleOut } from "d3-ease";
import { format } from "d3-format";

const props = defineProps<{
  year: number;
  data: any[];
  totalPrevious: number;
  projection?: { low: number; high: number };
}>();

const container_ref = ref<HTMLElement | null>(null);
const isVisible = ref(false);

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

const tooltip_indicators_group_ref = ref<SVGGElement | null>(null);
const tooltip_label_group_ref = ref<SVGGElement | null>(null);
const tooltip_line_ref = ref<SVGLineElement | null>(null);
const tooltip_circle_ref = ref<SVGCircleElement | null>(null);
const tooltip_text_ref = ref<SVGTextElement | null>(null);
const tooltip_rect_bg_ref = ref<SVGRectElement | null>(null);

const tooltip_indicators_group_ref_2 = ref<SVGGElement | null>(null);
const tooltip_label_group_ref_2 = ref<SVGGElement | null>(null);
const tooltip_line_ref_2 = ref<SVGLineElement | null>(null);
const tooltip_circle_ref_2 = ref<SVGCircleElement | null>(null);
const tooltip_text_ref_2 = ref<SVGTextElement | null>(null);
const tooltip_rect_bg_ref_2 = ref<SVGRectElement | null>(null);

const overlay_rect_ref = ref<SVGRectElement | null>(null);

let first_render = true;

// Component-scoped variables for interaction
let active_x_scale: any = null;
let active_y_scale: any = null;
let active_cve_dates: [Date, number][] = [];
let active_projection_low: [Date, number][] | null = null;
let active_projection_high: [Date, number][] | null = null;
let active_effectiveTotalPrevious = 0;
const date_formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface Cve { id: string; published: string; [key: string]: any; }

const getCveYear = (cve: Cve): number => {
  return new Date(cve.published).getFullYear();
};

// Helper to map event coordinates to SVG viewBox coordinates
const getSVGCoordinates = (event: MouseEvent | TouchEvent, svg: SVGSVGElement) => {
  let point = svg.createSVGPoint();
  if (window.TouchEvent && event instanceof TouchEvent) {
      point.x = event.touches[0].clientX;
      point.y = event.touches[0].clientY;
  } else if (event instanceof MouseEvent) {
      point.x = event.clientX;
      point.y = event.clientY;
  }
  // This transforms the screen pixels to the SVG's internal coordinate system (viewBox)
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return point.matrixTransform(ctm.inverse());
};

// Helper to find closest point on segment AB to point P in graph space
const getClosestPointOnSegment = (
  px: number, py: number,
  a: [Date, number],
  b: [Date, number]
): { point: [Date, number], distSq: number } => {
  const ax = active_x_scale(a[0]);
  const ay = active_y_scale(a[1]);
  const bx = active_x_scale(b[0]);
  const by = active_y_scale(b[1]);
  
  const dx = bx - ax;
  const dy = by - ay;
  
  if (dx === 0 && dy === 0) {
      return { point: a, distSq: (px - ax) ** 2 + (py - ay) ** 2 };
  }
  
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  
  // Clamp t to segment [0, 1]
  const tClamped = Math.max(0, Math.min(1, t));
  
  const closestX = ax + tClamped * dx;
  const closestY = ay + tClamped * dy;
  
  // Invert to get Date and Value
  const closestDate = active_x_scale.invert(closestX);
  const closestValue = active_y_scale.invert(closestY);
  
  return {
      point: [closestDate, closestValue],
      distSq: (px - closestX) ** 2 + (py - closestY) ** 2
  };
};

const onMouseLeave = () => {
  if (tooltip_indicators_group_ref.value) {
    tooltip_indicators_group_ref.value.style.display = "none";
  }
  if (tooltip_label_group_ref.value) {
    tooltip_label_group_ref.value.style.display = "none";
  }
  if (tooltip_indicators_group_ref_2.value) {
    tooltip_indicators_group_ref_2.value.style.display = "none";
  }
  if (tooltip_label_group_ref_2.value) {
    tooltip_label_group_ref_2.value.style.display = "none";
  }
};

const renderTooltip = (
    index: 1 | 2,
    d: [Date, number],
    is_projection: boolean,
    color: string
) => {
    const indicators_ref = index === 1 ? tooltip_indicators_group_ref : tooltip_indicators_group_ref_2;
    const label_ref = index === 1 ? tooltip_label_group_ref : tooltip_label_group_ref_2;
    const line_ref = index === 1 ? tooltip_line_ref : tooltip_line_ref_2;
    const circle_ref = index === 1 ? tooltip_circle_ref : tooltip_circle_ref_2;
    const text_ref = index === 1 ? tooltip_text_ref : tooltip_text_ref_2;
    const bg_ref = index === 1 ? tooltip_rect_bg_ref : tooltip_rect_bg_ref_2;

    if (!indicators_ref.value || !label_ref.value) return;

    indicators_ref.value.style.display = "block";
    label_ref.value.style.display = "block";

    const x_pos = active_x_scale(d[0]);
    const y_pos = active_y_scale(d[1]);
    const margin = {top: 20, right: 30, bottom: 20, left: 30}; // Must match render
    const x_svg = x_pos + margin.left;
    const y_svg = y_pos + margin.top;

    // Move line
    if (line_ref.value) {
        line_ref.value.setAttribute("x1", x_svg.toString());
        line_ref.value.setAttribute("x2", x_svg.toString());
        line_ref.value.setAttribute("y1", margin.top.toString());
        line_ref.value.setAttribute("y2", (400 - margin.bottom).toString());
    }

    // Move circle
    if (circle_ref.value) {
        circle_ref.value.setAttribute("cx", x_svg.toString());
        circle_ref.value.setAttribute("cy", y_svg.toString());
        circle_ref.value.setAttribute("fill", color);
    }

    // Update Text
    if (text_ref.value && bg_ref.value) {
        const text_el = select(text_ref.value);
        const date_str = date_formatter.format(d[0]);

        let display_val = 0;
        if (d[1] <= 0) {
            display_val = d[1] + active_effectiveTotalPrevious;
        } else {
            display_val = d[1];
        }
        display_val = Math.round(display_val);

        const label = is_projection ? "(Projection)" : "";
        text_el.text(`${date_str}: ${display_val} CVEs ${label}`);

        // Position text box
        const bbox = text_ref.value.getBBox();
        const padding = 4;

        select(bg_ref.value)
            .attr("x", bbox.x - padding)
            .attr("y", bbox.y - padding)
            .attr("width", bbox.width + padding * 2)
            .attr("height", bbox.height + padding * 2);

        // Adjust group position
        let tooltip_x = x_svg + 10;
        let tooltip_y = y_svg - 10;

        // Boundary checks
        if (tooltip_x > 700) tooltip_x = x_svg - bbox.width - 20;
        if (tooltip_y < 50) tooltip_y = y_svg + 20;

        label_ref.value.setAttribute("transform", `translate(${tooltip_x}, ${tooltip_y})`);
    }
};

const onMouseMove = (event: MouseEvent | TouchEvent) => {
  if (!active_x_scale || !active_y_scale || active_cve_dates.length === 0 || !svg_ref.value) return;

  const point = getSVGCoordinates(event, svg_ref.value);
  const margin = {top: 20, right: 30, bottom: 20, left: 30}; // Must match render

  // Convert SVG coordinate to Graph coordinate (remove margin)
  const mx_graph = point.x - margin.left;
  const my_graph = point.y - margin.top;

  // Find closest point in x/y space
  let best_d: [Date, number] | null = null;
  let min_dist_sq = Infinity;
  let is_projection = false;

  // 1. Check Historical Data Points
  for (const d of active_cve_dates) {
      const px = active_x_scale(d[0]);
      const py = active_y_scale(d[1]);
      const dx = px - mx_graph;
      const dy = py - my_graph;
      const dist_sq = dx * dx + dy * dy;
      
      if (dist_sq < min_dist_sq) {
          min_dist_sq = dist_sq;
          best_d = d;
          is_projection = false;
      }
  }

  // 2. Check Projection Low
  if (active_projection_low && active_projection_low.length === 2) {
      const res = getClosestPointOnSegment(mx_graph, my_graph, active_projection_low[0], active_projection_low[1]);
      if (res.distSq < min_dist_sq) {
          min_dist_sq = res.distSq;
          best_d = res.point;
          is_projection = true;
      }
  }

  // 3. Check Projection High
  if (active_projection_high && active_projection_high.length === 2) {
      const res = getClosestPointOnSegment(mx_graph, my_graph, active_projection_high[0], active_projection_high[1]);
      if (res.distSq < min_dist_sq) {
          min_dist_sq = res.distSq;
          best_d = res.point;
          is_projection = true;
      }
  }

  if (!best_d) return;

  if (is_projection && active_projection_low && active_projection_high && active_projection_low.length === 2 && active_projection_high.length === 2) {
      // In projection area: show both tooltips, aligned vertically to mouse X
      const target_date = active_x_scale.invert(mx_graph);

      // Calculate interpolated point on low projection line
      const pLow0 = active_projection_low[0];
      const pLow1 = active_projection_low[1];

      const xLow0 = active_x_scale(pLow0[0]);
      const yLow0 = active_y_scale(pLow0[1]);
      const xLow1 = active_x_scale(pLow1[0]);
      const yLow1 = active_y_scale(pLow1[1]);
      
      // Ensure mx_graph is clamped within the projection segment's x-range
      const clamped_mx_graph_low = Math.max(Math.min(mx_graph, Math.max(xLow0, xLow1)), Math.min(xLow0, xLow1));

      const tLow = (xLow1 - xLow0) !== 0 ? (clamped_mx_graph_low - xLow0) / (xLow1 - xLow0) : 0;
      const y_interpolated_low_graph = yLow0 + tLow * (yLow1 - yLow0);
      const val_low_inverted = active_y_scale.invert(y_interpolated_low_graph);
      const d_low: [Date, number] = [target_date, val_low_inverted];
      
      // Calculate interpolated point on high projection line
      const pHigh0 = active_projection_high[0];
      const pHigh1 = active_projection_high[1];

      const xHigh0 = active_x_scale(pHigh0[0]);
      const yHigh0 = active_y_scale(pHigh0[1]);
      const xHigh1 = active_x_scale(pHigh1[0]);
      const yHigh1 = active_y_scale(pHigh1[1]);

      // Ensure mx_graph is clamped within the projection segment's x-range
      const clamped_mx_graph_high = Math.max(Math.min(mx_graph, Math.max(xHigh0, xHigh1)), Math.min(xHigh0, xHigh1));

      const tHigh = (xHigh1 - xHigh0) !== 0 ? (clamped_mx_graph_high - xHigh0) / (xHigh1 - xHigh0) : 0;
      const y_interpolated_high_graph = yHigh0 + tHigh * (yHigh1 - yHigh0);
      const val_high_inverted = active_y_scale.invert(y_interpolated_high_graph);
      const d_high: [Date, number] = [target_date, val_high_inverted];
      
      // Render high projection tooltip (main one)
      renderTooltip(1, d_high, true, "#FFA500");
      
      // Render low projection tooltip (second one)
      renderTooltip(2, d_low, true, "#FFA500");
      
  } else {
      // Historical or no projection: show single tooltip
      renderTooltip(1, best_d, false, "blue");
      
      // Hide second tooltip
      if (tooltip_indicators_group_ref_2.value) tooltip_indicators_group_ref_2.value.style.display = "none";
      if (tooltip_label_group_ref_2.value) tooltip_label_group_ref_2.value.style.display = "none";
  }
};

const render = () => {
  if (!svg_ref.value) return;

  const current_year = props.year;
  const previous_year_date_start = new Date(`${current_year - 1}-01-01`);
  const current_year_date_start = new Date(`${current_year}-01-01`);
  const next_year_date_start = new Date(`${current_year + 1}-01-01`);

  const min_date = previous_year_date_start;
  const max_date = next_year_date_start;

  // Filter and process data
  const relevant_cves = props.data
    .filter((cve: Cve) => {
      const cveYear = getCveYear(cve);
      return cveYear === current_year || cveYear === current_year - 1;
    })
    .map(cve => ({ ...cve, date: new Date(cve.published) }))
    .filter(item => item.date >= min_date && item.date < max_date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());


  // Calculate effective total previous based on this filtered list
  const effectiveTotalPrevious = relevant_cves.filter(item => {
     const y = getCveYear(item);
     return y === current_year - 1;
  }).length;

  // Map to graph coordinates
  let cve_dates = relevant_cves.map((item, i) => [item.date, i + 1 - effectiveTotalPrevious] as [Date, number]);

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

  // Update scoped variable for interaction
  active_cve_dates = cve_dates;
  active_effectiveTotalPrevious = effectiveTotalPrevious;

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
  
  // Save projection lines for interaction
  active_projection_low = projection_dates_low.length > 0 ? projection_dates_low : null;
  active_projection_high = projection_dates_high.length > 0 ? projection_dates_high : null;

  const svg = select(svg_ref.value);  // Responsive: remove fixed width/height attributes if previously set by D3
  // svg.attr("width", 800); // Removed
  // svg.attr("height", 400); // Removed
  // Ensure viewBox is set (done in template)

  const margin = {top: 20, right: 30, bottom: 20, left: 30};
  const width = 800 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const x_scale = scaleTime()
    .domain([
      new Date(`${current_year - 2}-12-31`),
      new Date(`${current_year + 1}-01-02`)
    ])
    .range([0, width]);

  const min_val = cve_dates.length > 0 ? cve_dates[0][1] : -effectiveTotalPrevious;
  const effective_min = Math.min(min_val, -effectiveTotalPrevious);

  const y_scale = scaleLinear()
    .domain([effective_min, max_count])
    .range([height, 0]);

  // Update scoped variables for interaction
  active_x_scale = x_scale;
  active_y_scale = y_scale;

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
        .transition(t)
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
        .transition(t)
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
    .domain([0, effectiveTotalPrevious])
    .range([y_scale(-effectiveTotalPrevious), y_scale(0)]);

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

  // Update Overlay Rect size/position
  if (overlay_rect_ref.value) {
      select(overlay_rect_ref.value)
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width)
        .attr("height", height);
  }
};

watch(() => [props.data, props.year, props.totalPrevious], () => {
    if (isVisible.value) {
        requestAnimationFrame(() => render());
    }
}, { deep: true });

watch(isVisible, async (val) => {
    if (val) {
        await nextTick();
        requestAnimationFrame(() => render());
    } else {
        first_render = true;
    }
});

onMounted(() => {
    const observer = new IntersectionObserver((entries) => {
        isVisible.value = entries[0].isIntersecting;
    });
    if (container_ref.value) {
        observer.observe(container_ref.value);
    }
});
</script>

<style scoped>
.cve-progression-graph-container {
  max-width: 800px; /* Or a suitable max-width */
}

.placeholder {
  width: 100%;
  padding-bottom: 50%; /* 2:1 Aspect Ratio (height/width * 100) */
  background-color: transparent; /* Or a subtle loading color like #f9f9f9 */
}
</style>
