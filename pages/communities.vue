<template>
  <div class="fullscreenFlexbox">
    <Navbar></Navbar>
    <section class="section zoom">

      <FilterPanel :summary="summary">
        <UiField label="Repository">
          <RepositorySelector
            v-model="repositories"
            size="small"
            :allowMultiple="false"
            :allowAll="true"
            :filter="repo => repo.reviewers">
          </RepositorySelector>
        </UiField>

        <TimeRangeSelector v-model="time" />
      </FilterPanel>

      <div class="form-row">
        <div class="form-row">
          <button type="button" class="button is-info" @click="view" v-if="!displayPlaceholder"><span>View</span>
          </button>
          <button type="button" class="button is-info is-light" @click="download" v-if="!displayPlaceholder">
            Download
          </button>
        </div>
      </div>
      <AboutData>
        <ul>
          <li>
            Data is refreshed <strong>weekly</strong>, and
            <strong>automatically</strong>. See <a
              href="https://github.com/ArthurSonzogni/CommitTracker/actions/workflows/importer-graph.yaml">
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
      </AboutData>
    </section>

    <section v-if="graph" class="section map-section">
      <CommunityMap :graph="graph" />
    </section>

    <!-- Graphs generated before the interactive map only exist as SVG. -->
    <div class="zoomable" v-if="!displayPlaceholder && !graph">
      <div ref="graph_container"><svg></svg></div>
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

// Links made before the yearly time ranges use ranges no longer generated: use
// the closest one.
function LegacyTime(time: string) {
  if (time === "1w") {
    return "1m";
  }
  const years_ago = time.match(/^1y\+(\d)y$/)?.[1];
  if (years_ago) {
    return String(new Date().getFullYear() - Number(years_ago));
  }
  return time;
}

const repositories = ref(["v8"]);
const time = ref("1y");

const summary = computed(() => [
  listSummary(repositoryNames(repositories.value), "repositories"),
  time.value,
].join(" · "));
const zoom = ref(1);
const displayPlaceholder = ref(false);
const cachedObjectSrc = ref(null);
const graph_container = ref(null);

if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}
if (route.query.time) {
  time.value = LegacyTime(route.query.time);
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
    graph_container.value.querySelector("svg").replaceWith(svg);
  } else {
    displayPlaceholder.value = true;
  }
};

// The interactive map, when the graph exists as JSON.
const graph = shallowRef(null);
const fetchGraph = async () => {
  try {
    const response = await fetch(objectSrc.value.replace(/\.svg$/, ".json"));
    if (response.ok && response.headers.get("content-type")?.includes("json")) {
      graph.value = await response.json();
      displayPlaceholder.value = false;
      return true;
    }
  } catch (e) {}
  graph.value = null;
  return false;
};

const updateSVG = async () => {
  if (await fetchGraph()) {
    return;
  }
  cachedObjectSrc.value = null;
  await nextTick();
  await fetchSVG();
  if (!displayPlaceholder.value) {
    updateZoom();
  }
};

const updateZoom = () => {
  const svg = graph_container.value.querySelector("svg");
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  svg.setAttribute("margin", "auto")
  svg.setAttribute("aspect-ratio", "2")
  svg.setAttribute("width", "80vw")
  svg.addEventListener("click", view);
};

const updateUrl = () => {
  router.replace({
    query: {
      time: time.value,
      repositories: repositories.value.join(","),
    }
  });
  updateSVG();
};

watch([time, repositories], updateUrl);

onMounted(() => {
  // Replace the old time ranges in the URL.
  if (route.query.time && route.query.time !== time.value) {
    updateUrl();
    return;
  }
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
  min-height: 100vh;
}

html {
  scroll-behavior: smooth;
}

.map-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-top: 0;
}

.zoom {
  margin-top:0;
  padding: 10px;
  padding-left:24px;
  padding-right:24px;
}
</style>
