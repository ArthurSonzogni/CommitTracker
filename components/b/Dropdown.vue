<template>
  <div
    ref="root"
    class="dropdown"
    :class="{ 'is-active': open, 'is-expanded': expanded }"
    @mouseenter="hover && (open = true)"
    @mouseleave="hover && (open = false)">
    <div
      class="dropdown-trigger"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open">
      <slot name="trigger" :active="open" />
    </div>
    <div class="dropdown-menu" role="listbox">
      <div
        class="dropdown-content"
        :style="scrollable ? { maxHeight, overflowY: 'auto', overflowX: 'hidden' } : undefined">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A dropdown of <b-dropdown-item>, selecting a value. Compatible with
// Buefy's <b-dropdown>.

const props = withDefaults(defineProps<{
  expanded?: boolean;
  // click, hover.
  triggers?: string[];
  scrollable?: boolean;
  maxHeight?: string;
}>(), {
  triggers: () => ["click"],
  maxHeight: "200px",
});

const value = defineModel<any>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const hover = computed(() => props.triggers.includes("hover"));

provide("dropdown", {
  value,
  select: (newValue: any) => {
    if (newValue !== undefined) {
      value.value = newValue;
    }
    open.value = false;
  },
});

const onDocumentClick = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false;
  }
};
onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>

<style scoped>
.dropdown.is-expanded {
  width: 100%;
}

.dropdown.is-expanded .dropdown-trigger,
.dropdown.is-expanded .dropdown-menu {
  width: 100%;
}
</style>
