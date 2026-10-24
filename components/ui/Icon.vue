<template>
  <span class="icon" :class="size ? `is-${size}` : null" aria-hidden="true">
    <i :class="['mdi', `mdi-${name}`, SIZES[size ?? 'default']]"></i>
  </span>
</template>

<script setup lang="ts">
// A Material Design Icon, by name (https://pictogrammers.com/library/mdi/).

defineProps<{
  name: string;
  // Default: 24px.
  size?: "small" | "medium" | "large";
}>();

const SIZES: Record<string, string | null> = {
  default: "mdi-24px",
  small: null,
  medium: "mdi-36px",
  large: "mdi-48px",
};
</script>
