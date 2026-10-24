<template>
  <div>
    <Navbar/>
    <div class="m-5">
      <UiField label="Repository" class="mb-4">
        <RepositorySelector
          v-model="repositories"
          size="is-small"
          :allowMultiple="false"
          :allowAll="false"
          :filter="repo => repo.treemap"
        />
      </UiField>

      <div class="form-row">
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
      </div>

      <div class="form-row">
        <UiField label="Colormap">
          <UiDropdown v-model="colormap" max-height="300px" hover>
            <template #trigger="{ active }">
              <button type="button" class="button">
                <span class="color-swatch"
                      :style="{ background: $GetColormapGradient(colormap) }"/>
                {{ colormap }}
              <UiIcon :name="active ? 'menu-up' : 'menu-down'" size="small" /></button>
            </template>
            <UiDropdownItem v-for="option in colormap_list" :key="option" :value="option">
              <span class="color-swatch"
                    :style="{ background: $GetColormapGradient(option, 10) }"/>
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

        <div class="filters">
          <UiCheckbox v-model="exclude_test">
            Exclude tests
          </UiCheckbox>

          <UiCheckbox v-model="exclude_third_party">
            Exclude third parties
          </UiCheckbox>
        </div>
      </div>

      <div class="treemap-header">
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
                :style="{ background: $GetColormapGradient(colormap) }"/>
          <span>{{ percent(color_domain[1]) }}</span>

          <button type="button" class="button is-small ml-2" @click="fullscreen = true">
            <UiIcon name="fullscreen" size="small" /><span>Full screen</span>
          </button>
        </div>
      </div>
    </div>

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
        @zoomin="path.push($event); updateUrl(0, 1)"
        @animationend="animationEnd()"
        ref="treemap"
        >
      </Treemap>
    </div>
    <div class="section">
      <div class="form-row">
        <UiField expanded>
          <Timeline v-model="dates" ></Timeline>
        </UiField>
        <div class="form-row">
          <button type="button" class="button ml-5" @click="toggleAnimate" :disabled="dates[1].getTime() > new Date().getTime() - 100000000">
            <UiIcon :name="animate ? 'pause' : 'play'" size="small"></UiIcon>
          </button>
          <button type="button" class="button" :disabled="dates[1].getTime() > new Date().getTime() - 100000000" @click="increaseAnimateSpeed">
            x{{animate_speed}}
          </button>
        </div>
      </div>
    </div>

    <section class="section content">
      <h2 class="title is-5">
        Download data:
      </h2>

      <ul>
        <li>Temporal data:
          <button type="button" class="button is-small" @click="treemap.download('temporal_json')">JSON</button>
          <button type="button" class="button is-small" @click="treemap.download('temporal_csv')">CSV</button>
        </li>
        <li>Spatial data:
          <button type="button" class="button is-small" @click="treemap.download('spatial_json')">JSON</button>
          <button type="button" class="button is-small" @click="treemap.download('spatial_csv')">CSV</button>
        </li>
      </ul>
    </section>

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

import {format} from "d3-format";
import repositories_json from '../public/data/repositories.json'
import entries from '../public/treemap/entries.json'

const treemap = ref(null);

const route = useRoute()
const router = useRouter()

const findMetric = (identifier: string) => {
  return entries.metrics?.find((e: any) =>
    e.file === identifier ||
    e.name === identifier ||
    e.aliases?.includes(identifier)
  );
};

const field_color = ref([findMetric('todo') || entries.metrics?.[0]]);
if (route.query.field_color) {
  field_color.value = (route.query.field_color as string).split(",").map(file => {
    return findMetric(file);
  }).filter(f => f)
}
const field_color_value = computed(() => {
  return field_color.value?.filter(f => f).map(f => f.file) || [];
})

const field_size = ref([findMetric('line') || entries.metrics?.[0]])
if (route.query.field_size) {
  field_size.value = (route.query.field_size as string).split(",").map(file => {
    return findMetric(file);
  }).filter(f => f)
}
const field_size_value = computed(() => {
  return field_size.value?.filter(f => f).map(f => f.file) || [];
})

