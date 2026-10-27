<template>
  <!-- A section whose title folds and unfolds its content. -->
  <section class="collapsible-section">
    <h2 class="title is-4">
      <button type="button" class="collapsible-toggle" :aria-expanded="!collapsed"
        @click="emit('toggle')">
        <UiIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" size="small" />
        <span>{{ title }}</span>
      </button>
    </h2>
    <div v-if="!collapsed">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  collapsed: boolean;
}>();
const emit = defineEmits(["toggle"]);
</script>

<style scoped>
.collapsible-section {
  margin-top: 3rem;
}

.collapsible-toggle {
  align-items: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: 0.4rem;
  padding: 0;
}

.collapsible-toggle:hover span {
  text-decoration: underline;
}
</style>
