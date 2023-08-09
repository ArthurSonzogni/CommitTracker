<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Contribution </h1>

        <div class="block">
          <p>
            Sum
          </p>
          <b-field>
            <b-radio name="kind" v-model="kind" native-value="commit">
              Commit
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="contributors">
              Contributors
            </b-radio>
          </b-field>

          <p>
            First patch:
          </p>
          <b-field>
            <b-radio name="kind" v-model="kind" native-value="author_first">
              authored 
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="review_first">
              reviewed
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="both_first">
              both 
            </b-radio>
          </b-field>

          <p>
            Last patch:
          </p>
          <b-field>
            <b-radio name="kind" v-model="kind" native-value="author_last">
              authored 
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="review_last">
              reviewed
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="both_last">
              both 
            </b-radio>
          </b-field>

          <b-field>
          </b-field>

          <p>
            Average # developer contribution:
          </p>
          <b-field>
            <b-radio name="kind" v-model="kind" native-value="author_mean">
              Author
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="review_mean">
              Review
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="both_mean">
              Both 
            </b-radio>
          </b-field>

          <p>
            # Developer contribution (Top {{sliderTransform(percentile).toFixed(2)}}% percentile)
          </p>
          </b-field>
          <b-field>
            <b-radio name="kind" v-model="kind" native-value="author_percentile">
              Author
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="review_percentile">
              Review
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="both_percentile">
              Both 
            </b-radio>
          </b-field>
          <b-slider
            v-model="percentile"
            :min=0
            :max=1
            :step=0.001
            :custom-formatter="(val) => this.sliderTransform(val).toFixed(2) + '%'"
            :tooltip="false"
            indicator
            :disabled="slider_percentil_disabled"
          ></b-slider>

          <p>
            # Developer contribution (Top {{individual}} individual)
          </p>
          </b-field>
          <b-field>
            <b-radio name="kind" v-model="kind" native-value="author_individual">
              Author
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="review_individual">
              Review
            </b-radio>
            <b-radio name="kind" v-model="kind" native-value="both_individual">
              Both 
            </b-radio>
          </b-field>
          <b-slider
            v-model="individual"
            :min=1
            :max=1000
            :step=1
            :tooltip="false"
            indicator
            :disabled="slider_individual_disabled"
          ></b-slider>

        </div>

        <Contributions
          :kind="kind"
          :percentile="this.sliderTransform(percentile)"
          :individual="individual"
        />
      </div>
    </section>

    <section class="section">
      <div class="container">
        <p class="update_info">
          Fixme: Review prior to 2017 are ignored.
        </p>
      </div>
    </section>
    <section class="section">
      <div class="container">
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
      kind: "commit",
      percentile: 0.7071,
      individual: 300,
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
