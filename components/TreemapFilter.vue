<template>
  <b-dropdown aria-role="list">
    <template #trigger="{ active }">
      <b-button
        label="Filters"
        type="is-primary"
        :icon-right="active ? 'menu-up' : 'menu-down'" />
    </template>


    <!--<b-dropdown-item aria-role="listitem">Action</b-dropdown-item>-->
    <!--<b-dropdown-item aria-role="listitem">Another action</b-dropdown-item>-->
    <!--<b-dropdown-item aria-role="listitem">Something else</b-dropdown-item>-->
    <b-dropdown-item aria-role="listitem" v-for="filter in filters" :key="filter">
        {{filter.name}}
        <p>{{filter.description}}</p>
    </b-dropdown-item>
  </b-dropdown>
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
