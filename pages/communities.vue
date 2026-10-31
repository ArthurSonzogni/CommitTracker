<template>
  <div class="fullscreenFlexbox">
    <section class="section zoom">
      <FilterPanel :summary="summary">
        <UiField>
          <RepositorySelector
            v-model="repositories"
            size="small"
            :allowMultiple="false"
            :allowAll="true"
            :filter="repo => repo.reviewers">
          </RepositorySelector>
        </UiField>

        <div class="form-row">
          <TimeRangeSelector v-model="time" />
          <div class="form-row">
            <button type="button" class="button is-info" @click="view" v-if="!displayPlaceholder">
              <span>View</span>
            </button>
            <button type="button" class="button is-info is-light" @click="download" v-if="!displayPlaceholder">
              Download
            </button>
            <AboutData modal>
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
          </div>
        </div>
      </FilterPanel>
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
import { useUrlState, urlCodecs } from "~/composables/useUrlState";

const route = useRoute();
const router = useRouter();

// Links made before the yearly time ranges use ranges no longer generated: use
// the closest one.
function LegacyTime(value: string) {
  if (value === "1w") {
    return "1m";
  }
  const yearsAgo = value.match(/^1y\+(\d)y$/)?.[1];
  if (yearsAgo) {
    return String(new Date().getFullYear() - Number(yearsAgo));
  }
  return value;
}

const rawInitialTime = Array.isArray(route.query.time)
  ? route.query.time[0]
  : route.query.time;

const { repositories, time } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
  time: {
    parse: (raw) => LegacyTime(typeof raw === "string" && raw ? raw : "1y"),
    serialize: (val) => (!val || val === "1y" ? undefined : val),
    equals: (a, b) => a === b,
  },
});

const summary = computed(() => [
  listSummary(repositoryNames(repositories.value), "repositories"),
  time.value,
].join(" · "));

const displayPlaceholder = ref(false);
const cachedObjectSrc = ref<string | null>(null);
const graph_container = ref<HTMLElement | null>(null);
const graph = shallowRef<any>(null);

const dataset = computed(() => {
  const repo = repositories.value.length === 1
    ? repositories.value[0]
    : "all";
  return `${repo}_${time.value}.svg`;
});

const objectSrc = computed(() => `/community-map/${dataset.value}`);

const view = () => {
  window.open(objectSrc.value, "_blank");
};

const download = () => {
  const a = document.createElement("a");
  a.href = objectSrc.value;
  a.download = dataset.value;
  a.click();
};

let updateRequestId = 0;

const updateZoom = () => {
  const svg = graph_container.value?.querySelector("svg");
  if (!svg) return;
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  svg.setAttribute("margin", "auto");
  svg.setAttribute("aspect-ratio", "2");
  svg.setAttribute("width", "80vw");
  svg.addEventListener("click", view);
};

const fetchGraph = async (src: string, reqId: number): Promise<boolean> => {
  try {
    const response = await fetch(src.replace(/\.svg$/, ".json"));
    if (reqId !== updateRequestId) return false;
    if (response.ok && response.headers.get("content-type")?.includes("json")) {
      const data = await response.json();
      if (reqId !== updateRequestId) return false;
      graph.value = data;
      displayPlaceholder.value = false;
      return true;
    }
  } catch {}
  if (reqId === updateRequestId) {
    graph.value = null;
  }
  return false;
};

const fetchSVG = async (src: string, reqId: number) => {
  if (src === cachedObjectSrc.value && graph_container.value?.querySelector("svg")) {
    return;
  }
  const response = await fetch(src);
  if (reqId !== updateRequestId) return;
  if (response.ok) {
    const text = await response.text();
    if (reqId !== updateRequestId) return;
    displayPlaceholder.value = false;
    cachedObjectSrc.value = src;
    await nextTick();
    if (reqId !== updateRequestId) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    const svg = doc.querySelector("svg");
    const existing = graph_container.value?.querySelector("svg");
    if (!svg || !existing) {
      return;
    }
    existing.replaceWith(svg);
    updateZoom();
  } else {
    cachedObjectSrc.value = null;
    displayPlaceholder.value = true;
  }
};

const updateSVG = async () => {
  const reqId = ++updateRequestId;
  const src = objectSrc.value;
  if (await fetchGraph(src, reqId)) {
    return;
  }
  if (reqId !== updateRequestId) return;
  cachedObjectSrc.value = null;
  await nextTick();
  if (reqId !== updateRequestId) return;
  await fetchSVG(src, reqId);
};

watch([time, repositories], () => {
  updateSVG();
});

onMounted(() => {
  // Replace legacy time ranges (e.g. 1w, 1y+1y) in the URL.
  if (typeof rawInitialTime === "string" && rawInitialTime !== time.value) {
    router.replace({
      query: {
        ...route.query,
        time: time.value === "1y" ? undefined : time.value,
      },
    });
  }
  updateSVG();
});
</script>

<style scoped>
.zoomable :deep(svg) {
  transition: width 0.5s ease-in-out;
  cursor: pointer;
}

.fullscreenFlexbox {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.map-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-top: 0;
}

.zoom {
  margin-top: 0;
  padding: 10px;
  padding-left: 24px;
  padding-right: 24px;
}
</style>
