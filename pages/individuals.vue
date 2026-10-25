<template>
  <div>
    <Navbar/>

    <div>

      <section class="section sticky top">

        <FilterPanel :summary="summary">
          <UiField>
            <RepositorySelector
              v-model="repositories"
              size="is-small"
              />
          </UiField>
        </FilterPanel>

        <div class="developers-row">
          <UiField expanded>
            <DevelopersInput v-model="developers" allowEmail allowUsername/>
          </UiField>
          <div class="chips" role="group" aria-label="Count">
            <UiToggle v-model="options" value="author">
              Author
            </UiToggle>
            <UiToggle v-model="options" value="review">
              Review
            </UiToggle>
            <UiToggle v-if="developers.length >= 2" v-model="options" value="stacked">
              Stacked
            </UiToggle>
          </div>
        </div>
      </section>

      <section class="section" v-if="developers.length == 0">
        <div class="container empty-state">
          <h2 class="title is-4">Pick a developer</h2>
          <p>
            Type a username or an email above, or start with one of the top
            authors of {{ topAuthorsYear }}:
          </p>
          <div class="suggestions">
            <button
              v-for="author in topAuthors"
              :key="author"
              class="button"
              @click="developers = [author]">
              <UiIcon name="account" size="small"></UiIcon>
              <span>{{ author }}</span>
            </button>
          </div>
        </div>
      </section>

      <template v-else>
      <section class="section">
        <div class="container">
          <h2 class="title">Counts</h2>
          <TimelineCountBasic
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Timeline</h2>
          <div style="height: calc(50vh);">
            <TimelineChart
              chart="line"
              :repositories="repositories"
              :developers="developers"
              :dates="dates"
              :author="options.includes('author')"
              :review="options.includes('review')"
              :stacked="options.includes('stacked')"
              ></TimelineChart>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Timeline wrapped</h2>
          <div class="form-row">
            <UiField label="Modulo">
              <UiSegmented
                v-model="hourlyParam"
                aria-label="Modulo"
                :options="[
                  { value: 0, label: 'Day' },
                  { value: 1, label: 'Week' },
                  { value: 2, label: 'Year' },
                ]" />
            </UiField>

            <UiField :label="'Buckets: ' + wrappedBuckets" expanded>
              <UiSlider v-model="wrappedBuckets" :min="1" :max="500" aria-label="Buckets" lazy></UiSlider>
            </UiField>
          </div>

          <TimelineWrappedChart
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            :hourlyParam="hourlyParam"
            :buckets="wrappedBuckets"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Peers</h2>
          <PeersChart
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Details</h2>
          <TimelineCount
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Heatmap</h2>
          <TimelineChart
            chart="heatmap"
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            ></TimelineChart>
        </div>
      </section>


      <section class="section sticky bottom">
        <UiField expanded>
          <Timeline v-model="dates" ></Timeline>
        </UiField>
      </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Explicit import: Nuxt 4's auto-import reads <TimelineChart> as the lazy
// hydration modifier "Time" + "LineChart", and resolves it to LineChart.
import TimelineChart from '~/components/TimelineChart.vue'

const route = useRoute();
const router = useRouter();

const dates = ref([new Date("2000-01-01"), new Date()]);
if (route.query.dates) {
  dates.value = route.query.dates.split(',').map((d: string|number|Date) => new Date(d));
}

const developers = ref([]);
if (route.query.developers) {
  developers.value = route.query.developers.split(',');
}

const tt = computed(() => {
  return developers.value;
});

const options = ref(["author", "review"]);
if (route.query.options) {
  options.value = route.query.options.split(',');
}

const hourlyParam = ref(0);
if (route.query.hourlyParam) {
  hourlyParam.value = parseInt(route.query.hourlyParam);
  hourlyParam.value = Math.min(2, Math.max(0, hourlyParam.value));
}

const wrappedBuckets = ref(100);
if (route.query.wrappedBuckets) {
  wrappedBuckets.value = parseInt(route.query.wrappedBuckets);
}

