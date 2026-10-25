<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Leaderboard</h1>

        <FilterPanel :summary="summary">
          <UiField>
            <RepositorySelector
              v-model="repositories"
              size="medium"
              :allowMultiple="true"
              :allowAll="true"
              />
          </UiField>

          <div class="form-row">
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
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

import { showToast } from '~/utils/toast'

const repositories = ref<string[]>(["chromium"]);
const type = ref<string>("commit");
const grouping = ref<string>("yearly");
const kind = ref<string>("author");
const timeIndex = ref<number>(0);

const type_labels = {
  commit: "Commits",
  lines: "Lines",
  added_lines: "Additions",
  deleted_lines: "Deletions",
};
const summary = computed(() => [
  listSummary(repositoryNames(repositories.value), "repositories"),
  type_labels[type.value],
  capitalize(grouping.value),
].join(" · "));

const router = useRouter();
const route = useRoute();

if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}
if (route.query.type) {
  type.value = route.query.type as string;
}
if (route.query.grouping) {
  grouping.value = route.query.grouping as string;
}
if (route.query.kind) {
  kind.value = route.query.kind as string;
}
if (route.query.timeIndex) {
  timeIndex.value = parseInt(route.query.timeIndex as string);
}

watch([
  type,
  repositories,
  grouping,
  kind,
  timeIndex,
], (newValues, oldValues) => {
  if (newValues[0] != oldValues[0] && newValues[0] != "commit") {
    let message = "";
    let warning = "";
    switch(newValues[0]) {
      case "lines":
        warning = `
          <div class="has-text-left">
            <strong>Value</strong>: <code>Sum(addition+deletion)</code>
            <br>
            <strong>Warning</strong>: Biased around large scale refactoring and
            large addition/deletion.
          </div>
        `
        break;
      case "added_lines":
        warning = `
          <div class="has-text-left">
            <strong>Value</strong>: <code>Sum(max(0, addition - deletion))</code>
            <br>
            <strong>Warning</strong>: Biased around large scale refactoring and
            large addition.
          </div>
        `
        break;
      case "deleted_lines":
        warning = `
          <div class="has-text-left">
            <strong>Value</strong>: <code>Sum(max(0, deletion - addition))</code>
            <br>
            <strong>Warning</strong>: Biased around large scale refactoring and
            large deletion.
          </div>
        `
        break;
    }
    showToast({
      message: warning,
      type: "is-warning",
      duration: 5000,
    });
    //"Warning: This is heavily biased around large scale refactoring and large deletion.");
  }
  router.replace({
    query: {
      type: type.value == "commit" ? undefined : type.value,
      repositories: repositories.value.join(',') == "chromium" ? undefined : repositories.value.join(","),
      grouping: grouping.value == "yearly" ? undefined : grouping.value,
      kind: kind.value == "author" ? undefined : kind.value,
      timeIndex: timeIndex.value == 0 ? undefined : timeIndex.value.toString(),
    }
  });
});
</script>
