<template>
  <div>
    <Navbar/>

    <section class="section">
      <h1 class="title">CVE pivot table</h1>
      <div class="mycolumns">
        <div id="widget-colum">
          <UiField label="Time division">
            <UiSegmented
              v-model="time_division"
              :options="[
              { value: 'all', label: 'All' },
              { value: 'year', label: 'Year' },
              { value: 'quarter', label: 'Quarter' },
              { value: 'month', label: 'Month' },
            ]" />
          </UiField>

          <!--Lines-->
          <UiField label="Lines">
            <UiSegmented
              v-model="line"
              :options="[
              { value: 'components', label: 'components' },
              { value: 'repositories', label: 'repositories' },
            ]" />
          </UiField>

          <UiField label="Components depths" v-if="line == 'components'">
            <UiNumberInput v-model="component_division" min="0" max="4" step="1"></UiNumberInput>
          </UiField>

          <!--Severity ['low', 'medium', 'high', 'critical']-->
          <UiField label="Severity">
            <div class="chips">
              <UiToggle v-model="severity" value="N/A">N/A</UiToggle>
              <UiToggle v-model="severity" value="Low">Low</UiToggle>
              <UiToggle v-model="severity" value="Medium">Medium</UiToggle>
              <UiToggle v-model="severity" value="High">High</UiToggle>
              <UiToggle v-model="severity" value="Critical">Critical</UiToggle>
            </div>
          </UiField>

          <!-- value -->
          <div class="form-row">
            <UiField label="Reward">
              <UiSegmented
                v-model="cell_value"
                :options="[
                { value: 'vrp_reward', label: '$$$', title: 'VRP reward' },
              ]" />
            </UiField>
            <UiField label="CVE">
              <UiSegmented
                v-model="cell_value"
                :options="[
                { value: 'cve_count', label: 'Count', title: 'Number of CVE' },
              ]" />
            </UiField>
            <UiField label="Velocity">
              <UiSegmented
                v-model="cell_value"
                :options="[
                { value: 'time_to_fix_10p', label: '10p', title: 'Delay from bug reported to fix released to stable' },
                { value: 'time_to_fix_median', label: '50p', title: 'Delay from bug reported to fix released to stable' },
                { value: 'time_to_fix_90p', label: '90p', title: 'Delay from bug reported to fix released to stable' },
              ]" />
            </UiField>
          </div>

          <UiField label="Hide non representative data">
            <UiSwitch v-model="hide_low_count"></UiSwitch>
          </UiField>

        </div>
        <UiTable id="table-column" :data="table_data" striped bordered scrollable sticky-header height="85vh">
          <!--The component field-->
          <UiTableColumn field="component" label="Component" sortable sticky>
            <template v-slot="props">
              {{ props.row.line}}
            </template>

          </UiTableColumn>

          <UiTableColumn v-for="column in table_columns.sort((a, b) => a.label.localeCompare(b.label))" :field="column.field" :label="column.label" :td-attrs="tdAttrs" sortable>
            <template v-slot="props">
              <a v-if="line == 'components'"
                :href="`/cve/list?group_by=component&component=${props.row.line}&date=${column.label}`"
                class="table_link"
              >
                {{ formatter(props.row[column.field]) }}
              </a>

              <a v-if="line == 'repositories'"
                :href="`/cve/list?group_by=component&repo=${props.row.line}&date=${column.label}`"
                class="table_link"
              >
                {{ formatter(props.row[column.field]) }}
              </a>
            </template>
          </UiTableColumn>


        </UiTable>
      </div>
    </section>


    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2010-01-01')"/>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { fetchCveData } from '~/utils/cve'

import {format} from "d3-format";
import {scaleSequential} from "d3-scale";
import {scalePow} from "d3-scale";
import {interpolateOranges} from "d3-scale-chromatic";

const route = useRoute();
const router = useRouter();

const filteredData = shallowRef([])

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

const line = ref("components");
if (route.query.l) {
  line.value = route.query.l;
}

const component_division = ref(3);
if (route.query.cd) {
  component_division.value = parseInt(route.query.cd);
}
const time_division = ref("year");
if (route.query.td) {
  time_division.value = route.query.td;
}
const severity = ref(["N/A", "Low", "Medium", "High", "Critical"]);
if (route.query.s) {
  severity.value = route.query.s.split(",");
}
const cell_value = ref("vrp_reward");
if (route.query.v) {
  cell_value.value = route.query.v;
}

const updateUrl = () => {
  router.push({
    query: {
      start: dates.value[0].toISOString().split("T")[0],
      end: dates.value[1].toISOString().split("T")[0],
      cd: component_division.value,
      td: time_division.value,
      v: cell_value.value,
      s: severity.value.join(","),
      l: line.value,
    }
  });
};

const hide_low_count = ref(true);

