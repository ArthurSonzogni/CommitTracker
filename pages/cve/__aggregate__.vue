<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <b-field grouped>
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
            :td-attrs="tdAttrs"
            :th-attrs="thAttrs"
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
            :sortable="column.sortable"
            :td-attrs="tdAttrs"
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

let raw_data = {}
let table_data = ref([])
let table_columns = ref([])

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
  if (column.field == "component") {

    return {
      style: {
        backgroundColor: "white",
      }
    }
  }
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

const time_generator = function*(start, end) {
  switch(time_division.value) {
    case "all":
      yield "All";
      return;
    case "year":
      for (let i = start.getFullYear(); i <= end.getFullYear(); ++i) {
        yield ""+i;
      }
      return;
    case "quarter":
      for (let i = start.getFullYear(); i <= end.getFullYear(); ++i) {
        for (let j = 1; j < 13; j+=3) {
          yield `${i}Q${Math.floor(j/3)+1}`;
        }
      }
      return;
    case "month":
      for (let i = start.getFullYear(); i <= end.getFullYear(); ++i) {
        for (let j = 1; j < 13; ++j) {
          yield `${i}M${j}`;
        }
      }
      return;
  }
}

const time_get_bucket = (date) => {
  switch(time_division.value) {
    case "all":
      return "All";
    case "year":
      return ""+date.getFullYear();
    case "quarter":
      return `${date.getFullYear()}Q${Math.floor(date.getMonth()/3)+1}`;
    case "month":
      return `${date.getFullYear()}M${date.getMonth()+1}`;
  }
}

const render = (() => {
  const data = Object
    .values(raw_data)
    .map(cve => {
      const begin = new Date(cve.bug_date);
      const end = new Date(cve.version_dates.stable);

      return {
        date: new Date(cve.published),
        cve,
        value: (end - begin) / (1000 * 60 * 60 * 24)
      }
    })
    .filter(x => !isNaN(x.value))
    .filter(x => severity.value.includes(x.cve.severity))
    .sort((a, b) => a.date - b.date)


  const time_buckets = new Array();
  for (const time of time_generator(dates.value[0], dates.value[1])) {
    time_buckets.push(time);
  }

  // On the y axis, we have the date.
  table_columns.value = time_buckets.map(time => {
    return {
      field: time,
      label: time,
      sortable: true,
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

  const component_array = Array.from(components).sort();
  const component_array_index = new Map();
  for (let i = 0; i < component_array.length; ++i) {
    component_array_index.set(component_array[i], i);
  }

  // Value is the vrp_reward for each component in each date.
  let table_data_value = component_array.map(component => {
    switch(cell_value.value) {
      case "cve_count":
      case "vrp_reward":
        return {
          component,
          // Fill date with 0.
          ...Object.fromEntries(time_buckets.map(time => [time, 0])),
        }
      case "time_to_fix_10p":
      case "time_to_fix_90p":
      case "time_to_fix_median":
        return {
          component,
          // Fill date with 0.
          ...Object.fromEntries(time_buckets.map(time => [time, []])),
        }
    }
  })

  for (const cve of data) {
    const date =
      time_get_bucket(new Date(cve.cve.published));

    for(const component of cve.cve.components) {
      for (const part of component_generator(component)) {
        const component_index = component_array_index.get(part);
        if (component_index === undefined) {
          continue;
        }

        switch(cell_value.value) {
          case "cve_count":
            table_data_value[component_index][date] += 1;
            break;
          case "time_to_fix_10p":
          case "time_to_fix_90p":
          case "time_to_fix_median":
            table_data_value[component_index][date].push(cve.value);
            break;
          case "vrp_reward":
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

      switch(cell_value.value) {
        case "time_to_fix_10p":
          if (row[field].length == 0) {
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
          row[field] = row[field].sort((a, b) => a - b);
          row[field] = row[field][Math.floor(row[field].length / 2)];
          break;
        case "time_to_fix_90p":
          if (row[field].length == 0) {
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
        /*
        let years = Math.floor(days / 365);
        days = days % 365;
        let months = Math.floor(days / 30);
        days = days % 30;

        if (years != 0) {
          return `${years}y ${months}m`;
        }

        if (months != 0) {
          return `${months}m ${days}d`;
        }

        return `${days}d`;
        */
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

  table_data.value = table_data_value;

  // Add a colorscale.
  let max_value = Math.max(...table_data.value.map(row => {
    return Math.max(...Object.values(row).map(x => parseInt(x) || 0));
  }));

  color_scale = scalePow()
    .exponent(0.3)
    .domain([0, max_value])
    .range([0, 0.5]);

})

watch([
  dates,
  component_division,
  time_division,
  cell_value,
  severity,
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
