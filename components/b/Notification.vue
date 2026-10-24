<template>
  <article v-if="active" class="notification" :class="type">
    <button type="button" class="delete" aria-label="Close" @click="active = false" />
    <slot />
  </article>
</template>

<script setup lang="ts">
// A closable notification. Compatible with Buefy's <b-notification>.

defineProps<{ type?: string }>();

const active = defineModel<boolean>({ default: true });
</script>
