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

        </b-field>

        <Leaderboard
          :repositories="repositories"
          :grouping="grouping"
          :kind="kind"
          v-model:timeIndex="timeIndex"
          />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

const repositories = ref<string[]>(["chromium"]);
const grouping = ref<string>("yearly");
const kind = ref<string>("author");
const timeIndex = ref<number>(0);

const router = useRouter();
const route = useRoute();

if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
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
  repositories,
  grouping,
  kind,
  timeIndex,
], () => {
  router.replace({
    query: {
      repositories: repositories.value.join(","),
      grouping: grouping.value,
      kind: kind.value,
      timeIndex: timeIndex.value.toString(),
    }
  });
});
</script>
