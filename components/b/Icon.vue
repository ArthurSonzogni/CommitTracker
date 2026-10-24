<template>
  <span class="icon" :class="[textType, size]">
    <i :class="['mdi', `mdi-${icon}`, customSize ?? SIZES[size ?? 'default']]"></i>
  </span>
</template>

<script setup lang="ts">
// A Material Design Icon. Compatible with Buefy's <b-icon>.

const props = defineProps<{
  icon?: string;
  // is-small, is-medium, is-large.
  size?: string;
  // is-primary, is-danger, ... colors the icon.
  type?: string;
  customSize?: string;
}>();

const SIZES: Record<string, string | null> = {
  "default": "mdi-24px",
  "is-small": null,
  "is-medium": "mdi-36px",
  "is-large": "mdi-48px",
};

const textType = computed(() => props.type?.replace(/^is-/, "has-text-"));
</script>
