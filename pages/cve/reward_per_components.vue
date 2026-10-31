<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">CVE reward per component</h1>
        <ul>
          <li>{{cve_count}} CVEs in between {{dates[0].toISOString().split("T")[0]}} and {{dates[1].toISOString().split("T")[0]}}</li>
          <li>{{dollars_formatter(total_reward)}} total reward</li>
        </ul>
      </div>
    </section>

    <!-- On phones, the diagram is unreadable: a ranking is shown instead. -->
    <section class="section ranking">
      <div class="container">
        <ol>
          <li v-for="row in ranking" :key="row.component">
            <div class="ranking-row">
              <span class="ranking-component">{{ row.component }}</span>
              <span class="ranking-reward">{{ dollars_formatter(row.reward) }}</span>
            </div>
            <div class="ranking-bar" :style="{ width: 100 * row.reward / ranking[0].reward + '%' }"></div>
          </li>
        </ol>
      </div>
    </section>

    <section class="sankey" style="overflow-x: auto">
      <svg
        :width="width"
        :height="height"
      >

      <g ref="svg_labels" />
      <g ref="svg_link_labels" />
      <g ref="svg_nodes" />
      <g ref="svg_links" />

      <g ref="svg_tooltip" class="tooltip" style="display: none;">
        <rect/>
        <text/>
      </g>

      </svg>
    </section>

    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2011-01-01')"/>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { select, pointer } from "d3-selection";
import { sankey, sankeyLeft } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";
import { format } from "d3-format";
import { path } from "d3-path";
import "d3-transition";
import { transition } from "d3-transition";
import { easeQuadInOut } from "d3-ease";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchCveData, type CveRecord } from "~/utils/cve";
import { categoricalPalette } from "~/utils/palette";

const dollars_formatter = format("$,.0f");
const percent_formatter = format(".2%");

const cve_count = ref(0);
const ranking = ref<{ component: string; reward: number }[]>([]);
const total_reward = ref(0);

const svg_nodes = ref<SVGGElement | null>(null);
const svg_links = ref<SVGGElement | null>(null);
const svg_labels = ref<SVGGElement | null>(null);
const svg_link_labels = ref<SVGGElement | null>(null);
const svg_tooltip = ref<SVGGElement | null>(null);

const width = ref(2000);
const height = ref(2000);

const defaultStartDate = new Date();
defaultStartDate.setDate(defaultStartDate.getDate() - 365);
const defaultStartIso = defaultStartDate.toISOString().split("T")[0];
const defaultEndIso = new Date().toISOString().split("T")[0];

const { startDateStr, endDateStr } = useUrlState({
  startDateStr: { ...urlCodecs.string(defaultStartIso), key: "start" },
  endDateStr: { ...urlCodecs.string(defaultEndIso), key: "end" },
});

const dates = computed<[Date, Date]>({
  get: () => {
    const d0 = new Date(startDateStr.value);
    const d1 = new Date(endDateStr.value);
    return [
      Number.isNaN(d0.getTime()) ? new Date(defaultStartIso) : d0,
      Number.isNaN(d1.getTime()) ? new Date() : d1,
    ];
  },
  set: ([d0, d1]) => {
    if (d0 instanceof Date && !Number.isNaN(d0.getTime())) {
      startDateStr.value = d0.toISOString().split("T")[0];
    }
    if (d1 instanceof Date && !Number.isNaN(d1.getTime())) {
      endDateStr.value = d1.toISOString().split("T")[0];
    }
  },
});

const color = scaleOrdinal(categoricalPalette);

let data: CveRecord[] = [];

