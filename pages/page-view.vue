<template>
  <div>
    <Navbar />
    <section class="section">
      <div class="container content">
        <h1 class="title">Page view</h1>
        <template v-if="json.history">
          <p>
            Since <strong>2025-05-06</strong>, the website has been visited <strong>{{ json.total_hits }}</strong> times,
            with <strong>{{ json.today_hits }}</strong> visits today.
          </p>

          <LineChart :data=data />
        </template>
        <p v-else>The visit counts could not be loaded.</p>

        <hr>
        <p class="has-text-centered">
          <img
            src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fchrome-commit-tracker.arthursonzogni.com%2F&label=commit-tracker&icon=heart-fill&color=%23fd86aa">
          Powered by <a href="https://hitscounter.dev/">hitscounter</a>.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

const target = new URL('https://chrome-commit-tracker.arthursonzogni.com');
const hitscounter = new URL('https://hitscounter.dev/api/history');
hitscounter.searchParams.append('url', target.toString());

const fetchData = async () => {
  try {
    const response = await fetch(hitscounter.toString());
    const json = await response.json();
    return json;
  } catch (error) {
    console.error('Error fetching data:', error);
    return {};
  }
};

const json = await fetchData();

const data = ref([{
  label: 'Page view',
  values: (json.history ?? []).map(item => ({
    x: new Date(item.hit_date),
    y: item.hit_count,
  })),
}]);

</script>

<style scoped>

img {
  display: block;
  margin: 0 auto;
}

</style>
