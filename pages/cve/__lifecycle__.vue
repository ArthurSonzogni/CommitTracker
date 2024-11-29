<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">
          Bug lifecycle
        </h1>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <LineChart
          :data="filteredData"
          :formatter="d => Math.round(d) + ' days'"
        />
      </div>
    </section>


    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2015-01-01')"/>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">

import { select } from "d3-selection";
import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";
import { format } from "d3-format";
import { path } from "d3-path";
import { pointer } from "d3-selection";
import "d3-transition";
import { transition } from "d3-transition";
import { easeQuadInOut } from "d3-ease";
import { extent } from "d3-array";
import { scaleTime, scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { axisBottom, axisLeft } from "d3-axis";
import { quantile } from "d3-array";
import { min, max }  from "d3-array";

const route = useRoute();
const router = useRouter();

const filteredData = shallowRef([])

const dates = ref([
  new Date("2015-01-01"),
  new Date(),
]);
if (route.query.start) {
  dates.value[0] = new Date(route.query.start);
}
if (route.query.end) {
  dates.value[1] = new Date(route.query.end);
}

const updateUrl = () => {
  router.push({
    query: {
      start: dates.value[0].toISOString().split("T")[0],
      end: dates.value[1].toISOString().split("T")[0],
    }
  });
};

let raw_data = {}

onMounted(async () => {
  const response = await fetch("/cve/data.json");
  raw_data = await response.json();
  render();
})

const render = (() => {
  const data = Object
    .values(raw_data)
    .map(cve => {
      const begin = new Date(cve.bug_date);
      const end = new Date(cve.version_dates.stable);

      return {
        date: new Date(cve.published),
        value: (end - begin) / (1000 * 60 * 60 * 24)
      }
    })
    .filter(x => !isNaN(x.value))

  // Fill buckets.
  const buckets = new Array(10);
  for(let i = 0; i<buckets.length; ++i) {
    buckets[i] = [];
  }
  console.log(data);
  for(const d of data) {
    const f = (d.date - dates.value[0]) / (dates.value[1] - dates.value[0]);
    let index = Math.floor(f * buckets.length);
    index = Math.max(0, index);
    buckets[index].push(d.value);
  }
  for(let i = 0; i<buckets.length; ++i) {
    buckets[i] = buckets[i].sort((a,b) => a-b);
  }

  const percentiles = [20, 40, 50, 60, 80];
  const percentileData = percentiles.map(percentile => {
    return {
      label:  percentile + '%',
      // Return {x, y} values:
      values:
        buckets.map((bucket, i) => {
          const index = Math.round(percentile / 100 * bucket.length);
          const date = new Date(dates.value[0].getTime() + i * (dates.value[1] - dates.value[0]) / buckets.length);
          if (bucket.length === 0) {
            return {
              x: date,
              y: 0
            }
          }

          return {
            x: date,
            y: bucket[index]
          }
        })
    }
  });
  filteredData.value = percentileData
})

watch(dates, () => {
  updateUrl();
  render();
});

</script>

<style scoped>
.timeline {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background-color: white;
  width: 100%;
}

.tooltip {
  background-color: white;
}

</style>