const render = () => {
  if (
    !svg_nodes.value ||
    !svg_links.value ||
    !svg_labels.value ||
    !svg_link_labels.value
  ) {
    return;
  }

  const graph: { nodes: any[]; links: any[] } = {
    nodes: [],
    links: [],
  };
  const component_index: Record<string, number> = {};
  const linksIndex: Record<string, number> = {};

  const componentIndex = (component: string) => {
    if (component_index[component] === undefined) {
      component_index[component] = graph.nodes.length;
      graph.nodes.push({
        node: component_index[component],
        name: component,
      });
    }
    return component_index[component];
  };

  const addLink = (source: number, target: number, value: number) => {
    const key = `${source}-${target}`;
    if (linksIndex[key] === undefined) {
      linksIndex[key] = graph.links.length;
      graph.links.push({
        source,
        target,
        value: 0,
      });
    }
    graph.links[linksIndex[key]].value += value;
  };

  let cve_count_partial = 0;
  let total_reward_partial = 0;

  const [startBound, endBound] = dates.value;
  const component_vrp_reward: Record<string, number> = {};

  for (const cve of data) {
    if (!cve.bug_date) continue;
    const date = new Date(cve.bug_date);
    if (date < startBound || date > endBound) {
      continue;
    }

    const parsedReward = parseInt(String(cve.vrp_reward ?? ""));
    const cveReward = isNaN(parsedReward) ? 0 : parsedReward;
    total_reward_partial += cveReward;
    cve_count_partial += 1;

    if (cve.components?.length && cveReward > 0) {
      const share = cveReward / cve.components.length;
      for (const component of cve.components) {
        component_vrp_reward[component] = (component_vrp_reward[component] || 0) + share;
      }
    }
  }

  cve_count.value = cve_count_partial;
  total_reward.value = total_reward_partial;

  for (const component in component_vrp_reward) {
    if (component_vrp_reward[component] === 0) {
      delete component_vrp_reward[component];
    }
  }

  ranking.value = Object.entries(component_vrp_reward)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([component, reward]) => ({ component, reward }));

  height.value = Math.max(500, 35 * Math.pow(Object.keys(component_vrp_reward).length, 0.8));
  // Keep the graph readable on narrow screens; the section scrolls instead.
  width.value = Math.max(window.innerWidth, 1000);

  Object.entries(component_vrp_reward)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([component, reward]) => {
      const parts = component.split(">");
      let source = componentIndex("All");
      component_vrp_reward["All"] ||= 0;

      for (let i = 0; i < parts.length; i++) {
        const target = parts.slice(0, i + 1).join(">");
        addLink(source, componentIndex(target), reward);
        source = componentIndex(target);
      }
    });

  if (graph.nodes.length === 0 || graph.links.length === 0) {
    select(svg_nodes.value).selectAll("rect").remove();
    select(svg_links.value).selectAll("path").remove();
    select(svg_labels.value).selectAll("text").remove();
    select(svg_link_labels.value).selectAll("text").remove();
    return;
  }

  // Remove the prefix from all nodes.
  for (const node of graph.nodes) {
    node.component = node.name;
    const parts = node.name.split(">");
    node.name = parts[parts.length - 1];
  }

  const nodeWidth = 6;

  const sankey_generator = (sankey as any)(graph)
    .nodeId((d: any) => d.node)
    .nodeWidth(nodeWidth)
    .nodePadding(7)
    .nodeAlign(sankeyLeft)
    .size([width.value - 200, height.value - 100])
    .nodeSort(null);

  const sankey_graph = sankey_generator(graph);

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

  const update_node = (update: any) => {
    update
      .attr("x", (d: any) => d.x0)
      .attr("y", (d: any) => d.y0)
      .attr("height", (d: any) => d.y1 - d.y0)
      .attr("width", (d: any) => d.x1 - d.x0);
  };

  select(svg_nodes.value)
    .attr("transform", "translate(100,50)")
    .selectAll("rect")
    .data(sankey_graph.nodes, (d: any) => d.component)
    .join(
      enter => {
        const node = enter.append("rect");
        update_node(node);
        node
          .attr("fill", (d: any) => color(d.component))
          .attr("opacity", 0.0)
          .attr("transform", "translate(30,0)")
          .transition(transition_enter as any)
          .attr("opacity", 1.0)
          .attr("transform", "translate(0,0)");
        return node;
      },
      update => {
        const u = update.transition(transition_update as any);
        update_node(u);
        return u;
      },
      exit => {
        return exit
          .transition(transition_exit as any)
          .attr("opacity", 0)
          .remove();
      },
    );

  const update_link = (update: any) => {
    update.attr("d", (d: any) => {
      const w = (d.target.x0 - d.source.x1) * 0.3;
      const p = path();
      p.moveTo(d.source.x1, d.y0 - d.width / 2);
      p.bezierCurveTo(
        d.source.x1 + w, d.y0 - d.width / 2,
        d.target.x0 - w, d.y1 - d.width / 2,
        d.target.x0, d.y1 - d.width / 2,
      );
      p.lineTo(d.target.x0, d.y1 + d.width / 2);
      p.bezierCurveTo(
        d.target.x0 - w, d.y1 + d.width / 2,
        d.source.x1 + w, d.y0 + d.width / 2,
        d.source.x1, d.y0 + d.width / 2,
      );
      p.closePath();
      return p.toString();
    });
  };

  select(svg_links.value)
    .attr("opacity", 0.2)
    .attr("transform", "translate(100,50)")
    .selectAll("path")
    .data(sankey_graph.links, (d: any) => d.source.component + d.target.name)
    .join(
      enter => {
        const link = enter.append("path");
        update_link(link);
        link
          .attr("fill", (d: any) => color(d.source.component))
          .attr("opacity", 0.0)
          .attr("transform", "translate(30,0)")
          .transition(transition_enter as any)
          .attr("opacity", 1.0)
          .attr("transform", "translate(0,0)");
        return link;
      },
      update => {
        const u = update.transition(transition_update as any);
        update_link(u);
        return u;
      },
      exit => {
        return exit
          .transition(transition_exit as any)
          .attr("opacity", 0)
          .remove();
      },
    )
    .on("mouseover", function (event, d: any) {
      if (!svg_tooltip.value) return;
      const [mouse_x, mouse_y] = pointer(event);

      select(this).attr("opacity", 0.5);

      const tooltip = select(svg_tooltip.value)
        .style("display", "block")
        .style("position", "absolute")
        .attr("transform", `translate(${mouse_x},${mouse_y})`)
        .attr("pointer-events", "none");

      const text = tooltip
        .select<SVGTextElement>("text")
        .attr("font-size", 20)
        .attr("fill", "black")
        .attr("pointer-events", "none")
        .text(
          `${d.target.name}: ${dollars_formatter(d.value)} (${percent_formatter(
            total_reward.value ? d.value / total_reward.value : 0,
          )})`,
        );

      const bbox = text.node()?.getBBox();
      if (bbox) {
        tooltip
          .select("rect")
          .attr("x", -10)
          .attr("y", -30)
          .attr("width", bbox.width + 20)
          .attr("height", bbox.height + 20)
          .attr("fill", color(d.source.component))
          .attr("rx", 5)
          .attr("ry", 5)
          .attr("pointer-events", "none")
          .attr("stroke", "black")
          .attr("stroke-width", 1);
      }
    })
    .on("mousemove", function (event) {
      if (!svg_tooltip.value) return;
      const [mouse_x, mouse_y] = pointer(event);
      select(svg_tooltip.value).attr("transform", `translate(${mouse_x},${mouse_y})`);
    })
    .on("mouseout", function (_event, d: any) {
      if (svg_tooltip.value) {
        select(svg_tooltip.value).style("display", "none");
      }
      select(this)
        .attr("fill", color(d.source.component))
        .attr("opacity", 1.0);
    });

  const update_label = (update: any) => {
    update
      .attr("x", (d: any) => d.x0 + 10)
      .attr("y", (d: any) => (d.y1 + d.y0) / 2)
      .attr("text-anchor", "start")
      .attr("alignment-baseline", "middle")
      .text((d: any) => d.name)
      .attr("font-size", (d: any) => Math.max(Math.pow(d.y1 - d.y0, 0.2) * 5, 10));
  };

  select(svg_labels.value)
    .attr("transform", "translate(100,50)")
    .selectAll("text")
    .data(sankey_graph.nodes, (d: any) => d.component)
    .join(
      enter => {
        const label = enter.append("text");
        update_label(label);
        label
          .attr("opacity", 0.0)
          .attr("transform", "translate(30,0)")
          .transition(transition_enter as any)
          .attr("opacity", 1.0)
          .attr("transform", "translate(0,0)");
        return label;
      },
      update => {
        const u = update.transition(transition_update as any);
        update_label(u);
        return u;
      },
      exit => {
        return exit
          .transition(transition_exit as any)
          .attr("opacity", 0)
          .remove();
      },
    );

  const update_link_label = (update: any) => {
    update
      .attr(
        "transform",
        (d: any) => `translate(${d.target.x0 - 10}, ${(d.target.y1 + d.target.y0) / 2})`,
      )
      .attr("font-size", (d: any) =>
        Math.max(Math.pow(d.target.y1 - d.target.y0, 0.2) * 5, 10),
      )
      .text((d: any) => dollars_formatter(d.value));
  };

  select(svg_link_labels.value)
    .attr("transform", "translate(100,50)")
    .selectAll("text")
    .data(sankey_graph.links, (d: any) => d.source.component + d.target.component)
    .join(
      enter => {
        const label = enter.append("text");
        label.attr("text-anchor", "end");
        label.attr("alignment-baseline", "middle");
        update_link_label(label);
        label
          .attr("opacity", 0.0)
          .transition(transition_enter as any)
          .attr("opacity", 1.0);
        return label;
      },
      update => {
        const u = update.transition(transition_update as any);
        update_link_label(u);
        return u;
      },
      exit => {
        return exit
          .transition(transition_exit as any)
          .attr("opacity", 0)
          .remove();
      },
    );
};

watch(dates, render);

onMounted(async () => {
  window.addEventListener("resize", render);
  data = await fetchCveData();
  render();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", render);
});
</script>

<style scoped>
.timeline {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background-color: var(--surface);
  width: 100%;
}

.tooltip {
  background-color: var(--surface);
}

.ranking {
  display: none;
}

@media (max-width: 768px) {
  .ranking {
    display: block;
    padding-top: 0;
  }

  .sankey {
    display: none;
  }
}

.ranking ol {
  list-style: none;
  margin: 0;
}

.ranking li {
  margin-bottom: 0.6rem;
}

.ranking-row {
  display: flex;
  font-size: 0.875rem;
  gap: 0.5rem;
  justify-content: space-between;
}

.ranking-component {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ranking-reward {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ranking-bar {
  background: var(--accent);
  border-radius: 2px;
  height: 4px;
  margin-top: 0.2rem;
  opacity: 0.6;
}

</style>
