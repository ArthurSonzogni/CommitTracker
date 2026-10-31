<template>
  <div ref="container" align="center">
    <svg ref="svg" :width="svgWidth" :height="svgWidth">
      <g ref="arcs"></g>
      <g ref="indicators" class="indicators"></g>
      <g ref="legend"></g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { max } from "d3-array";
import { scaleLinear, scaleRadial } from "d3-scale";
import { local, select } from "d3-selection";
import { arc } from "d3-shape";
import { interpolate } from "d3-interpolate";
import "d3-transition";
import type { PropType } from "vue";
import {
  useDeveloperCommits,
  type DeveloperCommitsEntry,
} from "~/composables/useDeveloperCommits";
import { useElementSize } from "~/composables/useElementSize";

const indicatorDataAll = [
  ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"],
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
];

interface ScaledArc {
  startAngle: number;
  endAngle: number;
  padAngle: number;
  innerRadius: number;
  outerRadius: number;
}

interface ArcDatum {
  angle: number;
  buckets: number;
  inner: number;
  outer: number;
  developer: string;
}

const currentState = local<ScaledArc>();
const nowMs = Date.now();
const timezeroMs = new Date("2000-01-03T00:00:00.000").getTime();

const { $color } = useNuxtApp();

const props = defineProps({
  repositories: {
    type: Array as PropType<string[]>,
    default: () => ["chromium"],
  },
  developers: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  dates: {
    type: Array as PropType<Date[]>,
    default: undefined,
  },
  author: { type: Boolean, default: true },
  review: { type: Boolean, default: true },
  stacked: { type: Boolean, default: false },
  hourlyParam: { type: Number, default: 0 },
  buckets: { type: Number, default: 24 },
  commits: {
    type: Array as PropType<DeveloperCommitsEntry[]>,
    default: undefined,
  },
});

const container = ref<HTMLElement | null>(null);
const arcs = ref<SVGGElement | null>(null);
const indicators = ref<SVGGElement | null>(null);
const legend = ref<SVGGElement | null>(null);

const { width: containerWidth } = useElementSize(container, { width: 300 });
const svgWidth = ref(300);

const { filtered: fetchedFiltered } = useDeveloperCommits({
  repo: () => (props.commits !== undefined ? "" : props.repositories),
  developers: () => (props.commits !== undefined ? [] : props.developers),
  dates: () => props.dates,
  author: () => props.author,
  review: () => props.review,
});

const entries = computed<DeveloperCommitsEntry[]>(() => {
  if (props.commits === undefined) {
    return fetchedFiltered.value;
  }
  const hasDateBounds =
    Array.isArray(props.dates) &&
    props.dates.length >= 2 &&
    props.dates[0] instanceof Date &&
    props.dates[1] instanceof Date;
  const startMs = hasDateBounds ? props.dates![0].getTime() : -Infinity;
  const endMs = hasDateBounds ? props.dates![1].getTime() : Infinity;

  return props.commits.map((entry) => {
    if (!props.author && !props.review) {
      return { developer: entry.developer, data: [] };
    }
    const data = entry.data.filter((commit) => {
      if (!props.author && commit.kind === "author") return false;
      if (!props.review && commit.kind === "review") return false;
      const t = commit.timeMs ?? Date.parse(commit.date);
      return t >= startMs && t <= endMs;
    });
    return { developer: entry.developer, data };
  });
});

