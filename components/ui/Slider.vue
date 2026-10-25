<template>
  <div
    class="ui-slider"
    :class="{ 'is-disabled': disabled, 'has-ticks': !!$slots.default }">
    <div ref="track" class="ui-slider-track" @pointerdown="onTrackPointerDown">
      <div class="ui-slider-fill" :style="fillStyle" />
      <slot />
      <div
        v-for="(thumb, index) in values"
        :key="index"
        class="ui-slider-thumb-wrapper"
        :style="{ left: percent(thumb) + '%' }">
        <span
          v-if="tooltip && (tooltipAlways || dragging === index || focused === index)"
          class="ui-slider-tooltip">
          {{ format(thumb) }}
        </span>
        <div
          class="ui-slider-thumb"
          :class="{ 'is-dragging': dragging === index }"
          role="slider"
          tabindex="0"
          :aria-label="ariaLabel"
          :aria-valuemin="min"
          :aria-valuemax="max"
          :aria-valuenow="thumb"
          :aria-valuetext="format(thumb)"
          :aria-disabled="disabled"
          @pointerdown.stop="onThumbPointerDown(index, $event)"
          @keydown="onKeydown(index, $event)"
          @focus="focused = index"
          @blur="focused = null">
          <span v-if="indicator" class="ui-slider-indicator">{{ format(thumb) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A slider, for a number, or a range [a, b] with two thumbs. <UiSliderTick>
// children add labeled ticks.

const props = withDefaults(defineProps<{
  min?: number;
  max?: number;
  step?: number;
  // Show the value above the thumb while dragging or focused.
  tooltip?: boolean;
  tooltipAlways?: boolean;
  // Show the value in the thumb.
  indicator?: boolean;
  // Update the model when the drag ends, instead of continuously.
  lazy?: boolean;
  formatter?: (value: number) => string;
  disabled?: boolean;
  ariaLabel?: string;
}>(), {
  min: 0,
  max: 100,
  step: 1,
  tooltip: true,
});

const model = defineModel<number | number[]>();
const emit = defineEmits<{ change: [value: number | number[]] }>();

const isRange = computed(() => Array.isArray(model.value));

const track = ref<HTMLElement | null>(null);
const dragging = ref<number | null>(null);
const focused = ref<number | null>(null);

// The values being displayed, updated while dragging.
const values = ref<number[]>([]);
watch(model, value => {
  if (dragging.value === null) {
    values.value = Array.isArray(value) ? [...value] : [value ?? props.min];
  }
}, { immediate: true });

provide("slider", { min: toRef(props, "min"), max: toRef(props, "max") });

const percent = (value: number) =>
  100 * (value - props.min) / ((props.max - props.min) || 1);

const fillStyle = computed(() => {
  const [start, end] = isRange.value
    ? [Math.min(...values.value), Math.max(...values.value)]
    : [props.min, values.value[0]];
  return {
    left: percent(start) + "%",
    width: (percent(end) - percent(start)) + "%",
  };
});

const format = (value: number) => props.formatter
  ? props.formatter(value)
  : String(value);

// Round to the step, and to the step's precision to avoid floating errors.
const snap = (value: number) => {
  const decimals = (String(props.step).split(".")[1] ?? "").length;
  const snapped = props.min + Math.round((value - props.min) / props.step) * props.step;
  return Number(Math.min(props.max, Math.max(props.min, snapped)).toFixed(decimals));
};

const valueAt = (clientX: number) => {
  const rect = track.value!.getBoundingClientRect();
  const ratio = (clientX - rect.left) / (rect.width || 1);
  return snap(props.min + ratio * (props.max - props.min));
};

const output = () => {
  if (!isRange.value) {
    return values.value[0];
  }
  return [...values.value].sort((a, b) => a - b);
};

const commit = (final: boolean) => {
  if (final || !props.lazy) {
    model.value = output();
  }
  if (final) {
    emit("change", output());
  }
};

const startDrag = (index: number, event: PointerEvent) => {
  if (props.disabled) {
    return;
  }
  dragging.value = index;
  const move = (e: PointerEvent) => {
    values.value[index] = valueAt(e.clientX);
    commit(false);
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    dragging.value = null;
    commit(true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  event.preventDefault();
};

const onThumbPointerDown = (index: number, event: PointerEvent) => {
  startDrag(index, event);
};

// Clicking the track moves the nearest thumb there, and drags it.
const onTrackPointerDown = (event: PointerEvent) => {
  if (props.disabled) {
    return;
  }
  const value = valueAt(event.clientX);
  let index = 0;
  values.value.forEach((v, i) => {
    if (Math.abs(v - value) < Math.abs(values.value[index] - value)) {
      index = i;
    }
  });
  values.value[index] = value;
  commit(false);
  startDrag(index, event);
};

const onKeydown = (index: number, event: KeyboardEvent) => {
  const big = (props.max - props.min) / 10;
  const deltas: Record<string, number> = {
    ArrowLeft: -props.step,
    ArrowDown: -props.step,
    ArrowRight: props.step,
    ArrowUp: props.step,
    PageDown: -big,
    PageUp: big,
  };
  let value = values.value[index];
  if (event.key in deltas) {
    value = snap(value + deltas[event.key]);
  } else if (event.key === "Home") {
    value = props.min;
  } else if (event.key === "End") {
    value = props.max;
  } else {
    return;
  }
  event.preventDefault();
  values.value[index] = value;
  commit(true);
};
</script>

<style scoped>
.ui-slider {
  align-items: center;
  display: flex;
  min-height: 1.5rem;
  padding: 0.6rem 0;
  touch-action: none;
  width: 100%;
}

.ui-slider.has-ticks {
  padding-bottom: 1.6rem;
}

.ui-slider-track {
  background: var(--line);
  border-radius: 999px;
  cursor: pointer;
  height: 0.35rem;
  position: relative;
  width: 100%;
}

.ui-slider-fill {
  background: var(--accent);
  border-radius: 999px;
  height: 100%;
  position: absolute;
  top: 0;
}

.ui-slider-thumb-wrapper {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

.ui-slider-thumb {
  align-items: center;
  background: var(--surface);
  border: 2px solid var(--accent);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  cursor: grab;
  display: flex;
  height: 1.1rem;
  justify-content: center;
  min-width: 1.1rem;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1.4), box-shadow 0.2s;
}

.ui-slider-thumb:hover,
.ui-slider-thumb:focus-visible {
  box-shadow: var(--ring);
  outline: none;
  transform: scale(1.1);
}

.ui-slider-thumb:active {
  cursor: grabbing;
}

/* Lifted while dragged. */
.ui-slider-thumb.is-dragging {
  box-shadow: var(--ring), var(--shadow-lg);
  transform: scale(1.25);
}

.ui-slider-indicator {
  color: var(--ink);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  padding: 0 0.4rem;
  white-space: nowrap;
}

.ui-slider-thumb:has(.ui-slider-indicator) {
  height: 1.5rem;
}

.ui-slider-tooltip {
  background: var(--tooltip-bg);
  border-radius: var(--radius-sm);
  bottom: calc(100% + 0.5rem);
  color: var(--tooltip-ink);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  left: 50%;
  padding: 0.2rem 0.45rem;
  pointer-events: none;
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}

.ui-slider-tooltip::after {
  border: 4px solid transparent;
  border-top-color: var(--tooltip-bg);
  content: "";
  left: 50%;
  margin-left: -4px;
  position: absolute;
  top: 100%;
}

.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
