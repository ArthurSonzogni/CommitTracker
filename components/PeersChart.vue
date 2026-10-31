<template>
  <div ref="container" class="peers-chart" align="center">
    <svg ref="svg" width="100%" :height="svgHeight">
      <g ref="axis" class="peers-axis"></g>
      <g ref="authors"></g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { max } from "d3-array";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { interpolate } from "d3-interpolate";
import { axisTop } from "d3-axis";
import "d3-transition";
import type { PropType } from "vue";
import {
  useDeveloperCommits,
  type DeveloperCommitsEntry,
} from "~/composables/useDeveloperCommits";
import { useElementSize } from "~/composables/useElementSize";

const { $color } = useNuxtApp();

const container = ref<HTMLElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const axis = ref<SVGGElement | null>(null);
const authors = ref<SVGGElement | null>(null);

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
  take_n: { type: Number, default: 60 },
  commits: {
    type: Array as PropType<DeveloperCommitsEntry[]>,
    default: undefined,
  },
});

const { width: containerWidth } = useElementSize(container, { width: 800 });
const svgHeight = computed(() => props.take_n * 20 + 50);

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

interface PeerDeveloperBar {
  developer: string;
  left: number;
  right: number;
}

interface PeerRow {
  peer: string;
  developers: PeerDeveloperBar[];
  max: number;
}

const filteredData = computed<PeerRow[]>(() => {
  const peerCounts = new Map<string, Map<string, number>>();

  for (const entry of entries.value) {
    const devCounts = new Map<string, number>();
    for (const commit of entry.data) {
      if (!Array.isArray(commit.peers)) continue;
      for (const peer of commit.peers) {
        devCounts.set(peer, (devCounts.get(peer) ?? 0) + 1);
      }
    }
    for (const [peer, count] of devCounts) {
      let byDev = peerCounts.get(peer);
      if (!byDev) {
        byDev = new Map();
        peerCounts.set(peer, byDev);
      }
      byDev.set(entry.developer, count);
    }
  }

  const result: PeerRow[] = [];
  for (const [peer, byDev] of peerCounts) {
    let accumulated = 0;
    let rowMax = 0;
    const developers: PeerDeveloperBar[] = [];
    for (const [developer, count] of byDev) {
      const left = accumulated;
      const right = accumulated + count;
      developers.push({ developer, left, right });
      if (right > rowMax) rowMax = right;
      if (props.stacked) {
        accumulated += count;
      }
    }
    result.push({ peer, developers, max: rowMax });
  }

  result.sort((a, b) => b.max - a.max);
  return result.slice(0, props.take_n);
});

const render = () => {
  if (!axis.value || !authors.value) return;

  const svgWidth = containerWidth.value || container.value?.clientWidth || 800;
  const plotWidth = Math.max(80, svgWidth - 200);
  const maxDomain = max(filteredData.value, (d) => max(d.developers, (b) => b.right)) || 1;

  const scale = scaleLinear().domain([0, maxDomain]).range([0, plotWidth]);

  // About one tick every 60px, for the labels not to overlap.
  const axisGen = axisTop(scale).ticks(Math.max(2, Math.floor(plotWidth / 60)));

  select(axis.value)
    .attr("transform", "translate(130, 25)")
    .transition()
    .duration(500)
    .call(axisGen);

  select(authors.value).attr("transform", "translate(130, 50)");

  const updateGroup = (group: any) => {
    group
      .transition()
      .duration(500)
      .attr("opacity", 1)
      .attr("transform", (_d: PeerRow, i: number) => `translate(0, ${i * 20})`);
  };

  const updateRect = (rect: any) => {
    rect
      .transition()
      .duration(500)
      .attr("opacity", 0.5)
      .attr("x", (d: PeerDeveloperBar) => scale(d.left))
      .attr("width", (d: PeerDeveloperBar) => scale(d.right - d.left));
  };

  select(authors.value)
    .selectAll<SVGGElement, PeerRow>("g")
    .data(filteredData.value, (d) => d.peer)
    .join(
      (enter) => {
        const group = enter.append("g");
        group.attr("opacity", 0).attr("transform", (_d, i) => `translate(-100, ${i * 20})`);
        updateGroup(group);

        group
          .append("text")
          .attr("class", "peer")
          .attr("fill", "var(--ink)")
          .text((d) => d.peer)
          .attr("font-size", (d) => `${Math.min(230 / (1 + d.peer.length), 16)}px`)
          .attr("text-anchor", "end")
          .attr("text-baseline", "middle")
          .attr("x", -5);

        group
          .append("text")
          .attr("class", "value")
          .attr("fill", "var(--muted)")
          .text((d) => d.max)
          .attr("text-anchor", "start")
          .attr("text-baseline", "bottom")
          .attr("x", (d) => scale(d.max) + 5);

        return group;
      },
      (update) => {
        updateGroup(update);
        update
          .select<SVGTextElement>(".value")
          .transition()
          .duration(500)
          .attr("x", (d) => scale(d.max) + 5)
          .textTween((d, i, nodes) => {
            const previous = Number(select(nodes[i]).text()) || 0;
            const interpolator = interpolate(previous, d.max);
            return (t) => String(Math.round(interpolator(t)));
          });
        return update;
      },
      (exit) => {
        exit
          .transition()
          .duration(500)
          .attr("opacity", 0)
          .attr("transform", (_d, i) => `translate(100, ${i * 20})`)
          .remove();
        return exit;
      },
    )
    .selectAll<SVGRectElement, PeerDeveloperBar>("rect")
    .data(
      (d) => d.developers,
      (d) => d.developer,
    )
    .join(
      (enter) => {
        const rect = enter
          .append("rect")
          .attr("opacity", 0)
          .attr("rx", 5)
          .attr("ry", 5)
          .attr("x", (d) => scale(d.left))
          .attr("y", -15)
          .attr("width", (d) => scale(d.right - d.left))
          .attr("height", 19)
          .attr("fill", (d) => $color(d.developer));
        updateRect(rect);
        return rect;
      },
      (update) => {
        updateRect(update);
        return update;
      },
      (exit) => {
        exit.transition().duration(500).attr("opacity", 0).remove();
        return exit;
      },
    );
};

watch([filteredData, containerWidth], render);
onMounted(render);
</script>

<style scoped>
.peers-chart :deep(.peers-axis) {
  color: var(--muted);
}
</style>
