<template>
  <div>
    <Navbar/>

    <section class="section">

      <div class="columns">

        <div class="column">
          <b-field>
            <RepositorySelector
              v-model="repositories"
              size="is-small"
              :filter="repo => repo.treemap"
              />
          </b-field>
          <b-field>
            <TreemapInput v-model="field_size" placeholder="size"/>
            <TreemapInput v-model="field_color" placeholder="color"/>
          </b-field>
        </div>


        <div class="column is-narrow">

          <b-field label="Colormap" label-position="inside">
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

          <b-field grouped>
            <b-input v-model="colormapMin" size="is-small" placeholder="Min"></b-input>
            <b-input v-model="colormapMax" size="is-small" placeholder="Max"></b-input>
          </b-field>

        </div>

      </div>

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
        @zoomin="path.push($event)"
        />

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

<script>

export default {
  data() {
    let field_color = ["DanglingUntriaged"];
    if (this.$route.query.field_color) {
      field_color = this.$route.query.field_color.split(",");
    }
    let field_size = ["raw_ptr"];
    if (this.$route.query.field_size) {
      field_size = this.$route.query.field_size.split(",");
    }
    let colormap = "Turbo";
    if (this.$route.query.colormap) {
      colormap = this.$route.query.colormap;
    }
    let path = [];
    if (this.$route.query.path) {
      path = this.$route.query.path.split(",");
    }
    let colormapMin = 0.0;
    if (this.$route.query.colormapMin) {
      colormapMin = parseFloat(this.$route.query.colormapMin);
    }
    let colormapMax = 1.0;
    if (this.$route.query.colormapMax) {
      colormapMax = parseFloat(this.$route.query.colormapMax);
    }
    let repositories = ["chromium"];
    if (this.$route.query.repositories) {
      repositories = this.$route.query.repositories.split(",");
    }
    return {
      repositories,
      path,
      field_color,
      field_size,
      colormap_list: Object.keys(this.$getColormapList()),
      colormap,
      colormapMin,
      colormapMax,
    }
  },

  methods: {
    updateUrl() {
      const query = {
        repositories: this.repositories.join(","),
        path: this.path.join(","),
        field_color: this.field_color.join(","),
        field_size: this.field_size.join(","),
        colormap: this.colormap,
        colormapMin: this.colormapMin,
        colormapMax: this.colormapMax,
      }
      this.$router.replace({query});
    },
  },

  watch: {
    repositories: "updateUrl",
    colormap: "updateUrl",
    colormapMax: "updateUrl",
    colormapMin: "updateUrl",
    field_color: "updateUrl",
    field_size: "updateUrl",
    path: "updateUrl",
  },
}

</script>

<style scoped>
  section {
    margin-top: -40px;
  }
</style>
