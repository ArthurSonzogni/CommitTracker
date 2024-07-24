<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/treemap">
        4. Treemap
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
            :repositories="['chromium']"
            :path="path"
            :field_color="['allow_unsafe_buffers']"
            :field_size="['raw_ptr']"
            colormap="Red"
            colormapMin="0"
            colormapMax="0.3"
            :dates="['2020-01-01', new Date()]"
            @zoomin="path.push($event); updateUrl(0, 1)"
            />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">

const path = ref([]);

</script>
