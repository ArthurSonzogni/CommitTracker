<template>
  <div
    ref="root"
    class="segmented"
    :class="{ 'has-thumb': thumb.visible, 'thumb-animate': thumb.animate }"
    role="radiogroup"
    :aria-label="ariaLabel">
    <span
      v-if="thumb.visible"
      class="segmented-thumb"
      aria-hidden="true"
      :style="{
        width: `${thumb.width}px`,
        height: `${thumb.height}px`,
        transform: `translate(${thumb.left}px, ${thumb.top}px)`,
      }" />
    <label
      v-for="option in normalized"
      :key="String(option.value)"
      class="segmented-option"
      :class="{ 'is-selected': option.value === value, 'is-disabled': option.disabled }"
      :title="option.title">
      <input
        v-model="value"
        type="radio"
        class="visually-hidden-input"
        :name="name"
        :value="option.value"
        :disabled="option.disabled" />
      <UiIcon v-if="option.icon" :name="option.icon" size="small" />
      {{ option.label }}
    </label>
  </div>
</template>

<script setup lang="ts">
// A segmented control with a sliding active thumb.

type Option = { value: any; label: string; icon?: string; title?: string; disabled?: boolean };

const props = defineProps<{
  // {value: label} or [{value, label, icon?, title?, disabled?}].
  options: Record<string, string> | Option[];
  name?: string;
  ariaLabel?: string;
}>();

const value = defineModel<any>();

const normalized = computed<Option[]>(() => Array.isArray(props.options)
  ? props.options
  : Object.entries(props.options).map(([value, label]) => ({ value, label })));

// Radio inputs of a group need a common name.
const name = computed(() => props.name ?? useId());

const root = ref<HTMLElement | null>(null);
const thumb = reactive({
  visible: false,
  animate: false,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
});

const measure = (animate: boolean) => {
  const container = root.value;
  if (!container) return;
  const selected = container.querySelector<HTMLElement>(".segmented-option.is-selected");
  if (!selected || selected.offsetWidth === 0) {
    thumb.visible = false;
    return;
  }
  thumb.animate = animate && thumb.visible;
  thumb.left = selected.offsetLeft;
  thumb.top = selected.offsetTop;
  thumb.width = selected.offsetWidth;
  thumb.height = selected.offsetHeight;
  thumb.visible = true;
};

let ro: ResizeObserver | null = null;
onMounted(() => {
  nextTick(() => measure(false));
  if (root.value && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => measure(false));
    ro.observe(root.value);
  }
});

onBeforeUnmount(() => {
  ro?.disconnect();
});

watch(value, () => {
  nextTick(() => measure(true));
});

watch(normalized, () => {
  nextTick(() => measure(false));
});
</script>