let raw_data = {}
let table_data = shallowRef([])
let table_columns = shallowRef([])

// Format the cells with d3.format.
const dollarFormatter = format("$,.0f");
const dollarFormatter2 = format("$,.2f");

let value_projector = x => x;
let formatter = x => x;

// Exponential scale for the color.
let color_scale = scalePow()
  .exponent(0.2)
  .domain([0, 7000])
  .range([0, 1]);
let color_scale2 = scaleSequential(interpolateOranges);

const thAttrs = (column) => {
  return {
    style: {
      backgroundColor: "var(--surface)",
      zIndex: 1,
    }
  }
}

const tdAttrs = (row, column) => {
  const t = color_scale(value_projector(row[column.field]));
  if (isNaN(t)) {
    return {};
  }

  // The orange ramp is the same in both themes: pick a readable text color.
  return {
    style: {
      backgroundColor: color_scale2(t),
      color: t > 0.6 ? "#ffffff" : "#121216",
    }
  }
}

onMounted(async () => {
  raw_data = (await fetchCveData()).map(cve => {
    if (["Low", "Medium", "High", "Critical"].indexOf(cve.severity) == -1) {
      cve.severity = "N/A";
    }

    return cve;
  });
  render();
})

// Generator of component and subcomponent.
const component_generator = function*(component) {
  yield "All";
  if (component_division.value == 0) {
    return;
  }

  let current = []
  for (const part of component.split(">")) {
    current.push(part);
    yield current.join(">");
    if (current.length == component_division.value) {
      break;
    }
  }
}

const components_generator = function*(components) {
  if (!components) {
    return "All";
  }
  const seen = new Set();
  for (const component of components) {
    for (const part of component_generator(component)) {
      if (seen.has(part)) {
        continue;
      }
      seen.add(part);
      yield part;
    }
  }
}

const time_get_bucket = (date) => {
  switch(time_division.value) {
    case "all":
      return "All";
    case "year":
      return `${date.getFullYear()}`;
    case "quarter":
      return `${date.getFullYear()}Q${Math.floor(date.getMonth()/3)+1}`;
    case "month":
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      return `${date.getFullYear()}M${month}`;
  }
}

