<template>
  <!-- A page with its parameters. On large screens, the parameters sit in a
       column on the left, and stay in view while the content scrolls. The
       page grows by that column, so the content keeps its usual width. On
       smaller screens, the parameters stack above the content. -->
  <div class="container split-layout">
    <div v-if="$slots.header" class="split-header">
      <slot name="header" />
    </div>
    <aside class="split-aside" :aria-label="asideLabel">
      <slot name="aside" />
    </aside>
    <div class="split-main">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  asideLabel?: string;
}>(), {
  asideLabel: "Parameters",
});
</script>

<style scoped>
.split-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.split-main {
  min-width: 0;
}

@media (min-width: 1280px) {
  .container.split-layout {
    --aside-width: 260px;
    --aside-gap: 2.5rem;
    column-gap: var(--aside-gap);
    grid-template-columns: var(--aside-width) minmax(0, 1fr);
    max-width: calc(1152px + var(--aside-width) + var(--aside-gap));
  }

  .split-header {
    grid-column: 1 / -1;
  }

  .split-aside {
    align-self: start;
    grid-column: 1;
    /* Taller than the window: it scrolls on its own. */
    max-height: calc(100vh - 3rem);
    overflow-y: auto;
    /* Room for the focus rings. */
    padding: 2px;
    position: sticky;
    scrollbar-width: thin;
    top: 1.5rem;
  }

  .split-main {
    grid-column: 2;
  }

  /* The controls, laid out for a narrow column. */
  .split-aside :deep(.form-row) {
    align-items: stretch;
    flex-direction: column;
  }

  .split-aside :deep(.ui-field) {
    margin-bottom: 1.1rem;
  }

  /* Long lists (repositories, organizations): they wrap, and scroll past
   * nine rows. */
  .split-aside :deep(.chip-track) {
    align-content: flex-start;
    animation: none;
    flex: none;
    flex-wrap: wrap;
    mask-image: none;
    max-height: calc(9.5 * 1.75rem + 9 * 2px + 3px);
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    width: 100%;
  }

  .split-aside :deep(.chip-selector) {
    align-items: stretch;
    flex-direction: column;
  }

  /* Short choices: wrap on several lines rather than scroll. */
  .split-aside :deep(.segmented) {
    animation: none;
    flex-wrap: wrap;
    mask-image: none;
    overflow: visible;
  }
}

@media (min-width: 1408px) {
  .container.split-layout {
    max-width: calc(1344px + var(--aside-width) + var(--aside-gap));
  }
}
</style>
