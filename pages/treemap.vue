<template>
  <div>
    <Navbar/>

    <section class="section">

      <div class="columns">

        <div class="column">
          <TreemapInput v-model="field_size" placeholder="size"/>
        </div>

        <div class="column">
          <TreemapInput v-model="field_color" placeholder="color"/>
        </div>

        <div class="column is-narrow">

          <b-field label="Colormap" label-position="inside">
            <b-select
              placeholder="Colormap"
              v-model="colormap"
              >
              <option
                v-for="option in colormap_list"
                :value="option"
                :key="option">
              {{ option }}
              </option>
            </b-select>
          </b-field>

        </div>

      </div>

      <b-breadcrumb align="is-left">
        <b-breadcrumb-item tag='a' href="treemap#" >
          .
        </b-breadcrumb-item>
        <b-breadcrumb-item
          tag='a'
          v-for="(component, index) in path"
          :href="'treemap#' + path.slice(0, index+1).join('/')"
          >
          {{component}}
        </b-breadcrumb-item>
      </b-breadcrumb>


      <Treemap
        :field_color="field_color"
        :field_size="field_size"
        :colormap="colormap"
        @pathChanged="path = $event"
        />

    </section>

  </div>
</template>

<script>

export default {
  data() {
    return {
      field_color: ["DanglingUntriaged"],
      field_size: ["raw_ptr"],
      colormap_list: Object.keys(this.$getColormapList()),
      colormap: "Turbo",
      path: [],
    }
  },
}

</script>

<style scoped>
  section {
    margin-top: -40px;
  }
</style>
