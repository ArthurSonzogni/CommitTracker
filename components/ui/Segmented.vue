<template>
  <div class="segmented" role="radiogroup" :aria-label="ariaLabel">
    <label
      v-for="option in normalized"
      :key="String(option.value)"
      class="segmented-option"
      :class="{ 'is-selected': option.value === value, 'is-disabled': option.disabled }"
      :title="option.title">
      <input
        v-model="value"
        type="radio"
        class="visually-hidden-input"
        :name="name"
        :value="option.value"
        :disabled="option.disabled" />
      <UiIcon v-if="option.icon" :name="option.icon" size="small" />
      {{ option.label }}
    </label>
  </div>
</template>

<script setup lang="ts">
// A segmented control: pick one of a few options.

type Option = { value: any; label: string; icon?: string; title?: string; disabled?: boolean };

const props = defineProps<{
  // {value: label} or [{value, label, icon?, title?, disabled?}].
  options: Record<string, string> | Option[];
  name?: string;
  ariaLabel?: string;
}>();

const value = defineModel<any>();

const normalized = computed<Option[]>(() => Array.isArray(props.options)
  ? props.options
  : Object.entries(props.options).map(([value, label]) => ({ value, label })));

// Radio inputs of a group need a common name.
const name = computed(() => props.name ?? useId());
</script>
