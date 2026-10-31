<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">Repositories charts</h1>

        <FilterPanel :summary="summary">
          <UiField>
            <RepositorySelector
              v-model="repositories"
              size="medium"
              :allowMultiple="true"
              :allowAll="true"
              />
          </UiField>

          <UiField label="Metric" class="mb-4">
            <UiSegmented v-model="what" :options="what_options" />
          </UiField>


          <UiField label="Display" class="mb-4" v-if="what == 'per_contributor'">
            <UiSegmented
              v-model="display"
              :options="[
              { value: 'average', label: 'Average' },
              { value: 'percentile', label: `Top ${sliderTransform(percentile).toFixed(2)} %` },
              { value: 'individual', label: `Top ${individual} individual` },
              { value: 'someone', label: 'Someone' },
              { value: 'someone_rank', label: 'Someone (rank)' },
              { value: 'someone_rank_percent', label: 'Someone (rank %)' },
            ]" />
          </UiField>

          <UiField v-if="what == 'per_contributor' && display == 'percentile'">
            <UiSlider v-model="percentile" :min="0" :max="1" :step="0.001" :formatter="(val) => sliderTransform(val).toFixed(2) + '%'" :tooltip="false" indicator lazy></UiSlider>
          </UiField>

          <UiField v-if="what == 'per_contributor' && display == 'individual'">
            <UiSlider v-model="individual" :min="1" :max="1000" :step="1" :tooltip="false" lazy indicator></UiSlider>
          </UiField>

          <UiField v-if="what == 'per_contributor' && display.startsWith('someone')" expanded>
                   <DevelopersInput v-model="developers"></DevelopersInput>
          </UiField>

          <div class="form-row">
            <UiField label="Count as" v-if="what != 'commit'">
              <UiSegmented
                v-model="kind"
                :options="[
                { value: 'author', label: 'Author' },
                { value: 'review', label: 'Reviewer' },
                { value: 'both', label: 'Both' },
              ]" />
            </UiField>

            <UiField label="Grouping">
              <UiSegmented
                v-model="grouping"
                :options="[
                { value: 'forever', label: 'Forever' },
                { value: 'decennial', label: 'Decennial' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'monthly', label: 'Monthly' },
              ]" />
            </UiField>

            <UiField label="Developer min total contributions" v-if="min_contributions_enabled">
                     <UiNumberInput v-model="min_contributions"></UiNumberInput>
            </UiField>
          </div>

        </FilterPanel>

        <Contributions
          :repositories="repositories"
          :percentile="sliderTransform(percentile)"
          :individual="individual"
          :grouping="grouping"
          :what="what"
          :display="display"
          :kind="kind"
          :developers="developers"
          :min_contributions="min_contributions_enabled ? min_contributions : 0"
          />
      </div>
    </section>

    <section class="section pt-0">
      <div class="container">
        <AboutData>
          <ul>
            <li>
              Data are refreshed <strong>weekly</strong>, and
              <strong>automatically</strong>. See <a
                href="https://github.com/ArthurSonzogni/CommitTracker/actions/workflows/importer-commit-timeline.yaml">Jobs</a>
            </li>
            <li>
              Chromium's <strong>reviewers data before 2017 are missing</strong>.
              This informations wasn't part of the commit description before.
            </li>
            <li>
              <strong>Leaving contributors:</strong>: Every contributor increase
              the bucket representing their last commit.
              This is normal to see a huge increase in the last bucket, or in
              the second to last.
            </li>
            <li>
              <strong>New Contributors:</strong> Every contributor increase the
              bucket representing their first commit. This is normal to see a
              relative small number at the end, as the year is not completed yet.
            </li>
          </ul>
        </AboutData>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { capitalize, listSummary, repositoryNames } from "~/utils/filter-summary";

const DEFAULT_REPOSITORIES = [
  "angle",
  "chromeos",
  "chromium",
  "dawn",
  "devtool-frontend",
  "gn",
  "pdfium",
  "perfetto",
  "swiftshader",
  "v8",
  "webrtc",
] as const;

const {
  repositories,
  what,
  grouping,
  display,
  kind,
  percentile,
  individual,
  developers,
  min_contributions,
} = useUrlState({
  repositories: urlCodecs.csv(DEFAULT_REPOSITORIES),
  what: urlCodecs.enum(
    ["commit", "contributors", "first_commit", "last_commit", "per_contributor"] as const,
    "commit",
  ),
  grouping: urlCodecs.enum(
    ["forever", "decennial", "yearly", "quarterly", "monthly"] as const,
    "yearly",
  ),
  display: urlCodecs.enum(
    ["average", "percentile", "individual", "someone", "someone_rank", "someone_rank_percent"] as const,
    "average",
  ),
  kind: urlCodecs.enum(["author", "review", "both"] as const, "author"),
  percentile: urlCodecs.number(0.7071, { min: 0, max: 1 }),
  individual: urlCodecs.number(300, { min: 1, max: 1000, integer: true }),
  developers: urlCodecs.csv([]),
  min_contributions: urlCodecs.number(0, { min: 0, integer: true }),
});

const what_options = [
  { value: 'commit', label: 'Commits' },
  { value: 'contributors', label: 'Contributors' },
  { value: 'first_commit', label: 'New contributors' },
  { value: 'last_commit', label: 'Leaving contributors' },
  { value: 'per_contributor', label: 'Commits per developer' },
];

const summary = computed(() => [
  listSummary(repositoryNames(repositories.value), "repositories"),
  what_options.find(option => option.value == what.value)?.label,
  capitalize(grouping.value),
].join(" · "));

const sliderTransform = (value: number) => {
  return 100 * value * value;
}

const min_contributions_enabled = computed(() => {
  return what.value != 'per_contributor' || (
    display.value != 'someone' &&
    display.value != 'someone_rank' &&
    display.value != 'someone_rank_percent'
  )
});

</script>
