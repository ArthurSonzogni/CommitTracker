<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <b-field grouped group-multiline>
          <!--component_division, use 4 radiobox to set the value to 0,1,2,3-->
          <b-field label="Components depths">
            <b-radio-button v-model="component_division" native-value="0">0</b-radio-button>
            <b-radio-button v-model="component_division" native-value="1">1</b-radio-button>
            <b-radio-button v-model="component_division" native-value="2">2</b-radio-button>
            <b-radio-button v-model="component_division" native-value="3">3</b-radio-button>
            <b-radio-button v-model="component_division" native-value="4">4</b-radio-button>
            <b-radio-button v-model="component_division" native-value="5">5</b-radio-button>
          </b-field>

          <!-- time_division, use 3 radiobox to set the value to all,year,quarter,months -->
          <b-field label="Time division">
            <b-radio-button v-model="time_division" native-value="all">All</b-radio-button>
            <b-radio-button v-model="time_division" native-value="year">Year</b-radio-button>
            <b-radio-button v-model="time_division" native-value="quarter">Quarter</b-radio-button>
            <b-radio-button v-model="time_division" native-value="month">Month</b-radio-button>
          </b-field>

          <!--Severity ['low', 'medium', 'high', 'critical']-->
          <b-field label="Severity">
            <b-checkbox-button v-model="severity" native-value="Low">Low</b-checkbox-button>
            <b-checkbox-button v-model="severity" native-value="Medium">Medium</b-checkbox-button>
            <b-checkbox-button v-model="severity" native-value="High">High</b-checkbox-button>
            <b-checkbox-button v-model="severity" native-value="Critical">Critical</b-checkbox-button>
          </b-field>

          <!-- value -->
          <b-field label="Value">
            <!--<b-radio-button v-model="cell_value" native-value="vrp_reward">VRP reward</b-radio-button>-->
            <!--<b-radio-button v-model="cell_value" native-value="cve_count">CVE count</b-radio-button>-->
            <b-radio-button v-model="cell_value" native-value="vrp_reward">
              <b-tooltip label="VRP reward" position="is-top">
                Reward
              </b-tooltip>
            </b-radio-button>
            <b-radio-button v-model="cell_value" native-value="cve_count">
              <b-tooltip label="Number of CVE" position="is-top">
                CVE
              </b-tooltip>
            </b-radio-button>
            <b-radio-button v-model="cell_value" native-value="time_to_fix_10p">
              <b-tooltip label="Delay from bug reported to fix released to stable" position="is-top">
                Velocity 10p
              </b-tooltip>
            </b-radio-button>
            <b-radio-button v-model="cell_value" native-value="time_to_fix_median">
              <b-tooltip label="Delay from bug reported to fix released to stable" position="is-top">
                Velocity median
              </b-tooltip>
            </b-radio-button>
            <b-radio-button v-model="cell_value" native-value="time_to_fix_90p">
              <b-tooltip label="Delay from bug reported to fix released to stable" position="is-top">
                Velocity 90p
              </b-tooltip>
            </b-radio-button>
          </b-field>

          <b-field label="Hide low count">
            <b-switch v-model="hide_unreliable" type="is-info"></b-switch>
          </b-field>
        </b-field>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <b-table
          :data="table_data"
          striped
          bordered
          scrollable
          sticky-header
          height="60vh"
          >
          <!--The component field-->
          <b-table-column
            field="component"
            label="Component"
            sortable
            sticky
            >
            <template v-slot="props">
              {{ props.row.component }}
            </template>

          </b-table-column>

          <b-table-column
            draggable-column
            v-for="column in table_columns"
            :key="column.field"
            :field="column.field"
            :label="column.label"
            :td-attrs="tdAttrs"
            sortable
            >
            <template v-slot="props">
              {{ formatter(props.row[column.field]) }}
            </template>
          </b-table-column>


        </b-table>
      </div>
    </section>


    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2015-01-01')"/>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">

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
const component_division = ref(3);
if (route.query.cd) {
  component_division.value = parseInt(route.query.cd);
}
const time_division = ref("year");
if (route.query.td) {
  time_division.value = route.query.td;
}
const severity = ref(["Low", "Medium", "High", "Critical"]);
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
    }
  });
};

const hide_unreliable = ref(true);

let raw_data = {}
let table_data = shallowRef([])
let table_columns = shallowRef([])

// Format the cells with d3.format.
const dollarFormatter = format("$,.0f");
const dollarFormatter2 = format("$,.2f");
let formatter = x => x;

// Exponential scale for the color.

let color_scale = scalePow()
  .exponent(0.2)
  .domain([0, 7000])
  .range([0, 1]);
let color_scale2 = scaleSequential(interpolateOranges);

const thAttrs = (column) => {
  if (column.field == "component") {
    return {
      style: {
        backgroundColor: "white",
        zIndex: 1,
      }
    }
  }
  return {
    style: {
      backgroundColor: color_scale2(color_scale(column.field)),
    }
  }
}

const tdAttrs = (row, column) => {
  return {
    style: {
      backgroundColor: color_scale2(color_scale(row[column.field])),
    }
  }
}

