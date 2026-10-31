<template>
  <div>
    <div class="m-5">
      <UiField class="mb-4">
        <RepositorySelector
          v-model="repositories"
          size="is-small"
          :allowMultiple="false"
          :allowAll="false"
          :filter="repo => repo.treemap"
        />
      </UiField>

      <!-- On large screens, every control on a single row. -->
      <div class="form-row controls">
        <UiField label="Color (numerator)" expanded>
          <TreemapInput v-model:value="field_color"
                        :repositories="repositories"
                        placeholder="Add a metric"/>
          <UiCheckbox v-model="history_color">Show in the history chart</UiCheckbox>
        </UiField>

        <UiField label="Size (denominator)" expanded>
          <TreemapInput v-model:value="field_size"
                        :repositories="repositories"
                        placeholder="Add a metric"/>
          <UiCheckbox v-model="history_size">Show in the history chart</UiCheckbox>
        </UiField>

        <UiField label="Colormap">
          <UiDropdown v-model="colormap" max-height="300px" hover>
            <template #trigger="{ active }">
              <button type="button" class="button">
                <span class="color-swatch"
                      :style="{ background: activeColormapGradient }"/>
                {{ colormap }}
              <UiIcon :name="active ? 'menu-up' : 'menu-down'" size="small" /></button>
            </template>
            <UiDropdownItem v-for="option in colormap_list" :key="option" :value="option">
              <span class="color-swatch"
                    :style="{ background: colormapSwatches[option] }"/>
                {{ truncate(option, 5) }}
            </UiDropdownItem>
          </UiDropdown>
        </UiField>

        <!-- Min and Max stay on the same row. -->
        <div class="form-row bounds">
          <UiField label="Min" class="bound-field">
            <input class="input" v-model="colormapMin" inputmode="decimal"
                   :placeholder="`Auto (${formatBound(color_domain[0])})`" />
          </UiField>

          <UiField label="Max" class="bound-field">
            <input class="input" v-model="colormapMax" inputmode="decimal"
                   :placeholder="`Auto (${formatBound(color_domain[1])})`" />
          </UiField>
        </div>

        <UiField label="Options">
          <div class="filters">
            <UiCheckbox v-model="exclude_test">
              Exclude tests
            </UiCheckbox>

            <UiCheckbox v-model="exclude_third_party">
              Exclude third parties
            </UiCheckbox>
          </div>
        </UiField>
      </div>

      <div class="treemap-header" v-if="field_color_value.length">
        <nav class="breadcrumb" aria-label="Path">
          <ul>
            <li :class="{ 'is-active': path.length == 0 }">
              <a role="button" @click="path = []">
                <UiIcon name="home" size="small" />
                {{ repositoryNames(repositories).join(", ") }}
              </a>
            </li>
            <li
              v-for="(component, index) in path"
              :key="index"
              :class="{ 'is-active': index == path.length - 1 }">
              <a role="button" @click="path = path.slice(0, index+1)">{{component}}</a>
            </li>
          </ul>
        </nav>

        <div class="legend">
          <!-- The colormap legend -->
          <span>{{ percent(color_domain[0]) }}</span>
          <span class="legend-gradient"
                aria-label="Color scale"
                :style="{ background: activeColormapGradient }"/>
          <span>{{ percent(color_domain[1]) }}</span>

          <button type="button" class="button is-small ml-2" @click="fullscreen = true">
            <UiIcon name="fullscreen" size="small" /><span>Full screen</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Without a color metric, propose some views. -->
    <TreemapPresets
      v-if="field_color_value.length == 0"
      :repository="repositories[0]"
      @select="selectPreset" />

    <template v-else>
      <div class="treemap-frame" :class="{ 'is-fullscreen': fullscreen }">
        <div v-if="fullscreen" class="fullscreen-toolbar">
          <button type="button" class="button" :disabled="path.length == 0" @click="path = path.slice(0, -1)">
            <UiIcon name="arrow-up" size="small" /><span>Up</span>
          </button>
          <span class="fullscreen-path">{{ ['', ...path].join('/') || '/' }}</span>
          <button type="button" class="button" aria-label="Exit full screen" @click="fullscreen = false">
            <UiIcon name="fullscreen-exit" size="small" />
          </button>
        </div>
        <Treemap
          :repositories="repositories"
          :path="path"
          :field_color="field_color_value"
          :field_size="field_size_value"
          :colormapMin="colormapMin"
          :colormapMax="colormapMax"
          :colormap="colormap"
          :dates="dates"
          :animate="animate"
          :history_color="history_color"
          :history_size="history_size"
          :exclude_test="exclude_test"
          :exclude_third_party="exclude_third_party"
          @zoomin="path = [...path, $event]"
          @animationend="animationEnd()"
          ref="treemap"
          >
        </Treemap>
      </div>
      <div class="section">
        <Timeline v-model="dates">
          <button
            type="button"
            class="button"
            :aria-label="animate ? 'Pause' : 'Play'"
            :disabled="dates[1].getTime() > new Date().getTime() - 100000000"
            @click="toggleAnimate">
            <UiIcon :name="animate ? 'pause' : 'play'" size="small"></UiIcon>
          </button>
          <button
            type="button"
            class="button"
            :disabled="dates[1].getTime() > new Date().getTime() - 100000000"
            @click="increaseAnimateSpeed">
            x{{animate_speed}}
          </button>
        </Timeline>
      </div>

      <section class="section content">
        <h2 class="title is-5">
          Download data:
        </h2>

        <ul class="download-list">
          <li><span>Temporal data:</span>
            <button type="button" class="button is-small" @click="treemap?.download('temporal_json')">JSON</button>
            <button type="button" class="button is-small" @click="treemap?.download('temporal_csv')">CSV</button>
          </li>
          <li><span>Spatial data:</span>
            <button type="button" class="button is-small" @click="treemap?.download('spatial_json')">JSON</button>
            <button type="button" class="button is-small" @click="treemap?.download('spatial_csv')">CSV</button>
          </li>
        </ul>
      </section>

    </template>

    <section class="section">
      <AboutData>
        <ul>
          <li>The area of rectangle is proportional to:
            <span class="fraction">
              {{ field_size_value.join(" + ") }}
            </span>
          </li>
          <li> The color is the proportional to:
            <div class="fraction">
              <span class="numerator">
                {{ field_color_value.join(" + ") }}
              </span>
              <span class="denominator">
                {{ field_size_value.join(" + ") }}
              </span>
            </div>
          </li>
          <li>
            Content is updated <strong>weekly</strong>.
            To add a new dataset, please edit the yaml files in the
            <a href="https://github.com/ArthurSonzogni/CommitTracker/tree/main/treemap">
              <code>treemap/</code> directory.
            </a>
          </li>
        </ul>
      </AboutData>
    </section>

  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";