const modulo = computed(() => {
  switch (props.hourlyParam) {
    case 0:
      return 24 * 60 * 60 * 1000;
    case 1:
      return 7 * 24 * 60 * 60 * 1000;
    case 2:
      return 365 * 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
});

const filteredData = computed(() => {
  const developers = entries.value.map((d) => d.developer);
  const mod = modulo.value;
  const bucketCount = Math.max(1, props.buckets);

  let inner = new Array<number>(bucketCount).fill(0);
  const allArcs: ArcDatum[] = [];

  for (const entry of entries.value) {
    const outer = [...inner];
    for (const commit of entry.data) {
      const timeMs = commit.timeMs ?? Date.parse(commit.date);
      const elapsed = (((nowMs - timeMs) % mod) + mod) % mod;
      const ratio = elapsed / mod;
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
      outer[idx]++;
    }
    for (let i = 0; i < bucketCount; i++) {
      allArcs.push({
        angle: i,
        buckets: bucketCount,
        inner: inner[i],
        outer: outer[i],
        developer: entry.developer,
      });
    }
    inner = props.stacked ? outer : new Array<number>(bucketCount).fill(0);
  }

  return {
    developers,
    arcs: allArcs,
  };
});

const maxValue = computed(() => max(filteredData.value.arcs, (e) => e.outer) || 1);

const updateSize = () => {
  if (typeof window === "undefined") return;
  let w = containerWidth.value || container.value?.clientWidth || 300;
  w = Math.min(w, 800);
  w = Math.min(w, window.innerWidth * 0.8);
  w = Math.min(w, Math.max(200, (window.innerHeight - 300) * 0.9));
  svgWidth.value = Math.max(160, Math.round(w));
};

const render = () => {
  if (!arcs.value || !indicators.value || !legend.value) return;

  select(arcs.value).attr("transform", `translate(${svgWidth.value / 2}, ${svgWidth.value / 2})`);
  select(indicators.value).attr("transform", `translate(${svgWidth.value / 2}, ${svgWidth.value / 2})`);

  const innerRadius = svgWidth.value * 0.2;
  const outerRadius = svgWidth.value * 0.5;
  const bucketCount = Math.max(1, props.buckets);

  const x = scaleLinear().domain([0, bucketCount]).range([0, 2 * Math.PI]);
  const y = scaleRadial().domain([0, maxValue.value]).range([innerRadius, outerRadius]);

  const scaleArc = (d: { angle: number; inner: number; outer: number }): ScaledArc => ({
    startAngle: x(d.angle),
    endAngle: x(d.angle + 1.0),
    padAngle: x(0.05),
    innerRadius: y(d.inner),
    outerRadius: y(d.outer),
  });

  const makeArc = arc<ScaledArc>()
    .innerRadius((d) => d.innerRadius)
    .outerRadius((d) => d.outerRadius)
    .startAngle((d) => -d.endAngle)
    .endAngle((d) => -d.startAngle)
    .padAngle((d) => d.padAngle)
    .cornerRadius((d) => d.padAngle * 1000);

  const arcInterpolator = function (a: ScaledArc, b: ScaledArc) {
    return function (this: Element, t: number): string {
      const current: ScaledArc = {
        startAngle: interpolate(a.startAngle, b.startAngle)(t),
        endAngle: interpolate(a.endAngle, b.endAngle)(t),
        innerRadius: interpolate(a.innerRadius, b.innerRadius)(t),
        outerRadius: interpolate(a.outerRadius, b.outerRadius)(t),
        padAngle: interpolate(a.padAngle, b.padAngle)(t),
      };
      currentState.set(this, current);
      return makeArc(current) ?? "";
    };
  };

  select(arcs.value)
    .selectAll<SVGPathElement, ArcDatum>("path")
    .data(filteredData.value.arcs, (d) => `${d.developer}-${d.angle}-${d.buckets}`)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("fill", (d) => $color(d.developer))
          .attr("d", (d) => makeArc(scaleArc(d)))
          .attr("opacity", 0)
          .call((sel) =>
            sel
              .transition()
              .duration(1000)
              .attr("opacity", 0.5)
              .attrTween("d", function (d) {
                const previous = scaleArc({ angle: d.angle, inner: 0, outer: 0 });
                const next = scaleArc(d);
                return arcInterpolator(previous, next);
              }),
          ),
      (update) =>
        update.call((sel) =>
          sel
            .transition()
            .duration(1000)
            .attr("opacity", 0.5)
            .attrTween("d", function (d) {
              const next = scaleArc(d);
              const previous = currentState.get(this) ?? scaleArc({ angle: d.angle, inner: 0, outer: 0 });
              return arcInterpolator(previous, next);
            }),
        ),
      (exit) =>
        exit.call((sel) =>
          sel
            .transition()
            .duration(1000)
            .attr("opacity", 0)
            .attrTween("d", function (d) {
              const fallback = scaleArc({ angle: d?.angle ?? 0, inner: 0, outer: 0 });
              const previous = currentState.get(this) ?? fallback;
              const next: ScaledArc = {
                startAngle: previous.startAngle,
                endAngle: previous.endAngle,
                padAngle: previous.padAngle,
                innerRadius: y(0),
                outerRadius: y(0),
              };
              return arcInterpolator(previous, next);
            })
            .remove(),
        ),
    );

  const labels = indicatorDataAll[props.hourlyParam] ?? indicatorDataAll[0];
  const mod = modulo.value;
  const dephasage = (((nowMs - timezeroMs) % mod) + mod) % mod / mod;
  const indicatorData = labels.map((text, i) => ({
    text,
    angle: (i / labels.length - dephasage - 0.25) * 360,
  }));

  select(indicators.value)
    .selectAll<SVGTextElement, { text: string; angle: number }>("text")
    .data(indicatorData, (d) => `${d.text}-${d.angle}`)
    .join(
      (enter) =>
        enter
          .append("text")
          .attr("x", innerRadius * 0.5)
          .attr("y", 0)
          .attr("fill", "var(--ink)")
          .attr("text-anchor", "end")
          .attr("alignment-baseline", "middle")
          .attr("opacity", 1)
          .text((d) => d.text)
          .attr("transform", (d) => `rotate(${d.angle})`)
          .call((sel) =>
            sel
              .transition()
              .duration(1000)
              .attr("font-size", innerRadius * 0.1)
              .attr("x", innerRadius * 0.9)
              .attr("opacity", 0.6),
          ),
      (update) =>
        update.call((sel) =>
          sel
            .transition()
            .duration(1000)
            .attr("font-size", innerRadius * 0.1)
            .attr("x", innerRadius * 0.9)
            .attr("opacity", 0.6),
        ),
      (exit) =>
        exit.call((sel) =>
          sel
            .transition()
            .duration(1000)
            .attr("x", innerRadius)
            .attr("opacity", 0)
            .remove(),
        ),
    );

  select(legend.value)
    .selectAll<SVGGElement, string>(".legend")
    .data(filteredData.value.developers, (d) => d)
    .join(
      (enter) => {
        const group = enter.append("g").attr("class", "legend");
        group
          .attr("opacity", 0)
          .attr("transform", (_d, i) => `translate(100, ${i * 20 + 20})`)
          .transition()
          .duration(500)
          .attr("transform", (_d, i) => `translate(10, ${i * 20 + 20})`)
          .attr("opacity", 1);

        group
          .append("text")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("fill", (d) => $color(d))
          .text((d) => d);
        return group;
      },
      (update) => {
        update
          .transition()
          .duration(1000)
          .attr("transform", (_d, i) => `translate(10, ${i * 20 + 20})`)
          .attr("opacity", 1);
        return update;
      },
      (exit) => {
        exit
          .transition()
          .duration(500)
          .attr("transform", (_d, i) => `translate(100, ${i * 20 + 20})`)
          .attr("opacity", 0)
          .remove();
      },
    );
};

const onWindowResize = () => {
  updateSize();
  render();
};

watch([filteredData, containerWidth], () => {
  updateSize();
  render();
});

onMounted(() => {
  updateSize();
  render();
  window.addEventListener("resize", onWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onWindowResize);
});
</script>
