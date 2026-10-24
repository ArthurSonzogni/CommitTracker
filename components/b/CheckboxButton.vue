<template>
  <div class="control">
    <label
      class="b-checkbox checkbox button"
      :class="[checked ? type : null, size, { 'is-disabled': disabled }]">
      <slot />
      <input
        v-model="value"
        type="checkbox"
        class="visually-hidden-input"
        :value="nativeValue"
        :name="name"
        :disabled="disabled" />
    </label>
  </div>
</template>

<script setup lang="ts">
// A toggle button, for a value in an array, or a boolean. Compatible with
// Buefy's <b-checkbox-button>.

const props = withDefaults(defineProps<{
  nativeValue?: any;
  type?: string;
  size?: string;
  name?: string;
  disabled?: boolean;
}>(), {
  type: "is-primary",
});

const value = defineModel<any>();
const checked = computed(() => Array.isArray(value.value)
  ? value.value.includes(props.nativeValue)
  : !!value.value);
</script>
