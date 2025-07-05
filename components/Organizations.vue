<template>
  <div class="main">

    <div v-if="chart == 'line'"
         style="aspect-ratio: 16/9;">
      <LineChart
        class="line-chart"
        :data="line_chart_data"
        :formatter="formatter"
        >
      </LineChart>
    </div>

    <BarChart
      v-if="chart == 'bar'"
      :timeLabel="timeLabel"
      :formatter="formatter"
      :data="bar_chart_data"
      >
    </BarChart>

    <b-field position="is-centered">
      <slot></slot>

      <p class="m-2"></p>

      <b-field position="is-centered">

        <b-button @click="download = true" > Download </b-button>

        <b-modal v-model="download" :width="640">
          <div class="card">
            <div class="card-content">
              <div class="media">
                <div class="media-content">
                  <p class="title is-4">Download as:</p>
                </div>
              </div>

              <div class="content">
                <b-button type="is-light" class="download-button" @click="DownloadJSON()" > JSON </b-button>
                <b-button type="is-light" class="download-button" @click="DownloadJSON2()" > JSON (variant) </b-button>
                <b-button type="is-light" class="download-button" @click="DownloadCSV()" > CSV (rows)</b-button>
                <b-button type="is-light" class="download-button" @click="DownloadCSV2()" > CSV (table) </b-button>
              </div>
            </div>
          </div>
        </b-modal>

      </b-field>
    </b-field>
  </div>
</template>

<script setup lang="ts">

import repositories from 'public/data/repositories.json'
import organizations from 'public/data/organizations.json'
import { format } from 'd3-format'

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  organizations: { type:Array[String], default: () => ["Google"],},
  colors: { type:String, default: "repositories"},
  grouping: { type:String, default: "yearly"},
  kind: {},
  metric: {},
  chart: { type:String, default: "bar"},
  dates: {
    type:Array[Date],
    default: () => [new Date("2000-01-01"), new Date()]
  },
  others: { type: Boolean, default: false},
  percent: { type: Boolean, default: false},
})

const repositoriesColor = new Map();
for(const repo of repositories) {
  repositoriesColor.set(repo.dirname, repo.color);
}

const organizationsColor = new Map();
for (const i in organizations) {
  const hue = (i* 360 / organizations.length) + (i%4)*90;
  const luminance = 40+5*(i%3);
  organizationsColor.set(organizations[i], `hsl(${hue}, 99%, ${luminance}%)`);
}
organizationsColor.set("Others", "hsl(0, 0%, 50%)");

const bar_chart_data = shallowRef([]);
const line_chart_data = shallowRef([]);
const download = ref(false);
let formatter = format(",d");

const merge = function(a,b) {
  for(const key in b) {
    a[key] = (a[key] || 0) + b[key];
  }
}

const groupingFunction = function() {
  switch(props.grouping) {
    case "forever":
      return x => "Forever";

    case "decennial":
      return x => x.substr(0,3) + "0";

    case "yearly":
      return x => x.substr(0,4);

    case "quarterly":
      return x => {
        const year = x.substr(0,4)
        const month = x.substr(5,2);
        const quarter = Math.floor((month - 1) / 3) + 1;
        return `${year}Q${quarter}`;
      }

    case "monthly":
      return x => x.substr(0,7);
  }

  return x => x;
}

const groupingFunctionReverse = function(date) {
  switch(props.grouping) {
    case "forever":
      return props.dates[0];

    case "decennial":
      return new Date(date.substr(0,3) + "0-01-01");

    case "yearly":
      return new Date(date.substr(0,4) + "-01-01");

    case "quarterly":
      return new Date(date.substr(0,4) + "-" + (1 + (parseInt(date.substr(5,1)) - 1) * 3) + "-01");

    case "monthly":
      return new Date(date + "-01");
  }
}

const dataForRepository = async function(repository) {
  const response = await
    fetch(`/data/${repository}/organizations_summary_${props.metric}_${props.grouping}_${props.kind}.json`);
  const data_all = await response.json();

  const data = {};

  data["Others"] = {};

  for(const organization in data_all) {
    if (props.organizations.includes(organization)) {
      data[organization] = data_all[organization]
      continue;
    }

    if (props.colors == "organizations" || props.others) {
      merge(data["Others"], data_all[organization])
    }
  }

  // Filter out the dates that are not in the range.
  for(const organization in data) {
    for(const key in data[organization]) {
      const date = groupingFunctionReverse(key);
      if (date < props.dates[0] || date > props.dates[1]) {
        delete data[organization][key]
      }
    }
  }

  console.log(data);
  return data;
}

