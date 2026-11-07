<template>
  <!-- A page with its parameters. On large screens, the parameters sit in a
       column on the left, and stay in view while the content scrolls. The
       page grows by that column, so the content keeps its usual width. On
       smaller screens, the parameters stack above the content.

       The selection (what the content is about: repositories, organizations,
       filters) goes in the "aside" slot. The settings of how it is shown go
       above the content, in a ".form-row.settings-row". -->
  <div
    class="container split-layout"
    :class="{ 'has-width': width }"
    :style="width ? { '--content-width': `${width}px` } : undefined">
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
  // The maximum width of the content, in px, e.g. a reading column. By
  // default, the site's container.
  width?: number;
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

/* The settings of the content, above it: each label sits before its
 * control, so that they take few lines. */
.split-main :deep(.settings-row .ui-field) {
  align-items: center;
  flex-direction: row;
  gap: 0.5rem;
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

  /* Long lists (repositories, organizations): they wrap. Only the column
   * scrolls, not each list in it. */
  .split-aside :deep(.chip-track) {
    align-content: flex-start;
    animation: none;
    flex: none;
    flex-wrap: wrap;
    mask-image: none;
    max-height: none;
    overflow: visible;
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

.container.split-layout.has-width {
  max-width: var(--content-width);
}

@media (min-width: 1280px) {
  .container.split-layout.has-width {
    max-width: calc(var(--content-width) + var(--aside-width) + var(--aside-gap));
  }
}
</style>
