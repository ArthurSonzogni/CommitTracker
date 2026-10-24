<template>
  <div class="control">
    <label
      class="b-radio radio button"
      :class="[selected ? type : null, size, { 'is-selected': selected, 'is-disabled': disabled }]">
      <slot />
      <input
        v-model="value"
        type="radio"
        class="visually-hidden-input"
        :value="nativeValue"
        :name="name"
        :disabled="disabled" />
    </label>
  </div>
</template>

<script setup lang="ts">
// One option of a segmented control. Compatible with Buefy's
// <b-radio-button>. Several of them in a <b-field> form the control.

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
const selected = computed(() => value.value === props.nativeValue);
</script>
