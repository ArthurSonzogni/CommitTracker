<template>
  <div>
    <section class="section">
      <div class="container content page-view">
        <h1 class="title">Page view</h1>
        <UiLoading v-model="loading" :is-full-page="false" />
        <template v-if="history.length">
          <p>
            Since <strong>{{ history[0].hit_date }}</strong>, the website has
            been visited <strong>{{ number(json.total_hits) }}</strong> times,
            with <strong>{{ number(json.today_hits) }}</strong> visits today.
          </p>

          <LineChart :data="data" :formatter="number" :milestones="milestones" />
        </template>
        <p v-else-if="!loading">The visit counts could not be loaded.</p>

        <hr>
        <p class="has-text-centered">
          Powered by <a href="https://hitscounter.dev/">hitscounter</a>.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";

const target = new URL('https://chrome-commit-tracker.arthursonzogni.com');
const hitscounter = new URL('https://hitscounter.dev/api/history');
hitscounter.searchParams.append('url', target.toString());

const number = format(",");

// Events explaining the inflection points of the chart.
const milestones = [
  { date: new Date("2026-10-24"), label: "Tests and dev servers counted as visits" },
];

const loading = ref(true);
const json = shallowRef<any>({});
const history = computed(() => json.value.history ?? []);

const data = computed(() => [{
  label: 'Page view',
  values: history.value.map(item => ({
    x: new Date(item.hit_date),
    y: item.hit_count,
  })),
}]);

onMounted(async () => {
  try {
    const response = await fetch(hitscounter.toString());
    json.value = await response.json();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
  loading.value = false;
});

</script>

<style scoped>

.page-view {
  min-height: 200px;
  position: relative;
}

</style>
