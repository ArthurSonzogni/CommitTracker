<template>
  <div>
    <Navbar />
    <section class="section">
      <div class="container">
        <h1 class="title">Code accretion</h1>
        <p class="mb-4">
          The lines of code of Chromium alive over time, per year they were
          written in. Each year adds a new layer on top, which slowly erodes as
          its lines are rewritten. Computed like <code>git blame</code>, along
          the first-parent history, ignoring the formatting commits listed in
          <code>.git-blame-ignore-revs</code>, and excluding
          <code>third_party/</code> except Blink.
        </p>

        <FilterPanel :summary="share ? 'Share of the total' : 'Number of lines'">
          <UiField label="Display">
            <UiSegmented v-model="share" :options="[
              { value: false, label: 'Lines' },
              { value: true, label: 'Share' },
            ]" />
          </UiField>
        </FilterPanel>

        <div class="chart">
          <AccretionChart :data="cohorts" :share="share" :milestones="milestones" />
        </div>

        <h2 class="title is-4 mt-6">Developers</h2>
        <p class="mb-4">
          The lines each developer wrote, still alive over time.
        </p>
        <UiField>
          <DevelopersInput v-model="developers" />
        </UiField>
        <div class="chart">
          <LineChart :data="developerData" :formatter="lines" />
        </div>

        <h2 class="title is-4 mt-6">Most lines alive</h2>
        <UiTable :data="leaderboard" hoverable striped :paginated="true" :per-page="20">
          <UiTableColumn field="rank" label="#" v-slot="props" numeric>
            {{ props.row.rank }}
          </UiTableColumn>
          <UiTableColumn field="username" label="Developer" v-slot="props">
            <NuxtLink :to="`/developers/${props.row.username}`">
              {{ props.row.username }}
            </NuxtLink>
          </UiTableColumn>
          <UiTableColumn field="lines" label="Lines alive" v-slot="props" numeric sortable>
            {{ lines(props.row.lines) }}
          </UiTableColumn>
          <UiTableColumn field="peak" label="Peak" v-slot="props" numeric sortable>
            {{ lines(props.row.peak) }}
          </UiTableColumn>
        </UiTable>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";

const route = useRoute();
const router = useRouter();

const repository = "chromium";

// The events explaining the largest steps of the chart.
const milestones = [
  { date: "2009-08-21", label: "Hunspell moved to DEPS" },
  { date: "2015-09-23", label: "Blink merged into Chromium" },
  { date: "2018-10-24", label: "Redundant web test baselines removed" },
  { date: "2023-11-28", label: "Legacy DOM conformance tests removed" },
  { date: "2024-05-17", label: "Content extraction test data trimmed" },
  { date: "2025-06-26", label: "native_client_sdk removed" },
];
const lines = format(",");

const share = ref(route.query.share === "true");
const developers = ref(route.query.developers
  ? route.query.developers.split(",")
  : []);

const cohorts = shallowRef(null);
const leaderboard = shallowRef([]);
const developerData = shallowRef([]);

const fetchJson = url => fetch(url).then(response => response.ok
  ? response.json()
  : null);

onMounted(async () => {
  const [cohortsJson, leaderboardJson] = await Promise.all([
    fetchJson(`/accretion/${repository}/cohorts.json`),
    fetchJson(`/accretion/${repository}/leaderboard.json`),
  ]);
  cohorts.value = cohortsJson;
  leaderboard.value = leaderboardJson.map((entry, i) => ({ ...entry, rank: i + 1 }));
  if (developers.value.length === 0) {
    developers.value = leaderboard.value.slice(0, 5).map(entry => entry.username);
  }
});

watch(developers, async () => {
  const jsons = await Promise.all(developers.value.map(username =>
    fetchJson(`/accretion/${repository}/usernames/${username}.json`)));
  developerData.value = developers.value
    .map((username, i) => jsons[i] && {
      label: username,
      values: jsons[i].dates.map((date, j) => ({
        x: new Date(date),
        y: jsons[i].lines[j],
      })),
    })
    .filter(entry => entry);
});

watch([share, developers], () => {
  router.replace({
    query: {
      share: share.value ? "true" : undefined,
      developers: developers.value.join(",") || undefined,
    },
  });
});
</script>

<style scoped>
.chart {
  height: 500px;
}
</style>
