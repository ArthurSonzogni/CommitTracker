<template>
  <div ref="container" align="center">
    <svg ref="svg" :width="svgWidth" :height="svgHeight">
      <g ref="arcs"></g>
      <g ref="indicators"></g>
      <g ref="legend"></g>
    </svg>
  </div>
</template>

<script setup lang="ts">

import {max} from "d3-array";
import {scaleLinear, scaleRadial} from "d3-scale";
import {select} from "d3-selection";
import {arc} from "d3-shape";
import {interpolate} from "d3-interpolate";
import {local} from "d3-selection";
import "d3-transition";

const indicatorDataAll = [
  ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"],
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
];

const currentState = local();
const now = new Date();

const { $chromeDataAll, $color } = useNuxtApp();

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  developers: { type: Array },
  dates: { type: Array[Date] },
  author: { type: Boolean },
  review: { type: Boolean },
  stacked: { type: Boolean },
  hourlyParam: { type: Number },
  buckets: { type: Number, default: 24},
});

const container = ref<HTMLElement | null>(null);
const arcs = ref<SVGGElement | null>(null);
const indicators = ref<SVGGElement | null>(null);
const legend = ref<SVGGElement | null>(null);

interface Arc {
  angle: number;
  buckets: number;
  inner: number;
  outer: number;
  developer: string;
}

interface Data {
  developers: Array<string>;
  arcs: Array<Arc>;
}

const data = ref<Data>([]);
const svgWidth = ref<number>(300);
const svgHeight = ref<number>(300);

const modulo = computed(() => {
  switch(props.hourlyParam) {
    case 0: return 24 * 60 * 60 * 1000;
    case 1: return 7 * 24 * 60 * 60 * 1000;
    case 2: return 365 * 24 * 60 * 60 * 1000;
  }
  return 0;
});

const filteredData = computed(() => {

  const developers = data.value.map(d => d.developer);

  // Filter:
  let data_2 = data.value;

  data_2 = data_2.map(d => {
    let commits = d.data;
    if (!props.author) {
      commits = commits.filter(commit => commit.kind != "author")
    }

    if (!props.review) {
      commits = commits.filter(commit => commit.kind != "review")
    }

    const values = commits
      .map(commit => new Date(commit.date))
      .sort((a,b) => (a-b))
      .filter(date => {
        return date >= props.dates[0] && date <= props.dates[1];
      })

    return {
      developer: d.developer,
      values: values.map(time => {
        const seconds = now - time;
        return (seconds % modulo.value) / modulo.value;
      })
    }
  });

  let inner = new Array(props.buckets).fill(0);

  data_2 = data_2.map(entry => {
    const outer = [...inner];
    entry.values.forEach(time => {
      outer[Math.floor(time * props.buckets)]++;
    });
    const out = {
      developer: entry.developer,
      values: outer.map((_v, i) => {
        return {
          angle: i,
          buckets: props.buckets,
          inner: inner[i],
          outer: outer[i],
          developer: entry.developer,
        };
      })
    }
    inner = props.stacked
      ? outer
      : new Array(props.buckets).fill(0);

    return out;
  });

  data_2 = data_2.map(entry => entry.values).flat()
  return {
    developers: developers,
    arcs: data_2,
  }
});

const max_value = computed(() => {
  return max(
    filteredData.value.arcs.map(e => e.outer)
  );
});

const developersChanged = async () => {
  data.value = await $chromeDataAll(props.repositories, props.developers);
}

const initialize = () => {
  try {
    svgWidth.value = container.value.clientWidth;
    svgWidth.value = Math.min(svgWidth.value, 800);
    svgWidth.value = Math.min(svgWidth.value, window.innerWidth * 0.8);
    svgWidth.value = Math.min(svgWidth.value,
      Math.max(0, (window.innerHeight - 300) * 0.9));
    svgHeight.value = svgWidth.value;
  } catch (e) {
    console.log(e);
  }
  developersChanged();
  render();
  window.addEventListener("resize", initialize);
}

