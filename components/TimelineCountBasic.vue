<template>
  <div>
    <div align="center">
      <b-table
        :data="filteredData"
        :columns="columns"
        height="100%"
        striped
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
})

const data = shallowRef([])
const filteredData = shallowRef([])
const columns = [
  {
    field: "developer",
    label: "Developer",

  },
  {
    field: "author",
    label: "Author",
  },
  {
    field: "review",
    label: "Review",
  },
]

const refreshFilteredData = async () => {
  const new_filtered_data = [];

  for(const d of data.value) {

    let commit = d.commits
      .filter(commit => {
        const date = new Date(commit.date)
        return date >= props.dates[0] && date <= props.dates[1]
      })


    const out = {
      developer: d.developer,
      author: commit.filter(c => c.kind == "author").length,
      review: commit.filter(c => c.kind == "review").length,
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

</script>
