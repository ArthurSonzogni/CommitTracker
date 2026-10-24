<template>
  <div class="control" :class="{ 'is-expanded': expanded }">
    <input v-model="value" class="input" :class="size" :type="type" :placeholder="placeholder" />
  </div>
</template>

<script setup lang="ts">
// A text input. Compatible with Buefy's <b-input>.

withDefaults(defineProps<{
  placeholder?: string;
  size?: string;
  type?: string;
  expanded?: boolean;
}>(), {
  type: "text",
});

const value = defineModel<string | number>();
</script>
