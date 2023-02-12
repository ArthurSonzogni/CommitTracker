<template>
    <b-slider
        v-model="dates"
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
const interpolator = interpolateDate(new Date("2000-01"), new Date());
const getDate = (val) => interpolator(Math.pow(val, 0.42));

export default {
    data() {
        return {
            dates : [0.1, 1],
        }
    },
    methods: {
        formatDate(val) {
            const date = getDate(val);
            return date.getFullYear() + "-" + (date.getMonth() + 1);
        }
    },
    watch: {
        dates(newDates) {
            this.$emit('change',
                new Date(getDate(newDates[0])),
                new Date(getDate(newDates[1])),
            );
        }
    },
}

</script>
