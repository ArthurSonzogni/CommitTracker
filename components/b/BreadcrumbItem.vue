<template>
  <li :class="{ 'is-active': active }">
    <component :is="tag === 'router-link' ? NuxtLink : tag" v-bind="$attrs" :aria-current="active ? 'page' : undefined">
      <slot />
    </component>
  </li>
</template>

<script setup lang="ts">
// An item of <b-breadcrumb>. Compatible with Buefy's <b-breadcrumb-item>.
import { NuxtLink } from '#components'

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  // a, router-link.
  tag?: string;
  active?: boolean;
}>(), {
  tag: "a",
});
</script>
