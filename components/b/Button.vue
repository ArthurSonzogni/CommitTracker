<template>
  <component
    :is="component"
    class="button"
    :class="[type, size, {
      'is-rounded': rounded,
      'is-outlined': outlined,
      'is-inverted': inverted,
      'is-fullwidth': expanded,
      'is-loading': loading,
    }]"
    :to="tag === 'router-link' ? to : undefined"
    :href="tag === 'a' ? href : undefined"
    :type="tag === 'button' ? nativeType : undefined"
    :disabled="disabled || undefined">
    <BIcon v-if="iconLeft" :icon="iconLeft" :size="iconSize" />
    <span v-if="label">{{ label }}</span>
    <span v-else-if="$slots.default"><slot /></span>
    <BIcon v-if="iconRight" :icon="iconRight" :size="iconSize" />
  </component>
</template>

<script setup lang="ts">
// A button. Compatible with Buefy's <b-button>.
import { NuxtLink } from '#components'

const props = withDefaults(defineProps<{
  // is-primary, is-info, is-light, ...
  type?: string;
  size?: string;
  label?: string;
  iconLeft?: string;
  iconRight?: string;
  // button, a, router-link.
  tag?: string;
  to?: string | object;
  href?: string;
  nativeType?: string;
  disabled?: boolean;
  rounded?: boolean;
  outlined?: boolean;
  inverted?: boolean;
  expanded?: boolean;
  loading?: boolean;
}>(), {
  tag: "button",
  nativeType: "button",
});

const component = computed(() => props.tag === "router-link" ? NuxtLink : props.tag);
const iconSize = computed(() => props.size === "is-large" ? "is-medium" : "is-small");
</script>
