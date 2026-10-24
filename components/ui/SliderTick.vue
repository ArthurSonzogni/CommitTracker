<template>
  <div class="ui-slider-tick" :style="{ left: position + '%' }">
    <span v-if="$slots.default" class="ui-slider-tick-label"><slot /></span>
  </div>
</template>

<script setup lang="ts">
// A tick of <UiSlider>, with an optional label.

const props = defineProps<{ value: number }>();

const slider = inject<{ min: Ref<number>, max: Ref<number> }>("slider");
const position = computed(() => {
  const min = slider?.min.value ?? 0;
  const max = slider?.max.value ?? 100;
  return 100 * (props.value - min) / ((max - min) || 1);
});
</script>

<style scoped>
.ui-slider-tick {
  background: var(--line-strong);
  border-radius: 1px;
  height: 0.35rem;
  pointer-events: none;
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  width: 2px;
}

.ui-slider-tick-label {
  color: var(--muted);
  font-size: 0.7rem;
  left: 50%;
  position: absolute;
  top: 0.75rem;
  transform: translateX(-50%);
  white-space: nowrap;
}
</style>
