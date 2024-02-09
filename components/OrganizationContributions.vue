<template>
  <BarChart
    :timeLabel="timeLabel"
    :data="data"
    postfix=" ⚙️"
  >
  </BarChart>
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
      data: [],
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

    async dataForRepository(repository) {
      const response = await fetch(`/data/${repository}/organizations_summary.json`);
      const data_all = await response.json();

      const data = {};
      for(const organization in data_all) {
        if (this.organizations.includes(organization)) {
          data[organization] = data_all[organization];
        }
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
          new_data[new_key] |= 0;
          new_data[new_key] += old_data[key]
        }
        data[organization] = new_data;
      }

      return data;
    },

    async refresh() {
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

      // Turn the object into an array of arrays for D3.
      this.data = Object.keys(data)
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
  },

}

</script>
