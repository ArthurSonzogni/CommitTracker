<template>
  <div class="container" ref="container">
    <div v-if="!data" class="skeleton accretion-skeleton" aria-hidden="true" />
    <svg>
      <g ref="content">
        <g ref="areas" />
        <g ref="milestonesGroup" />
        <g ref="labels" />
        <g ref="tooltip" />
      </g>
      <g ref="xAxis" />
      <g ref="yAxis" />
    </svg>
  </div>
</template>

<script setup lang="ts">
// A stacked area chart: the lines of code alive over time, per year they were
// written in. The oldest years at the bottom.

import { axisBottom, axisLeft } from "d3-axis";
import { bisector, max } from "d3-array";
import { format } from "d3-format";
import { scaleLinear, scaleTime } from "d3-scale";
import { pointer, select } from "d3-selection";
import { area, stack, stackOffsetExpand, stackOffsetNone } from "d3-shape";
import "d3-transition";

const props = defineProps({
  // { dates: string[], years: string[], lines: number[][] }
  data: { type: Object },
  // Each year as a share of the total, instead of a number of lines.
  share: { type: Boolean, default: false },
  // Hand-picked events explaining the steps: { date, label }.
  milestones: { type: Array, default: () => [] },
});

const container = ref<HTMLElement | null>(null);
const content = ref<SVGGElement | null>(null);
const areas = ref<SVGGElement | null>(null);
const labels = ref<SVGGElement | null>(null);
const milestonesGroup = ref<SVGGElement | null>(null);
const tooltip = ref<SVGGElement | null>(null);
const xAxis = ref<SVGGElement | null>(null);
const yAxis = ref<SVGGElement | null>(null);

// The site's series colors, rotating every 8 years, for the neighbor years to
// differ clearly.
const color = (year: string, years: string[]) => {
  if (year === "unknown") return "var(--faint)";
  const known = years.filter(y => y !== "unknown");
  return `var(--series-${known.indexOf(year) % 8 + 1})`;
};

const lines = format(".3~s");
const percent = format(".1%");

