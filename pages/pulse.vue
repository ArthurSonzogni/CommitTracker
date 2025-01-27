<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Repository commits</h1>

        <strong>Repositories:</strong>

        <RepositorySelector
          v-model="repositories"
          size="medium"
          :allowMultiple="true"
          :allowAll="true"
        />

        <CalendarHeatmap :data="data" />
      </div>
    </section>
    <section class="section sticky bottom">
      <b-field expanded>
        <Timeline v-model="dates" ></Timeline>
      </b-field>
    </section>
  </div>
</template>

<script setup lang="ts">

import { format } from "d3-format";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";

const route = useRoute()
const router = useRouter()

const heatmap = shallowRef([]);
const data = shallowRef([]);
const dates = ref([new Date("2000-01-01"), new Date()]);
if (route.query.dates) {
  try {
    dates.value = route.query.dates.split(",").map(d => new Date(d));
  } catch (e) {
    console.error(e);
  }
}

const repositories = ref(["chromium"]);
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}

const refresh = async () => {
  router.push({
    query: {
      repositories: repositories.value.join(","),
      dates: dates.value.map(d => d.toISOString()).join(",")
    }
  });

  const responses = await Promise.all(repositories.value.map(repo =>
    fetch(`/data/${repo}/commits_per_hour.json`)
  ))
  const jsons = await Promise.all(responses.map(res => res.json()));

  // Format is:
  // {
  //   "startDate": "2021-01-01",
  //   "commits": [
  //      0, // The 0th hour
  //      1, // The 1st hour
  //      ...
  //   ]
  // }

  // Align the data into a common array.
  let min_date = new Date(jsons
    .map(json => json.startDate)
    .reduce((a, b) => a < b ? a : b)
  );

  const size = Math.max(...jsons.map(json => json.commits.length));

  // Extend every json to the same size, by prepending 0s.
  const aligned = jsons.map(json => {
    const out = new Array(size).fill(0);
    const offset = size - json.commits.length;
    for (let i = 0; i < json.commits.length; i++) {
      out[i + offset] = json.commits[i];
    }
    return out;
  });

  // Filter by date.
  const aligned_filtered = aligned.map(json => {
    return json.filter((_, index) => {
      const date = new Date(min_date.getTime() + index * 1000 * 60 * 60);
      return date >= dates.value[0] && date <= dates.value[1];
    });
  });

  // Adjust min_date
  if (dates.value[0] > min_date) {
    min_date = dates.value[0];
  }

  data.value = aligned_filtered.map((json, index) => {
    return {
      label: repositories.value[index],
      values: json.map((value, index) => {
        return {
          x: new Date(min_date.getTime() + index * 1000 * 60 * 60),
          y: value,
        };
      })
    };
  });
};

watch(repositories, refresh);
watch(dates, refresh);
onMounted(refresh);

</script>

<style>

  .line {
    display:flex;
    margin:1px;
  }

  .left {
    text-align:right;
    margin-right:10px;
    width:48px;
  }

  .center {
    color: black;
    background: rgba(0,128,255);
    opacity: 0.2;
    margin: 0px 10px 0px 0px;
    border-radius: 5px;
  }

  .center:hover {
    opacity: 0.4;
  }

  .usernameList {
    color:black;
    list-style-type: square;
    list-style-position: inside;
    display:flex;
    flex-wrap: wrap;
    padding-left:100px;
  }

  .usernameList.hidden {
    display:none;
  }

  .usernameList>* {
    flex: 1 1 160px;
  }

</style>