import type { LocationQuery, LocationQueryRaw } from "vue-router";
import repositories_json from "../public/data/repositories.json";
import { allTreemapMetrics, findTreemapMetric, type TreemapMetricEntry } from "~/utils/treemapMetrics";
import { colormapNames, GetColormapGradient } from "~/utils/colormap";
import { sameQuery } from "~/composables/useUrlState";

const treemap = ref<any>(null);

const route = useRoute();
const router = useRouter();

const findMetric = findTreemapMetric;

// Empty by default: the page then proposes some views.
const field_color = ref<TreemapMetricEntry[]>([]);
const field_color_value = computed(() =>
  field_color.value?.filter(Boolean).map(f => f.file) || [],
);

const field_size = ref<TreemapMetricEntry[]>([]);
const field_size_value = computed(() =>
  field_size.value?.filter(Boolean).map(f => f.file) || [],
);

const dates = ref<[Date, Date]>([new Date("2020-01-01"), new Date()]);
const colormap = ref("Red");
const path = ref<string[]>([]);

// Empty bounds fit the displayed data.
const colormapMin = ref("");
const colormapMax = ref("");

const color_domain = computed(() => treemap.value?.color_domain ?? [0, 1]);
const percent = format(".2~%");
const formatBound = format(".3~r");

const default_repo =
  repositories_json?.find?.(repo => repo.treemap)?.dirname ||
  repositories_json?.[0]?.dirname ||
  "chromium";

const repositories = ref<string[]>([default_repo]);
const history_color = ref(true);
const history_size = ref(false);
const exclude_test = ref(false);
const exclude_third_party = ref(false);

const firstQueryString = (val: LocationQuery[string]): string | undefined => {
  const v = Array.isArray(val) ? val[0] : val;
  return typeof v === "string" ? v : undefined;
};

