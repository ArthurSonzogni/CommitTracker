<template>
  <!-- The explanations of a page, folded by default. -->
  <details class="about-data" :open="open">
    <summary>
      <UiIcon name="information-outline" size="small" />
      {{ title }}
    </summary>
    <div class="content about-data-body">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  open?: boolean;
}>(), {
  title: "About this data",
  open: false,
});
</script>

<style scoped>
.about-data {
  background: var(--surface-sunken);
  border-radius: calc(var(--radius) + 3px);
  margin: 1rem 0;
}

.about-data summary {
  align-items: center;
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  font-size: 0.875rem;
  font-weight: 560;
  gap: 0.4rem;
  list-style: none;
  padding: 0.6rem 0.9rem;
  user-select: none;
}

.about-data summary::-webkit-details-marker {
  display: none;
}

.about-data summary::after {
  border-bottom: 2px solid currentColor;
  border-right: 2px solid currentColor;
  content: "";
  height: 0.45rem;
  margin-left: auto;
  transform: rotate(45deg);
  transition: transform 0.15s;
  width: 0.45rem;
}

.about-data[open] summary::after {
  transform: rotate(-135deg);
}

.about-data summary:hover {
  color: var(--ink);
}

.about-data-body {
  font-size: 0.9rem;
  padding: 0 1rem 1rem;
}
</style>
