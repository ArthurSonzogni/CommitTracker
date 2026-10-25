<template>
  <!-- Styled like a segmented control: a track with -/+ around the value. -->
  <div class="ui-number-input">
    <button
      type="button"
      class="segmented-option"
      aria-label="Decrement"
      :disabled="min !== undefined && value - step < min"
      @click="update(value - step)">
      <UiIcon name="minus" size="small" />
    </button>
    <input
      type="number"
      :value="value"
      :min="min"
      :max="max"
      :step="step"
      @change="update(Number(($event.target as HTMLInputElement).value))" />
    <button
      type="button"
      class="segmented-option"
      aria-label="Increment"
      :disabled="max !== undefined && value + step > max"
      @click="update(value + step)">
      <UiIcon name="plus" size="small" />
    </button>
  </div>
</template>

<script setup lang="ts">
// A number input with -/+ buttons.

const props = withDefaults(defineProps<{
  min?: number | string;
  max?: number | string;
  step?: number | string;
}>(), {
  step: 1,
});

const value = defineModel<number>({ default: 0 });
const min = computed(() => props.min === undefined ? undefined : Number(props.min));
const max = computed(() => props.max === undefined ? undefined : Number(props.max));
const step = computed(() => Number(props.step));

const update = (newValue: number) => {
  if (isNaN(newValue)) {
    return;
  }
  if (min.value !== undefined) newValue = Math.max(min.value, newValue);
  if (max.value !== undefined) newValue = Math.min(max.value, newValue);
  value.value = newValue;
};
</script>

<style scoped>
.ui-number-input {
  align-items: center;
  align-self: flex-start;
  background: var(--surface-sunken);
  border-radius: calc(var(--radius) + 3px);
  box-shadow: inset 0 0 0 1px rgba(18, 18, 22, 0.04);
  display: inline-flex;
  gap: 2px;
  padding: 3px;
}

.ui-number-input button {
  background: none;
  border: none;
  padding: 0 0.6rem;
}

.ui-number-input button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.ui-number-input input {
  -moz-appearance: textfield;
  background: var(--surface);
  border: none;
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  font-weight: 540;
  height: 1.95rem;
  text-align: center;
  width: 5rem;
}

.ui-number-input input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.ui-number-input input::-webkit-inner-spin-button,
.ui-number-input input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
</style>
