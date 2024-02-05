<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Contributions</h1>

        <p>
          <strong>Repositories?</strong>
        </p>
        <RepositorySelector
          v-model="repositories"
          size="medium"
          :allowMultiple="true"
          :allowAll="true"
          />

        <b-field label="What?">
          <b-field>
            <b-radio-button
              name="what"
              v-model="what"
              native-value="contributors">
              Contributors
            </b-radio-button>
            <b-radio-button
              name="what"
              v-model="what"
              native-value="first_commit">
              New contributors
            </b-radio-button>
            <b-radio-button
              name="what"
              v-model="what"
              native-value="last_commit">
              Leaving contributors
            </b-radio-button>
          </b-field>
          <b-field>
            <b-radio-button
              name="what"
              v-model="what"
              native-value="commit">
              Commits
            </b-radio-button>
            <b-radio-button
              name="what"
              v-model="what"
              native-value="per_contributor">
              Commits per developer
            </b-radio-button>
          </b-field>
        </b-field>


        <b-field label="Display:" v-if="what == 'per_contributor'">
          <b-radio-button name="display" v-model="display" native-value="average">
            Average
          </b-radio-button>
          <b-radio-button name="display" v-model="display" native-value="percentile">
            Top {{sliderTransform(percentile).toFixed(2)}} %
          </b-radio-button>
          <b-radio-button name="display" v-model="display" native-value="individual">
            Top {{individual}} individual
          </b-radio-button>
          <b-radio-button name="display" v-model="display"
                                         native-value="someone">
            Someone
          </b-radio-button>
          <b-radio-button name="display" v-model="display"
                                         native-value="someone_rank">
            Someone (rank)
          </b-radio-button>

          <b-radio-button name="display" v-model="display"
                                         native-value="someone_rank_percent">
            Someone (rank %)
          </b-radio-button>
        </b-field>

        <b-field v-if="what == 'per_contributor' && display == 'percentile'">
          <b-slider
            v-model="percentile"
            :min=0
            :max=1
            :step=0.001
            :custom-formatter="(val) => this.sliderTransform(val).toFixed(2) + '%'"
            :tooltip="false"
            indicator
            lazy
            ></b-slider>
        </b-field>

        <b-field v-if="what == 'per_contributor' && display == 'individual'">
          <b-slider
            v-model="individual"
            v-if="display == 'individual'"
            :min=1
            :max=1000
            :step=1
            :tooltip="false"
            lazy
            indicator
            ></b-slider>
        </b-field>

        <b-field v-if="what == 'per_contributor' && display.startsWith('someone')"
                 expanded
                 >
                 <DevelopersInput v-model="developers"></DevelopersInput>
        </b-field>

        <b-field grouped group-multiline>
          <b-field label="As:" v-if="what != 'commit'">
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

          <b-field label="Developer min total contributions:"
                   v-if="min_contributions_enabled" >
            <b-numberinput
              v-model="min_contributions"
              controls-position="compact"
            ></b-numberinput>
          </b-field>
        </b-field>

        <Contributions
          :repositories="repositories"
          :percentile="this.sliderTransform(percentile)"
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

    <section class="section">
      <b-field
        <b-button
          v-if="!displayReadme"
          label="Readme"
          @click="displayReadme = true"
          type="is-warning"
          />
        </b-button>
      </b-field>
      <b-message
        title="Readme"
        v-model="displayReadme"
        aria-close-label="Close message"
        >
        <div class="content">
          <ul>
            <li>
              Data are refreshed <strong>weekly</strong>, and
              <strong>automatically</strong>. See <a
                href="https://github.com/ArthurSonzogni/ChromeCommitTracker/actions/workflows/importer-commit-timeline.yaml">Jobs</a>
            </li>
            <li>
              Chrome's <strong>reviewers data before 2017 are missing</strong>.
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
        </div>
      </b-message>
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
    let what = "contributors";
    if (this.$route.query.what) {
      what = this.$route.query.what;
    }
    let grouping = "yearly";
    if (this.$route.query.grouping) {
      grouping = this.$route.query.grouping;
    }
    let display = "average";
    if (this.$route.query.display) {
      display = this.$route.query.display;
    }
    let kind = "author";
    if (this.$route.query.kind) {
      kind = this.$route.query.kind;
    }
    let percentile = 0.7071;
    if (this.$route.query.percentile) {
      percentile = this.$route.query.percentile;
    }
    let individual = 300;
    if (this.$route.query.individual) {
      individual = this.$route.query.individual;
    }
    let developers = [];
    if (this.$route.query.developers) {
      developers = this.$route.query.developers.split(",");
    }
    let min_contributions = 0;
    if (this.$route.query.min_contributions) {
      min_contributions = parseInt(this.$route.query.min_contributions);
    }

    return {
      repositories,
      what,
      grouping,
      display,
      kind,
      percentile,
      individual,
      developers,
      min_contributions,
      displayReadme: false,
    };
  },

  watch: {
    repositories: "updateUrl",
    what: "updateUrl",
    grouping: "updateUrl",
    display: "updateUrl",
    kind: "updateUrl",
    percentile: "updateUrl",
    individual: "updateUrl",
    developers: "updateUrl",
    min_contributions: "updateUrl",
  },

  methods: {
    updateUrl() {
      console.log(this.what, this.display, this.kind)
      this.$router.replace({
        query: {
          repositories: this.repositories.join(","),
          what: this.what,
          grouping: this.grouping,
          display: this.display,
          kind: this.kind,
          percentile: this.percentile,
          individual: this.individual,
          developers: this.developers.join(","),
          min_contributions: this.min_contributions,
        }
      });
    },

    sliderTransform(value) {
      return 100 * value * value;
    }
  },

  computed: {
    slider_percentil_disabled: function() {
      return !(
        this.kind === "author_percentile" ||
        this.kind === "review_percentile" ||
        this.kind === "both_percentile"
      );
    },
    slider_individual_disabled: function() {
      return !(
        this.kind === "author_individual" ||
        this.kind === "review_individual" ||
        this.kind === "both_individual"
      );
    },
    min_contributions_enabled: function() {
      return this.what != 'per_contributor' || (
        this.display != 'someone' &&
        this.display != 'someone_rank' &&
        this.display != 'someone_rank_percent'
      )
    }
  }
}
</script>
