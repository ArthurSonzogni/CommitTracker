<template>
  <div>
    <Navbar/>
    <section class="section">
      <b-field grouped>
        <b-field label="size" label-position="inside" expanded>
          <TreemapInput v-model:value="field_size" placeholder="size"/>
        </b-field>
        <b-field label="color" label-position="inside" expanded>
          <TreemapInput v-model:value="field_color" placeholder="color"/>
        </b-field>
      </b-field>

      <b-breadcrumb align="is-left">
        <b-breadcrumb-item
          tag = 'a'
          v-on:click.native = "path = []"
          >
          .
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


      <Treemap
        :repositories="repositories"
        :path="path"
        :field_color="field_color"
        :field_size="field_size"
        :colormapMin="colormapMin"
        :colormapMax="colormapMax"
        :colormap="colormap"
        @zoomin="path.push($event); updateUrl(0, 1)"
      ></Treemap>

      <b-field grouped>
        <b-field label="Min" grouped label-position="inside">
          <b-input v-model="colormapMin" placeholder="Min"></b-input>
        </b-field>
        <b-field label="Max" grouped label-position="inside">
          <b-input v-model="colormapMax" placeholder="Max"></b-input>
        </b-field>
        <b-field label="Colormap" expanded label-position="inside">
          <b-select
            placeholder="Colormap"
            v-model="colormap"
            expanded
            >
            <option
              v-for="option in colormap_list"
              :value="option"
              :key="option"
              >
              {{ option }}
            </option>
          </b-select>
        </b-field>
      </b-field>

    </section>

    <section class="section">
      <p>
        Data is updated automatically every weeks. This is a self modifying git
        repository.
      </p>
      <p>
        New entries to track can be added by opening a PR against this
        <a
          href="https://github.com/ArthurSonzogni/ChromeCommitTracker/blob/main/static/data/chromium/treemap/entries.json">file</a>
      </p>
    </section>

  </div>
</template>

<script setup lang="ts">

const route = useRoute()
const router = useRouter()

const field_color = ref(["allow_unsafe_buffers"]);
if (route.query.field_color) {
  field_color.value = route.query.field_color.split(",");
}

const field_size = ref(["file"]);
if (route.query.field_size) {
  field_size.value = route.query.field_size.split(",");
}

const colormap = ref("Red");
if (route.query.colormap) {
  colormap.value = route.query.colormap;
}

const path = ref([]);
if (route.query.path) {
  path.value = route.query.path.split(",");
}

const colormapMin = ref(-0.03);
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

const { $color_map } = useNuxtApp();
const colormap_list = ref(Object.keys($color_map));

const updateUrl = (old_value, new_value) => {
  const query = {
    repositories: repositories.value.join(","),
    path: path.value.join(","),
    field_color: field_color.value.join(","),
    field_size: field_size.value.join(","),
    colormap: colormap.value,
    colormapMin: colormapMin.value,
    colormapMax: colormapMax.value,
  }
  router.push({ query });
}

watch(repositories, updateUrl);
watch(colormap, updateUrl);
watch(colormapMax, updateUrl);
watch(colormapMin, updateUrl);
watch(field_color, updateUrl);
watch(field_size, updateUrl);
watch(path, updateUrl);

</script>

<style scoped>
section {
  margin-top: -40px;
}
</style>
