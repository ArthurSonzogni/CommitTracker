<template>
  <div class="centered">
    <svg ref="svg_ref">
      <g ref="svg_content_ref" />
      <g ref="tooltip_ref"  display="none" opacity="0.9">
        <rect
          width="80"
          height="50"
          fill="#eee"
          rx="10"
          ry="10"
          stroke="gray"
          stroke-width="1"
        />
        <text
          class="count"
          x="10"
          y="22"
          font-size="20px"
          font-weight="bold">
          0
        </text>
        <text
          class="date"
          x="10"
          y="42"
          font-size="12px"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">

import { select } from "d3-selection";
import "d3-transition";
import { scalePow} from "d3-scale";

// This implements a github-style heatmap calendar using d3.js

const props = defineProps({
  data: {
    type: Array,
    required: true,
  },
});

const svg_ref = ref<SVGSVGElement | null>(null);
const tooltip_ref = ref<SVGGElement | null>(null);
const svg_content_ref = ref<SVGGElement | null>(null);

// The set of years encountered so far.
const year_cache = new Set();

const refresh = async () => {
  // The data format is:
  // [
  //   {
  //     label: String
  //     values: [{
  //       x: Date,
  //       y: number
  //     }]
  //   }
  if (!props.data.length) {
    return;
  }

  // Group by year.
  const per_year = {};
  for(const dataset of props.data) {
    for(const row of dataset.values) {
      const year = row.x.getFullYear();
      if (!per_year[year]) {
        per_year[year] = [];
      }
      per_year[year].push(row);
      year_cache.add(year);
    }
  }

  // Accumulate the data for each year in a 365 matrix.
  // Format:
  // {
  //   2021: [ number, number, ... ]
  //   2022: [ number, number, ... ]
  // }
  const heatmap = [];
  for(const year in per_year) {
    const year_data = {};

    // We want the first displayed cell to be a Sunday. We leave blank cells
    // before.
    const first_day = new Date(year, 0, 1);
    const offset = first_day.getDay();

    for(const row of per_year[year]) {
      const id = Math.floor((row.x - first_day) / (1000 * 60 * 60 * 24));
      const y = row.x.getDay(); // The weekday.
      const x = Math.floor((id + offset) / 7);
      year_data[id] ||= {x, y, z: 0, date: row.x};
      year_data[id].z += row.y;
    }

    // Fill in the blanks.
    const min_id = Math.min(...Object.keys(year_data).map(Number));
    const max_id = Math.max(...Object.keys(year_data).map(Number));

    heatmap.push({
      year: year,
      data: Object.values(year_data),
    })
  }

  const height_per_year = 200;
  const height = heatmap.length * height_per_year;

  let max_value_98percentile = 0;
  const values = [];
  for(const row of heatmap) {
    for(const key in row.data) {
      values.push(row.data[key].z);
    }
  }
  values.sort((a, b) => a - b);
  max_value_98percentile = values[Math.floor(values.length * 0.98)];

  const color_scale = scalePow()
    .domain([0, max_value_98percentile + 1])
    .range(["#eeeeee", "green"])
    .exponent(0.7);


  const update_year_rect = year_rect => {
    return year_rect
      .attr("transform", (d, i) => `translate(0, ${i * height_per_year})`)
      .attr("opacity", 1)
  }

  const update_cell = cell => {
    return cell
      .attr("fill", d => color_scale(d.z))
      .attr("width", 16)
      .attr("height", 16)
      .attr("opacity", 1)
  }

  select(svg_ref.value)
    .attr("width", 1200)
    .attr("height", height);

  heatmap.sort((b, a) => a.year - b.year);
  const svg = select(svg_content_ref.value);
  svg
    .selectAll("g")
    .data(heatmap, d => d.year)
    .join(
      enter => {
        const g = enter.append("g");
        g.attr("opacity", 0)
        g.attr("transform", (d, i) => `translate(-300, ${i * height_per_year})`)

        // Transition the opacity and the transform.
        update_year_rect(
        g.transition()
         .duration(300)
         .delay((d, i) => i * 100)
        )

        const title = g.append("text")
        title.text(d => d.year)
          .attr("x", 0)
          .attr("y", 30)
          .attr("font-weight", "bold")
          .attr("font-size", "12px")
          .attr("fill", "black")

        const rect = g.append("rect")
        rect
          .attr("x", 0)
          .attr("y", 40)
          .attr("width", 400)
          .attr("height", height_per_year - 80)
          .attr("fill", "white")

        // Add the weekdays on the left.
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for(let i = 0; i < 7; i++) {
          const text = g.append("text")
          text.text(weekdays[i])
            .attr("x", 0)
            .attr("y", 52+i * 18)
            .attr("font-size", "12px")
            .attr("opacity", 0.5)
        }

        // Add the month names on the top.
        const months = [
          "Jan", "Feb", "Mar", "Apr",
          "May", "Jun", "Jul", "Aug",
          "Sep", "Oct", "Nov", "Dec"
        ];
        for(let i = 0; i < 12; i++) {
          const text = g.append("text")
          text.text(months[i])
            .attr("x", 40 + i * 80)
            .attr("y", 30)
            .attr("font-size", "12px")
            .attr("opacity", 0.5)
        }

        return g;
      },
      update => {
        return update_year_rect(update);
      },
      exit => {
        exit.remove()
      }
    )
    .selectAll("rect")
    .data(d => d.data, d => { return d.x + "," + d.y; })
    .join(
      enter => {
        const rect = enter.append("rect")
        rect
          .attr("x", (d, i) => 30 + d.x * 18)
          .attr("y", (d, i) => d.y * 18 + 40)

        update_cell(rect.transition().duration(300).delay((d, i) => i ));

        // Change the rect stroke on mouse/enter/leave.
        rect.on("mouseenter", function(event, d) {
          select(this).attr("stroke", "black");
        })
        rect.on("mouseleave", function(event, d) {
          select(this).attr("stroke", "none");
        })

        // Replace mousemove by mouse click.
        rect.on("mousemove", function(event, d) {
          const box = select(this).node().getBoundingClientRect();

          // Use the mouse position to place the tooltip.
          let x = event.offsetX - 25;
          let y = event.offsetY + 30;

          // Use some modulo to emulate the tooltip sticking to the cell.
          x = Math.floor(x / 18) * 18;
          y = Math.floor(y / 18) * 18;

          // Clamp the tooltip to the window.
          x = Math.max(x, 50);
          x = Math.min(x, 900);
          y = Math.max(y, 50);

          select(tooltip_ref.value)
            .attr("transform", `translate(${x}, ${y})`)
            .attr("display", "block")

          // Transition the text.
          select(tooltip_ref.value).select(".count")
            .transition()
            .duration(100)
            .textTween(function() {
              const previous_value = parseInt(select(this).text()) || 0;
              return t => {
                const current_value = Math.floor(previous_value + (d.z - previous_value) * t);
                return current_value;
              }
            })
          select(tooltip_ref.value).select(".date").text(d.date.toISOString().split("T")[0]);
        })

      },
      update => {
        update_cell(update.transition().duration(300).delay((d, i) => i ));
        return update;
      },
      exit => {
        exit
          .transition()
          .duration(300)
          .delay((d, i) => i)
          .attr("opacity", 0).remove();
      }
    )
};
watch(() => props.data, refresh)
onMounted(refresh);

</script>

<style scoped>

.centered {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  background: white;
}

</style>
