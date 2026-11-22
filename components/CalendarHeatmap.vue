<template>
  <div class="calendar-heatmap">
    <div v-if="hasData" class="heatmap-legend" aria-hidden="true">
      <span>Less</span>
      <span
        v-for="(swatch, idx) in legendSwatches"
        :key="idx"
        class="legend-swatch"
        :style="{ backgroundColor: swatch }"
      />
      <span>More</span>
    </div>
    <div class="svg-scroll">
      <svg ref="svg_ref" class="heatmap-svg">
        <g ref="svg_content_ref" />
        <g ref="tooltip_ref" display="none" opacity="0.97" style="pointer-events: none;">
          <rect
            width="156"
            height="50"
            fill="var(--surface)"
            rx="8"
            ry="8"
            stroke="var(--line-strong)"
            stroke-width="1"
          />
          <text
            class="count"
            x="12"
            y="22"
            font-size="15px"
            font-weight="700"
            fill="var(--ink)"
          >
            0
          </text>
          <text
            class="date"
            x="12"
            y="40"
            font-size="11.5px"
            fill="var(--muted)"
          />
        </g>
      </svg>
    </div>
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
  dateStr: string;
}

interface YearHeatmap {
  year: number;
  data: CellDatum[];
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
const legendSwatches = ref<string[]>([]);
const hasData = ref(false);

const DAY_MS = 24 * 60 * 60 * 1000;
const SVG_WIDTH = 1000;
const CELL = 15;
const STEP = 18;
const LEFT_PAD = 36;
const TOP_PAD = 32;
const YEAR_HEIGHT = TOP_PAD + 7 * STEP + 20;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr",
  "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec",
];

