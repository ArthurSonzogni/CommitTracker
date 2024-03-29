<template>
  <LineChart :data="filteredData" />
</template>

<script>

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    developers: { type: Array },
    dates: { type: Array[Date] },
    endDate: { type: Date },
    author: { type: Boolean },
    review: { type: Boolean },
    stacked: { type: Boolean },
  },

  data() {
    return {
      data: [],
      svgWidth: 500,
      svgHeight: 500,
    }
  },

  computed: {
    filteredData() {
      // Filter:
      let data = this.data.map(d => {
        console.log(data);
        let commits = d.data;

        if (!this.author) {
          commits = commits.filter(commit => commit.kind != "author")
        }

        if (!this.review) {
          commits = commits.filter(commit => commit.kind != "review")
        }

        const values = commits
          .map(commit => new Date(commit.date))
          .sort((a,b) => (a-b))
          .filter(date => {
            return date >= this.dates[0] && date <= this.dates[1];
          })

        return {
          label: d.developer,
          values: values,
        }
      });

      // Stacked:
      if (this.stacked) {
        let accu = [];
        data = data.map(entry => {
          accu = accu.concat(entry.values).sort((a, b) => a - b);
          return {
            label: entry.developer,
            values: accu,
          };
        });
      }

      // Accumulate patches:
      data = data.map(entry => {
        let accu = 0;
        return {
          label: entry.label,
          values: entry.values.map(time => {
            accu++;
            return {
              x: time,
              y: accu,
            };
          }),
        };
      });

      return data;
    },
  },

  mounted() {
    this.initialize();
  },

  watch: {
    developers: "developersChanged",
    repositories: "developersChanged",
  },

  methods: {
    async developersChanged() {
      this.data = await this.$chromeDataAll(this.repositories[0], this.developers);
    },

    initialize() {
      this.developersChanged();
    },
  }
};
</script>
