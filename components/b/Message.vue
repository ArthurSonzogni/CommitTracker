<template>
  <article v-if="active" class="message" :class="type">
    <header v-if="title" class="message-header">
      <p>{{ title }}</p>
      <button type="button" class="delete" :aria-label="ariaCloseLabel" @click="active = false" />
    </header>
    <section class="message-body">
      <slot />
    </section>
  </article>
</template>

<script setup lang="ts">
// A closable message. Compatible with Buefy's <b-message>.

defineProps<{
  title?: string;
  type?: string;
  ariaCloseLabel?: string;
}>();

const active = defineModel<boolean>({ default: true });
</script>
