<template>
  <b-field grouped label="Time range:">
    <template v-for="(list, i) in possibleValues" :key="i">
      <b-field class="has-addons">
        <template v-for="item in list" :key="item">
          <b-radio-button
            v-model="value"
            :native-value="item"
            >
            <b-tooltip :label="tooltip.get(item)">
              {{ item }}
            </b-tooltip>
          </b-radio-button>
        </template>
      </b-field>
    </template>
  </b-field>
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

const possibleValues =  [
  [
    'forever',
  ],
  [
    '1y+4y',
    '1y+3y',
    '1y+2y',
    '1y+1y',
  ],
  [
    '1y',
    '6m',
    '3m',
    '1m',
    '1w',
  ]
];

const tooltip = new Map([
  ['forever', "All time"],
  ['1y+4y', "Five year ago, until four year ago"],
  ['1y+3y', "Four year ago, until three year ago"],
  ['1y+2y', "Three year ago, until two year ago"],
  ['1y+1y', "Two year ago, until last year"],
  ['1y', "The last year"],
  ['6m', "The last 6 months"],
  ['3m', "The last 3 months"],
  ['1m', "The last month"],
  ['1w', "The last week"],
]);

const items = ref(possibleValues.flat());

</script>
