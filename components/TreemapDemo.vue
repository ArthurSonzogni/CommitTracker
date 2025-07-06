<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/treemap">
        4. Treemap
        </NuxtLink>
      </h1>

      <div class="content">
        <p>
          The treemap shows the evolution of the codebase over space and time
          (WIP).
        </p>
      </div>
      <div>
        <Treemap
          :repositories="['chromium']"
          :path="path"
          :field_color="['allow_unsafe_buffers']"
          :field_size="['raw_ptr']"
          colormap="Red"
          colormapMin="0"
          colormapMax="0.3"
          :dates="[new Date('2021-01-01'), new Date()]"
          :animate="true"
          @zoomin="path.push($event); updateUrl(0, 1)"
          />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">

const path = ref([]);

</script>
