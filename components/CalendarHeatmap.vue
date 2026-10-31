<template>
  <div class="centered">
    <svg ref="svg_ref">
      <g ref="svg_content_ref" />
      <g ref="tooltip_ref" display="none" opacity="0.95" style="pointer-events: none;">
        <rect
          width="88"
          height="50"
          fill="var(--surface)"
          rx="10"
          ry="10"
          stroke="var(--line-strong)"
          stroke-width="1" />
        <text
          class="count"
          x="10"
          y="22"
          font-size="20px"
          font-weight="bold"
          fill="var(--ink)">
          0
        </text>
        <text
          class="date"
          x="10"
          y="42"
          font-size="12px"
          fill="var(--muted)" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { select } from "d3-selection";
import "d3-transition";
import { scalePow } from "d3-scale";
import type { PropType } from "vue";

interface HeatmapPoint {
  x: Date;
  y: number;
}

interface HeatmapSeries {
  label: string;
  values: HeatmapPoint[];
}

interface CellDatum {
  x: number;
  y: number;
  z: number;
  date: Date;
}

const props = defineProps({
  data: {
    type: Array as PropType<HeatmapSeries[]>,
    required: true,
  },
});

const svg_ref = ref<SVGSVGElement | null>(null);
const tooltip_ref = ref<SVGGElement | null>(null);
const svg_content_ref = ref<SVGGElement | null>(null);

const refresh = () => {
  if (!svg_ref.value || !svg_content_ref.value) {
    return;
  }
  if (!props.data.length) {
    select(svg_content_ref.value).selectAll("*").remove();
    select(svg_ref.value).attr("height", 0);
    return;
  }

  // Group by year.
  const per_year: Record<number, HeatmapPoint[]> = {};
  for (const dataset of props.data) {
    for (const row of dataset.values) {
      const year = row.x.getFullYear();
      if (!per_year[year]) {
        per_year[year] = [];
      }
      per_year[year].push(row);
    }
  }

  const heatmap: Array<{ year: number; data: CellDatum[] }> = [];
  for (const yearStr in per_year) {
    const year = Number(yearStr);
    const year_data: Record<number, CellDatum> = {};

    // First displayed cell is Sunday; leave blank cells before Jan 1.
    const first_day = new Date(year, 0, 1);
    const offset = first_day.getDay();

    for (const row of per_year[year]) {
      const id = Math.floor((row.x.getTime() - first_day.getTime()) / (1000 * 60 * 60 * 24));
      const y = row.x.getDay();
      const x = Math.floor((id + offset) / 7);
      year_data[id] ||= { x, y, z: 0, date: row.x };
      year_data[id].z += row.y;
    }

    heatmap.push({
      year,
      data: Object.values(year_data),
    });
  }

  const height_per_year = 200;
  const height = heatmap.length * height_per_year;

  const values: number[] = [];
  for (const row of heatmap) {
    for (const cell of row.data) {
      values.push(cell.z);
    }
  }
  values.sort((a, b) => a - b);
  const max_value_98percentile = values[Math.floor(values.length * 0.98)] ?? 0;

  const css = getComputedStyle(document.documentElement);
  const color_scale = scalePow<string>()
    .domain([0, max_value_98percentile + 1])
    .range([
      css.getPropertyValue("--surface-sunken").trim() || "#ebedf0",
      css.getPropertyValue("--heat-high").trim() || "#216e39",
    ])
    .exponent(0.7);

  const update_year_rect = (year_rect: any) =>
    year_rect
      .attr("transform", (_d: any, i: number) => `translate(0, ${i * height_per_year})`)
      .attr("opacity", 1);

  const update_cell = (cell: any) =>
    cell
      .attr("fill", (d: CellDatum) => color_scale(d.z))
      .attr("width", 16)
      .attr("height", 16)
      .attr("opacity", 1);

  select(svg_ref.value)
    .attr("width", 1200)
    .attr("height", height);

  heatmap.sort((a, b) => b.year - a.year);
  const svg = select(svg_content_ref.value);
  svg
    .selectAll<SVGGElement, { year: number; data: CellDatum[] }>("g")
    .data(heatmap, (d) => d.year)
    .join(
      (enter) => {
        const g = enter.append("g");
        g.attr("opacity", 0);
        g.attr("transform", (_d, i) => `translate(-300, ${i * height_per_year})`);

        update_year_rect(
          g.transition()
            .duration(300)
            .delay((_d, i) => i * 100),
        );

        g.append("text")
          .text((d) => d.year)
          .attr("x", 0)
          .attr("y", 30)
          .attr("font-weight", "bold")
          .attr("font-size", "12px")
          .attr("fill", "var(--ink)");

        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 0; i < 7; i++) {
          g.append("text")
            .text(weekdays[i])
            .attr("x", 0)
            .attr("y", 52 + i * 18)
            .attr("font-size", "12px")
            .attr("fill", "var(--muted)");
        }

        const months = [
          "Jan", "Feb", "Mar", "Apr",
          "May", "Jun", "Jul", "Aug",
          "Sep", "Oct", "Nov", "Dec",
        ];
        for (let i = 0; i < 12; i++) {
          g.append("text")
            .text(months[i])
            .attr("x", 40 + i * 80)
            .attr("y", 30)
            .attr("font-size", "12px")
            .attr("fill", "var(--muted)");
        }

        return g;
      },
      (update) => update_year_rect(update),
      (exit) => exit.remove(),
    )
    .selectAll<SVGRectElement, CellDatum>("rect")
    .data(
      (d) => d.data,
      (d) => `${d.x},${d.y}`,
    )
    .join(
      (enter) => {
        const rect = enter
          .append("rect")
          .attr("x", (d) => 30 + d.x * 18)
          .attr("y", (d) => d.y * 18 + 40);

        update_cell(rect.transition().duration(300).delay((_d, i) => i));

        rect.on("mouseenter", function () {
          select(this).attr("stroke", "var(--ink)");
        });
        rect.on("mouseleave", function () {
          select(this).attr("stroke", "none");
          if (tooltip_ref.value) {
            select(tooltip_ref.value).attr("display", "none");
          }
        });

        rect.on("mousemove", function (event: MouseEvent, d: CellDatum) {
          let x = event.offsetX - 25;
          let y = event.offsetY + 30;

          x = Math.floor(x / 18) * 18;
          y = Math.floor(y / 18) * 18;

          x = Math.max(x, 50);
          x = Math.min(x, 900);
          y = Math.max(y, 50);

          if (!tooltip_ref.value) return;
          select(tooltip_ref.value)
            .attr("transform", `translate(${x}, ${y})`)
            .attr("display", "block");

          select(tooltip_ref.value)
            .select(".count")
            .transition()
            .duration(100)
            .textTween(function () {
              const previous_value = parseInt(select(this).text()) || 0;
              return (t) => String(Math.floor(previous_value + (d.z - previous_value) * t));
            });
          select(tooltip_ref.value)
            .select(".date")
            .text(d.date.toISOString().split("T")[0]);
        });

        return rect;
      },
      (update) => {
        update_cell(update.transition().duration(300).delay((_d, i) => i));
        return update;
      },
      (exit) =>
        exit
          .transition()
          .duration(300)
          .delay((_d, i) => i)
          .attr("opacity", 0)
          .remove(),
    );
};

let themeObserver: MutationObserver | null = null;

watch(() => props.data, refresh);

onMounted(() => {
  refresh();
  if (typeof MutationObserver !== "undefined") {
    themeObserver = new MutationObserver(refresh);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
});
</script>

<style scoped>
.centered {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow-x: auto;
}
</style>