const render = () => {
  select(arcs.value)
    .attr("transform", `translate(${svgWidth.value/2}, ${svgHeight.value/2})`);
  select(indicators.value)
    .attr("transform", `translate(${svgWidth.value/2}, ${svgHeight.value/2})`);

  const innerRadius = Math.max(svgWidth.value, svgHeight.value) * 0.2;
  const outerRadius = Math.max(svgWidth.value, svgHeight.value) * 0.5;

  const x = scaleLinear()
    .domain([0, props.buckets])
    .range([0, 2 * Math.PI])

  const y = scaleRadial()
    .domain([0, max_value.value])
    .range([innerRadius, outerRadius])

  const Scale = data => {
    return {
      startAngle: x(data.angle),
      endAngle: x(data.angle + 1.0),
      padAngle: x(0.05),
      innerRadius: y(data.inner),
      outerRadius: y(data.outer),
    }
  };

  const ArcInterpolator = function(a, b) {
    return function(t) {
      const current = {
        startAngle: interpolate(a.startAngle, b.startAngle)(t),
        endAngle: interpolate(a.endAngle, b.endAngle)(t),
        innerRadius: interpolate(a.innerRadius, b.innerRadius)(t),
        outerRadius: interpolate(a.outerRadius, b.outerRadius)(t),
        padAngle: interpolate(a.padAngle, b.padAngle)(t),
      };
      currentState.set(this, current);
      return MakeArc(current);
    };
  };

  const MakeArc = arc()
    .innerRadius(d => d.innerRadius)
    .outerRadius(d => d.outerRadius)
    .startAngle(d => -d.endAngle)
    .endAngle(d => -d.startAngle)
    .padAngle(d => d.padAngle)
    .cornerRadius(d => d.padAngle * 1000)
  ;

  select(arcs.value)
    .selectAll("path")
    .data(filteredData.value.arcs, d => `${d.developer}-${d.angle}-${d.buckets}`)
    .join(
      enter => {
        return enter
          .append("path")
          .attr("fill", d => $color(d.developer))
          .attr("d", d => MakeArc(Scale(d)))
          .attr("opacity", 0)
          .transition()
          .duration(1000)
          .attr("opacity", 0.5)
          .attrTween('d', function (d) {
            const previous = Scale({
              angle: d.angle,
              inner: 0,
              outer: 0,
            });
            const next = Scale(d)
            return ArcInterpolator(previous, next);
          })
      },
      update => {
        return update
          .transition()
          .duration(1000)
          .attr("opacity", 0.5)
          .attrTween('d', function (d) {
            const previous = currentState.get(this);
            const next = Scale(d)
            return ArcInterpolator(previous, next);
          });
      },
      exit => {
        return exit
          .transition()
          .duration(1000)
          .attr("opacity", 0)
          .attrTween('d', function (_d) {
            const previous = currentState.get(this);
            const next = Scale({
              angle: 0,
              padAngle: 0,
              inner: 0,
              outer: 0,
            });
            next.startAngle = previous.startAngle;
            next.endAngle = previous.endAngle;
            next.padAngle = previous.padAngle;
            return ArcInterpolator(previous, next);
          })
          .remove();
      }
    )

  const indicatorData = indicatorDataAll[props.hourlyParam].map((d, i) => {

    const timezero = new Date("2000-01-03T00:00:00.000");
    const dephasage = ((now - timezero) % modulo.value) / modulo.value;
    const angle = i / indicatorDataAll[props.hourlyParam].length;
    return {
      text: d,
      angle: (angle - dephasage - 0.25) * 360,
    }
  });

  select(indicators.value)
    .selectAll("text")
    .data(indicatorData, d => `${d.text}-${d.angle}`)
    .join(
      enter => {
        return enter
          .append("text")
          .attr("x", innerRadius * 0.5)
          .attr("y", 0)
          .attr("text-anchor", "end")
          .attr("alignment-baseline", "middle")
          .attr("opacity", 1)
          .text(d => d.text)
          .attr("transform", d => `rotate(${d.angle})`)
          .transition()
          .duration(1000)
          .attr("font-size", innerRadius*0.1)
          .attr("x", innerRadius * 0.9)
          .attr("opacity", 0.5)
        ;
      },
      update => {
        return update
          .transition()
          .duration(1000)
          .attr("font-size", innerRadius*0.1)
          .attr("x", innerRadius * 0.9)
          .attr("opacity", 0.5)
      },
      exit => {
        return exit
          .transition()
          .duration(1000)
          .attr("x", innerRadius * 1)
          .attr("opacity", 0)
          .remove();
      }
    )

  select(legend.value)
    .selectAll(".legend")
    .data(filteredData.value.developers, d => d)
    .join(
      enter => {enter
        const group = enter
          .append("g")
          .attr("class", "legend")

        group
          .attr("opacity", 0)
          .attr("transform", (_d, i) => `translate(100, ${i*20+20})`)
          .transition()
          .duration(500)
          .attr("transform", (_d, i) => `translate(10, ${i*20+20})`)
          .attr("opacity", 1)

        group
          .append("text")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("fill", d => $color(d))
          .text(d => d)
        return group;
      },
      update => {
        update
          .transition()
          .duration(1000)
          .attr("transform", (_d, i) => `translate(10, ${i*20+20})`)
          .attr("opacity", 1)
        return update;
      },
      exit => {
        exit
          .transition()
          .duration(500)
          .attr("transform", (_d, i) => `translate(100, ${i*20+20})`)
          .attr("opacity", 0)
          .remove()
      }
    )
}

watch(() => props.developers, developersChanged);
watch(() => props.repositories, developersChanged);
watch(filteredData, render);

onMounted(initialize)

</script>

<style scoped>
.svg-container {
  width: 100%;
  height:100%;
  min-height:500px;
}

</style>
