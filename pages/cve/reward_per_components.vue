<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">
          VRP reward per component
        </h1>
        <ul>
          <li>{{cve_count}} CVEs</li>
          <li>{{formatter(total_reward)}} total reward</li>
        </ul>
      </div>
    </section>

    <section>
      <svg
        :width="width"
        :height="height"
      >

      <g ref="svg_nodes" />
      <g ref="svg_links" />
      <g ref="svg_labels" />
      <g ref="svg_link_labels" />


      <g class="tooltip" style="display: none;">
        <text>Tooltip</text>
      </g>
      </svg>
    </section>

    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2015-01-01')"/>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">

import { select } from "d3-selection";
import { sankey } from "d3-sankey";
import { sankeyLeft } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";
import { format } from "d3-format";
import { path } from "d3-path";
import { pointer } from "d3-selection";
import "d3-transition";
import { transition } from "d3-transition";
import { easeQuadInOut } from "d3-ease";

const formatter = format("$,.0f");

const route = useRoute();
const router = useRouter();

const cve_count = ref(0);
const total_reward = ref(0);

const svg_nodes = ref(null);
const svg_links = ref(null);
const svg_labels = ref(null);
const svg_link_labels = ref(null);

const width = ref(2000);
const height = ref(2000);

const dates = ref([
  new Date("2015-01-01"),
  new Date(),
]);
if (route.query.start) {
  dates.value[0] = new Date(route.query.start);
}
if (route.query.end) {
  dates.value[1] = new Date(route.query.end);
}

const updateUrl = () => {
  router.push({
    query: {
      start: dates.value[0].toISOString().split("T")[0],
      end: dates.value[1].toISOString().split("T")[0],
    }
  });
};

const color = scaleOrdinal(schemeCategory10);

let data = {}

onMounted(async () => {
  const response = await fetch("/cve/data.json");
  data = await response.json();
  render();
})

