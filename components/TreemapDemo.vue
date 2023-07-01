<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/treemap">
        Treemap
        </NuxtLink>
      </h1>

      <div class="columns">
        <div class="column is-5 content">
          <p>
            The treemap shows the evolution of the codebase over space and time
            (WIP).
          </p>
        </div>
        <div class="column">
          <Treemap
            :field_color="field_color"
            :field_size="field_size"
            colormap="Turbo"
            />
        </div>
      </div>
    </div>
  </section>
</template>

<script>

export default {
  data() {
    return {
      field_color: ["DanglingUntriaged"],
      field_size: ["raw_ptr"],
    }
  },
}

</script>
