<template>
  <div
    ref="root"
    class="dropdown"
    :class="{ 'is-active': open, 'is-expanded': expanded }"
    :style="popover ? { anchorName } : undefined"
    @keydown.esc="open = false"
    @mouseenter="hover && (open = true)"
    @mouseleave="hover && (open = false)">
    <div
      class="dropdown-trigger"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open">
      <slot name="trigger" :active="open" />
    </div>
    <div
      ref="menu"
      class="dropdown-menu"
      role="listbox"
      :popover="popover ? 'manual' : undefined"
      :style="popover ? { positionAnchor: anchorName } : undefined">
      <div
        class="dropdown-content"
        :style="{ maxHeight, overflowY: 'auto', overflowX: 'hidden' }">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { anchorSupported, uniqueAnchorName } from "~/utils/anchor";

// A dropdown of <UiDropdownItem>, selecting a value. The trigger slot gets
// `active`.

const props = withDefaults(defineProps<{
  expanded?: boolean;
  // Also open on hover, not only on click.
  hover?: boolean;
  maxHeight?: string;
}>(), {
  maxHeight: "300px",
});

const value = defineModel<any>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const popover = anchorSupported();
const anchorName = uniqueAnchorName();

watch(open, (value) => {
  if (popover && menu.value) {
    menu.value.togglePopover(value);
  }
});

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

/* As a popover, in the top layer, tethered to the trigger. It opens upward
 * when there is no room below. */
.dropdown .dropdown-menu:popover-open {
  background: transparent;
  border: none;
  color: inherit;
  inset: auto;
  margin: 0;
  overflow: visible;
  padding: 4px 0 0;
  position: fixed;
  position-area: bottom span-right;
  position-try-fallbacks: flip-block;
}

.dropdown.is-expanded .dropdown-menu:popover-open {
  width: anchor-size(width);
}
</style>