const render = (() => {
  const graph = {
    nodes: [],
    links: []
  }
  const component_index = {};
  const linksIndex = {};

  const componentIndex = (component) => {
    if (component_index[component] === undefined) {
      component_index[component] = graph.nodes.length;
      graph.nodes.push({
        "node": component_index[component],
        "name": component
      });
    }
    return component_index[component];
  }

  const addLink = (source, target, value) => {
    const key = `${source}-${target}`;
    if (linksIndex[key] === undefined) {
      linksIndex[key] = graph.links.length;
      graph.links.push({
        "source": source,
        "target": target,
        "value": 0
      });
    }

    graph.links[linksIndex[key]].value += value;
  }

  let cve_count_partial = 0;
  let total_reward_partial = 0;

  const component_vrp_reward = { }
  for (const cve of Object.values(data)) {
    const date = new Date(cve.bug_date);
    if (date < dates.value[0] || date > dates.value[1]) {
      continue;
    }

    total_reward_partial += isNaN(parseInt(cve.vrp_reward))
      ? 0
      : parseInt(cve.vrp_reward);
    cve_count_partial += 1;

    for (const component of cve.components || []) {
      let reward = isNaN(parseInt(cve.vrp_reward))
        ? 0
        : parseInt(cve.vrp_reward);
      reward /= cve.components.length;
      component_vrp_reward[component] ||= 0;
      component_vrp_reward[component] += reward;
    }
  }

  cve_count.value = cve_count_partial;
  total_reward.value = total_reward_partial;

  // Remove components with no reward.
  for (const component in component_vrp_reward) {
    if (component_vrp_reward[component] == 0) {

      delete component_vrp_reward[component];
    }
  }

  //height.value = Math.max(500, 20 * Object.keys(component_vrp_reward).length);
  width.value = window.innerWidth;

  Object.entries(component_vrp_reward)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([component, reward]) => {
      console.log(component, reward);
      const parts = component.split(">");
      let source = componentIndex("All");
      component_vrp_reward["All"] ||= 0;

      for (let i = 0; i < parts.length; i++) {
        const target = parts.slice(0, i + 1).join(">");
        addLink(source, componentIndex(target), reward);
        source = componentIndex(target);
      }
    });

  // Remove the prefix from all nodes.
  for (const node of graph.nodes) {
    node.component = node.name;
    const parts = node.name.split(">");
    node.name = parts[parts.length - 1];
  }

  //const nodeWidth = graph.nodes.map(d => d.name.length * 20).reduce((a, b) => a + b) / graph.nodes.length;

  const nodeWidth = 6;

  const sankey_generator = sankey(graph)
    .nodeId(d => d.node)
    .nodeWidth(nodeWidth)
    .nodePadding(5)
    .nodeAlign(sankeyLeft)
    .size([width.value-200, height.value-100])
    .nodeSort(null)

  const sankey_graph = sankey_generator(graph);
  console.log(sankey_graph);

  const transition_enter = transition()
    .duration(500)
    .delay(300)
    .ease(easeQuadInOut);

  const transition_update = transition()
    .duration(200)
    .ease(easeQuadInOut);

  const transition_exit = transition()
    .duration(200)
    .ease(easeQuadInOut);


  const update_node = (update) => {
    update
      .attr("x", d => d.x0)
      .attr("y", d => d.y0)
      .attr("height", d => d.y1 - d.y0)
      .attr("width", d => d.x1 - d.x0)
  }

  select(svg_nodes.value)
    .attr("transform", "translate(100,50)")
    .selectAll("rect")
    .data(sankey_graph.nodes, d => d.component)
    .join(
      enter => {
        const node = enter.append("rect");
        update_node(node);
        node
          .attr("fill", d => color(d.component))
          .attr("opacity", 0.0)
          .attr("transform", "translate(30,0)")
          .transition(transition_enter)
          .attr("opacity", 1.0)
          .attr("transform", "translate(0,0)")
        return node;
      },
      update => {
        update = update.transition(transition_update);
        update_node(update);
        return update;
      },
      exit => {
        exit = exit.transition(transition_exit);
        exit.attr("opacity", 0)
        exit.remove();
      }
    )

  const update_link = (update) => {
    update
      .attr("d", d => {
        const w = (d.target.x0 - d.source.x1) * 0.3;
        const p = path();
        p.moveTo(d.source.x1, d.y0 - d.width /2)
        p.bezierCurveTo(
          d.source.x1 + w , d.y0 - d.width / 2   ,
          d.target.x0 - w , d.y1 - d.width / 2   ,
          d.target.x0     , d.y1 - d.width / 2);
        p.lineTo(
          d.target.x0, d.y1 + d.width / 2);
        p.bezierCurveTo(
          d.target.x0 - w , d.y1 + d.width / 2,
          d.source.x1 + w , d.y0 + d.width / 2,
          d.source.x1     , d.y0 + d.width / 2);
        p.closePath();
        return p.toString();
      })
  }

  select(svg_links.value)
    .attr("opacity", 0.2)
    .attr("transform", "translate(100,50)")
    .selectAll("path")
    .data(sankey_graph.links, d => d.source.component + d.target.name)
    .join(
      enter => {
        const link = enter.append("path");
        update_link(link);
        link
          .attr("fill", d => color(d.source.component))
          .attr("opacity", 0.0)
          .attr("transform", "translate(30,0)")
          .transition(transition_enter)
          .attr("opacity", 1.0)
          .attr("transform", "translate(0,0)");
        return link;
      },
      update => {
        update = update.transition(transition_update);
        update_link(update);
        return update;
      },
      exit => {
        exit = exit.transition(transition_exit);
        exit.attr("opacity", 0)
        exit.remove();
      }
    )
    // On hover, highlight the link, and show the tooltip.
    .on("mouseover", function(event, d) {
      const [mouse_x, mouse_y] = pointer(event);
      const mouse = pointer(event);

      select(this)
        .attr("opacity", 0.5)
      select(".tooltip")
        .style("display", "block")
        .style("position", "absolute")
        .attr("transform", `translate(${mouse_x},${mouse_y})`)
        .select("text")
        .text(d.target.name + ": " + formatter(d.value));

    })
    .on("mousemove", function(event) {
      const [mouse_x, mouse_y] = pointer(event);
      select(".tooltip")
        .attr("transform", `translate(${mouse_x},${mouse_y})`)
    })
    .on("mouseout", function(event, d) {
      select(".tooltip").style("display", "none");
      select(this).attr("fill", color(d.source.component));
      select(this)
        .attr("opacity", 1.0)
    });

  const update_label = (update) => {
    update
      .attr("x", d => d.x0 + 10)
      .attr("y", d => (d.y1 + d.y0) / 2)
      .attr("text-anchor", "start")
      .attr("alignment-baseline", "middle")
      .text(d => d.name)
      .attr("font-size", d => Math.pow(d.y1 - d.y0, 0.1) * 7)
  }

  select(svg_labels.value)
    .attr("transform", "translate(100,50)")
    .selectAll("text")
    .data(sankey_graph.nodes, d => d.component)
    .join(
      enter => {
        const label = enter.append("text");
        update_label(label);
        label
          .attr("opacity", 0.0)
          .attr("transform", "translate(30,0)")
          .transition(transition_enter)
          .attr("opacity", 1.0)
          .attr("transform", "translate(0,0)");
        return label;
      },
      update => {
        update = update.transition(transition_update);
        update_label(update);
        return update;
      },
      exit => {
        exit = exit.transition(transition_exit);
        exit.attr("opacity", 0)
        exit.remove();
      }
    )


  // Add labels to the links.

  const update_link_label = (update) => {
    update
      //.attr("x", d => d.target.x0 - 10)
      //.attr("y", d => (d.target.y1 + d.target.y0) / 2)
      .attr("transform", d => `translate(${d.target.x0 - 10}, ${(d.target.y1 + d.target.y0) / 2})`)
      .attr("font-size", d => Math.pow(d.target.y1 - d.target.y0, 0.1) * 7)
      .text(d => formatter(d.value));
  }

  select(svg_link_labels.value)
    .attr("transform", "translate(100,50)")
    .selectAll("text")
    .data(sankey_graph.links, d => d.source.component + d.target.component)
    .join(
      enter => {
        const label = enter.append("text");
        label.attr("text-anchor", "end")
        label.attr("alignment-baseline", "middle")
        update_link_label(label);
        label
          .attr("opacity", 0.0)
          .transition(transition_enter)
          .attr("opacity", 1.0);
        return label;
      },
      update => {
        update = update.transition(transition_update);
        update_link_label(update);
        return update;
      },
      exit => {
        exit = exit.transition(transition_exit);
        exit.attr("opacity", 0)
        exit.remove();
      }
    )
})

watch(dates, () => {
  updateUrl();
  render();
});

// On resize, re-render the graph.
window.addEventListener("resize", () => {
  render();
});

</script>

<style scoped>
.timeline {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background-color: white;
  width: 100%;
}

.tooltip {
  background-color: white;
}

</style>
