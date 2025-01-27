<template>
  <div>
    <Navbar/>

    <div>

      <section class="section sticky top">

        <RepositorySelector
          v-model="repositories"
          size="is-small"
          />
        <b-field grouped>

          <b-field expanded>
            <DevelopersInput v-model="developers"/>
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
          <h2 class="title">0. Counts</h2>
          <TimelineCountBasic
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">1. Timeline</h2>
          <TimelineChart
            chart="line"
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
          <h2 class="title">2. Timeline wrapped</h2>
          <b-field grouped>
            <b-field
              label="Modulo"
              expanded
              label-position="on-border"
              >
              <b-slider
                v-model="hourlyParam"
                :min="0"
                :max="2"
                aria-label="Fan"
                :tooltip="false"
                rounded
                >
                <b-slider-tick :value="0">Day</b-slider-tick>
                <b-slider-tick :value="1">Week</b-slider-tick>
                <b-slider-tick :value="2">Year</b-slider-tick>
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
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">3. Peers</h2>
          <PeersChart
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">4. Details</h2>
          <TimelineCount
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            />
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="title">5. Heatmap</h2>
          <TimelineChart
            chart="heatmap"
            :repositories="repositories"
            :developers="developers"
            :dates="dates"
            :author="options.includes('author')"
            :review="options.includes('review')"
            :stacked="options.includes('stacked')"
            ></TimelineChart>
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

<script setup lang="ts">

const route = useRoute();
const router = useRouter();

const dates = ref([new Date("2000-01-01"), new Date()]);
if (route.query.dates) {
  dates.value = route.query.dates.split(',').map((d: string|number|Date) => new Date(d));
}

const developers = ref([]);
if (route.query.developers) {
  developers.value = route.query.developers.split(',');
}

const tt = computed(() => {
  return developers.value;
});

const options = ref(["author", "review"]);
if (route.query.options) {
  options.value = route.query.options.split(',');
}

const hourlyParam = ref(0);
if (route.query.hourlyParam) {
  hourlyParam.value = parseInt(route.query.hourlyParam);
  hourlyParam.value = Math.min(2, Math.max(0, hourlyParam.value));
}

const wrappedBuckets = ref(100);
if (route.query.wrappedBuckets) {
  wrappedBuckets.value = parseInt(route.query.wrappedBuckets);
}

const repositories = ref(["chromium"]);
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(',');
}

const updateUrl = () => {
  router.push({
    query: {
      developers: developers.value.join(','),
      options: options.value.join(','),
      hourlyParam: hourlyParam.value,
      wrappedBuckets: wrappedBuckets.value,
      repositories: repositories.value.join(','),
      dates: dates.value.map((d: { toISOString: () => string; }) => d.toISOString().split("T")[0]).join(','),
    }
  });
};

watch([
  dates,
  developers,
  options,
  hourlyParam,
  wrappedBuckets,
  repositories,
], updateUrl);

const updateHasScrolled = () => {
  const maxScroll = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );

  document.documentElement.dataset.scrolltop =
    (window.scrollY > 100) ? '1' : '0';
  document.documentElement.dataset.scrollbottom=
    (maxScroll - window.scrollY > 1000) ? '1' : '0';
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

.anchor {
  display: block;
  position: relative;
  top: -200px;
}

.anchor-link {
  color:black;
  opacity: 0.1;
  transition: opacity 0.2s ease-in-out;
}

.anchor-link:hover {
  opacity: 1;
}

</style>
