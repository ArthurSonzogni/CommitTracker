<template>
  <div>
    <h3>As author</h3>
    <div ref="container" align="center">
      <b-table
        :data="filteredData"
        :columns="columns"
        striped
        hoverable
      ></b-table>
    </div>
  </div>
</template>

<script>

import { format } from 'd3-format'

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    developers: { type: Array },
    dates: { type: Array[Date] },
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
          label: "#Commits",
          sortable: true,
        },
        {
          field: "review",
          label: "#Commits (review)",
          sortable: true,
        },
        {
          field: "additions_author",
          label: "#Lines added",
          sortable: true,
        },
        {
          field: "deletions_author",
          label: "#Lines removed",
          sortable: true,
        },
        {
          field: "additions_review",
          label: "#Lines added (review)",
          sortable: true,
        },
        {
          field: "deletions_review",
          label: "#Lines removed (review)",
          sortable: true,
        },
      ],
    }
  },

  watch: {
    repositories: "developersChanged",
    developers: "developersChanged",
  },

  computed: {
    filteredData() {
      return this.data.map(d => {
        const commit = d.commits
          .filter(commit => {
            const date = new Date(commit.date);
            return date >= this.dates[0] && date <= this.dates[1];
          });

        const authored = commit
          .filter(c => c.kind == "author");

        const reviewed = commit
          .filter(c => c.kind == "review");

        const sum = array => array.reduce((a,b) => a+b , 0);
        return {
          developer: d.developer,
          author: authored.length,
          review: reviewed.length,
          additions_author: format(",d")(sum(authored.map(c => c.additions))),
          deletions_author: format(",d")(sum(authored.map(c => c.deletions))),
          additions_review: format(",d")(sum(reviewed.map(c => c.additions))),
          deletions_review: format(",d")(sum(reviewed.map(c => c.deletions))),
        };
      });
    },
  },

  methods: {
    async developersChanged() {
      const data = await this.$chromeDataAll(this.repositories[0], this.developers);
      this.data = data.map(d => {
        return {
          developer: d.developer,
          commits: d.data
        };
      });
    },
  }
};
</script>
