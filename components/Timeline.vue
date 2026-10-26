<template>
  <div class="timeline">
    <div class="form-row quarter-row" v-if="more">
      <button type="button" @click="toggleMore" class="button is-small toggle" title="Back to the slider" aria-label="Back to the slider">
        <UiIcon name="tune-variant" size="small" />
      </button>
      <UiField :label="anchor === null ? 'Click a quarter, or two for a range' : 'Click the end of the range'" expanded>
        <div ref="strip" class="quarter-strip" @pointerleave="hovered = null">
          <div v-for="y in years" :key="y" class="quarter-year">
            <button
              type="button"
              class="quarter-year-label"
              :title="'Select ' + y"
              @click="onYearClick(y)">
              {{y}}
            </button>
            <button
              v-for="q in 4"
              :key="q"
              type="button"
              class="quarter-cell"
              :class="['is-' + quarterState(4 * y + q - 1), { 'is-anchor': anchor === 4 * y + q - 1 }]"
              :disabled="!isSelectable(4 * y + q - 1)"
              :aria-pressed="quarterState(4 * y + q - 1) === 'full'"
              :title="quarterTitle(4 * y + q - 1)"
              @pointerenter="hovered = 4 * y + q - 1"
              @click="onQuarterClick(4 * y + q - 1)">
              Q{{q}}
            </button>
          </div>
        </div>
      </UiField>
      <UiField label="Min">
        <UiDateInput
          :model-value="value[0]"
          @update:model-value="value = [$event, value[1]]"
          :min="minDate"
          :max="maxDate" />
      </UiField>
      <UiField label="Max">
        <UiDateInput
          :model-value="value[1]"
          @update:model-value="value = [value[0], $event]"
          :min="minDate"
          :max="maxDate" />
      </UiField>
    </div>

    <div class="form-row slider-row" v-if="!more">
      <button type="button" @click="toggleMore" class="button is-small toggle" title="Select quarters or dates" aria-label="Select quarters or dates">
        <UiIcon name="calendar-range" size="small" />
      </button>
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
const minDate = ref<Date>(props.minDate);
const maxDate = ref<Date>(props.maxDate);
const today = new Date();
const year = ref<number>(today.getFullYear());
const more = ref<boolean>(false);

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

const toggleMore = () => {
  more.value = !more.value;
  anchor.value = null;
}

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

// The quarter strip. A quarter is identified by 4 * year + (0..3).
const quarterStart = (quarter: number) => {
  return new Date(Math.floor(quarter / 4), (quarter % 4) * 3);
}
const quarterEnd = (quarter: number) => {
  return new Date(Math.min(quarterStart(quarter + 1).getTime(), maxDate.value.getTime()));
}
const quarterOf = (date: Date) => {
  return 4 * date.getFullYear() + Math.floor(date.getMonth() / 3);
}

const years = computed(() => {
  const list = [];
  for (let y = minDate.value.getFullYear(); y <= maxDate.value.getFullYear(); ++y) {
    list.push(y);
  }
  return list;
});

const isSelectable = (quarter: number) => {
  return quarter >= quarterOf(minDate.value) && quarter <= quarterOf(maxDate.value);
}

const selectQuarters = (a: number, b: number) => {
  const first = Math.max(Math.min(a, b), quarterOf(minDate.value));
  const last = Math.min(Math.max(a, b), quarterOf(maxDate.value));
  const start = new Date(Math.max(quarterStart(first).getTime(), minDate.value.getTime()));
  value.value = [start, quarterEnd(last)];
}

// Dates can be off by a few hours (time zones) or days (the slider's
// resolution), so they are compared with some tolerance.
const TOLERANCE = 2 * 24 * 60 * 60 * 1000;  // ms.

// The start of a range being selected, waiting for a click on its end, and
// the quarter under the pointer, to preview the range.
const anchor = ref<number | null>(null);
const hovered = ref<number | null>(null);

const quarterState = (quarter: number) => {
  if (anchor.value !== null && hovered.value !== null) {
    return Math.min(anchor.value, hovered.value) <= quarter &&
      quarter <= Math.max(anchor.value, hovered.value) ? "preview" : "none";
  }
  const start = Math.max(quarterStart(quarter).getTime(), minDate.value.getTime());
  const end = quarterEnd(quarter).getTime();
  const from = value.value[0].getTime();
  const to = value.value[1].getTime();
  if (from <= start + TOLERANCE && to >= end - TOLERANCE) {
    return "full";
  }
  if (Math.min(to, end) - Math.max(from, start) > TOLERANCE) {
    return "partial";
  }
  return "none";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const quarterTitle = (quarter: number) => {
  const month = (quarter % 4) * 3;
  return `${Math.floor(quarter / 4)} Q${quarter % 4 + 1} ` +
    `(${MONTHS[month]}–${MONTHS[month + 2]})`;
}

// A first click selects a quarter, and a second one extends it into a range.
const onQuarterClick = (quarter: number) => {
  if (anchor.value === null) {
    anchor.value = quarter;
    selectQuarters(quarter, quarter);
    return;
  }
  selectQuarters(anchor.value, quarter);
  anchor.value = null;
}

const onYearClick = (y: number) => {
  anchor.value = null;
  selectQuarters(4 * y, 4 * y + 3);
}

// Show the most recent quarters first.
const strip = ref<HTMLElement | null>(null);
watch(strip, (element) => {
  if (element) {
    element.scrollLeft = element.scrollWidth;
  }
});

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

.quarter-row {
  flex-wrap: nowrap;
}
@media (max-width: 768px) {
  .quarter-row {
    flex-wrap: wrap;
  }
}
.quarter-row > .ui-field.is-expanded {
  min-width: 0;
}

.toggle {
  flex-shrink: 0;
}
.quarter-row .toggle {
  align-self: flex-end;
}

.quarter-strip {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 3px 3px 0.25rem;
  scrollbar-width: thin;
}

.quarter-year {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
}

.quarter-year-label {
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0 0.2rem;
}
.quarter-year-label:hover {
  color: var(--ink);
}

.quarter-cell {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  cursor: pointer;
  font-size: 0.75rem;
  min-width: 2.1rem;
  padding: 0.2rem 0;
}
.quarter-cell:hover:not(:disabled) {
  border-color: var(--accent);
}
.quarter-cell.is-full {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.quarter-cell.is-partial {
  background: linear-gradient(to top, var(--accent-line) 50%, var(--surface) 50%);
  border-color: var(--accent-line);
}
.quarter-cell.is-preview {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.quarter-cell.is-anchor {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.quarter-cell:disabled {
  cursor: default;
  opacity: 0.35;
}
.quarter-year-label:focus-visible,
.quarter-cell:focus-visible {
  box-shadow: var(--ring);
  outline: none;
}

</style>
