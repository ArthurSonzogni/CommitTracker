<template>
  <b-field grouped label="Time range:">
    <template v-for="(list, i) in possibleValues" :key="i">
      <b-field class="has-addons">
        <template v-for="item in list" :key="item">
          <b-radio-button
            v-model="value"
            :native-value="item"
            >
            {{ item }}
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
    '1y',
  ],
  [
    '6m',
    '3m',
    '1m',
    '1w',
  ]
];

const items = ref(possibleValues.flat());

</script>
