<template>
  <div class="fullscreenFlexbox">
    <Navbar></Navbar>
    <section class="section zoom">

      <RepositorySelector
        v-model="repositories"
        size="small"
        :allowMultiple="false"
        :allowAll="true"
        :filter="repo => repo.reviewers">
      </RepositorySelector>

      <TimeRangeSelector v-model="time">
      </TimeRangeSelector>

      <b-field grouped>
        <b-field grouped>
          <b-button
            label="Readme"
            @click="displayReadme = !displayReadme"
            type="is-warning">
          </b-button>
          <b-button
            @click="view"
            type="is-info"
            v-if="!displayPlaceholder"
            label="View">
          </b-button>
          <b-button @click="download" type="is-info is-light"
                                      v-if="!displayPlaceholder">
            Download
          </b-button>
        </b-field>
        <b-field label="Zoom" label-position="on-border" expanded>
          <b-slider
            v-model="zoom"
            :min="0.1"
            :max="6"
            :step="0.05"
            :tooltip="false"
            lazy
            indicator>
          </b-slider>
        </b-field>
      </b-field>
    </section>
    <section class="section" v-if="displayReadme">
      <div class="container">
        <b-message
          title="Readme"
          v-model="displayReadme"
          aria-close-label="Close message">
          <div class="content">
            <ul>
              <li>
                Data is refreshed <strong>weekly</strong>, and
                <strong>automatically</strong>. See <a
                  href="https://github.com/ArthurSonzogni/ChromeCommitTracker/actions/workflows/importer-graph.yaml">
                  Job
                </a>
              </li>
              <li>
                <strong>Label height</strong> is proportional to the number
                contributions square root (author + review). The goal is to make
                the surface used to draw one characters proportional to the
                number of commits.
              </li>
              <li>
                <strong>Edge thickness</strong> is proportional to the number
                of commit flowing from one author to a reviewer. We ignore long
                distance edges with a low number of commit. To be precise, there
                is a "commit" / "length" threshold. The "real" graph is extremly
                dense and difficult to interpret.
              </li>
              <li>
                <strong>Edge orientation</strong> helps understanding who is the
                author and who is the reviewer. The edge turn left when going
                from the author to the reviewer.
              </li>
              <li>
                <strong>Colors</strong> represent different communities who
                strongly interact together, and do not outside Often, the number
                of communities is high when considering small range of time
                (small project), and low when considering large range of time
                (large product). We are using the
                <a href="https://en.wikipedia.org/wiki/Louvain_method">
                  Louvain algorithm
                </a>.
              </li>
              <li>
                <strong>Code reviews before 2017 are not included.</strong>,
                the data wasn't part of the commit description before.
              </li>
            </ul>
          </div>
        </b-message>
      </div>
    </section>

    <div class="zoomable" v-if="!displayPlaceholder">
      <svg></svg>
    </div>

    <p v-if="displayPlaceholder" class="container">
      No data for this selection. Try to select a larger time range, or a different repository.<br/>

      Please note that this relies on the commit description. If the commit
      description doesn't contains some `Reviewed-by` or tags, the data will be
      incomplete.
    </p>
  </div>
</template>

<script setup lang="ts">

const route = useRoute();
const router = useRouter();

const repositories = ref(["v8"]);
const time = ref("forever");
const zoom = ref(1);
const displayReadme = ref(false);
const displayPlaceholder = ref(false);
const cachedObjectSrc = ref(null);

if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}
if (route.query.time) {
  time.value = route.query.time;
}
if (route.query.zoom) {
  zoom.value = parseFloat(route.query.zoom);
}

const dataset = computed(() => {
  const repo = repositories.value.length == 1
    ? repositories.value
    : "all";
  return `${repo}_${time.value}.svg`;
});

const objectSrc = computed(() => {
  return "/community-map/" + dataset.value;
});

const view = () => {
  window.open(objectSrc.value, "_blank");
};

const download = () => {
  const a = document.createElement("a");
  a.href = objectSrc.value;
  a.download = dataset.value;
  a.click();
};


const fetchSVG = async () => {
  if (objectSrc.value == cachedObjectSrc.value) {
    return;
  }
  cachedObjectSrc.value = objectSrc.value;
  const response = await fetch(objectSrc.value)
  if (response.ok) {
    displayPlaceholder.value = false;
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) {
      return;
    }
    document.querySelector("svg").replaceWith(svg);
  } else {
    displayPlaceholder.value = true;
  }
};

const updateSVG = async () => {
  await fetchSVG();
  updateZoom();
};

const updateZoom = () => {
  const svg = document.querySelector("svg");
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  svg.setAttribute("margin", "auto")
  svg.setAttribute("aspect-ratio", "2")
  svg.setAttribute("width", zoom.value * 95 + "vw");
  svg.addEventListener("click", view);
};

const updateUrl = () => {
  router.replace({
    query: {
      time: time.value,
      zoom: zoom.value,
      repositories: repositories.value.join(","),
    }
  });
  updateSVG();
};

watch([time, zoom, repositories], updateUrl);

onMounted(() => {
  updateSVG();
});

</script>

<style scope>

svg {
  transition: width 0.5s ease-in-out;
  cursor: pointer;
}

.fullscreenFlexbox {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.zoomable{
  overflow: scroll;
  width: 100%;
  height: 100%;
}

.zoomable::-webkit-scrollbar {
  width: 3px;
  height:3px;
}

.zoomable:hover::-webkit-scrollbar {
  width: 10px;
  height:10px;
}

.zoomable::-webkit-scrollbar-track {
  background: transparent;
}

.zoomable::-webkit-scrollbar-thumb {
  background-color: rgba(128,128,128,0.5);
  border-radius: 8px;
}

.zoomable::-webkit-scrollbar-thumb:hover {
  background-color: rgba(128,128,128,1.0);
}

html {
  scroll-behavior: smooth;
}

.zoom {
  backdrop-filter: blur(5px);
  background-color: rgba(255, 255, 255, 0.5);
  margin-top:0;
  padding: 10px;
  padding-left:24px;
  padding-right:24px;
}
</style>
