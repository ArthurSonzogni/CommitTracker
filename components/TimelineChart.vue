<template>
  <LineChart :data="filteredData" />
</template>

<script setup lang="ts">

const props = defineProps({
  repositories: { type: Array, default: () => ["chromium"] },
  developers: { type: Array },
  dates: { type: Array },
  author: { type: Boolean },
  review: { type: Boolean },
  stacked: { type: Boolean },
});

const data = ref([]);

const { $chromiumDataAll } = useNuxtApp();

const filteredData = computed(() => {
  // Filter:
  let data_2 = data.value.map(d => {
    let commits = d.data;

    if (!props.author) {
      commits = commits.filter(commit => commit.kind != "author")
    }

    if (!props.review) {
      commits = commits.filter(commit => commit.kind != "review")
    }

    const values = commits
      .map(commit => new Date(commit.date))
      .sort((a,b) => (a-b))
      .filter(date => {
        return date >= props.dates[0] && date <= props.dates[1];
      })

    return {
      label: d.developer,
      values: values,
    }
  });

  // Stacked:
  if (props.stacked) {
    let accu = [];
    data_2 = data_2.map(entry => {
      accu = accu.concat(entry.values).sort((a, b) => a - b);
      return {
        label: entry.developer,
        values: accu,
      };
    });
  }

  // Accumulate patches:
  data_2 = data_2.map(entry => {
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

  return data_2;
});

const developersChanged = async () => {
  const new_data = await $chromiumDataAll(props.repositories[0], props.developers);
  data.value = new_data;
}
watch(() => [props.developers, props.repositories], developersChanged);

const initialize = () => {
  developersChanged();
}

onMounted(() => {
  initialize();
})

</script>
