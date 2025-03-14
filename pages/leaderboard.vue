<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Leaderboard</h1>

        <RepositorySelector
          v-model="repositories"
          size="medium"
          :allowMultiple="true"
          :allowAll="true"
          />

        <b-field grouped group-multiline>
          <b-field label="As:">
            <b-radio-button
              name="kind"
              v-model="kind"
              native-value="author"
            >
              author
            </b-radio-button>
            <b-radio-button
              name="kind"
              v-model="kind"
              native-value="review"
            >
              Review
            </b-radio-button>
            <b-radio-button name="kind" v-model="kind" native-value="both">
              both
            </b-radio-button>
          </b-field>

          <b-field label="Grouping:">
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="forever">
              Forever
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="decennial">
              Decennial
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="yearly">
              Yearly
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="quarterly">
              Quarterly
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="monthly">
              Monthly
            </b-radio-button>
          </b-field>

          <b-field label="type">
            <b-select v-model="type">
              <option value="commit">Commits</option>
              <option value="lines">Lines</option>
              <option value="added_lines">Additions</option>
              <option value="deleted_lines">Deletions</option>
            </b-select>
          </b-field>
        </b-field>

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

import { ToastProgrammatic as Toast } from '@ntohq/buefy-next'

const repositories = ref<string[]>(["chromium"]);
const type = ref<string>("commit");
const grouping = ref<string>("yearly");
const kind = ref<string>("author");
const timeIndex = ref<number>(0);

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
    const toast = new Toast();
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
    toast.open({
      message: warning,
      type: "is-warning",
      position: "is-bottom",
      duration: 5000,
      pauseOnHover: true,
      queue: true,
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
