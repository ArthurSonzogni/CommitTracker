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
            :custom-formatter="(val) => sliderTransform(val).toFixed(2) + '%'"
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

    <section class="section">
      <b-field>
        <b-button
          v-if="!displayReadme"
          label="Readme"
          @click="displayReadme = true"
          type="is-warning"
          ></b-button>
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

<script setup lang="ts">

const route = useRoute();
const router = useRouter();

const repositories = ref([
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
]);
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}
const what = ref("commit");
if (route.query.what) {
  what.value = route.query.what;
}
const grouping = ref("yearly");
if (route.query.grouping) {
  grouping.value = route.query.grouping;
}
const display = ref("average");
if (route.query.display) {
  display.value = route.query.display;
}
const kind = ref("author");
if (route.query.kind) {
  kind.value = route.query.kind;
}
const percentile = ref(0.7071);
if (route.query.percentile) {
  percentile.value = parseFloat(route.query.percentile);
}
const individual = ref(300);
if (route.query.individual) {
  individual.value = parseInt(route.query.individual);
}
const developers = ref([]);
if (route.query.developers) {
  developers.value = route.query.developers.split(",");
}
const min_contributions = ref(0);
if (route.query.min_contributions) {
  min_contributions.value = parseInt(route.query.min_contributions);
}
const displayReadme = ref(false);

watch([
  repositories,
  what,
  grouping,
  display,
  kind,
  percentile,
  individual,
  developers,
  min_contributions
], () => {
  router.replace({
    query: {
      repositories: repositories.value.join(","),
      what: what.value,
      grouping: grouping.value,
      display: display.value,
      kind: kind.value,
      percentile: percentile.value,
      individual: individual.value,
      developers: developers.value.join(","),
      min_contributions: min_contributions.value,
    }
  });
});

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
