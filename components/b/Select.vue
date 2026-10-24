<template>
  <div class="control" :class="{ 'is-expanded': expanded }">
    <span class="select" :class="[size, { 'is-fullwidth': expanded, 'is-empty': value == null }]">
      <select v-model="value">
        <option v-if="placeholder" :value="null" disabled hidden>{{ placeholder }}</option>
        <slot />
      </select>
    </span>
  </div>
</template>

<script setup lang="ts">
// A select. Compatible with Buefy's <b-select>. A `change` listener receives
// the native event, bubbling from the <select>.

defineProps<{
  placeholder?: string;
  size?: string;
  expanded?: boolean;
}>();

const value = defineModel<any>({ default: null });
</script>
