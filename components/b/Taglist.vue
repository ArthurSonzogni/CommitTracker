<template>
  <div class="tags" :class="{ 'has-addons': attached }">
    <slot />
  </div>
</template>

<script setup lang="ts">
// A list of tags. Compatible with Buefy's <b-taglist>.

defineProps<{ attached?: boolean }>();
</script>
