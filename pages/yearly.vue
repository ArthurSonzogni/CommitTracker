<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Contributions</h1>

        <p>
          <strong>Repositories?</strong>
        </p>
        <b-field>
          <b-radio-button
            name="repositories"
            v-model="repositories"
            native-value="chrome">
            Chrome
          </b-radio-button>
          <b-radio-button
            name="repositories"
            v-model="repositories"
            native-value="v8">
            V8
          </b-radio-button>
          <b-radio-button
            name="repositories"
            v-model="repositories"
            native-value="dawn">
            Dawn
          </b-radio-button>
        </b-field>

        <p>
          <strong>What?</strong>
        </p>

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

        <div v-if="what == 'per_contributor'">
          <p>
            <strong>Display: </strong>
          </p>
          <b-field>
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
          <b-field>

            <b-slider
              v-model="percentile"
              v-if="display == 'percentile'"
              :min=0
              :max=1
              :step=0.001
              :custom-formatter="(val) => this.sliderTransform(val).toFixed(2) + '%'"
              :tooltip="false"
              indicator
              lazy
              ></b-slider>

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

            <DevelopersInput v-if="display.startsWith('someone')"
            v-model="developers"></DevelopersInput>
          </b-field>

        </div>


        <div v-if="what != 'commit'">
          <p>
            <strong>As: </strong>
          </p>
          <b-field>
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
        </div>


        <Contributions
          :repositories="repositories"
          :percentile="this.sliderTransform(percentile)"
          :individual="individual"
          :what="what"
          :display="display"
          :kind="kind"
          :developers="developers"
          />
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="update_info">
          Fixme: Review prior to 2017 are ignored.
        </p>
        <p class="update_info">
          The data are updated weekly, automatically.
        </p>
      </div>
    </section>

  </div>
</template>

<script>

export default {
  data() {
    return {
      repositories: "chrome",
      what: "commit",
      display: "average",
      kind: "both",
      percentile: 0.7071,
      individual: 300,
      developers: [],
    };
  },

  methods: {
    sliderTransform(value) {
      return 100 * value * value;
    }
  },

  computed: {
    slider_percentil_disabled: function() {
      console.log(this.kind)
      return !(
        this.kind === "author_percentile" ||
        this.kind === "review_percentile" ||
        this.kind === "both_percentile"
      );
    },
    slider_individual_disabled: function() {
      console.log(this.kind)
      return !(
        this.kind === "author_individual" ||
        this.kind === "review_individual" ||
        this.kind === "both_individual"
      );
    }
  }
}
</script>