onMounted(async () => {
  const response = await fetch("/cve/data.json");
  raw_data = await response.json();
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
  const component_bucket_set = new Set();

  const data = Object
    .values(raw_data)
    .map(cve => {
      if (!cve.version_dates.stable) {
        return 0;
      }

      if (!severity.value.includes(cve.severity)) {
        return 0;
      }


      const begin = new Date(cve.bug_date);
      const end = new Date(cve.version_dates.stable);

      if (!begin || !end) {
        return 0;
      }
      const date = end;

      if (date < dates.value[0] || date > dates.value[1]) {
        return 0;
      }

      const value = (end - begin) / (1000 * 60 * 60 * 24);
      if (isNaN(value)) {
        return 0;
      }


      const time_label = time_get_bucket(date);
      time_bucket_set.add(time_label)
      for (const component of cve.components || []) {
        for (const part of component_generator(component)) {
          component_bucket_set.add(part);
        }
      }

      return {
        date,
        cve,
        value,
      }
    })
    .filter(x => x != 0)
    .sort((a, b) => a.date - b.date)

  const time_buckets = Array.from(time_bucket_set).sort();
  const component_buckets = Array.from(component_bucket_set).sort();

  // On the y axis, we have the date.
  table_columns.value = [
    {
      field: "component",
      label: "Component",
    }
  ]
  table_columns.value = time_buckets.map(time => {
    return {
      field: time,
      label: time,
    }
  })

  // On the x axis, we have the component.
  const components = new Set();
  for (const cve of data) {
    for (const component of cve.cve.components) {
      for (const part of component_generator(component)) {
        components.add(part);
      }
    }
  }

  const component_array_index = new Map();
  for (let i = 0; i < component_buckets.length; ++i) {
    component_array_index.set(component_buckets[i], i);
  }

  // Value is the vrp_reward for each component in each date.
  let table_data_value = component_buckets.map(component => {
    return {
      component,
    }
  })

  for (const cve of data) {
    const date = time_get_bucket(cve.date);

    for(const component of cve.cve.components) {
      for (const part of component_generator(component)) {
        const component_index = component_array_index.get(part);
        if (component_index === undefined) {
          continue;
        }

        switch(cell_value.value) {
          case "cve_count":
            table_data_value[component_index][date] ||= 0;
            table_data_value[component_index][date] += 1;
            break;
          case "time_to_fix_10p":
          case "time_to_fix_90p":
          case "time_to_fix_median":
            table_data_value[component_index][date] ||= [];
            table_data_value[component_index][date].push(cve.value);
            break;
          case "vrp_reward":
            table_data_value[component_index][date] ||= 0;
            table_data_value[component_index][date] += parseInt(cve.cve.vrp_reward) || 0;
        }
      }
    }
  }

  // Post processing for computing median and 90p.
  for (const row of table_data_value) {
    for (const field of time_buckets) {
      if (field == "component") {
        continue;
      }

      if (row[field] === undefined) {
        continue;
      }

      switch(cell_value.value) {
        case "time_to_fix_10p":
          if (row[field].length == 0) {
            row[field] = 0;
            break;
          }
          if (hide_unreliable.value && row[field].length < 10) {
            row[field] = 0;
            break;
          }
          row[field] = row[field].sort((a, b) => a - b);
          row[field] = row[field][Math.floor(row[field].length * 0.1)];
          break;
        case "time_to_fix_median":
          if (row[field].length == 0) {
            row[field] = 0;
            break;
          }
          if (hide_unreliable.value && row[field].length < 7) {
            row[field] = 0;
            break;
          }
          row[field] = row[field].sort((a, b) => a - b);
          row[field] = row[field][Math.floor(row[field].length / 2)];
          break;
        case "time_to_fix_90p":
          if (row[field].length == 0) {
            row[field] = 0;
            break;
          }
          if (hide_unreliable.value && row[field].length < 10) {
            row[field] = 0;
            break;
          }
          row[field] = row[field] || [];
          row[field] = row[field].sort((a, b) => a - b);
          row[field] = row[field][Math.floor(row[field].length * 0.9)];
          break;
      }
    }
  }

  switch(cell_value.value) {
    case "time_to_fix_10p":
    case "time_to_fix_median":
    case "time_to_fix_90p":
      formatter = x => {
        if (!x) {
          return "";
        }

        let days = Math.floor(x);
        return `${days}d`;
      }
      break;
    case "vrp_reward":
      formatter = x => {
        if (!x) {
          return "";
        }

        if (x >= 1000000) {
          return dollarFormatter2(x/1000000) + "M";
        }

        if (x >= 1000) {
          return dollarFormatter(x/1000) + "k";
        }

        return dollarFormatter(x);
      }
      break;
    case "cve_count":
      formatter = x => {
        if (!x) {
          return "";
        }

        return `${x}`;
      }
      break;
  }

  // Add a colorscale.
  let max_value = Math.max(...table_data_value.map(row => {
    return Math.max(...Object.values(row).map(x => parseInt(x) || 0));
  }));
  table_data.value = table_data_value;

  color_scale = scalePow()
    .exponent(0.3)
    .domain([0, max_value])
    .range([0, 0.5]);

})

watch([
  cell_value,
  component_division,
  dates,
  hide_unreliable,
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
  background-color: white;
  width: 100%;
}

.tooltip {
  background-color: white;
}

</style>
