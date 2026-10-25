<template>
  <UiField>
    <div class="form-row">
      <UiSegmented
        v-for="(list, i) in possibleValues"
        :key="i"
        v-model="value"
        aria-label="Time range"
        :options="list.map(item => ({ value: item, label: item, title: tooltip.get(item) }))" />
    </div>
  </UiField>
</template>

<script setup lang="ts">

const value = defineModel()

const props = defineProps({
  label: {
    default: "",
    type: String,
    required: false
  },
});

// Every calendar year since reviews are recorded, most recent first. Kept in
// sync with importer/graph.mjs.
const FIRST_YEAR = 2017;
const years = [];
for (let year = new Date().getFullYear(); year >= FIRST_YEAR; --year) {
  years.push(String(year));
}

const possibleValues = [
  [
    'forever',
  ],
  [
    '1y',
    '6m',
    '3m',
    '1m',
  ],
  years,
];

const tooltip = new Map([
  ['forever', "All time"],
  ['1y', "The last year"],
  ['6m', "The last 6 months"],
  ['3m', "The last 3 months"],
  ['1m', "The last month"],
  ...years.map(year => [year, year === years[0] ? `${year}, so far` : year]),
]);

const items = ref(possibleValues.flat());

</script>
