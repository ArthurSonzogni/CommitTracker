<template>
  <a
    class="dropdown-item"
    role="option"
    tabindex="0"
    :aria-selected="selected"
    :class="{ 'is-active': selected }"
    @click="dropdown?.select(value)"
    @keydown.enter.prevent="dropdown?.select(value)">
    <slot />
  </a>
</template>

<script setup lang="ts">
// An item of <UiDropdown>.

const props = defineProps<{ value?: any }>();

const dropdown = inject<{ value: Ref<any>, select: (value: any) => void } | null>("dropdown", null);
const selected = computed(() => props.value !== undefined && dropdown?.value.value === props.value);
</script>
