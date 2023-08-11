<template>
  <div>
    <Navbar/>

    <div>
      <section class="section sticky top">
        <b-field grouped>
          <DevelopersInput v-model="developers" ></DevelopersInput>

          <b-field>
            <b-checkbox-button
              v-model="checkboxStates"
              native-value="author"
              size="is-medium"
              >
              Author
            </b-checkbox-button>

            <b-checkbox-button
              v-model="checkboxStates"
              native-value="review"
              size="is-medium"
              >
              Review
            </b-checkbox-button>
          </b-field>

          <b-field>
            <b-checkbox-button
              v-if="developers.length >= 2"
              v-model="checkboxStates"
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
          <h2 class="title">Count</h2>
          <TimelineCount
            :developers="developers"
            :startDate="startDate"
            :endDate="endDate"
            /></TimelineCount>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Timeline</h2>
          <TimelineChart
            :developers="developers"
            :startDate="startDate"
            :endDate="endDate"
            :author="checkboxStates.includes('author')"
            :review="checkboxStates.includes('review')"
            :stacked="checkboxStates.includes('stacked')"
            ></TimelineChart>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Timeline wrapped</h2>
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
            :developers="developers"
            :startDate="startDate"
            :endDate="endDate"
            :author="checkboxStates.includes('author')"
            :review="checkboxStates.includes('review')"
            :stacked="checkboxStates.includes('stacked')"
            :hourlyParam="hourlyParam"
            :buckets="wrappedBuckets"
            /></TimelineWrappedChart>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">Peers</h2>
          <PeersChart
            :developers="developers"
            :startDate="startDate"
            :endDate="endDate"
            :author="checkboxStates.includes('author')"
            :review="checkboxStates.includes('review')"
            :stacked="checkboxStates.includes('stacked')"
            ></PeersChart>
        </div>
      </section>

      <section class="section sticky bottom">
        <b-field expanded>
          <Timeline @change="changeDate" ></Timeline>
        </b-field>
      </section>
    </div>
  </div>
</template>

<script>

export default {
  data() {
    let developers = [];
    try {
      const url = new URL(window.location);
      const search = new URLSearchParams(url.search)
      developers = search.get("developers").split("~")
    } catch (e) {}
    return {
      startDate: new Date(),
      endDate: new Date(),
      developers: developers,
      checkboxStates: ["author", "review"],
      hourlyParam: 0,
      wrappedBuckets: 100,
    };
  },

  async fetch() {
    const response = await fetch("./data/users.json");
    const list = await response.json();
    this.developerList = list;
  },

  methods: {
    changeDate(first, end) {
      this.startDate = first;
      this.endDate = end;
    },

    pushState: function() {
      const url = new URL(window.location);
      const search = new URLSearchParams(url.search)
      search.set("developers", this.developers.join('~'));
      url.search = search.toString();
      if (url.search != window.location.search) {
        history.pushState({}, "", url)
      }
    },
  },

  watch: {
    developers: "pushState",
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
  z-index: 1000;
  backdrop-filter: blur(4px);
  background-color: rgba(255, 255, 255, 0.5);
  transition: background-color 0.2s ease-in-out;
  transition: all 0.1s ease-in-out;
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
