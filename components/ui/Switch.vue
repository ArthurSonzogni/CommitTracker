<template>
  <UiCheckbox v-model="value" variant="switch" :name="name" :disabled="disabled">
    <slot />
  </UiCheckbox>
</template>

<script setup lang="ts">
defineProps<{ name?: string; disabled?: boolean }>();
const value = defineModel<boolean>();
</script>