const formatDateLabel = (year: number, monthIdx: number, day: number, weekday: number) => {
  const m = String(monthIdx + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${WEEKDAYS[weekday]}, ${year}-${m}-${d}`;
};

const refresh = () => {
  if (!svg_ref.value || !svg_content_ref.value) {
    return;
  }
  const hasPoints = props.data.some((s) => s.values && s.values.length > 0);
  hasData.value = hasPoints;
  if (!hasPoints) {
    select(svg_content_ref.value).selectAll("*").remove();
    select(svg_ref.value).attr("viewBox", `0 0 ${SVG_WIDTH} 0`).attr("height", 0);
    legendSwatches.value = [];
    return;
  }

  // Group by UTC year & day-of-year so dates stay consistent across timezones.
  const perYear = new Map<number, Map<number, CellDatum>>();
  for (const dataset of props.data) {
    for (const row of dataset.values) {
      const year = row.x.getUTCFullYear();
      let yearMap = perYear.get(year);
      if (!yearMap) {
        yearMap = new Map();
        perYear.set(year, yearMap);
      }
      const jan1Ms = Date.UTC(year, 0, 1);
      const dayOfYear = Math.floor((row.x.getTime() - jan1Ms) / DAY_MS);
      if (dayOfYear < 0 || dayOfYear > 366) continue;

      let cell = yearMap.get(dayOfYear);
      if (!cell) {
        const offset = new Date(jan1Ms).getUTCDay();
        const weekday = row.x.getUTCDay();
        const week = Math.floor((dayOfYear + offset) / 7);
        cell = {
          x: week,
          y: weekday,
          z: 0,
          dateStr: formatDateLabel(year, row.x.getUTCMonth(), row.x.getUTCDate(), weekday),
        };
        yearMap.set(dayOfYear, cell);
      }
      cell.z += row.y;
    }
  }

  const heatmap: YearHeatmap[] = Array.from(perYear.entries())
    .map(([year, map]) => ({ year, data: Array.from(map.values()) }))
    .sort((a, b) => b.year - a.year);

  const height = heatmap.length * YEAR_HEIGHT + 16;

  const values: number[] = [];
  for (const row of heatmap) {
    for (const cell of row.data) {
      if (cell.z > 0) values.push(cell.z);
    }
  }
  values.sort((a, b) => a - b);
  const maxValue98 = values[Math.floor(values.length * 0.98)] ?? 1;

  const css = getComputedStyle(document.documentElement);
  const zeroColor = css.getPropertyValue("--surface-sunken").trim() || "#ebedf0";
  const highColor = css.getPropertyValue("--heat-high").trim() || "#216e39";
  const colorScale = scalePow<string>()
    .domain([0, maxValue98 + 1])
    .range([zeroColor, highColor])
    .exponent(0.7)
    .clamp(true);

  legendSwatches.value = [0, 0.2, 0.45, 0.72, 1].map((t) =>
    colorScale(t * (maxValue98 + 1)),
  );

  select(svg_ref.value)
    .attr("viewBox", `0 0 ${SVG_WIDTH} ${height}`)
    .attr("width", SVG_WIDTH)
    .attr("height", height);

  const positionTooltip = (event: MouseEvent) => {
    if (!tooltip_ref.value || !svg_ref.value) return;
    const pt = svg_ref.value.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg_ref.value.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const x = Math.min(Math.max(10, local.x + 14), SVG_WIDTH - 166);
    const y = Math.min(Math.max(10, local.y - 58), Math.max(10, height - 56));
    select(tooltip_ref.value)
      .attr("transform", `translate(${x}, ${y})`)
      .attr("display", "block");
  };

  const hideTooltip = () => {
    if (tooltip_ref.value) {
      select(tooltip_ref.value).attr("display", "none");
    }
  };

  const updateYearGroup = (g: any) =>
    g
      .attr("transform", (_d: any, i: number) => `translate(0, ${i * YEAR_HEIGHT})`)
      .attr("opacity", 1);

  const updateCell = (cell: any) =>
    cell
      .attr("fill", (d: CellDatum) => (d.z === 0 ? zeroColor : colorScale(d.z)))
      .attr("width", CELL)
      .attr("height", CELL)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("opacity", 1);

  const svg = select(svg_content_ref.value);
  const yearGroups = svg
    .selectAll<SVGGElement, YearHeatmap>("g.year-group")
    .data(heatmap, (d) => d.year)
    .join(
      (enter) => {
        const g = enter.append("g").classed("year-group", true);
        g.attr("opacity", 0);
        g.attr("transform", (_d, i) => `translate(0, ${i * YEAR_HEIGHT})`);
        updateYearGroup(g.transition().duration(240));

        g.append("text")
          .text((d) => String(d.year))
          .attr("x", 0)
          .attr("y", 20)
          .attr("font-weight", "700")
          .attr("font-size", "13px")
          .attr("fill", "var(--ink)");

        for (const dayIdx of [1, 3, 5]) {
          g.append("text")
            .text(WEEKDAYS[dayIdx])
            .attr("x", 0)
            .attr("y", TOP_PAD + dayIdx * STEP + 11)
            .attr("font-size", "11px")
            .attr("fill", "var(--muted)");
        }

        g.each(function (d) {
          const group = select(this);
          const jan1Ms = Date.UTC(d.year, 0, 1);
          const offset = new Date(jan1Ms).getUTCDay();
          for (let m = 0; m < 12; m++) {
            const firstOfMonth = Date.UTC(d.year, m, 1);
            const dayIdx = Math.floor((firstOfMonth - jan1Ms) / DAY_MS);
            const week = Math.floor((dayIdx + offset) / 7);
            group
              .append("text")
              .text(MONTHS[m])
              .attr("x", LEFT_PAD + week * STEP)
              .attr("y", 20)
              .attr("font-size", "11px")
              .attr("fill", "var(--muted)");
          }
        });

        g.append("g").classed("day-cells", true);

        return g;
      },
      (update) => updateYearGroup(update),
      (exit) => exit.remove(),
    );

  yearGroups
    .select("g.day-cells")
    .selectAll<SVGRectElement, CellDatum>("rect.day-cell")
    .data(
      (d) => d.data,
      (d) => `${d.x},${d.y}`,
    )
    .join(
      (enter) => {
        const rect = enter
          .append("rect")
          .classed("day-cell", true)
          .attr("x", (d) => LEFT_PAD + d.x * STEP)
          .attr("y", (d) => TOP_PAD + d.y * STEP);

        updateCell(rect);

        rect.on("mouseenter", function (_event: MouseEvent, d: CellDatum) {
          select(this).attr("stroke", "var(--ink)").attr("stroke-width", 1.5);
          if (!tooltip_ref.value) return;
          select(tooltip_ref.value)
            .select(".count")
            .text(`${d.z.toLocaleString("en-US")} ${d.z === 1 ? "commit" : "commits"}`);
          select(tooltip_ref.value).select(".date").text(d.dateStr);
        });

        rect.on("mouseleave", function () {
          select(this).attr("stroke", "none");
          hideTooltip();
        });

        rect.on("mousemove", positionTooltip);

        return rect;
      },
      (update) => updateCell(update),
      (exit) => exit.remove(),
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
.calendar-heatmap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
  font-size: 0.76rem;
  color: var(--muted);
}

.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
}

.svg-scroll {
  overflow-x: auto;
}

.heatmap-svg {
  display: block;
  width: 100%;
  height: auto;
  min-width: 720px;
}
</style>
