<template>
  <nav class="navbar" role="navigation" aria-label="Main navigation">
    <div class="navbar-brand">
      <slot name="brand" />
      <a
        role="button"
        tabindex="0"
        class="navbar-burger"
        :class="{ 'is-active': open }"
        aria-label="Menu"
        :aria-expanded="open"
        @click="open = !open"
        @keydown.enter.prevent="open = !open">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </a>
    </div>
    <div class="navbar-menu" :class="{ 'is-active': open }">
      <div class="navbar-start"><slot name="start" /></div>
      <div class="navbar-end"><slot name="end" /></div>
    </div>
  </nav>
</template>

<script setup lang="ts">
// A responsive navbar, collapsed behind a burger on touch screens.
// Compatible with Buefy's <b-navbar>, with <b-navbar-item> and
// <b-navbar-dropdown>.

const open = ref(false);
provide("navbar-close", () => { open.value = false; });

// Close the mobile menu when navigating.
const route = useRoute();
watch(() => route.fullPath, () => { open.value = false; });
</script>
