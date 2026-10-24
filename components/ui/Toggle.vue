<template>
  <label class="chip" :class="{ 'is-selected': checked, 'is-disabled': disabled }">
    <input
      v-model="model"
      type="checkbox"
      class="visually-hidden-input"
      :value="value"
      :disabled="disabled" />
    <slot />
  </label>
</template>

<script setup lang="ts">
// A toggle chip. Its v-model is a boolean, or an array containing `value`
// when selected.

const props = defineProps<{
  value?: any;
  disabled?: boolean;
}>();

const model = defineModel<any>();
const checked = computed(() => Array.isArray(model.value)
  ? model.value.includes(props.value)
  : !!model.value);
</script>
