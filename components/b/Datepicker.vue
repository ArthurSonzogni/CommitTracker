<template>
  <div class="control">
    <input
      class="input"
      type="date"
      :value="toInputValue(value)"
      :min="toInputValue(minDate)"
      :max="toInputValue(maxDate)"
      @change="onChange" />
  </div>
</template>

<script setup lang="ts">
// A date input, using the browser's date picker. Compatible with the usage
// of Buefy's <b-datepicker>: `value`, and an `input` event with the Date.

defineProps<{
  value?: Date;
  minDate?: Date;
  maxDate?: Date;
  position?: string;
}>();

const emit = defineEmits<{ input: [value: Date] }>();

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
    emit("input", new Date(year, month - 1, day));
  }
};
</script>
