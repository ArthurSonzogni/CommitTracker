<template>
  <div>
    <Navbar/>
    <div class="m-5">
      <b-field group group-multiline>
      <TreemapInput v-model:value="field_color"
                    placeholder="color/numerator"/>
      <b-checkbox v-model="history_color" class="ml-4"/>
      <TreemapInput v-model:value="field_size"
                    placeholder="size/denominator"/>
      <b-checkbox v-model="history_size" class="ml-4"/>

        <b-field expanded class="mr-2" label="Colormap"
                                       label-position="on-border">
          <b-dropdown
            v-model="colormap"
            expanded
            trap
            :triggers="['hover']"
            scrollable
            max-height="300px"
            >
            <template #trigger="{ active }">
              <b-button
                type="is-ghost"
                :icon-right="active ? 'menu-up' : 'menu-down'"
                >
              {{ option }}
                <span class="color-swatch"
                      :style="{ background: $GetColormapGradient(colormap) }"/>
                {{ colormap }}
              </b-button>
            </template>
            <b-dropdown-item
              v-for="option in colormap_list"
              :key="option"
              :value="option"
              >
              <span class="color-swatch"
                    :style="{ background: $GetColormapGradient(option, 10) }"/>
                {{ truncate(option, 5) }}
            </b-dropdown-item>
          </b-dropdown>
        </b-field>

        <b-field class="mr-2" label="Min" label-position="on-border">
          <b-input
            v-model="colormapMin"
            placeholder="Min"
            >
          </b-input>
        </b-field>

        <b-field class="mr-2" label="Max" label-position="on-border">
          <b-input
            v-model="colormapMax"
            placeholder="Max"
            ></b-input>
        </b-field>

        <b-checkbox v-model="exclude_test" class="ml-4">
          Exclude tests
        </b-checkbox>

      </b-field>

      <b-breadcrumb align="is-left">
        <b-breadcrumb-item tag='a' v-on:click.native = "path = []">
          &#60;root&#62;
        </b-breadcrumb-item>
        <b-breadcrumb-item
          tag='a'
          v-for="(component, index) in path"
          :key="index"
          v-on:click.native="path = path.slice(0, index+1)"
          >
          {{component}}
        </b-breadcrumb-item>
      </b-breadcrumb>
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
      @zoomin="path.push($event); updateUrl(0, 1)"
      @animationend="animationEnd()"
      ref="treemap"
      >
    </Treemap>
    <div class="section">
      <b-field grouped>
        <b-field expanded>
          <Timeline v-model="dates" ></Timeline>
        </b-field>
        <b-field grouped>
          <b-button
            class="ml-5"
            @click="toggleAnimate"
            :disabled="dates[1].getTime() > new Date().getTime() - 100000000"
            >
            <b-icon
              :icon="animate ? 'pause' : 'play'"
              size="is-small"
              ></b-icon>
          </b-button>
          <b-button
            :disabled="dates[1].getTime() > new Date().getTime() - 100000000"
            @click="increaseAnimateSpeed"
            >
            x{{animate_speed}}
          </b-button>
        </b-field>
      </b-field>
    </div>

    <section class="section content">
      <h2 class="title is-5">
        Download data:
      </h2>

      <ul>
        <li>Temporal data:
          <a @click="treemap.download('temporal_json')" > JSON </a>,
          <a @click="treemap.download('temporal_csv')" > CSV </a>
        </li>
        <li>Spatial data:
          <a @click="treemap.download('spatial_json')" > JSON </a>,
          <a @click="treemap.download('spatial_csv')" > CSV </a>
        </li>
      </ul>
    </section>

    <section class="section content">
      <h2 class="title is-5">
        How to read the treemap:
      </h2>
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
      </ul>
      <h3 class="title is-5">
        Datasets
      </h3>
      <p class="mt-2">
        Content is updated <strong>weekly</strong>.
        <br/>
        To add a new dataset, please edit the
        <a href="https://github.com/ArthurSonzogni/ChromeCommitTracker/blob/main/treemap.yaml">
          <code>treemap.yaml</code>
        file.
        </a>
      </p>
    </section>

  </div>
</template>

<script setup lang="ts">

import entries from '../public/treemap/entries.json'

const treemap = ref(null);

const route = useRoute()
const router = useRouter()

const field_color = ref([entries.metrics[7]]);
if (route.query.field_color) {
  field_color.value = route.query.field_color.split(",").map(file => {
    return entries.metrics.find(e => e.file === file)
  })
}
const field_color_value = computed(() => {
  return field_color.value.map(f => f.file);
})

const field_size = ref([entries.metrics[0]])
if (route.query.field_size) {
  field_size.value = route.query.field_size.split(",").map(file => {
    return entries.metrics.find(e => e.file === file)
  })
}
const field_size_value = computed(() => {
  return field_size.value.map(f => f.file);
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

const colormapMin = ref(0);
if (route.query.colormapMin) {
  colormapMin.value = parseFloat(route.query.colormapMin);
}

const colormapMax = ref(0.12);
if (route.query.colormapMax) {
  colormapMax.value = parseFloat(route.query.colormapMax);
}

const repositories = ref(["chromium"]);
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
    colormapMax: colormapMax.value,
    colormapMin: colormapMin.value,
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

console.log($color_map["Viridis"](0.5))
console.log($GetColormapGradient("Viridis"))

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
    border-bottom: 1px solid black;
    padding: 0.3em;
  }

  .denominator {
    padding: 0.3em;
  }

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
