<template>
  <div class="ui-field" :class="{ 'is-expanded': expanded }">
    <span v-if="label" class="ui-field-label">{{ label }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
// A labeled form control. Group several of them in a <div class="form-row">.

defineProps<{
  label?: string;
  // Grow to fill the row.
  expanded?: boolean;
}>();
</script>
