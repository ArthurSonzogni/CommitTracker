<template>
  <div ref="container" align="center">
    <svg ref="svg" :width="svgWidth" :height="svgHeight">
      <g ref="axis"></g>
      <g ref="authors"></g>
    </svg>
  </div>
</template>

<script setup lang="ts">

import {max} from "d3-array";
import {scaleLinear} from "d3-scale";
import {select} from "d3-selection";
import {interpolate} from "d3-interpolate";
import {axisTop} from "d3-axis";
import "d3-transition";

const { $chromiumDataAll, $color } = useNuxtApp();

const container = ref<HTMLElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const axis = ref<SVGGElement | null>(null);
const authors = ref<SVGGElement | null>(null);

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  developers: { type: Array },
  dates: { type: Array[Date] },
  author: { type: Boolean },
  review: { type: Boolean },
  stacked: { type:Boolean },
  take_n: { type: Number , default: 60},
});

interface Commit {
  date: string;
  kind: string;
  peers: Array<string>;
}

interface Data {
  developer: string;
  data: Array<Commit>;
}

const data = ref<Array<Data>>([]);
const svgWidth = ref<number>(300);
const svgHeight = ref<number>(300);

watch(() => [props.developers, props.repositories], async () => {
  data.value = await $chromiumDataAll(props.repositories[0], props.developers);
});

const filteredData = computed(() => {
  // Filter and count peers for every developers.
  const data2 = data.value.map(d => {

    let commits = d.data
      .filter(commit => {
        const date = new Date(commit.date);
        return date >= props.dates[0] && date <= props.dates[1];
      });

    if (!props.author) {
      commits = commits.filter(commit => commit.kind != "author")
    }

    if (!props.review) {
      commits = commits.filter(commit => commit.kind != "review")
    }

    const developers = commits.map(commit => commit.peers).flat();

    const peers = {};

    developers.forEach(d=> {
      if (!peers[d])
        peers[d] = 0;
      peers[d]++;
    })

    return {
      developer: d.developer,
      peers: peers,
    };
  });

  // Reformat data to be indexed by peers.
  const peers = {};
  data2.forEach(d => {
    Object.entries(d.peers).forEach(([peer, count]) => {
      if (!peers[peer])
        peers[peer] = {};
      peers[peer][d.developer] = count;
    })
  });

  // If stacked, accumulate the data
  for(const peer in peers) {
    let accumulated = 0;
    Object.entries(peers[peer]).forEach(([developer, count]) => {
      peers[peer][developer] = {
        left: accumulated,
        right: accumulated + count,
      }
      if (props.stacked)
        accumulated += count;
    })
  }

  // Turn the object into an array.
  const result = [];
  for(const peer in peers) {
    let max =  0;
    Object.entries(peers[peer]).forEach(([, count]) => {
      max = Math.max(max, count.right);
    });

    result.push({
      peer: peer,
      developers: Object.entries(peers[peer]).map(([developer, count]) => {
        return {
          developer: developer,
          left: count.left,
          right: count.right,
        }
      }),
      max: max,
    })
  }

  result.sort((a, b) => b.max - a.max);

  return result.splice(0, props.take_n);
});

const render = () => {
  const scale = scaleLinear()
    .domain([0, max(filteredData.value, d => max(d.developers, d => d.right))])
    .range([0, svgWidth.value - 200]);

  const axis_ = axisTop(scale)

  select(axis.value)
    .attr("transform", `translate(130, 25)`)
    .transition()
    .duration(500)
    .call(axis_);

  select(authors.value)
    .attr("transform", `translate(130, 50)`)

  const updateGroup = group => {
    group
      .transition()
      .duration(500)
      .attr("opacity", 1)
      .attr("transform", (_d, i) => `translate(0, ${i * 20})`);
  }

  const updateRect = rect => {
    rect
      .transition()
      .duration(500)
      .attr("opacity", 0.5)
      .attr("x", d => scale(d.left))
      .attr("width", d => scale(d.right - d.left))
  }

  select(authors.value)
    .selectAll("g")
    .data(filteredData.value, d => d.peer)
    .join(
      enter => {
        const group = enter.append("g");
        group
          .attr("opacity", 0)
          .attr("transform", (_d, i) => `translate(-100, ${i * 20})`);
        updateGroup(group);

        const peer = group.append("text");
        peer
          .attr("class", "peer")
          .text(d => d.peer)
          .attr("text-anchor", "end")
          .attr("text-baseline", "middle")
          .attr("x", -5)
          .attr("color", d => $color(d.peer))

        const value = group.append("text");
        value
          .attr("class", "value")
          .text(d => d.max)
          .attr("text-anchor", "start")
          .attr("text-baseline", "bottom")
          .attr("x", d => scale(d.max) + 5);

        return group;
      },
      update => {
        const group = update;
        updateGroup(group);

        const value = group.select(".value");
        value
          .transition()
          .duration(500)
          .attr("x", d => scale(d.max))
          .textTween((d, i, nodes) => {
            const previous = select(nodes[i]).text();
            const interpolator = interpolate(previous, d.max);
            return t => {
              return Math.round(interpolator(t));
            }
          });
        return group; },
      exit => {
        exit
          .transition()
          .duration(500)
          .attr("opacity", 0)
          .attr("transform", (_d, i) => `translate(100, ${i * 20})`)
          .remove();
        return exit;
      },
    )
    .selectAll("rect")
    .data(d => d.developers, d => d.developer)
    .join(
      enter => {
        const rect = enter.append("rect")
          .attr("opacity", 0)
          .attr("rx", 5)
          .attr("ry", 5)
          .attr("x", d => scale(d.left))
          .attr("y", -15)
          .attr("width", d => scale(d.right - d.left))
          .attr("height", 19)
          .attr("fill", d => $color(d.developer))
        ;
        updateRect(rect);
        return rect;
      },
      update => {
        const rect = update;
        updateRect(rect);
        return rect;
      },
      exit => {
        exit
          .transition()
          .duration(500)
          .attr("opacity", 0)
          .remove();
        return exit;
      },
    )
}
watch(filteredData, render);

const initialize = async () => {
  svgHeight.value = props.take_n * 20 + 50;
  svgWidth.value = container.value.clientWidth;
  render();
  window.addEventListener("resize", initialize);
}

onMounted(() => {
  initialize();
});

</script>
