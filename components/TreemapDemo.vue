<template>
  <section class="section feature">
    <div class="container">
      <header class="feature-header">
        <span class="feature-index">04</span>
        <h2 class="title">
          <NuxtLink to="/treemap">Treemap</NuxtLink>
        </h2>
        <NuxtLink class="feature-link" to="/treemap">
          Open
          <b-icon icon="arrow-right" size="is-small"></b-icon>
        </NuxtLink>
      </header>

      <div class="content">
        <p>
          The treemap shows the evolution of the codebase over space and time
          (WIP).
        </p>
      </div>
      <div class="frame">
        <Treemap
          :repositories="[default_repo]"
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
import repositories_json from '../public/data/repositories.json'
const default_repo = repositories_json[0]?.dirname || "chromium";

const path = ref([]);

</script>
