<template>
  <div>
    <Navbar/>

    <div>

      <section class="section sticky top">

        <RepositorySelector v-model="repositories" size="medium"/>
        <b-field grouped>

          <b-field expanded>
            <DevelopersInput v-model="developers" ></DevelopersInput>
          </b-field>

          <b-field>
            <b-checkbox-button
              v-model="options"
              native-value="author"
              size="is-medium"
              >
              Author
            </b-checkbox-button>

            <b-checkbox-button
              v-model="options"
              native-value="review"
              size="is-medium"
              >
              Review
            </b-checkbox-button>
          </b-field>

          <b-field>
            <b-checkbox-button
              v-if="developers.length >= 2"
              v-model="options"
              native-value="stacked"
              size="is-medium"
              >
              Stacked
            </b-checkbox-button>
          </b-field>

        </b-field>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">1. Count</h2>
          <TimelineCount
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            /></TimelineCount>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">2. Timeline</h2>
          <TimelineChart
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            ></TimelineChart>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">3. Timeline wrapped</h2>
          <b-field grouped>
            <b-field
              label="Modulo"
              expanded
              label-position="on-border"
            >
              <b-slider
                v-model="hourlyParam"
                :min="0"
                :max="3"
                aria-label="Fan"
                :tooltip="false"
                rounded
              >
                <b-slider-tick :value="0">Day</b-slider-tick>
                <b-slider-tick :value="1">Week</b-slider-tick>
                <b-slider-tick :value="2">Month</b-slider-tick>
                <b-slider-tick :value="3">Year</b-slider-tick>
              </b-slider>
            </b-field>

            <b-field
              :label="'Buckets: ' + wrappedBuckets"
              expanded
              label-position="on-border"
            >
              <b-slider
                v-model="wrappedBuckets"
                :min="1"
                :max="500"
                aria-label="Buckets"
                lazy
                rounded
              ></b-slider>
            </b-field>
          </b-field>

          <TimelineWrappedChart
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            :hourlyParam="hourlyParam"
            :buckets="wrappedBuckets"
            /></TimelineWrappedChart>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">4. Peers</h2>
          <PeersChart
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            ></PeersChart>
        </div>
      </section>

      <section class="section sticky bottom">
        <b-field expanded>
          <Timeline v-model="dates" ></Timeline>
        </b-field>
      </section>
    </div>
  </div>
</template>

<script>

export default {
  data() {
    let dates = [new Date("2000-01-01"), new Date()];
    if (this.$route.query.dates) {
      dates = this.$route.query.dates.split(',').map(d => new Date(d));
    }

    let developers =  [];
    if (this.$route.query.developers) {
      developers = this.$route.query.developers.split(',');
    }
    let options =  ["author", "review"];
    if (this.$route.query.options) {
      options = this.$route.query.options.split(',');
    }
    let hourlyParam =  0;
    if (this.$route.query.hourlyParam) {
      hourlyParam = parseInt(this.$route.query.hourlyParam);
    }
    let wrappedBuckets =  100;
    if (this.$route.query.wrappedBuckets) {
      wrappedBuckets = parseInt(this.$route.query.wrappedBuckets);
    }
    let repositories =  ["chromium"];
    if (this.$route.query.repositories) {
      repositories = this.$route.query.repositories.split(',');
    }

    return {
      dates,
      developers,
      options,
      hourlyParam,
      wrappedBuckets,
      repositories,
    };
  },

  methods: {
    updateUrl() {
      this.$router.push({
        query: {
          developers: this.developers.join(','),
          options: this.options.join(','),
          hourlyParam: this.hourlyParam,
          wrappedBuckets: this.wrappedBuckets,
          repositories: this.repositories.join(','),
          dates: this.dates.map(d => d.toISOString().split("T")[0]).join(','),
        }
      });
    },
  },

  watch: {
    dates: "updateUrl",
    developers: "updateUrl",
    options: "updateUrl",
    hourlyParam: "updateUrl",
    wrappedBuckets: "updateUrl",
    repositories: "updateUrl",
    dates: "updateUrl",
  },
};

const updateHasScrolled = () => {
  const maxScroll = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );

  document.documentElement.dataset.scrolltop =
    (window.scrollY > 100) ? 1 : 0;
  document.documentElement.dataset.scrollbottom=
    (maxScroll - window.scrollY > 1000) ? 1 : 0;
};

updateHasScrolled();
document.addEventListener('scroll', updateHasScrolled, { passive: true });

</script>

<style scoped>
.sticky {
  position: sticky;
  width: 100%;
  z-index: 2;
}

.sticky::before {
  display: block;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  z-index: 1;

  backdrop-filter: blur(4px);
  background-color: rgba(255, 255, 255, 0.5);
  content: '';
  position:absolute;
  transition: all 0.1s ease-in-out;
  transition: background-color 0.2s ease-in-out;
}

.sticky > * {
  z-index: 2;
  position: relative;
}


html[data-scrolltop= "1"] .sticky.top {
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
}

.sticky.top {
  top: 0;
  margin-top:0;
  padding-top:15px;
  margin-bottom:0;
  padding-bottom:15px;
}

.sticky.bottom {
  bottom: 0;
  margin-bottom:0px;
  padding-bottom:15px;
}
</style>
