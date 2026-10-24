<template>
  <nav class="breadcrumb" :class="[align, size]" aria-label="Breadcrumb">
    <ul><slot /></ul>
  </nav>
</template>

<script setup lang="ts">
// A breadcrumb, of <b-breadcrumb-item>. Compatible with Buefy's
// <b-breadcrumb>.

defineProps<{
  align?: string;
  size?: string;
}>();
</script>