// Set the state from the URL. Missing parameters reset to their defaults.
const applyQuery = (query: LocationQuery) => {
  const rawColor = firstQueryString(query.field_color);
  field_color.value = rawColor
    ? rawColor.split(",").map(findMetric).filter((f): f is TreemapMetricEntry => Boolean(f))
    : [];

  const rawSize = firstQueryString(query.field_size);
  field_size.value = rawSize
    ? rawSize.split(",").map(findMetric).filter((f): f is TreemapMetricEntry => Boolean(f))
    : [findMetric("line") || allTreemapMetrics[0]].filter(Boolean);

  const rawDates = firstQueryString(query.dates);
  if (rawDates && rawDates.includes(",")) {
    const parsed = rawDates.split(",").map(d => new Date(d));
    dates.value =
      parsed.length >= 2 && !Number.isNaN(parsed[0].getTime()) && !Number.isNaN(parsed[1].getTime())
        ? [parsed[0], parsed[1]]
        : [new Date("2020-01-01"), new Date()];
  } else {
    dates.value = [new Date("2020-01-01"), new Date()];
  }

  colormap.value = firstQueryString(query.colormap) || "Red";
  const rawPath = firstQueryString(query.path);
  path.value = rawPath ? rawPath.split(",").filter(Boolean) : [];
  colormapMin.value = firstQueryString(query.colormapMin) || "";
  colormapMax.value = firstQueryString(query.colormapMax) || "";
  const rawRepos = firstQueryString(query.repositories);
  repositories.value = rawRepos ? rawRepos.split(",").filter(Boolean) : [default_repo];
  history_color.value = firstQueryString(query.history_color) !== "0";
  history_size.value = firstQueryString(query.history_size) === "1";
  exclude_test.value = query.exclude_test !== undefined && firstQueryString(query.exclude_test) !== "0";
  exclude_third_party.value =
    query.exclude_third_party !== undefined && firstQueryString(query.exclude_third_party) !== "0";
};
applyQuery(route.query);

const fullscreen = ref(false);
const exitFullscreenOnEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    fullscreen.value = false;
  }
};
onMounted(() => window.addEventListener("keydown", exitFullscreenOnEscape));
onUnmounted(() => window.removeEventListener("keydown", exitFullscreenOnEscape));

const animate = ref(false);
const animate_speed = ref(1);

const colormap_list = colormapNames;
const colormapSwatches = Object.fromEntries(
  colormapNames.map(option => [option, GetColormapGradient(option, 10)]),
);
const activeColormapGradient = computed(() => GetColormapGradient(colormap.value));

const increaseAnimateSpeed = () => {
  switch (animate_speed.value) {
    case 1: animate_speed.value = 2; break;
    case 2: animate_speed.value = 5; break;
    case 5: animate_speed.value = 10; break;
    case 10: animate_speed.value = 1; break;
  }
};

let restoring = false;
let lastPathSerialized = path.value.join(",");

const buildQuery = (): LocationQueryRaw => {
  const colorStr = field_color_value.value.join(",");
  const sizeStr = field_size_value.value.join(",");
  const pathStr = path.value.join(",");
  const repoStr = repositories.value.join(",");
  const defaultEnd = new Date().toISOString().split("T")[0];
  const datesArr = dates.value.map(d => d.toISOString().split("T")[0]);
  const datesStr =
    datesArr[0] === "2020-01-01" && datesArr[1] === defaultEnd
      ? undefined
      : datesArr.join(",");

  const query: LocationQueryRaw = {
    colormap: colormap.value !== "Red" || route.query.colormap ? colormap.value : undefined,
    colormapMax: colormapMax.value || undefined,
    colormapMin: colormapMin.value || undefined,
    field_color: colorStr || undefined,
    field_size: sizeStr && (colorStr || sizeStr !== "line") ? sizeStr : undefined,
    path: pathStr || undefined,
    repositories: repoStr && (repoStr !== default_repo || route.query.repositories) ? repoStr : undefined,
    dates: datesStr,
  };
  if (history_color.value === false) {
    query.history_color = "0";
  }
  if (history_size.value === true) {
    query.history_size = "1";
  }
  if (exclude_test.value === true) {
    query.exclude_test = null;
  }
  if (exclude_third_party.value === true) {
    query.exclude_third_party = null;
  }
  return query;
};

