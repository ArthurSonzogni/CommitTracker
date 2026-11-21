<template>
  <!-- A page with its parameters. On large screens, the parameters sit in a
       column on the left, and stay in view while the content scrolls. The
       page grows by that column, so the content keeps its usual width. On
       smaller screens, the parameters sit behind a collapsible filter bar
       (open by default on tablets, collapsed on narrow phones) so the chart
       stays close to the top.

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

    <!-- Compact filter toggle bar for < 1280px viewports. -->
    <div class="mobile-filter-bar">
      <button
        type="button"
        class="mobile-filter-toggle"
        :aria-expanded="mobileOpen"
        @click="mobileOpen = !mobileOpen">
        <UiIcon name="tune" size="small" />
        <span>{{ asideLabel }}</span>
        <span v-if="activeFilterCount > 0" class="filter-count">{{ activeFilterCount }}</span>
        <UiIcon :name="mobileOpen ? 'chevron-up' : 'chevron-down'" size="small" class="toggle-chevron" />
      </button>
      <button
        v-if="activeFilterCount > 0"
        type="button"
        class="reset-filters-btn"
        title="Reset all filters to defaults"
        @click="resetFilters">
        <UiIcon name="restart" size="small" />
        <span>Reset</span>
      </button>
    </div>

    <aside
      class="split-aside"
      :class="{ 'is-collapsed-mobile': !mobileOpen }"
      :aria-label="asideLabel">
      <div v-if="activeFilterCount > 0" class="aside-reset-row">
        <span class="aside-active-label">{{ activeFilterCount }} active {{ activeFilterCount === 1 ? "filter" : "filters" }}</span>
        <button
          type="button"
          class="reset-filters-btn"
          title="Reset all filters to defaults"
          @click="resetFilters">
          <UiIcon name="restart" size="small" />
          <span>Reset</span>
        </button>
      </div>
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

const route = useRoute();
const router = useRouter();

const activeFilterCount = computed(() =>
  Object.entries(route.query).filter(([, v]) => v !== undefined && v !== "").length,
);

const resetFilters = () => {
  router.replace({ query: {} });
};

// Collapse filters by default only on narrow phones (< 640px) so the chart
// stays above the fold on mobile without hiding controls on tablets/desktop.
const mobileOpen = ref(true);
onMounted(() => {
  if (window.innerWidth < 640) {
    mobileOpen.value = false;
  }
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

.mobile-filter-bar {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.mobile-filter-toggle {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink-2);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.85rem;
  font-weight: 560;
  gap: 0.45rem;
  padding: 0.4rem 0.75rem;
  transition: border-color 0.15s, color 0.15s;
}

.mobile-filter-toggle:hover {
  border-color: var(--accent);
  color: var(--ink);
}

.filter-count {
  background: var(--accent-soft);
  border-radius: 999px;
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.18rem 0.45rem;
}

.toggle-chevron {
  color: var(--faint);
}

.aside-reset-row {
  display: none;
}

.reset-filters-btn {
  align-items: center;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 550;
  gap: 0.3rem;
  padding: 0.25rem 0.55rem;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.reset-filters-btn:hover {
  background: var(--surface-sunken);
  border-color: var(--line-strong);
  color: var(--ink);
}

@media (max-width: 1279px) {
  .split-aside.is-collapsed-mobile {
    display: none;
  }
}

/* The settings of the content, above it: each label sits before its
 * control, so that they take few lines. */
.split-main :deep(.settings-row .ui-field) {
  align-items: center;
  flex-direction: row;
  gap: 0.5rem;
}

@media (min-width: 1280px) {
  .mobile-filter-bar {
    display: none;
  }

  .aside-reset-row {
    align-items: center;
    border-bottom: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
  }

  .aside-active-label {
    color: var(--faint);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

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
    max-height: calc(100vh - 5.5rem);
    overflow-y: auto;
    /* Room for the focus rings. */
    padding: 2px;
    position: sticky;
    scrollbar-width: thin;
    top: 4.5rem;
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

  /* Long lists (repositories, organizations): they wrap, and scroll on
   * their own past ten rows and a half, the half row hinting at the rest.
   * The repositories fit; the organizations scroll. */
  .split-aside :deep(.chip-track) {
    align-content: flex-start;
    animation: none;
    flex-wrap: wrap;
    mask-image: none;
    max-height: 20.5rem;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .split-aside :deep(.chip-track .chip) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .split-aside :deep(.ui-segmented) {
    display: flex;
    flex-wrap: wrap;
  }

  .split-aside :deep(.ui-segmented .button) {
    flex: 1 1 auto;
  }

  .split-aside :deep(.ui-select),
  .split-aside :deep(.ui-select select) {
    width: 100%;
  }

  /* Tighter spacing above the settings row, now that the selection is on
   * the side. */
  .split-main :deep(.settings-row) {
    margin-bottom: 0.75rem;
  }

  .split-main :deep(.settings-row .ui-field) {
    margin-bottom: 0;
  }

  .container.split-layout.has-width {
    max-width: calc(var(--content-width) + var(--aside-width) + var(--aside-gap));
  }
}
</style>
