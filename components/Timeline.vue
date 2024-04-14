<template>
  <div>

    <b-field grouped v-if="!more">
      <b-button @click="more=true" class="mr-5" size="is-small">+</b-button>
      <b-slider
        v-if="!more"
        expanded
        v-model="range"
        :min="0"
        :max="1.1"
        :step="0.001"
        :custom-formatter="formatDate"
        rounded
        tooltip-always
        lazy
        >
        <b-slider-tick :value="getDateInverse(new Date(year-11 + '-01-01'))">{{year-11}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-7 + '-01-01'))">{{year-7}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-4 + '-01-01'))">{{year-4}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-2 + '-01-01'))">{{year-2}}</b-slider-tick>
        <b-slider-tick :value="getDateInverse(new Date(year-1 + '-01-01'))">{{year-1}}</b-slider-tick>
        <b-slider-tick :value="1">today</b-slider-tick>
      </b-slider>
    </b-field>

    <b-field grouped v-if="more">
      <b-button @click="more=false" class="mr-5" size="is-small">-</b-button>
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
      <b-field
        v-for="year in [year-1, year]"
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
    </b-field>
  </div>
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

export default {
  props: {
    value: { type: Array[Date], required: true },
  },
  data() {
    return {
      range: this.value.map(this.getDateInverse),
      more: false,
      minDate: new Date("2000-01"),
      maxDate: new Date(new Date().getFullYear() + 4 + "-01"),
      year: new Date().getFullYear(),
    }
  },
  methods: {
    formatDate(val) {
      const date = this.getDate(val);
      return date.getFullYear() + "-" + (date.getMonth() + 1);
    },
    getDate(val) {
      return interpolator(Math.pow(val, 0.42));
    },
    getDateInverse(date) {
      return Math.pow(interpolatorInverse(date), 2.38);
    },

    isQuarterSelected(year_quarter) {
      const year = Math.floor(year_quarter / 4);
      const quarter = year_quarter % 4;
      const startDate = new Date(year, (quarter-1)*3);
      const endDate = new Date(year, (quarter-1)*3 + 3);
      return this.range[0] <= this.getDateInverse(startDate) && this.range[1] >= this.getDateInverse(endDate);
    },

    onQuarterClick(year, quarter) {
      const startDate = new Date(year, (quarter-1)*3);
      const endDate = new Date(year, (quarter-1)*3 + 3);

      if (!this.isQuarterSelected(4*year+quarter)) {
        this.range = [
          Math.min(this.range[0], this.getDateInverse(startDate)),
          Math.max(this.range[1], this.getDateInverse(endDate))
        ];
        return;
      }

      const yearquarter_left = 4*year+quarter-1;
      const yearquarter_right = 4*year+quarter+1;

      if (this.isQuarterSelected(yearquarter_left) && this.isQuarterSelected(yearquarter_right)) {
        this.range = [this.getDateInverse(startDate), this.getDateInverse(endDate)];
        return;
      }

      if (this.isQuarterSelected(yearquarter_left)) {
        console.log("left selected");
        const left_year = Math.floor(yearquarter_left / 4);
        const left_quarter = yearquarter_left % 4;
        const left_endDate = new Date(left_year, (left_quarter-1)*3 + 3);
        this.range = [this.range[0], this.getDateInverse(left_endDate)];
        return;
      }

      if (this.isQuarterSelected(yearquarter_right)) {
        console.log("right selected");
        const right_year = Math.floor(yearquarter_right / 4);
        const right_quarter = yearquarter_right % 4;
        const right_startDate = new Date(right_year, (right_quarter-1)*3);
        this.range = [this.getDateInverse(right_startDate), this.range[1]];
        return;
      }

      console.log("none selected");
      this.range = [this.getDateInverse(startDate), this.getDateInverse(endDate)];
    }
  },
  watch: {
    range(newRange) {
      const startDate = structuredClone(this.getDate(newRange[0]));
      const endDate = structuredClone(this.getDate(newRange[1]));
      this.$emit("input", [startDate, endDate]);
    }
  },
}

</script>
