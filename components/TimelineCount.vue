<template>
  <div>
    <b-field>
      <b-switch v-model="full">Full</b-switch>
    </b-field>
    <div align="center">
      <b-table
        :data="filteredData"
        :columns="columns"
        sticky-header
        striped
        hoverable
      >
      </b-table>
    </div>
  </div>
</template>

<script setup lang="ts">

import { format } from 'd3-format'
const { $chromiumDataAll } = useNuxtApp();

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  developers: { type: Array },
  dates: { type: Array[Date] },
  author: { type: Boolean },
  review: { type: Boolean },
})

const data = shallowRef([])
const filteredData = shallowRef([])
const columns = shallowRef([])
const full = ref<boolean>(false)

const refreshFilteredData = async () => {
  const new_filtered_data = [];

  for(const d of data.value) {

    let commit = d.commits
      .filter(commit => {
        const date = new Date(commit.date)
        return date >= props.dates[0] && date <= props.dates[1]
      })

    if (!props.author) {
      commit = commit.filter(c => c.kind != "author")
    }

    if (!props.review) {
      commit = commit.filter(c => c.kind != "review")
    }

    const new_columns = [];
    new_columns.push({
      field: "developer",
      label: "Developer",
      sortable: true,
      sticky: true,
      visible: true,
      numeric: false,
      headerClass: "table-style-header",
    });

    new_columns.push({
      field: "commit",
      label: "Σ(Commits)",
      sortable: true,
      visible: true,
      numeric: true,
      cellClass: "table-style-commits",
      headerClass: "table-style-header",
    });

    const stats = [];
    stats.push(["", (x:string) => `Σ(${x})`])
    if (full.value) {
      stats.push(["_mean", (x:string) => `Mean(${x})`])
      stats.push(["_median", (x:string) => `Median(${x})`])
      stats.push(["_min", (x:string) => `Min(${x})`])
      stats.push(["_max", (x:string) => `Max(${x})`])
    }

    for(const type of ["Additions", "Deletions", "Net", "Modified", "Files"]) {
      for(const stat of stats) {
        const field = `${type.toLowerCase()}${stat[0]}`
        new_columns.push({
          field: field,
          label: stat[1](type),
          sortable: true,
          visible: true,
          numeric: true,
          cellClass: `table-style-${type.toLowerCase()}`,
          headerClass: "table-style-header",
        })
      }
    }
    columns.value = new_columns;

    // Collect additions, deletions, net, and files. Sort and calculate the sum,
    // mean, median, min, and max.
    const additions = commit.map(c => c.additions).sort((a,b) => a-b)
    const deletions = commit.map(c => c.deletions).sort((a,b) => a-b)
    const net = commit.map(c => c.additions - c.deletions).sort((a,b) => a-b)
    const modified = commit.map(c => c.additions + c.deletions).sort((a,b) => a-b)
    const files = commit.map(c => c.files).sort((a,b) => a-b)

    const int_format = format(",d")
    const float_format = format(".2f")

    const sum = array => array.reduce((a,b) => a+b , 0)

    const sum_additions = sum(additions)
    const sum_deletions = sum(deletions)
    const sum_net = sum(net)
    const sum_modified = sum(modified)
    const sum_files = sum(files)

    const out = {
      developer: d.developer,

      commit: format(",")(commit.length),

      additions: int_format(sum_additions),
      additions_mean: float_format(sum_additions / commit.length),
      additions_median: int_format(additions[Math.floor(additions.length/2)]),
      additions_min: int_format(additions[0]),
      additions_max: int_format(additions[additions.length-1]),

      deletions: int_format(sum_deletions),
      deletions_mean: float_format(sum_deletions / commit.length),
      deletions_median: int_format(deletions[Math.floor(deletions.length/2)]),
      deletions_min: int_format(deletions[0]),
      deletions_max: int_format(deletions[deletions.length-1]),

      net: int_format(sum_net),
      net_mean: float_format(sum_net / commit.length),
      net_median: int_format(net[Math.floor(net.length/2)]),
      net_min: int_format(net[0]),
      net_max: int_format(net[net.length-1]),

      modified: int_format(sum_modified),
      modified_mean: float_format(sum_modified / commit.length),
      modified_median: int_format(modified[Math.floor(modified.length/2)]),
      modified_min: int_format(modified[0]),
      modified_max: int_format(modified[modified.length-1]),

      files: int_format(sum_files),
      files_mean: float_format(sum_files / commit.length),
      files_median: int_format(files[Math.floor(files.length/2)]),
      files_min: int_format(files[0]),
      files_max: int_format(files[files.length-1]),

    };

    new_filtered_data.push(out);
  };

  filteredData.value = new_filtered_data;
};

const refresh = async () => {
  const d = await $chromiumDataAll(props.repositories[0], props.developers)
  data.value = d.map(d => {
    return {
      developer: d.developer,
      commits: d.data
    }
  })
  refreshFilteredData()
}

refresh();

watch(() => props.repositories, refresh)
watch(() => props.developers, refresh)
watch(() => props.dates, refresh)
watch(() => props.author, refreshFilteredData)
watch(() => props.review, refreshFilteredData)
watch(full, refreshFilteredData)


</script>

<style>
.table-style-commits {
  font-family: monospace;
  background-color: rgba(255,255,0,0.1);
}
.table-style-additions {
  font-family: monospace;
  background-color: rgba(0, 255, 0, 0.1);
}
.table-style-deletions {
  font-family: monospace;
  background-color: rgba(255, 0, 0, 0.1);
}
.table-style-net {
  font-family: monospace;
  background-color: rgba(0, 0, 255, 0.1);
}
.table-style-modified {
  font-family: monospace;
  background-color: rgba(255, 0, 255, 0.1);
}
.table-style-files {
  font-family: monospace;
  background-color: rgba(0, 0, 0, 0.1);
}
</style>
