<template>
  <div>
    <section class="section">
      <SplitLayout>
        <template #header>
          <h1 class="title">Leaderboard</h1>
        </template>

        <template #aside>
        <FilterPanel :summary="summary">
          <UiField label="Repositories">
            <RepositorySelector
              v-model="repositories"
              size="medium"
              :allowMultiple="true"
              :allowAll="true"
              />
          </UiField>
        </FilterPanel>
        </template>

        <!-- The settings of the chart, above it. -->
        <FilterPanel :summary="settingsSummary">
          <div class="form-row settings-row">
            <UiField label="Count as">
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

            <UiField label="Measure">
              <UiSelect v-model="type">
                <option value="commit">Commits</option>
                <option value="lines">Lines</option>
                <option value="added_lines">Additions</option>
                <option value="deleted_lines">Deletions</option>
              </UiSelect>
            </UiField>
          </div>
        </FilterPanel>

        <!--If props.type is "line", display a warning that this is heavily biased-->
        <!--around large scale refactoring and large deletion.-->


        <Leaderboard
          :repositories="repositories"
          :type="type"
          :grouping="grouping"
          :kind="kind"
          v-model:timeIndex="timeIndex"
          />
      </SplitLayout>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { capitalize, listSummary, repositoryNames } from "~/utils/filter-summary";
import { showToast } from "~/utils/toast";

const { type, repositories, grouping, kind, timeIndex } = useUrlState({
  type: urlCodecs.enum(
    ["commit", "lines", "added_lines", "deleted_lines"] as const,
    "commit",
  ),
  repositories: urlCodecs.csv(["chromium"]),
  grouping: urlCodecs.enum(
    ["forever", "decennial", "yearly", "quarterly", "monthly"] as const,
    "yearly",
  ),
  kind: urlCodecs.enum(["author", "review", "both"] as const, "author"),
  timeIndex: urlCodecs.number(0, { min: 0, integer: true }),
});

const type_labels = {
  commit: "Commits",
  lines: "Lines",
  added_lines: "Additions",
  deleted_lines: "Deletions",
};

const summary = computed(() => listSummary(repositoryNames(repositories.value), "repositories"));
const settingsSummary = computed(() => [
  capitalize(kind.value),
  capitalize(grouping.value),
  type_labels[type.value],
].join(" · "));

const WARNING_MESSAGES: Record<string, string> = {
  lines:
    "Value: Sum(addition + deletion) — Warning: Biased around large scale refactoring and large addition/deletion.",
  added_lines:
    "Value: Sum(max(0, addition - deletion)) — Warning: Biased around large scale refactoring and large addition.",
  deleted_lines:
    "Value: Sum(max(0, deletion - addition)) — Warning: Biased around large scale refactoring and large deletion.",
};

watch(type, (next, prev) => {
  if (next !== prev && next !== "commit" && WARNING_MESSAGES[next]) {
    showToast({
      message: WARNING_MESSAGES[next],
      type: "is-warning",
      duration: 5000,
    });
  }
});
</script>
