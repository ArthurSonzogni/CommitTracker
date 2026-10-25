<template>
  <div class="timeline">
    <div class="form-row" v-if="more">
      <button type="button" @click="toggleMore" class="button is-small mr-5"> - </button>
      <UiField v-for="year in [year-1, year]" :key="year" :label="year + '-Quarters'">
        <button type="button" v-for="i in 4" :key="i" @click="onQuarterClick(year, i)" class="button is-primary is-rounded mr-1">
          {{'Q' + i}}
        </button>
      </UiField>

      <UiField label="Min">
        <UiDateInput
          :model-value="value[0]"
          @update:model-value="range = [getDateInverse($event), range[1]]"
          :min="minDate"
          :max="maxDate" />
      </UiField>
      <UiField label="Max">
        <UiDateInput
          :model-value="value[1]"
          @update:model-value="range = [range[0], getDateInverse($event)]"
          :min="minDate"
          :max="maxDate" />
      </UiField>
    </div>

    <div class="form-row slider-row" v-if="!more">
      <button type="button" @click="toggleMore" class="button is-small"> + </button>
      <div ref="sliderBox" class="slider-box">
        <UiSlider expanded v-model="range" :min="0" :max="1" :step="0.001" :formatter="formatDate" tooltip-always lazy>
          <UiSliderTick v-for="tick in ticks" :key="tick.label" :value="tick.value">
            {{tick.label}}
          </UiSliderTick>
        </UiSlider>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import { interpolateDate } from "d3-interpolate";
import { chromeMilestoneAt } from "~/utils/chrome-releases";

const props = defineProps({
  minDate: {
    default: new Date("2000-01"),
    type: Date
  },
  maxDate: {
    default: new Date(),
    type: Date
  },
});

const date_pow_factor = 3.0;

const interpolator = (pos) => {
  return interpolateDate(props.minDate, props.maxDate)(Math.pow(pos, 1.0/date_pow_factor));
}
const interpolatorInverse = (date) => {
  const min_date_time = props.minDate.getTime();
  const max_date_time = props.maxDate.getTime();
  const date_time = date.getTime();
  const pos = (date_time - min_date_time) / (max_date_time - min_date_time);
  // Dates outside of the range are clamped, instead of producing NaN.
  return Math.pow(Math.min(1, Math.max(0, pos)), date_pow_factor);
}

const value = defineModel()

const range = ref<Number[]>(value.value.map(interpolatorInverse));
const more = ref<boolean>(false);
const minDate = ref<Date>(props.minDate);
const maxDate = ref<Date>(props.maxDate);
const today = new Date();
const year = ref<number>(today.getFullYear());

let updating_range = false;
let updating_value = false;

watch(range, () => {
  if (updating_value || updating_range) {
    return;
  }
  updating_value = true;
  value.value = range.value.map(interpolator);
  setTimeout(() => {
    updating_value = false;
  }, 1);
})

watch(value, () => {
  if (updating_value || updating_range) {
    return;
  }
  updating_range = true;
  range.value = value.value.map(interpolatorInverse);
  setTimeout(() => {
    updating_range = false;
  }, 1);
})

const toggleMore = () => {
  more.value = !more.value;
}

// The month, and the Chrome milestone on the stable channel then.
const formatDate = (val: number) => {
  const date = interpolator(val);
  const month = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  const milestone = chromeMilestoneAt(date);
  return milestone ? `${month} · M${milestone}` : month;
}

const getDate = (val: number) => {
  return interpolator(val);
}

const getDateInverse = (date: Date) => {
  return interpolatorInverse(date);
}

// The labeled ticks: today, and past years. Only the ones with room for their
// label are kept, so that they don't overlap on narrow screens.
const sliderBox = ref<HTMLElement | null>(null);
const sliderWidth = ref(1000);
let resizeObserver: ResizeObserver | null = null;
watch(sliderBox, (element) => {
  resizeObserver?.disconnect();
  if (element) {
    resizeObserver = new ResizeObserver(() => {
      sliderWidth.value = element.clientWidth;
    });
    resizeObserver.observe(element);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());

const TICK_SPACING = 40;  // px.
const ticks = computed(() => {
  const candidates = [{ value: 1, label: "today" }];
  for (const diff of [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20]) {
    const value = getDateInverse(new Date(year.value - diff + "-01-01"));
    if (value >= 0.1) {
      candidates.push({ value, label: String(year.value - diff) });
    }
  }
  const kept = [];
  for (const tick of candidates) {
    const last = kept[kept.length - 1];
    if (!last || (last.value - tick.value) * sliderWidth.value >= TICK_SPACING) {
      kept.push(tick);
    }
  }
  return kept;
});

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

<style scoped>
.timeline {
   user-select: none;
   /* Room for the slider's always visible tooltips at both ends. */
   padding-left: 40px;
   padding-right: 40px;
}
.slider-row {
  align-items: center;
  flex-wrap: nowrap;
}

.slider-box {
  flex: 1;
  min-width: 0;
}

.timeline :deep(.field) {
  margin-bottom: 0 !important;
}
</style>