const consolidateData = async function() {
  const repo_data = {}
  for(const repo of props.repositories) {
    repo_data[repo] = await dataForRepository(repo);
  }

  const data = {};
  if (props.colors == "repositories") {
    for(const repo in repo_data) {
      for(const organization in repo_data[repo]) {
        for(const date in repo_data[repo][organization]) {
          data[date] = data[date] || {};
          data[date][repo] ||= 0;
          data[date][repo] += repo_data[repo][organization][date];
        }
      }
    }

    if (props.percent) {
      for(const date in data) {
        let total = 0;
        for(const repo in data[date]) {
          total += data[date][repo];
        }
        for(const repo in data[date]) {
          data[date][repo] /= total;
        }
      }
    }
  } else {
    for(const repo in repo_data) {
      for(const organization in repo_data[repo]) {
        for(const date in repo_data[repo][organization]) {
          data[date] = data[date] || {};
          data[date][organization] ||= 0;
          data[date][organization] += repo_data[repo][organization][date];
        }
      }
    }

    if (props.percent) {
      for(const date in data) {
        let total = 0;
        for(const organization in data[date]) {
          total += data[date][organization];
        }
        for(const organization in data[date]) {
          data[date][organization] /= total;
        }
      }
    }

    if (!props.others) {
      for(const date in data) {
        delete data[date]["Others"];
      }
    }
  }

  // Cleanup empty data:
  for(const date in data) {
    for(const label in data[date]) {
      if (data[date][label] == 0) {
        delete data[date][label];
      }
    }
  }

  // Cleanup empty dates:
  for(const date in data) {
    if (Object.keys(data[date]).length == 0) {
      delete data[date];
    }
  }

  return data;
}

const refresh = async function() {
  const data = await consolidateData();

  formatter = props.percent
    ? format(".2%")
    : props.metric == "commit"
      ? v => format(",d")(v) + ' ⚙️'
      : v => format(",d")(v) + ' 🧍';

  // Turn the object into an array of arrays for D3.
  if (props.chart == "bar") {
    bar_chart_data.value = Object.keys(data)
      .sort()
      .map(date => {
        return {
          label: date,
          values: Object
          .keys(data[date])
          .sort()
          .map(label => {
            return {
              label: label,
              value: data[date][label],
              color: props.colors == "repositories"
              ? repositoriesColor.get(label)
              : organizationsColor.get(label),
            };
          })
        };
      });
  }

  if (props.chart == "line") {
    // For the time_char_data, we only take the top 10 labels.
    const label_size = {}
    for(const date in data) {
      for(const label in data[date]) {
        label_size[label] = (label_size[label] || 0) + data[date][label];
      }
    }

    const top_label = Object.keys(label_size)
      .sort((a,b) => label_size[b] - label_size[a])
      .slice(0,10);

    const accumulate = (acc = 0) => {
      return (d) => {
        return {
          x: d.x,
          y: acc += d.y,
        };
      };
    }

    line_chart_data.value = top_label
      .map(label => {
        return {
          label: label,
          values: Object.keys(data)
          .sort()
          .slice(0, -1)
          .map(date => {
            return {
              x: new Date(groupingFunctionReverse(date)),
              y: data[date][label] || 0,
            };
          })
        };
      });
  }
}

const Download = function(data_string, filename, type) {
  const blob = new Blob([data_string], {type: type || "text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DownloadJSON2 = async function() {
  const data = await consolidateData();
  Download(JSON.stringify(data, null, 2), "data.json", "application/json");
}

const DownloadJSON = async function() {
  const data = await consolidateData();

  const inverted_data = {};
  for(const date in data) {
    for(const label in data[date]) {
      inverted_data[label] = inverted_data[label] || {};
      inverted_data[label][date] = data[date][label];
    }
  }

  Download(JSON.stringify(inverted_data, null, 2), "data.json", "application/json");
}

const DownloadCSV = async function() {
  const data = await consolidateData();
  const csv = Object.keys(data)
    .sort()
    .map(date => {
      return Object.keys(data[date])
        .sort()
        .map(label => {
          return `${date},${label},${data[date][label]}`;
        })
        .join("\n");
    })
    .join("\n");

  Download(csv, "data.csv", "text/csv");
}

const DownloadCSV2 = async function() {
  const data = await consolidateData();

  const labels = new Set();
  for(const date in data) {
    for(const label in data[date]) {
      labels.add(label);
    }
  }

  // Head
  let csv = "Date"
  for(const label of labels) {
    csv += `,${label}`;
  }

  // Rows
  for(const date in data) {
    csv += `\n${date}`;
    for(const label of labels) {
      csv += `,${data[date][label] || 0}`;
    }
  }

  Download(csv, "data.csv", "text/csv");
}

const timeLabel = computed(() => {
  switch(props.grouping) {
    case "forever": return "Forever";
    case "decennial": return "Decade";
    case "yearly": return "Year";
    case "quarterly": return "Quarter";
    case "monthly": return "Month";
  }
})


watch(props, refresh)

onMounted(() => {
  refresh();
})

</script>

<style scoped>

.line-chart {
  margin-top: 2rem;
}

</style>
