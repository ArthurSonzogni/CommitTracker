<template>
  <div class="main">

    <LineChart
      class="line-chart"
      v-if="chart == 'line'"
      :data="line_chart_data" >
    </LineChart>

    <BarChart
      v-if="chart == 'bar'"
      :timeLabel="timeLabel"
      :data="bar_chart_data"
      postfix=" ⚙️" >
    </BarChart>

    <div class="download">
      <b-button @click="download = true" v-if="!download" > Download </b-button>
      <b-field v-if="download" label="Download as:">
        <b-button class="download-button" @click="DownloadJSON()" > JSON </b-button>
        <b-button class="download-button" @click="DownloadJSON2()" > JSON (variant) </b-button>
        <b-button class="download-button" @click="DownloadCSV()" > CSV (rows)</b-button>
        <b-button class="download-button" @click="DownloadCSV2()" > CSV (table) </b-button>
      </b-field>
    </div>
  </div>
</template>

<script>

import repositories from 'static/data/repositories.json'
import organizations from 'static/data/organizations.json'

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    organizations: { type:Array[String], default: () => ["Google"],},
    colors: { type:String, default: "repositories"},
    grouping: { type:String, default: "yearly"},
    kind: {},
    chart: { type:String, default: "bar"},
    dates: {
      type:Array[Date],
      default: () => [new Date("2000-01-01"), new Date()]
    },
    others: { type: Boolean, default: false},
  },

  data() {
    this.repositoriesColor = new Map();
    for(const repo of repositories) {
      this.repositoriesColor.set(repo.dirname, repo.color);
    }

    this.organizationsColor = new Map();
    for (const i in organizations) {
      const hue = (i* 360 / organizations.length) + (i%4)*90;
      const luminance = 40+5*(i%3);
      this.organizationsColor.set(organizations[i], `hsl(${hue}, 99%, ${luminance}%)`);
    }

    return {
      bar_chart_data: [],
      line_chart_data: [],
      download: false,
    }
  },

  mounted() {
    this.refresh();
  },

  methods: {
    merge: function(a,b) {
      for(const key in b) {
        a[key] = (a[key] || 0) + b[key];
      }
    },

    groupingFunction: function() {
      switch(this.grouping) {
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
    },

    groupingFunctionReverse: function(date) {
      switch(date.length) {
        case 4:
          return new Date(date)

        case 6: {
          switch(date.substr(5,1)) {
            case "1": return new Date(`${date.substr(0,4)}-01`);
            case "2": return new Date(`${date.substr(0,4)}-04`);
            case "3": return new Date(`${date.substr(0,4)}-07`);
            case "4": return new Date(`${date.substr(0,4)}-10`);
          }
        }

        case 7:
          return new Date(`${date}-01`);
      }
    },

    async dataForRepository(repository) {
      const response = await fetch(`/data/${repository}/organizations_summary.json`);
      const data_all = await response.json();

      const data = {};

      data["Others"] = {
        author: {},
        review: {},
      }

      for(const organization in data_all) {
        if (this.organizations.includes(organization)) {
          data[organization] = data_all[organization];
          continue;
        }

        this.merge(data["Others"].author, data_all[organization].author);
        this.merge(data["Others"].review, data_all[organization].review);
      }

      switch(this.kind) {
        case "author":
          for(const organization in data) {
            data[organization] = data[organization].author;
          }
          break;

        case "review":
          for(const organization in data) {
            data[organization] = data[organization].review;
          }
          break;

        case "both":
          for(const organization in data) {
            let merged = {};
            this.merge(merged, data[organization].author);
            this.merge(merged, data[organization].review);
            data[organization] = merged
          }
          break;
      }


      // Group dates togethers.
      const group = this.groupingFunction();
      for(const organization in data) {
        const old_data = data[organization];
        const new_data = {}
        for(const key in old_data) {
          const new_key = group(key);
          const new_key_date = this.groupingFunctionReverse(new_key);
          if (new_key_date < this.dates[0] || new_key_date > this.dates[1]) {
            continue;
          }
          new_data[new_key] |= 0;
          new_data[new_key] += old_data[key]
        }
        data[organization] = new_data;
      }

      if (!this.others) {
        delete data["Others"];
      }

      return data;
    },

    async consolidateData() {
      const repo_data = {}
      for(const repo of this.repositories) {
        repo_data[repo] = await this.dataForRepository(repo);
      }

      const data = {};
      for(const repo in repo_data) {
        if (this.colors == "repositories") {
          for(const organization in repo_data[repo]) {
            for(const date in repo_data[repo][organization]) {
              data[date] = data[date] || {};
              data[date][repo] = data[date][repo] || 0;
              data[date][repo] += repo_data[repo][organization][date];
            }
          }
        } else {
          for(const organization in repo_data[repo]) {
            for(const date in repo_data[repo][organization]) {
              data[date] = data[date] || {};
              data[date][organization] = data[date][organization] || 0;
              data[date][organization] += repo_data[repo][organization][date];
            }
          }
        }
      }
      return data;
    },

    async refresh() {
      const data = await this.consolidateData();

      // Turn the object into an array of arrays for D3.
      if (this.chart == "bar") {
        this.bar_chart_data = Object.keys(data)
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
                  color: this.colors == "repositories"
                  ? this.repositoriesColor.get(label)
                  : this.organizationsColor.get(label),
                };
              })
            };
          });
      }

      if (this.chart == "line") {
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

        this.line_chart_data = top_label
          .map(label => {
            return {
              label: label,
              values: Object.keys(data)
              .sort()
              .slice(0, -1)
              .map(date => {
                return {
                  x: new Date(this.groupingFunctionReverse(date)),
                  y: data[date][label] || 0,
                };
              })
            };
          });
      }
    },

    Download(data_string, filename, type) {
      const blob = new Blob([data_string], {type: type || "text/plain"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    async DownloadJSON2() {
      const data = await this.consolidateData();
      this.Download(JSON.stringify(data, null, 2), "data.json", "application/json");
    },

    async DownloadJSON() {
      const data = await this.consolidateData();

      const inverted_data = {};
      for(const date in data) {
        for(const label in data[date]) {
          inverted_data[label] = inverted_data[label] || {};
          inverted_data[label][date] = data[date][label];
        }
      }

      this.Download(JSON.stringify(inverted_data, null, 2), "data.json", "application/json");
    },

    async DownloadCSV() {
      const data = await this.consolidateData();
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

      this.Download(csv, "data.csv", "text/csv");
    },

    async DownloadCSV2() {
      const data = await this.consolidateData();

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

      this.Download(csv, "data.csv", "text/csv");
    },

  },

  computed: {
    timeLabel() {
      switch(this.grouping) {
        case "yearly": return "Year";
        case "quarterly": return "Quarter";
        case "monthly": return "Month";
      }
    },
  },

  watch: {
    repositories: "refresh",
    organizations: "refresh",
    colors: "refresh",
    grouping: "refresh",
    kind: "refresh",
    chart: "refresh",
    dates: "refresh",
    others: "refresh",
  },

}

</script>

<style scoped>

.line-chart {
  margin-top: 2rem;
}

</style>
