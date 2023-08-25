<template>
  <div>
    <Navbar/>

    <section class="section">

      <div class="columns">

        <div class="column">
          <b-field>
            <RepositorySelector v-model="repositories" size="is-medium"/>
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
                :key="option">
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
          href="https://github.com/ArthurSonzogni/ChromeCommitTracker/blob/main/static/data/chrome/treemap/entries.json">file</a>
      </p>
    </section>

  </div>
</template>

<script>

export default {
  data() {
    let field_color = ["DanglingUntriaged"];
    let field_size = ["raw_ptr"];
    let colormap_list = Object.keys(this.$getColormapList());
    let colormap = "Turbo";
    let path = [];
    let colormapMin = 0.0;
    let colormapMax = 1.0;
    let repositories = "chrome"
    try {
      const url = new URL(window.location);
      const search = new URLSearchParams(url.search)
      const params = search.get("p")
      const data = atob(params);
      [
        repositories,
        path,
        colormap,
        field_color,
        field_size,
        colormapMin,
        colormapMax
      ] = JSON.parse(data);
    } catch (e) {
      console.log(e);
    }
    return {
      repositories,
      path,
      field_color,
      field_size,
      colormap_list,
      colormap,
      colormapMin,
      colormapMax,
    }
  },

  methods: {
    popstate: function() {
      try {
        const url = new URL(window.location);
        const search = new URLSearchParams(url.search);
        console.log("popupState");
        [
          this.repositories,
          this.path,
          this.colormap,
          this.field_color,
          this.field_size,
          this.colormapMin,
          this.colormapMax,
        ] = JSON.parse(atob(search.get("p")));
        console.log("popupState (endc)");
      } catch (e) {
        console.log(e);
      }
    },

    pushState: function() {
      const url = new URL(window.location);
      const params = [
          this.repositories,
          this.path,
          this.colormap,
          this.field_color,
          this.field_size,
          this.colormapMin,
          this.colormapMax
      ];
      const search = new URLSearchParams(url.search)
      search.set("p", btoa(JSON.stringify(params)))
      url.search = search.toString();
      if (url.search != window.location.search) {
        history.pushState({}, "", url)
      }
    },
  },

  watch: {
    repositories: "pushState",
    colormap: "pushState",
    colormapMax: "pushState",
    colormapMin: "pushState",
    field_color: "pushState",
    field_size: "pushState",
    path: "pushState",
  },

  mounted: function() {
    window.addEventListener('popstate', this.popstate)
  },
}

</script>

<style scoped>
  section {
    margin-top: -40px;
  }
</style>
