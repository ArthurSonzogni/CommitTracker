<template>
  <component
    :is="tag === 'router-link' ? NuxtLink : tag"
    class="navbar-item"
    :to="tag === 'router-link' ? to : undefined"
    :href="href"
    @click="close?.()">
    <slot />
  </component>
</template>

<script setup lang="ts">
// A link of <b-navbar>. Compatible with Buefy's <b-navbar-item>.
import { NuxtLink } from '#components'

withDefaults(defineProps<{
  // a, router-link.
  tag?: string;
  to?: string | object;
  href?: string;
}>(), {
  tag: "a",
});

const close = inject<(() => void) | null>("navbar-close", null);
</script>
