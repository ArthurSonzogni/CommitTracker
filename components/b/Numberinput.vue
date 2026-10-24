<template>
  <div class="field has-addons b-numberinput">
    <p class="control">
      <button
        type="button"
        class="button is-primary"
        aria-label="Decrement"
        :disabled="min !== undefined && value - step < min"
        @click="update(value - step)">
        <BIcon icon="minus" size="is-small" />
      </button>
    </p>
    <div class="control is-expanded">
      <input
        class="input"
        type="number"
        :value="value"
        :min="min"
        :max="max"
        :step="step"
        @change="update(Number(($event.target as HTMLInputElement).value))" />
    </div>
    <p class="control">
      <button
        type="button"
        class="button is-primary"
        aria-label="Increment"
        :disabled="max !== undefined && value + step > max"
        @click="update(value + step)">
        <BIcon icon="plus" size="is-small" />
      </button>
    </p>
  </div>
</template>

<script setup lang="ts">
// A number input with -/+ buttons. Compatible with Buefy's <b-numberinput>.

const props = withDefaults(defineProps<{
  min?: number | string;
  max?: number | string;
  step?: number | string;
  controlsPosition?: string;
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
.b-numberinput {
  margin-bottom: 0;
}

.b-numberinput input {
  text-align: center;
  -moz-appearance: textfield;
}

.b-numberinput input::-webkit-inner-spin-button,
.b-numberinput input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
</style>
