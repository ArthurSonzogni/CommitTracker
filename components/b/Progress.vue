<template>
  <progress class="progress" :class="[type, size]" max="100" :value="value">{{ value }}%</progress>
</template>

<script setup lang="ts">
// A progress bar, value in [0, 100]. Compatible with Buefy's <b-progress>.

defineProps<{
  value?: number;
  type?: string;
  size?: string;
}>();
</script>
