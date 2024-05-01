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
            <b-radio-button name="kind" v-model="kind" native-value="author">
              author
            </b-radio-button>
            <b-radio-button name="kind" v-model="kind" native-value="review">
              reviewer
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
          :timeIndex="timeIndex"
          @timeIndexChanged="n => timeIndex = n"
          />
      </div>
    </section>
  </div>
</template>

<script>

export default {
  data() {
    let repositories = ["chromium"];
    if (this.$route.query.repositories) {
      repositories = this.$route.query.repositories.split(",");
    }
    let grouping = "yearly";
    if (this.$route.query.grouping) {
      grouping = this.$route.query.grouping;
    }
    let kind = "author";
    if (this.$route.query.kind) {
      kind = this.$route.query.kind;
    }
    let timeIndex = 0;
    if (this.$route.query.timeIndex) {
      timeIndex = parseInt(this.$route.query.timeIndex);
    }

    return {
      repositories,
      grouping,
      kind,
      timeIndex
    };
  },

  watch: {
    repositories: "updateUrl",
    grouping: "updateUrl",
    kind: "updateUrl",
    timeIndex: "updateUrl",
  },

  methods: {
    updateUrl() {
      this.$router.replace({
        query: {
          repositories: this.repositories.join(","),
          grouping: this.grouping,
          kind: this.kind,
          timeIndex: this.timeIndex,
        }
      });
    },
  },
}
</script>
