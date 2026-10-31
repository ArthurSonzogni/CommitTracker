<template>
  <div class="chip-selector">
    <slot name="leading" />

    <div
      ref="trackRef"
      class="fields chip-track"
      :class="{ 'is-multiple': multiple }">
      <UiToggle
        v-for="item in items"
        :key="item.id"
        :model-value="selectedSet.has(item.id)"
        @update:model-value="toggle(item.id)">
        <slot name="chip" :item="item">
          <UiIcon v-if="item.icon" :name="item.icon" size="small" />
          {{ item.label }}
        </slot>
      </UiToggle>
    </div>

    <div v-if="allowAll || allowMultiple || $slots.default" class="options">
      <UiCheckbox
        v-if="allowAll"
        name="all"
        :model-value="isAllSelected"
        @update:model-value="toggleAll">
        All
      </UiCheckbox>
      <UiCheckbox
        v-if="allowMultiple"
        name="multiple"
        v-model="multiple">
        Multiple
      </UiCheckbox>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
export interface ChipItem {
  id: string;
  label: string;
  icon?: string;
}

const props = withDefaults(defineProps<{
  items: ChipItem[];
  allIds?: string[];
  allowMultiple?: boolean;
  allowAll?: boolean;
  scrollSelectedIntoView?: boolean;
}>(), {
  allowMultiple: false,
  allowAll: false,
  scrollSelectedIntoView: false,
});

const selected = defineModel<string[]>({ default: () => [] });

const multiple = ref((selected.value?.length ?? 0) > 1 && props.allowMultiple);

watch(
  () => selected.value?.length ?? 0,
  (len) => {
    if (len > 1 && props.allowMultiple) {
      multiple.value = true;
    }
  },
);

const selectedSet = computed(() => new Set(selected.value ?? []));

const effectiveAllIds = computed(() =>
  props.allIds ?? props.items.map((item) => item.id),
);

const isAllSelected = computed(() => {
  const ids = effectiveAllIds.value;
  if (ids.length === 0) return false;
  return (
    ids.length === (selected.value?.length ?? 0) &&
    ids.every((id) => selectedSet.value.has(id))
  );
});

const toggle = (id: string) => {
  if (!multiple.value) {
    selected.value = [id];
    return;
  }
  const next = [...(selected.value ?? [])];
  const idx = next.indexOf(id);
  if (idx === -1) {
    next.push(id);
  } else {
    next.splice(idx, 1);
  }
  selected.value = next.sort();
};

const toggleAll = (checked: boolean) => {
  if (checked) {
    multiple.value = props.allowMultiple;
    selected.value = [...effectiveAllIds.value];
  } else {
    if (!props.allowMultiple) {
      multiple.value = false;
    }
    selected.value = [];
  }
};

// Scroll the first selected chip into view on mount without scrolling the page.
const trackRef = ref<HTMLElement | null>(null);
onMounted(() => {
  if (!props.scrollSelectedIntoView) return;
  const container = trackRef.value;
  const firstSelected = container?.querySelector(".is-selected") as HTMLElement | null;
  if (container && firstSelected && firstSelected !== container.firstElementChild) {
    requestAnimationFrame(() => {
      if (trackRef.value && firstSelected.isConnected) {
        trackRef.value.scrollLeft = firstSelected.offsetLeft - 24;
      }
    });
  }
});
</script>

<style scoped>
.chip-selector {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.options {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 1rem;
}
</style>
