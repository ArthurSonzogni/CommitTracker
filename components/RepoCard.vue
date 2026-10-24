<template>
  <div class="column is-full-mobile is-half-desktop is-one-third-widescreen">
    <div class="card">
      <div class="card-header">
        <div class="card-header-title"
             :style='{
             backgroundColor: repo.color + "66",
             }
             '>
          {{repo.name}}
        </div>
      </div>

      <div class="card-content">

        <UiField>
          <UiIcon name="github">
          </UiIcon>
          <a :href="`https://github.com/${repo.owner}/${repo.repository}`">
            {{repo.owner}}/{{repo.repository}}
          </a>
        </UiField>

        <UiField>
          <UiIcon name="subdirectory-arrow-right">
          </UiIcon>
          <a
            :href="`https://github.com/${repo.owner}/${repo.repository}/tree/HEAD/${repo.cone || '/'}`">
            {{repo.cone || '/'}}
          </a>
        </UiField>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">

const props = defineProps({
  repo: Object
})

</script>
