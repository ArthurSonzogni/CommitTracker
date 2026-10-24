<template>
  <span class="select" :class="{ 'is-fullwidth': expanded }">
    <select v-model="value">
      <option v-if="placeholder" :value="null" disabled hidden>{{ placeholder }}</option>
      <slot />
    </select>
  </span>
</template>

<script setup lang="ts">
// A select, of <option> children. A `change` listener receives the native
// event, bubbling from the <select>.

defineProps<{
  placeholder?: string;
  expanded?: boolean;
}>();

const value = defineModel<any>({ default: null });
</script>
