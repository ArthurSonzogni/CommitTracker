<template>
  <div>
    <Navbar/>
    <section class="section container">
      <h1 class="title">Chromium Vulnerabilities</h1>
    </section>

    <section class="section container sticky">
      <div class="columns">
        <div class="column">
          <b-field label="Severity">
            <b-checkbox-button v-model="severities" native-value="Low">Low</b-checkbox-button>
            <b-checkbox-button v-model="severities" native-value="Medium">Medium</b-checkbox-button>
            <b-checkbox-button v-model="severities" native-value="High">High</b-checkbox-button>
            <b-checkbox-button v-model="severities" native-value="Critical">Critical</b-checkbox-button>
          </b-field>
        </div>

        <div class="column">
          <template v-if="severities.includes('Low')">
            <b-icon type="is-info" icon="circle"></b-icon> Low
          </template>
          <template v-if="severities.includes('Medium')">
            <b-icon type="is-warning" icon="circle"></b-icon> Medium
          </template>
          <template v-if="severities.includes('High')">
            <b-icon type="is-danger" icon="circle"></b-icon> High
          </template>
          <template v-if="severities.includes('Critical')">
            <b-icon icon="circle"></b-icon> Critical
          </template>

        </div>
      </div>
    </section>

    <section class="section container">

      <svg ref="svg_ref">
        <path ref="svg_graph_projection_low_ref"></path>
        <path ref="svg_graph_projection_high_ref"></path>
        <path ref="svg_graph_ref"></path>
        <g ref="axis_x_ref"></g>
        <g ref="axis_y1_ref"></g>
        <g ref="axis_y2_ref"></g>

        <g>
          <rect x="45" y="10" width="10" height="10" fill="blue"></rect>
          <text x="60" y="20">Historical</text>
          <rect x="45" y="30" width="10" height="10" fill="#FFA500"></rect>
          <text x="60" y="40">Projection</text>
        </g>

        <line
          x1="400"
          x2="400"
          y1="0"
          y2="380"
          stroke="black"
          stroke-width="1"
          stroke-dasharray="5,5"
        />

        <line
          ref="svg_split_horizontal_ref"
          x1="30"
          x2="770"
          y1="190"
          y2="190"
          stroke="black"
          stroke-width="1"
          stroke-dasharray="5,5"
        />

        <text
          x="200"
          y="150"
          class="previous_year_label"
          font-size="19"
          font-weight="bold"
          fill="black"
          text-anchor="middle"
        >{{ previous_year }}</text>

        <text
          x="600"
          y="150"
          class="current_year_label"
          font-size="19"
          font-weight="bold"
          fill="black"
          text-anchor="middle"
          >
          {{ current_year }}
        </text>

        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="13" result="coloredBlur"/>
          <feGaussianBlur stdDeviation="5" result="coloredBlur2"/>
          <feGaussianBlur stdDeviation="3" result="coloredBlur3"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="coloredBlur2"/>
            <feMergeNode in="coloredBlur2"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </svg>
    </section>

    <section
      class="section container"
      v-for="(data,i) in cve_list_ref">

      <h2 class="title"> {{ data.year }} </h2>

      <div class="grid">
        <strong>Total : </strong>
        <p>{{ data.total }} CVEs</p>

        <template v-if="i > 0">
          <strong>Y/Y :</strong>
          <p>
            {{
            cve_percent_format((data.total - data.total_previous) / data.total * 100)
            }} %
          </p>
        </template>
        <template v-if="i === 0">
          <strong>Projection :</strong>
          [
          {{ projection_low }}
          CVEs
          ,
          {{ projection_high }}
          CVEs
          ]
        </template>
        <template v-if="i === 0">
          <strong>Y/Y projection :</strong>
          [
          {{
          cve_percent_format((projection_low- data.total_previous) /
          data.total_previous * 100)
          }} %
          ,
          {{
          cve_percent_format((projection_high - data.total_previous) /
          data.total_previous * 100)
          }} %
          ]
        </template>
      </div>

      <hr>

      <Lazy>
        <table class="table is-bordered is-striped is-narrow is-hoverable">
          <thead>
            <tr>
              <th scope="col" ></th>
              <th scope="col" v-for="project in project_list">
                {{ project }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(cves, cweId) in data.cves">
              <th scope="row"> {{ cweId}} </th>
              <td v-for="project in project_list">
                <span v-if="cves[project]">
                  <NuxtLink
                    v-for="cve in cves[project]"
                    :to="`/cve?id=${cve.id}`"
                    >
                    <b-tooltip
                      type="is-light"
                      >
                      <template v-slot:content
                                style="width: 500px">
                        <p style="white-space: pre-line; width: 500px; ">
                          <strong>
                            {{ cve.id }}
                          </strong>
                          -
                          {{ cve.description }}
                        </p>
                        <p v-if="cve.vrp_reward">
                          <strong> Reward </strong>
                          {{ cve.vrp_reward }}$
                        </p>

                        <p v-for="component in cve.components">
                          <strong> Component </strong>
                          {{ component }}
                        </p>

                      </template>

                      <b-icon v-if="cve.severity === 'Low'" type="is-info" icon="circle"></b-icon>
                      <b-icon v-if="cve.severity === 'Medium'" type="is-warning" icon="circle"></b-icon>
                      <b-icon v-if="cve.severity === 'High'" type="is-danger" icon="circle"></b-icon>
                      <b-icon v-if="cve.severity === 'Critical'" icon="circle"></b-icon>
                    </b-tooltip>
                  </NuxtLink>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </Lazy>
    </section>
  </div>
</template>

<script lang="ts" setup>

import { format } from "d3-format";
import { select } from "d3-selection";
import { scaleTime } from "d3-scale";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axisBottom } from "d3-axis";
import { axisLeft } from "d3-axis";
import { axisRight } from "d3-axis";
import "d3-transition";
import { transition } from "d3-transition";
import {interpolatePath} from "d3-interpolate-path";
import { easeCircleOut } from "d3-ease";

