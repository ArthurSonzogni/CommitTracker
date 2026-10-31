<template>
  <ChipSelector
    v-model="value"
    class="repository-selector"
    :items="filteredItems"
    :all-ids="topLevelIds"
    :allow-multiple="allowMultiple"
    :allow-all="allowAll"
    scroll-selected-into-view />
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import repositoriesJson from "../public/data/repositories.json";

const value = defineModel<string[]>({ default: () => [] });

const props = defineProps({
  filter: {
    type: Function as PropType<(repo: any) => boolean>,
    default: () => true,
  },
  allowMultiple: {
    type: Boolean,
    default: false,
  },
  allowAll: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: "is-small",
  },
});

const visibleRepositories = computed(() =>
  repositoriesJson.filter((repo) => props.filter(repo)),
);

const filteredItems = computed(() =>
  visibleRepositories.value.map((repo) => ({
    id: repo.dirname,
    label: repo.name,
  })),
);

const topLevelIds = computed(() =>
  visibleRepositories.value
    .filter((repo) => repo.parent === undefined)
    .map((repo) => repo.dirname.toLowerCase()),
);
</script>

<style scoped>
.repository-selector {
  padding: 1rem 0 0.75rem;
}
</style>