const updateUrl = () => {
  if (restoring) {
    return;
  }
  const query = buildQuery();
  const nextPathSerialized = path.value.join(",");
  const shouldPush = nextPathSerialized !== lastPathSerialized;
  lastPathSerialized = nextPathSerialized;

  if (sameQuery(route.query, query)) {
    return;
  }
  if (shouldPush) {
    router.push({ query });
  } else {
    router.replace({ query });
  }
};

// Back/forward navigation: restore the state from the new URL, without
// pushing it again.
watch(() => route.query, async (newQuery) => {
  restoring = true;
  try {
    applyQuery(newQuery);
    lastPathSerialized = path.value.join(",");
  } finally {
    await nextTick();
    restoring = false;
  }
});

const selectPreset = (preset: {
  color: string[];
  size: string[];
  start?: string;
  history_size?: boolean;
}) => {
  field_size.value = preset.size.map(findMetric).filter((f): f is TreemapMetricEntry => Boolean(f));
  field_color.value = preset.color.map(findMetric).filter((f): f is TreemapMetricEntry => Boolean(f));
  history_size.value = !!preset.history_size;
  if (preset.start) {
    dates.value = [new Date(preset.start), dates.value[1]];
  }
};

const truncate = (str: string, n: number) => {
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
};

watch([
  repositories,
  colormap,
  colormapMax,
  colormapMin,
  field_color,
  field_size,
  path,
  dates,
  history_color,
  history_size,
  exclude_test,
  exclude_third_party,
], () => {
  if (!animate.value) {
    updateUrl();
  }
}, { deep: true, flush: "post" });

onMounted(() => {
  const rawColor = firstQueryString(route.query.field_color);
  const rawSize = firstQueryString(route.query.field_size);
  if (
    (rawColor && rawColor !== field_color_value.value.join(",")) ||
    (rawSize && rawSize !== field_size_value.value.join(","))
  ) {
    updateUrl();
  }
});

const animationEnd = async () => {
  if (dates.value[1] > new Date()) {
    animate.value = false;
  }

  if (animate.value) {
    const next = dates.value[1].getTime() + animate_speed.value * 7 * 24 * 60 * 60 * 1000;
    dates.value = [dates.value[0], new Date(next)];
  }
};

watch(animate, () => {
  if (animate.value) {
    animationEnd();
  } else {
    updateUrl();
  }
});

const toggleAnimate = () => {
  animate.value = !animate.value;
};
</script>

<style scoped>
section {
  margin-top: -40px;
}

.fraction {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  font-size: 1.2em;
  line-height: 1;
  padding: 0 0.2em;
  vertical-align: middle;

  .numerator {
    border-bottom: 1px solid var(--ink);
    padding: 0.3em;
  }

  .denominator {
    padding: 0.3em;
  }

}

.treemap-frame.is-fullscreen {
  background: var(--surface);
  inset: 0;
  overflow: auto;
  position: fixed;
  z-index: 50;
}

.fullscreen-toolbar {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem 0;
}

.fullscreen-path {
  color: var(--muted);
  flex: 1;
  font-size: 0.85rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* In full screen, the treemap fills the screen, without the history chart. */
.is-fullscreen :deep(.split-view) {
  height: calc(100dvh - 3rem);
}

.is-fullscreen :deep(.split-view > div:not(.treemap-container)) {
  display: none;
}

/* The color and size fields have a checkbox below: align on the labels. */
.controls {
  align-items: flex-start;
}

.bounds {
  flex-wrap: nowrap;
  margin-bottom: 0;
}

.bound-field {
  width: 8rem;
}

.filters {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  min-height: 2.25rem;
}

.treemap-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  justify-content: space-between;
}

.treemap-header .breadcrumb {
  margin-bottom: 0;
}

.legend {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  gap: 0.5rem;
}

.legend-gradient {
  border-radius: 999px;
  height: 0.6rem;
  width: 8rem;
}

.color-swatch {
  display: inline-block;
  width: 120px;
  height: 1em;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border: 1px solid #ccc;
  border-radius: 2px;
  margin-right: 0.5em;
  vertical-align: middle;
}

.download-list li > span,
.download-list .button {
  vertical-align: middle;
}

.download-list .button {
  margin-left: 0.35rem;
}

</style>