const cve_count_format = format("+,d");
const cve_percent_format = format("+.1f");

const router = useRouter();
const route = useRoute();

const severities = ref(["High", "Critical"]);

if (route.query.severities) {
  severities.value = route.query.severities.split(",");
}

watch(severities, () => {
  const has_default_severities =
    severities.value.length === 2 &&
    severities.value.includes("High") &&
    severities.value.includes("Critical");

  router.push({
    query: {
      severities: has_default_severities ? undefined :
      severities.value.join(","),
    }
  });
  render();
});

const cve_list_ref = ref([]);
const svg_ref = ref<HTMLSvgElement | null>(null);
const svg_graph_ref = ref<SVGPathElement | null>(null);
const svg_graph_projection_low_ref = ref<SVGPathElement | null>(null);
const svg_graph_projection_high_ref = ref<SVGPathElement | null>(null);
const axis_x_ref = ref<SVGGElement | null>(null);
const axis_y1_ref = ref<SVGGElement | null>(null);
const axis_y2_ref = ref<SVGGElement | null>(null);
const svg_split_horizontal_ref = ref<SVGLineElement | null>(null);

const previous_year = new Date().getFullYear() - 1;
const current_year = new Date().getFullYear();

const projection_low = ref(0);
const projection_high = ref(0);

const project_list = [
  "angle",
  "chromium",
  "dawn",
  "skia",
  "swiftshader",
  "v8",
  "webrtc"
];

const filter_cve = (cve) => {
  return cve.severity && severities.value.includes(cve.severity)
    && cve.id > "2020";
}

