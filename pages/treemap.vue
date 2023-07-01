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

      <Treemap
        :field_color="field_color"
        :field_size="field_size"
        :colormap="colormap"
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
    }
  },
}

</script>
