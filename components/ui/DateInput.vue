<template>
  <input
    class="input"
    type="date"
    :value="toInputValue(model)"
    :min="toInputValue(min)"
    :max="toInputValue(max)"
    @change="onChange" />
</template>

<script setup lang="ts">
// A date input, using the browser's date picker.

defineProps<{
  min?: Date;
  max?: Date;
}>();

const model = defineModel<Date>();

// YYYY-MM-DD, in local time.
const toInputValue = (date?: Date) => {
  if (!date || isNaN(date.getTime())) {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const onChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.value) {
    const [year, month, day] = input.value.split("-").map(Number);
    model.value = new Date(year, month - 1, day);
  }
};
</script>
