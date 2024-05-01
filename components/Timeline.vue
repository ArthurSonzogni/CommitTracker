<template>
  <div>
    <b-field grouped v-if="more">
      <b-button @click="toggleMore" class="mr-5" size="is-small"> - </b-button>
      <b-field
        v-for="year in [year-1, year]"
        :key="year"
        :label="year + '-Quarters'">
        <b-button
          v-for="i in 4"
          :key="i"
          @click="onQuarterClick(year, i)"
          :inverted="!isQuarterSelected(4*year+i)"
          type="is-primary"
          class="mr-1"
          rounded
          >
          {{'Q' + i}}
        </b-button>
      </b-field>

      <b-field label="Min">
        <b-datepicker
          position="is-top-left"
          :value="value[0]"
          @input="range[0] = getDateInverse($event)"
          :min-date="minDate"
          :max-date="maxDate"
          ></b-datepicker>
      </b-field>
      <b-field label="Max">
        <b-datepicker
          position="is-top-left"
          :value="value[1]"
          @input="range[1] = getDateInverse($event)"
          :min-date="minDate"
          :max-date="maxDate"
          ></b-datepicker>
      </b-field>
    </b-field>

    <b-field grouped v-if="!more">
      <b-button @click="toggleMore" class="mr-5" size="is-small"> + </b-button>
      <b-slider
        expanded
        v-model="range"
        :min="0"
        :max="1"
        :step="0.001"
        :custom-formatter="formatDate"
        rounded
        tooltip-always
        lazy
        >
        <b-slider-tick :value="getDateInverse(new Date(year-8 + '-01-01'))">{{year-8}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-5 + '-01-01'))">{{year-5}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-3 + '-01-01'))">{{year-3}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-2 + '-01-01'))">{{year-2}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-1 + '-01-01'))">{{year-1}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-0 + '-01-01'))">{{year-0}}</b-slider-tick>
        <b-slider-tick :value="1">today</b-slider-tick>
      </b-slider>
    </b-field>

  </div>
</template>

<script setup lang="ts">

import { interpolateDate } from "d3-interpolate";

const min_date = new Date("2000-01");
const max_date = new Date();
const date_pow_factor = 3.0;

const interpolator = (pos) => {
  return interpolateDate(min_date, max_date)(Math.pow(pos, 1.0/date_pow_factor));
}
const interpolatorInverse = (date) => {
  const min_date_time = min_date.getTime();
  const max_date_time = max_date.getTime();
  const date_time = date.getTime();
  const pos = (date_time - min_date_time) / (max_date_time - min_date_time);
  return Math.pow(pos, date_pow_factor);
}

const value = defineModel()

const range = ref<Number[]>(value.value.map(interpolatorInverse));
const more = ref<boolean>(false);
const minDate = ref<Date>(min_date);
const maxDate = ref<Date>(max_date);
const today = new Date();
const year = ref<number>(new Date(today.getFullYear(), today.getMonth()-4).getFullYear());

watch(range, () => {
  value.value = range.value.map(interpolator);
})

const toggleMore = () => {
  more.value = !more.value;
}

const formatDate = (val: number) => {
  const date = interpolator(val);
  return date.getFullYear() + "-" + (date.getMonth() + 1);
}

const getDate = (val: number) => {
  return interpolator(val);
}

const getDateInverse = (date: Date) => {
  return interpolatorInverse(date);
}

const isQuarterSelected = (year_quarter: number) => {
  const year = Math.floor(year_quarter / 4);
  const quarter = year_quarter % 4;
  const startDate = new Date(year, (quarter-1)*3);
  const endDate = new Date(year, (quarter-1)*3 + 3);
  return range.value[0] <= getDateInverse(startDate) &&
    range.value[1] >= getDateInverse(endDate);
}

const onQuarterClick = (year: number, quarter: number) => {
  const startDate = new Date(year, (quarter-1)*3);
  const endDate = new Date(year, (quarter-1)*3 + 3);

  if (!isQuarterSelected(4*year+quarter)) {
    range.value = [
      Math.min(range.value[0], getDateInverse(startDate)),
      Math.max(range.value[1], getDateInverse(endDate))
    ];
    return;
  }

  const yearquarter_left = 4*year+quarter-1;
  const yearquarter_right = 4*year+quarter+1;

  if (isQuarterSelected(yearquarter_left) && isQuarterSelected(yearquarter_right)) {
    range.value = [getDateInverse(startDate), getDateInverse(endDate)];
    return;
  }

  if (isQuarterSelected(yearquarter_left)) {
    const left_year = Math.floor(yearquarter_left / 4);
    const left_quarter = yearquarter_left % 4;
    const left_endDate = new Date(left_year, (left_quarter-1)*3 + 3);
    range.value = [range.value[0], getDateInverse(left_endDate)];
    return;
  }

  if (isQuarterSelected(yearquarter_right)) {
    const right_year = Math.floor(yearquarter_right / 4);
    const right_quarter = yearquarter_right % 4;
    const right_startDate = new Date(right_year, (right_quarter-1)*3);
    range.value = [getDateInverse(right_startDate), range.value[1]];
    return;
  }

  range.value = [getDateInverse(startDate), getDateInverse(endDate)];
}

</script>
