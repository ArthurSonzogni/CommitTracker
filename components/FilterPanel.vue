<template>
  <div class="filter-panel" :class="{ 'is-open': open }">
    <!-- On narrow screens, the filters are folded behind a one line summary,
         so that the chart is visible without scrolling. -->
    <button
      type="button"
      class="filter-panel-toggle"
      :aria-expanded="open"
      @click="open = !open">
      <UiIcon name="tune-variant" size="small" />
      <span class="filter-panel-summary">{{ summary }}</span>
      <UiIcon :name="open ? 'chevron-up' : 'chevron-down'" size="small" />
    </button>
    <div class="filter-panel-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  summary: string;
}>();

const open = ref(false);
</script>

<style scoped>
.filter-panel-toggle {
  align-items: center;
  background: var(--surface-sunken);
  border: none;
  border-radius: calc(var(--radius) + 3px);
  color: var(--ink);
  cursor: pointer;
  display: none;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 540;
  gap: 0.5rem;
  margin-bottom: 1rem;
  min-height: 2.5rem;
  padding: 0 0.75rem;
  text-align: left;
  width: 100%;
}

.filter-panel-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .filter-panel-toggle {
    display: flex;
  }

  .filter-panel:not(.is-open) .filter-panel-body {
    display: none;
  }
}
</style>
