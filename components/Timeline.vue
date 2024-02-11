<template>
  <b-slider
    v-model="range"
    :min="0"
    :max="1.1"
    :step="0.001"
    :custom-formatter="formatDate"
    rounded
    tooltip-always
    lazy
    >
    <b-slider-tick :value="1">today</b-slider-tick>
  </b-slider>
</template>

<script>

import { interpolateDate } from "d3-interpolate";
const min_date = new Date("2000-01");
const max_date = new Date();
const interpolator = interpolateDate(min_date, max_date);
const interpolatorInverse = (date) => {
  const min_date_time = min_date.getTime();
  const max_date_time = max_date.getTime();
  const date_time = date.getTime();
  return (date_time - min_date_time) / (max_date_time - min_date_time);
}

const getDate = (val) => interpolator(Math.pow(val, 0.42));
const getDateInverse = (date) => Math.pow(interpolatorInverse(date), 2.38);

export default {
  props: {
      value: { type: Array[Date], required: true },
  },
  data() {
    return {
      range: this.value.map(getDateInverse),
    }
  },
  methods: {
    formatDate(val) {
      const date = getDate(val);
      return date.getFullYear() + "-" + (date.getMonth() + 1);
    }
  },
  watch: {
    range(newRange) {
        const startDate = structuredClone(getDate(newRange[0]));
        const endDate = structuredClone(getDate(newRange[1]));
        this.$emit("input", [startDate, endDate]);
    }
  },
}

</script>
