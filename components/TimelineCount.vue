<template>
  <div ref="container" align="center">
    <b-table :data="filteredData" :columns="columns"></b-table>
  </div>
</template>

<script>
export default {
  props: {
    developers: { type: Array },
    startDate: { type: Date },
    endDate: { type: Date },
  },

  data() {
    return {
      data: [],
      columns: [
        {
          field: "developer",
          label: "Developer",
          sortable: true,
        },
        {
          field: "author",
          label: "Author",
          sortable: true,
        },
        {
          field: "review",
          label: "Review",
          sortable: true,
        },
      ]
    }
  },

  watch: {
    developers: "developersChanged",
  },

  computed: {
    filteredData() {
      const filterDate = d => {
        const date = new Date(d);
        return date >= this.startDate && //
               date <= this.endDate;
      }
      return this.data.map(d => {
        return {
          developer: d.developer,
          author: d.author.filter(filterDate).length,
          review: d.review.filter(filterDate).length,
        };
      });
    },
  },

  methods: {
    developersChanged() {
      Promise.all(this.developers.map(async d => {
        const response = await fetch(`./data/users/${d}.json`);
        const data = await response.json();
        console.log(data);
        return {
          developer:d,
          author:Object.keys(data.author),
          review:Object.keys(data.review),
        };
      })).then(data => {
        this.data = data;
        console.log(this.data);
      });
    },
  }
};
</script>