const render = () => {
  if (!props.data || !container.value) return;
  const { years } = props.data;
  const rows = props.data.dates.map((date, i) => {
    const row = { date: new Date(date) };
    years.forEach((year, j) => row[year] = props.data.lines[i][j]);
    return row;
  });

  const margin = { top: 10, right: 50, bottom: 30, left: 60 };
  const width = container.value.clientWidth - margin.left - margin.right;
  const height = container.value.clientHeight - margin.top - margin.bottom;

  select(content.value).attr("transform", `translate(${margin.left}, ${margin.top})`);
  select(xAxis.value).attr("transform", `translate(${margin.left}, ${margin.top + height})`);
  select(yAxis.value).attr("transform", `translate(${margin.left}, ${margin.top})`);

  const series = stack()
    .keys(years)
    .offset(props.share ? stackOffsetExpand : stackOffsetNone)(rows);

  const x = scaleTime()
    .range([0, width])
    .domain([rows[0].date, rows.at(-1).date]);
  const y = scaleLinear()
    .range([height, 0])
    .domain([0, props.share ? 1 : max(series.at(-1), d => d[1])]);

  select(xAxis.value).call(axisBottom(x).ticks(width / 80));
  select(yAxis.value).transition().duration(500)
    .call(axisLeft(y).ticks(height / 50).tickFormat(props.share ? percent : lines));

  const shape = area()
    .x(d => x(d.data.date))
    .y0(d => y(d[0]))
    .y1(d => y(d[1]));

  select(areas.value)
    .selectAll("path")
    .data(series, s => s.key)
    .join("path")
    .attr("fill", s => color(s.key, years))
    .transition().duration(500)
    .attr("d", shape);

  // The milestones: a dashed line, labeled near the top. Labels on the right
  // half are written leftward, to stay inside the chart.
  const milestones = props.milestones
    .map(m => ({ ...m, x: x(new Date(m.date)) }))
    .filter(m => m.x >= 0 && m.x <= width);
  select(milestonesGroup.value)
    .selectAll(".milestone")
    .data(milestones, m => m.label)
    .join(enter => {
      const group = enter.append("g").attr("class", "milestone");
      group.append("line")
        .style("stroke", "var(--ink)")
        .style("stroke-opacity", 0.6)
        .attr("stroke-dasharray", "3 3");
      group.append("text")
        .attr("font-size", "11px")
        .attr("font-style", "italic")
        .style("fill", "var(--ink)")
        // A halo, to stay readable over the areas.
        .style("paint-order", "stroke")
        .style("stroke", "var(--bg)")
        .style("stroke-width", 3);
      return group;
    })
    .call(group => {
      group.select("line")
        .attr("x1", m => m.x)
        .attr("x2", m => m.x)
        .attr("y1", 0)
        .attr("y2", height);
      group.select("text")
        .attr("text-anchor", m => m.x > width / 2 ? "end" : "start")
        .attr("x", m => m.x > width / 2 ? m.x - 4 : m.x + 4)
        .attr("y", (m, i) => 12 + i * 14)
        .text(m => m.label);
    });

  // Label the years thick enough at the right edge.
  const last = series.map(s => ({ key: s.key, d: s.at(-1) }))
    .filter(({ d }) => y(d[0]) - y(d[1]) > 11);
  select(labels.value)
    .selectAll("text")
    .data(last, l => l.key)
    .join("text")
    .attr("x", width + 4)
    .attr("font-size", "11px")
    .attr("dominant-baseline", "middle")
    .style("fill", "var(--muted)")
    .text(l => l.key)
    .transition().duration(500)
    .attr("y", l => y((l.d[0] + l.d[1]) / 2));

  // On hover: the lines of every year at this date, newest first.
  const bisect = bisector(row => row.date).center;
  select(container.value)
    .on("pointerenter pointermove", event => {
      const i = bisect(rows, x.invert(pointer(event, content.value)[0]));
      const row = rows[i];
      const total = years.reduce((sum, year) => sum + row[year], 0);
      const entries = [...years].reverse().filter(year => row[year] > 0)
        .map(year => ({ year, value: row[year] }));
      const left = x(row.date) > width / 2;

      const group = select(tooltip.value).style("display", null);
      group.selectAll("line")
        .data([0])
        .join("line")
        .attr("x1", x(row.date)).attr("x2", x(row.date))
        .attr("y1", 0).attr("y2", height)
        .style("stroke", "var(--ink)")
        .style("stroke-opacity", 0.5);

      const box = group.selectAll("g.box")
        .data([0])
        .join(enter => {
          const g = enter.append("g").attr("class", "box");
          g.append("rect")
            .attr("rx", 6)
            .style("fill", "var(--tooltip-bg)")
            .style("opacity", 0.9);
          return g;
        })
        .attr("transform", `translate(${x(row.date) + (left ? -170 : 10)}, 4)`);
      box.select("rect")
        .attr("width", 160)
        .attr("height", 24 + 14 * entries.length);
      box.selectAll("text")
        .data([
          { label: row.date.toISOString().slice(0, 10), value: lines(total), bold: true },
          ...entries.map(e => ({
            label: e.year,
            value: props.share ? percent(e.value / total) : lines(e.value),
            color: color(e.year, years),
          })),
        ])
        .join("text")
        .attr("x", 8)
        .attr("y", (_, i) => 16 + 14 * i)
        .attr("font-size", "11px")
        .attr("font-weight", d => d.bold ? "bold" : null)
        .style("fill", "var(--tooltip-ink)")
        .text(d => d.label)
        .selectAll("tspan")
        .data(d => [d])
        .join("tspan")
        .attr("x", 152)
        .attr("text-anchor", "end")
        .text(d => d.value);
      box.selectAll("circle")
        .data(entries)
        .join("circle")
        .attr("cx", 50)
        .attr("cy", (_, i) => 26 + 14 * i)
        .attr("r", 4)
        .style("fill", e => color(e.year, years));
    })
    .on("pointerleave", event => {
      // On touch screens, keep the tooltip of the last tap.
      if (event.pointerType === "touch") return;
      select(tooltip.value).style("display", "none");
    });
};

onMounted(() => {
  render();
  (new ResizeObserver(render)).observe(container.value);
});
watch(() => [props.data, props.share, props.milestones], render);
</script>

<style scoped>
.container {
  height: 100%;
  position: relative;
  width: 100%;
}

svg {
  height: 100%;
  touch-action: pan-y;
  width: 100%;
}

.accretion-skeleton {
  inset: 0;
  position: absolute;
}
</style>
