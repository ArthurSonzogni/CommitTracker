<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="sr-only">Repositories heatmap</h1>

        <FilterPanel :summary="listSummary(repositoryNames(repositories), 'repositories')">
          <UiField>
            <RepositorySelector
              v-model="repositories"
              size="medium"
              :allowMultiple="true"
              :allowAll="true"
            />
          </UiField>
        </FilterPanel>

        <FetchError v-if="loadError" class="mb-4" :message="loadError" @retry="loadRepositories" />
        <CalendarHeatmap :data="data" />
      </div>
    </section>
    <section class="section sticky bottom">
      <UiField expanded>
        <Timeline v-model="dates" ></Timeline>
      </UiField>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchJson, formatFetchError } from "~/utils/fetchJson";
import { listSummary, repositoryNames } from "~/utils/filter-summary";

interface CommitsPerHourResponse {
  startDate: string;
  commits: number[];
}

interface AlignedCommitsPerHour {
  minDateMs: number;
  repos: string[];
  aligned: number[][];
}

const HOUR_MS = 60 * 60 * 1000;

const { repositories, dates } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
  dates: urlCodecs.dateRange("2000-01-01"),
});

const rawAligned = shallowRef<AlignedCommitsPerHour | null>(null);
const loadError = ref<string | null>(null);
let requestId = 0;

const loadRepositories = async () => {
  const id = ++requestId;
  const repos = [...repositories.value];
  loadError.value = null;
  if (repos.length === 0) {
    rawAligned.value = null;
    return;
  }

  try {
    const jsons = await Promise.all(
      repos.map(repo => fetchJson<CommitsPerHourResponse>(`/data/${repo}/commits_per_hour.json`, { cache: true })),
    );
    if (id !== requestId) return;

    const minStartDate = jsons
      .map(json => json.startDate)
      .reduce((a, b) => (a < b ? a : b));
    const minDateMs = new Date(minStartDate).getTime();
    const size = Math.max(0, ...jsons.map(json => json.commits.length));

    // Extend every json to the same size by prepending 0s.
    const aligned = jsons.map(json => {
      const out = new Array<number>(size).fill(0);
      const offset = size - json.commits.length;
      for (let i = 0; i < json.commits.length; i++) {
        out[i + offset] = json.commits[i];
      }
      return out;
    });

    rawAligned.value = { minDateMs, repos, aligned };
  } catch (error) {
    if (id === requestId) {
      console.error("Failed to fetch commits_per_hour:", error);
      loadError.value = formatFetchError(error, "Failed to load heatmap data.");
    }
  }
};

const data = computed(() => {
  const raw = rawAligned.value;
  if (!raw || raw.aligned.length === 0) return [];

  const { minDateMs, repos, aligned } = raw;
  const size = aligned[0]?.length ?? 0;
  if (size === 0) return repos.map(label => ({ label, values: [] }));

  const d0Ms = dates.value[0].getTime();
  const d1Ms = dates.value[1].getTime();
  const startIdx = Math.max(0, Math.ceil((d0Ms - minDateMs) / HOUR_MS));
  const endIdx = Math.min(size - 1, Math.floor((d1Ms - minDateMs) / HOUR_MS));
  if (endIdx < startIdx) {
    return repos.map(label => ({ label, values: [] }));
  }

  const baseMs = Math.max(minDateMs, d0Ms);
  return aligned.map((series, repoIdx) => {
    const sliced = series.slice(startIdx, endIdx + 1);
    return {
      label: repos[repoIdx],
      values: sliced.map((value, idx) => ({
        x: new Date(baseMs + idx * HOUR_MS),
        y: value,
      })),
    };
  });
});

watch(repositories, loadRepositories);
onMounted(loadRepositories);
</script>