let first_render = true;
const render = async () => {

  const response = await fetch("/cve/data.json");
  const data = (await response.json()).filter(filter_cve);

  const cve_project = cve => {
    if (!cve.description) {
      return "???";
    }
    for (const project of project_list) {
      if (project == "chromium") {
        continue;
      }
      if (cve.description.toLowerCase().includes(project)) {
        return project;
      }
    }
    return "chromium";
  }

  const repo_data = data.map((cve) => {
    return {
      ...cve,
      project: cve_project(cve),
    };
  });

  const severity_map = new Map([
    ["Low", 0],
    ["Medium", 1],
    ["High", 2],
    ["Critical", 3],
  ]);

  const filter_by_year = (year) => {
    const year_string = year.toString();
    let out = repo_data;
    // Filter by year.
    out = out.filter((cve) => {
      return cve.id && cve.id.startsWith(year_string);
    });
    out = out.reverse();

    // Sort by severity
    out = out.sort((a, b) => {
      return severity_map.get(a.severity) - severity_map.get(b.severity);
    });

    // GroupBy cweId
    out = Object.groupBy(out, cve => cve.problem)

    // GroupBy project
    for (const cweId in out) {
      out[cweId] = Object.groupBy(out[cweId], cve => cve.project);
    }

    return out;
  }

  const year_list = Array
    .from(new Set(repo_data.map((cve) => cve.id?.slice(0, 4))))
    .filter(x => x)
    .sort()
    .reverse()
    .map(x => parseInt(x))
  ;

  const cve_list = year_list.map((year) => {
    return {
      year: year,
      cves: filter_by_year(year),
    };
  });

  cve_list_ref.value = cve_list;

  // Compute total for each year.
  for (let i = 0; i < cve_list.length; i++) {
    let total = 0
    Object.values(cve_list[i].cves).forEach((cves) => {
      Object.values(cves).forEach((cve) => {
        total += Object.values(cve).length;
      });
    });
    cve_list[i].total = total;
    if (i > 0) {
      cve_list[i-1].total_previous = total;
    }
  }

  // Compute the estimated number of vulnerabilities for the current year by
  // interpolation based on the date.
  const now = new Date();
  const year_percent =
    (now - new Date(`${now.getFullYear()}-01-01`)) /
    (new Date(`${now.getFullYear() + 1}-01-01`) - new Date(`${now.getFullYear()}-01-01`));

  const mean = cve_list[0].total / year_percent;
  projection_low.value = Math.max(
    cve_list[0].total + 0.01,
    Math.round(mean - 1.96 * Math.sqrt(mean))
  );
  console.log(projection_low.value);
  projection_high.value = Math.round(mean + 1.96 * Math.sqrt(mean));

  // Yield
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Render the graph using d3. The data is the cve's date for the last 365
  // days and the projection until the end of the current year.
  // - The historical data is drawn in glowing blue
  // - This projection is drawn in glowing yellow.

  const current_year = new Date().getFullYear();
  const min_date = new Date(`${current_year - 1}-01-01`);
  const max_date = new Date(`${current_year + 1}-01-01`);

  // Format [[Date, accumulated CVEs]...]
  let cve_dates = data
    .filter(cve => cve.id >= "" + min_date.getFullYear())
    .map(cve => { return new Date(cve.published); })
    .filter(date => date > min_date)
    .sort((a, b) => a - b)
    .map((date, i) => [date, i + 1 - cve_list[1].total]);

  cve_dates.push([new Date(`${current_year}-01-01`), 0]);
  cve_dates = cve_dates.sort((a, b) => a[0] - b[0]);

  const projection_dates_low = [
    cve_dates[cve_dates.length - 1],
    [
      new Date(`${current_year + 1}-01-01`),
      projection_low.value
    ]
  ];

  const projection_dates_high = [
    cve_dates[cve_dates.length - 1],
    [
      new Date(`${current_year + 1}-01-01`),
      projection_high.value
    ]
  ];

  const max_count = projection_dates_high[1][1];

  const svg = select(svg_ref.value);
  svg.attr("width", 800);
  svg.attr("height", 400);

  const margin = {top: 20, right: 30, bottom: 20, left: 30};

  const width = 800 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const x = scaleTime()
    .domain([
      new Date(`${current_year - 2}-12-31`),
      new Date(`${current_year + 1}-01-02`)
    ])
    .range([0, width]);

  const y = scaleLinear()
    .domain([cve_dates[0][1], projection_dates_high[1][1]])
    .range([height, 0]);

  const t = transition()
    .duration(first_render ? 0 : 500)
    .ease(easeCircleOut);
  first_render = false;

  const line_generator = line()
    .x(d => x(d[0]))
    .y(d => y(d[1]));
  const graph = select(svg_graph_ref.value);
  graph
    .attr("style", "filter: url(#glow);")
    .attr("fill", "none")
    .attr("stroke", "blue")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .data([cve_dates])
    .transition(t)
    .attrTween('d', function (d) {
      const previous = select(this).attr('d');
      const current = line_generator(d);
      return interpolatePath(previous, current);
    })
  ;

  const svg_graph_projection_low = select(svg_graph_projection_low_ref.value);
  svg_graph_projection_low
    .attr("style", "filter: url(#glow);")
    .attr("fill", "none")
    .attr("stroke", "#FFA500")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .attr("stroke-dasharray", "5,5")
    .data([projection_dates_low])
    .transition()
    .attrTween('d', function (d) {
      const previous = select(this).attr('d');
      const current = line_generator(d);
      return interpolatePath(previous, current);
    })
  ;

  const svg_graph_projection_high = select(svg_graph_projection_high_ref.value);
  svg_graph_projection_high
    .attr("style", "filter: url(#glow);")
    .attr("fill", "none")
    .attr("stroke", "#FFA500")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .attr("stroke-dasharray", "5,5")
    .data([projection_dates_high])
    .transition()
    .attrTween('d', function (d) {
      const previous = select(this).attr('d');
      const current = line_generator(d);
      return interpolatePath(previous, current);
    })
  ;

  // y1 and y2 are scale for the previous and current year.
  const y1 = scaleLinear()
    .domain([0, cve_list[1].total])
    .range([y(-cve_list[1].total), y(0)]);

  const y2 = scaleLinear()
    .domain([0, max_count])
    .range([y(0), y(max_count)]);

  const axis_x = select(axis_x_ref.value);
  const axis_y1 = select(axis_y1_ref.value);
  const axis_y2 = select(axis_y2_ref.value);
  axis_x.transition(t).call(axisBottom(x));
  axis_x.attr("transform", `translate(${margin.left}, ${height + margin.top})`);

  axis_y1.transition(t).call(axisLeft(y1));
  axis_y1.attr("transform", `translate(${margin.left}, ${margin.top})`);
  axis_y2.transition(t).call(axisRight(y2));
  axis_y2.attr("transform", `translate(${margin.left + width}, ${margin.top})`);

  const split_horizontal = select(svg_split_horizontal_ref.value);
  split_horizontal
    .transition(t)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("x1", x(min_date))
    .attr("x2", x(max_date))
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
  ;

  select(".previous_year_label")
    .transition(t)
    .attr("y", y(0))
  ;

  select(".current_year_label")
    .transition(t)
    .attr("y", y(0) + 19 * 3)
}

render();

</script>

<style scoped>

.grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 0.5em;
}

.grid > strong {
  text-align: right;
}

td {
  max-width: 400px;
}

.sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
  margin-bottom: 0;
  margin-top: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 1);
}

.columns {
  align-items: flex-end;
}

</style>