const dates = ref([
  new Date("2020-01-01"),
  new Date(),
])
if (route.query.dates) {
  dates.value = route.query.dates
    .split(',')
    .map(d => new Date(d))
}

const colormap = ref("Red");
if (route.query.colormap) {
  colormap.value = route.query.colormap;
}

const path = ref([]);
if (route.query.path) {
  path.value = route.query.path.split(",");
}

// Empty bounds fit the displayed data.
const colormapMin = ref("");
if (route.query.colormapMin) {
  colormapMin.value = route.query.colormapMin;
}

const colormapMax = ref("");
if (route.query.colormapMax) {
  colormapMax.value = route.query.colormapMax;
}

const color_domain = computed(() => treemap.value?.color_domain ?? [0, 1]);
const percent = format(".2~%");
const formatBound = format(".3~r");

const default_repo = repositories_json?.find?.(repo => repo.treemap)?.dirname || repositories_json?.[0]?.dirname || "chromium";

const repositories = ref([default_repo]);
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}

const history_color = ref(true);
if (route.query.history_color == "0") {
  history_color.value = false;
}

const history_size = ref(false);
if (route.query.history_size == "1") {
  history_size.value = true;
}

const exclude_test = ref(false);
if (route.query.exclude_test !== undefined) {
  exclude_test.value = true;
}

const exclude_third_party = ref(false);
if (route.query.exclude_third_party !== undefined) {
  exclude_third_party.value = true;
}

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

const {
  $color_map,
  $GetColormapGradient
} = useNuxtApp();
const colormap_list = ref(Object.keys($color_map));

const increaseAnimateSpeed = () => {
  switch(animate_speed.value) {
    case 1: animate_speed.value = 2; break;
    case 2: animate_speed.value = 5; break;
    case 5: animate_speed.value = 10; break;
    case 10: animate_speed.value = 1; break;
  }
}

const updateUrl = (old_value, new_value) => {
  const query = {
    colormap: colormap.value,
    colormapMax: colormapMax.value || undefined,
    colormapMin: colormapMin.value || undefined,
    field_color: field_color.value.map(f => f.file).join(","),
    field_size: field_size.value.map(f => f.file).join(","),
    path: path.value.join(","),
    repositories: repositories.value.join(","),
    dates: dates.value.map(d => d.toISOString().split("T")[0]).join(","),
  }
  if (history_color.value === false) {
    query.history_color = "0"
  }
  if (history_size.value === true) {
    query.history_size = "1"
  }
  if (exclude_test.value === true) {
    query.exclude_test = null;
  }
  if (exclude_third_party.value === true) {
    query.exclude_third_party = null;
  }

  router.push({ query });
}

const truncate = (str, n) => {
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + '…';
};

watch(repositories, updateUrl);
watch(colormap, updateUrl);
watch(colormapMax, updateUrl);
watch(colormapMin, updateUrl);
watch(field_color, updateUrl);
watch(field_size, updateUrl);
watch(path, updateUrl);
watch(dates, updateUrl);
watch(history_color, updateUrl);
watch(history_size, updateUrl);
watch(exclude_test, updateUrl);
watch(exclude_third_party, updateUrl);

onMounted(() => {
  if (
    (route.query.field_color && route.query.field_color !== field_color_value.value.join(",")) ||
    (route.query.field_size && route.query.field_size !== field_size_value.value.join(","))
  ) {
    updateUrl();
  }
});

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


const animationEnd = async () => {
  if (dates.value[1] > new Date()) {
    animate.value = false;
  }

  if (animate.value) {
    const next = dates.value[1].getTime() + animate_speed.value *
      7 * 24 * 60 * 60 * 1000;
    dates.value = [dates.value[0], new Date(next)];
  }
}

watch(animate, () => {
  if (animate.value) {
    animationEnd();
  }
})

const toggleAnimate = () => {
  animate.value = !animate.value;
  if (animate.value) {
    animationEnd();
  }
}

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

</style>
