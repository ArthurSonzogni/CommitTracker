<template>
  <div
    ref="root"
    class="navbar-item has-dropdown is-hoverable"
    :class="{ 'is-active': open }"
    @mouseleave="open = false">
    <a
      class="navbar-link"
      role="button"
      tabindex="0"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="open = !open"
      @keydown.enter.prevent="open = !open">
      <slot name="label" />
    </a>
    <div class="navbar-dropdown" @click="open = false">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
// A dropdown of <b-navbar>: opens on hover on desktop, and on click.
// Compatible with Buefy's <b-navbar-dropdown>.

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const onDocumentClick = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false;
  }
};
onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>
