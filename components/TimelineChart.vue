<template>
  <LineChart
    :filteredData="filteredData"
  />
</template>

<script>

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    developers: { type: Array },
    startDate: { type: Date },
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
        const author = !this.author ? {} :
          Object.entries(d.data.author)
          .map(([time, _]) => time)
        const review = !this.review ? {} :
          Object.entries(d.data.review)
          .map(([time, _]) => time)

        const values = [author, review]
          .flat()
          .sort()
          .map(time => new Date(time))
          .filter(time => {
            return time >= this.startDate && time <= this.endDate;
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

      console.log(data);
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
