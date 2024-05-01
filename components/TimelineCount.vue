<template>
  <div>
    <div align="center">
      <b-table
        :data="filteredData"
        :columns="columns"
        striped
        hoverable
      />
    </div>
  </div>
</template>

<script setup lang="ts">

import { format } from 'd3-format'
const { $chromeDataAll } = useNuxtApp();

const props = defineProps({
  repositories: { type:Array[String], default: () => ["chromium"],},
  developers: { type: Array },
  dates: { type: Array[Date] },
})

const data = ref([])
const columns = [
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
]

const filteredData = computed(() => {
  console.log("filteredData");
  console.log(data.value);
  return data.value.map(d => {
    const commit = d.commits
      .filter(commit => {
        const date = new Date(commit.date)
        return date >= props.dates[0] && date <= props.dates[1]
      })

    const authored = commit.filter(c => c.kind == "author")

    const reviewed = commit.filter(c => c.kind == "review")

    const sum = array => array.reduce((a,b) => a+b , 0)
    const out = {
      developer: d.developer,
      author: authored.length,
      review: reviewed.length,
      additions_author: format(",d")(sum(authored.map(c => c.additions))),
      deletions_author: format(",d")(sum(authored.map(c => c.deletions))),
      additions_review: format(",d")(sum(reviewed.map(c => c.additions))),
      deletions_review: format(",d")(sum(reviewed.map(c => c.deletions))),
    };
    console.log(out);
    return out;
  });
})

const refresh = async () => {
  console.log("refresh");
  const d = await $chromeDataAll(props.repositories[0], props.developers)
  data.value = d.map(d => {
    return {
      developer: d.developer,
      commits: d.data
    }
  })
  console.log("refresh");
  console.log(data.value);
}

refresh();

watch([props.repositories, props.developers, props.date], refresh)


</script>
