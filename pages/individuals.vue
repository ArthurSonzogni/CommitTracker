<template>
  <div>
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
          <TimelineCount
            basic
            :commits="raw"
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
            <DeveloperTimelineChart
              chart="line"
              :commits="raw"
              :repositories="repositories"
              :developers="developers"
              :dates="dates"
              :author="options.includes('author')"
              :review="options.includes('review')"
              :stacked="options.includes('stacked')"
              />
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
            :commits="raw"
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
            :commits="raw"
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
            :commits="raw"
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
          <DeveloperTimelineChart
            chart="heatmap"
            :commits="raw"
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            />
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
import { useDeveloperCommits } from "~/composables/useDeveloperCommits";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { listSummary, repositoryNames } from "~/utils/filter-summary";
import { fetchUsernamesSummary } from "~/utils/usernamesSummary";

const {
  developers,
  options,
  hourlyParam,
  wrappedBuckets,
  repositories,
  dates,
} = useUrlState({
  developers: urlCodecs.csv([]),
  options: urlCodecs.csv(["author", "review"]),
  hourlyParam: urlCodecs.number(0, { min: 0, max: 2, integer: true }),
  wrappedBuckets: urlCodecs.number(100, { min: 1, max: 500, integer: true }),
  repositories: urlCodecs.csv(["chromium"]),
  dates: urlCodecs.dateRange("2000-01-01"),
});

const { raw } = useDeveloperCommits({
  repo: repositories,
  developers,
});

const summary = computed(() =>
  listSummary(repositoryNames(repositories.value), "repositories"),
);

// Suggestions when no developer is selected: the top authors of the latest
// year in the first selected repository.
const topAuthors = ref<string[]>([]);
const topAuthorsYear = ref("");
let topAuthorsRepo = "";
let topAuthorsReqId = 0;

watch([developers, repositories], async () => {
  const repo = repositories.value[0];
  if (developers.value.length > 0 || !repo) {
    return;
  }
  if (topAuthors.value.length > 0 && topAuthorsRepo === repo) {
    return;
  }

  const reqId = ++topAuthorsReqId;
  const summaryData = await fetchUsernamesSummary(repo, "commit", "yearly", "author");
  if (reqId !== topAuthorsReqId) return;

  const year = Object.values(summaryData)
    .flatMap(years => Object.keys(years))
    .reduce((a, b) => (a > b ? a : b), "");

  topAuthorsRepo = repo;
  topAuthorsYear.value = year;
  topAuthors.value = Object.entries(summaryData)
    .sort((a, b) => (b[1][year] ?? 0) - (a[1][year] ?? 0))
    .slice(0, 8)
    .map(([name]) => name);
}, { immediate: true });

const updateHasScrolled = () => {
  const maxScroll = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight,
  );

  document.documentElement.dataset.scrolltop =
    window.scrollY > 100 ? "1" : "0";
  document.documentElement.dataset.scrollbottom =
    maxScroll - window.scrollY > 1000 ? "1" : "0";
};

onMounted(() => {
  updateHasScrolled();
  document.addEventListener("scroll", updateHasScrolled, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener("scroll", updateHasScrolled);
  delete document.documentElement.dataset.scrolltop;
  delete document.documentElement.dataset.scrollbottom;
});
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
</style>
