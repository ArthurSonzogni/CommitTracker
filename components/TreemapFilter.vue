<template>
  <UiDropdown>
    <template #trigger="{ active }">
      <button type="button" class="button is-primary"><span>Filters</span><UiIcon :name="active ? 'menu-up' : 'menu-down'" size="small" /></button>
    </template>

    <UiDropdownItem v-for="filter in filters" :key="filter">
        {{filter.name}}
        <p>{{filter.description}}</p>
    </UiDropdownItem>
  </UiDropdown>
</template>

<script setup lang="ts">
import entries from '../public/treemap/entries.json'

const filters = ref(entries.filters);

</script>

<style scoped>
  .tag {
    cursor: pointer;
  }
</style>