const repositories = ref(["chromium"]);

const summary = computed(() =>
  listSummary(repositoryNames(repositories.value), "repositories"));
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(',');
}

// Suggestions when no developer is selected: the top authors of the latest
// year in the first selected repository.
const topAuthors = ref<string[]>([]);
const topAuthorsYear = ref("");
watch([developers, repositories], async () => {
  if (developers.value.length || topAuthors.value.length) {
    return;
  }
  const response = await fetch(
    `/data/${repositories.value[0]}/usernames_summary_commit_yearly_author.json`);
  if (!response.ok) {
    return;
  }
  const summary: Record<string, Record<string, number>> = await response.json();
  const year = Object.values(summary)
    .flatMap(years => Object.keys(years))
    .reduce((a, b) => a > b ? a : b, "");
  topAuthorsYear.value = year;
  topAuthors.value = Object.entries(summary)
    .sort((a, b) => (b[1][year] ?? 0) - (a[1][year] ?? 0))
    .slice(0, 8)
    .map(([name]) => name);
}, { immediate: true });

const updateUrl = () => {
  router.push({
    query: {
      developers: developers.value.join(','),
      options: options.value.join(','),
      hourlyParam: hourlyParam.value,
      wrappedBuckets: wrappedBuckets.value,
      repositories: repositories.value.join(','),
      dates: dates.value.map((d: { toISOString: () => string; }) => d.toISOString().split("T")[0]).join(','),
    }
  });
};

watch([
  dates,
  developers,
  options,
  hourlyParam,
  wrappedBuckets,
  repositories,
], updateUrl);

const updateHasScrolled = () => {
  const maxScroll = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );

  document.documentElement.dataset.scrolltop =
    (window.scrollY > 100) ? '1' : '0';
  document.documentElement.dataset.scrollbottom=
    (maxScroll - window.scrollY > 1000) ? '1' : '0';
};

updateHasScrolled();
document.addEventListener('scroll', updateHasScrolled, { passive: true });

</script>

<style scoped>
.empty-state p {
  color: var(--muted);
  max-width: 36rem;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.suggestions .button {
  border-radius: 999px;
  gap: 0.25rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.sticky {
  position: sticky;
  transition: box-shadow 0.2s;
  width: 100%;
  z-index: 2;
}

.sticky::before {
  display: block;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  z-index: 1;

  backdrop-filter: saturate(180%) blur(12px);
  background-color: color-mix(in srgb, var(--surface) 88%, transparent);
  content: '';
  position:absolute;
  transition: all 0.1s ease-in-out;
  transition: background-color 0.2s ease-in-out;
}

.sticky > * {
  z-index: 2;
  position: relative;
}


.developers-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

/* Elevated when the content scrolls under them. */
html[data-scrolltop= "1"] .sticky.top {
  box-shadow: 0 10px 24px -14px color-mix(in srgb, black 30%, transparent);
}

html[data-scrollbottom= "1"] .sticky.bottom {
  box-shadow: 0 -10px 24px -14px color-mix(in srgb, black 30%, transparent);
}

.sticky.top {
  top: 0;
  margin-top:0;
  padding-top:15px;
  margin-bottom:0;
  padding-bottom:15px;
}

/* On phones, the filters take too much of the screen to stay visible. */
@media (max-width: 768px) {
  .sticky.top {
    position: relative;
  }
}

.sticky.bottom {
  border-top: 1px solid var(--line);
  bottom: 0;
  margin-bottom:0px;
  padding-bottom: 0.5rem;
  padding-top: 0.6rem;
}

.anchor {
  display: block;
  position: relative;
  top: -200px;
}

.anchor-link {
  color: var(--ink);
  opacity: 0.1;
  transition: opacity 0.2s ease-in-out;
}

.anchor-link:hover {
  opacity: 1;
}

.test{
  width: 100%;
  height: 400px !important;
}

</style>