const render = (() => {

  const time_bucket_set = new Set();
  const line_bucket_set = new Set();

  const data = Object
    .values(raw_data)
    .map(cve => {
      if (!severity.value.includes(cve.severity)) {
        return 0;
      }

      const begin = new Date(cve.bug_date);
      const end = new Date(cve.version_dates.stable);

      const date = new Date(cve.published) || end || begin;

      if (date < dates.value[0] || date > dates.value[1]) {
        return 0;
      }

      const value = (end - begin) / (1000 * 60 * 60 * 24);

      const time_label = time_get_bucket(date);
      time_bucket_set.add(time_label)
      switch(line.value) {
        case "components":
          for (const part of components_generator(cve.components)) {
            line_bucket_set.add(part);
          }
          break;
        case "repositories":
          const repos = new Set();
          for (const sha in cve.commits) {
            const commit = cve.commits[sha];
            if (commit.repo) {
              repos.add(commit.repo);
            }
          }
          if (repos.length == 0) {
            return 0;
          }
          for (const repo of repos) {
            line_bucket_set.add(repo);
          }
          break;
      }

      return {
        date,
        cve,
        value,
      }
    })
    .filter(x => x != 0)
    .sort((a, b) => a.date - b.date)

  const time_buckets = Array.from(time_bucket_set).sort()
  const line_buckets = Array.from(line_bucket_set).sort()

  // On the y axis, we have the date.
  table_columns.value = [
    {
      field: "line",
      label: line.value == "components" ? "Component" : "Repository",
    }
  ]
  table_columns.value = time_buckets.map(time => {
    return {
      field: time,
      label: time,
    }
  })

  // On the y axis, we have the component.
  const lines = new Set();
  switch(line.value) {
    case "components":
      for (const cve of data) {
        for (const part of components_generator(cve.cve.components)) {
          lines.add(part);
        }
      }
      break;
    case "repositories":
      for (const cve of data) {
        const repos = new Array();
        for (const sha in cve.cve.commits) {
          const commit = cve.cve.commits[sha];
          if (commit.repo) {
            repos.push(commit.repo);
          }
        }
        for (const repo of repos) {
          lines.add(repo);
        }
      }
      break;
  }

  const line_array_indexes = new Map();
  for (let i = 0; i < line_buckets.length; ++i) {
    line_array_indexes.set(line_buckets[i], i);
  }

  // Value is the vrp_reward for each component in each date.
  let table_data_value = line_buckets.map(line => {
    return {
      line: line,
    }
  })

  for (const cve of data) {
    const date = time_get_bucket(cve.date);

    switch(line.value) {
      case "components":
        for (const component of components_generator(cve.cve.components)) {
          const component_index = line_array_indexes.get(component);
          if (component_index === undefined) {
            continue;
          }

          table_data_value[component_index][date] ||= [];
          table_data_value[component_index][date].push(cve.cve);
        }
        break;
      case "repositories":
        const repos = new Set();
        for (const sha in cve.cve.commits) {
          const commit = cve.cve.commits[sha];
          if (commit.repo) {
            repos.add(commit.repo);
          }
        }
        for (const repo of repos) {
          const repo_index = line_array_indexes.get(repo);
          if (repo_index === undefined) {
            continue;
          }

          table_data_value[repo_index][date] ||= [];
          table_data_value[repo_index][date].push(cve.cve);
        }
        break;
    }
  }

  // Set a formatter for the cells.
  switch(cell_value.value) {
    case "vrp_reward":
      value_projector = cves => {
        if (!cves) {
          return 0;
        }

        let reward = 0;
        for (const cve of cves) {
          reward += parseInt(cve.vrp_reward) || 0;
        }

        return reward;
      }
      break;

    case "cve_count":
      value_projector = cves => {
        if (!cves) {
          return 0;
        }

        return cves.length;
      }
      formatter = value_projector;
      break;

    case "time_to_fix_10p":
      value_projector = cves => {
        if (!cves) {
          return 0;
        }

        if (cves.length == 0) {
          return 0;
        }

        const values = cves
          .map(cve => {
            const begin = new Date(cve.bug_date);
            const end = new Date(cve.version_dates.stable);
            return (end - begin) / (1000 * 60 * 60 * 24);
          })
          .filter(x => x)
          .sort((a, b) => a - b)

        if (hide_low_count.value && values.length < 12) {
          return 0;
        }

        return values[Math.floor(values.length * 0.1)];
      }
      break;

    case "time_to_fix_median":
      value_projector = cves => {
        if (!cves) {
          return 0;
        }

        if (cves.length == 0) {
          return 0;
        }

        const values = cves
          .map(cve => {
            const begin = new Date(cve.bug_date);
            const end = new Date(cve.version_dates.stable);
            return (end - begin) / (1000 * 60 * 60 * 24);
          })
          .filter(x => x)
          .sort((a, b) => a - b)

        if (hide_low_count.value && values.length < 6) {
          return 0;
        }

        return values[Math.floor(values.length / 2)];
      }
      break;

    case "time_to_fix_90p":
      value_projector = cves => {
        if (!cves) {
          return 0;
        }

        if (cves.length == 0) {
          return 0;
        }

        const values = cves
          .map(cve => {
            const begin = new Date(cve.bug_date);
            const end = new Date(cve.version_dates.stable);
            return (end - begin) / (1000 * 60 * 60 * 24);
          })
          .filter(x => x)
          .sort((a, b) => a - b)

        if (hide_low_count.value && values.length < 12) {
          return 0;
        }
        return values[Math.floor(values.length * 0.9)];
      }
      break;
  }

  switch(cell_value.value) {
    case "vrp_reward":
      formatter = cves => {
        const reward = value_projector(cves);
        if (reward == 0) {
          return "";
        }

        if (reward >= 1000000) {
          return dollarFormatter2(reward/1000000) + "M";
        }

        if (reward >= 1000) {
          return dollarFormatter(reward/1000) + "k";
        }

        return dollarFormatter(reward);
      }
      break;

    case "cve_count":
      formatter = value => {
        const count = value_projector(value);
        if (count == 0) {
          return "";
        }
        return count;
      }
      break;

    case "time_to_fix_10p":
    case "time_to_fix_median":
    case "time_to_fix_90p":
      formatter = x => {
        const value = value_projector(x);
        if (!value) {
          return "";
        }
        return `${Math.floor(value)}d`;
      }
      break;
  }

  // Add a colorscale.
  let max_value = 0;
  for (const row of table_data_value) {
    for (const field of time_buckets) {
      if (field == "line") {
        continue;
      }

      if (row[field] === undefined) {
        row[field] = 0;
        continue;
      }

      const value = value_projector(row[field]);
      if (value > max_value) {
        max_value = value;
      }
    }
  }

  color_scale = scalePow()
    .exponent(0.3)
    .domain([0, max_value])
    .range([0, 0.5]);
  table_data.value = table_data_value;
})

watch([
  cell_value,
  line,
  component_division,
  dates,
  hide_low_count,
  severity,
  time_division,
], () => {
  updateUrl();
  render();
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

.mycolumns {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1104px) {
  .mycolumns {
    display: flex;
    flex-direction: row;
    max-width: 100%;
    gap: 1em;
  }
}

.mycolumns {
  display: flex;
  gap: 1em;
}

#table-column {
  flex: 1;
  overflow: auto;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.table_link {
  color: var(--ink);
}

.table_link:hover {
  color: blue;
}

</style>
