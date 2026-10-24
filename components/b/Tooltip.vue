<template>
  <span
    class="b-tooltip"
    :class="[position, { 'is-multiline': multilined, 'is-always': always, 'is-dashed': dashed }]"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="hovered = true"
    @focusout="hovered = false">
    <span v-show="active && (hovered || always)" class="tooltip-content" role="tooltip">
      <slot name="content">{{ label }}</slot>
    </span>
    <span class="tooltip-trigger"><slot /></span>
  </span>
</template>

<script setup lang="ts">
// A tooltip over its content, on hover and focus. Compatible with Buefy's
// <b-tooltip>.

withDefaults(defineProps<{
  label?: string;
  // is-top, is-bottom, is-left, is-right.
  position?: string;
  type?: string;
  multilined?: boolean;
  always?: boolean;
  dashed?: boolean;
  active?: boolean;
}>(), {
  position: "is-top",
  active: true,
});

const hovered = ref(false);
</script>

<style scoped>
.b-tooltip {
  display: inline-flex;
  position: relative;
}

.tooltip-content {
  background: var(--tooltip-bg);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  color: var(--tooltip-ink);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  padding: 0.3rem 0.55rem;
  pointer-events: none;
  position: absolute;
  text-align: center;
  white-space: nowrap;
  z-index: 38;
}

.is-multiline .tooltip-content {
  white-space: normal;
  width: 18rem;
}

/* The arrow. */
.tooltip-content::before {
  border: 5px solid transparent;
  content: "";
  position: absolute;
}

.is-top .tooltip-content {
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
}

.is-top .tooltip-content::before {
  border-top-color: var(--tooltip-bg);
  left: 50%;
  margin-left: -5px;
  top: 100%;
}

.is-bottom .tooltip-content {
  left: 50%;
  top: calc(100% + 8px);
  transform: translateX(-50%);
}

.is-bottom .tooltip-content::before {
  border-bottom-color: var(--tooltip-bg);
  bottom: 100%;
  left: 50%;
  margin-left: -5px;
}

.is-left .tooltip-content {
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}

.is-left .tooltip-content::before {
  border-left-color: var(--tooltip-bg);
  left: 100%;
  margin-top: -5px;
  top: 50%;
}

.is-right .tooltip-content {
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}

.is-right .tooltip-content::before {
  border-right-color: var(--tooltip-bg);
  margin-top: -5px;
  right: 100%;
  top: 50%;
}

.is-dashed .tooltip-trigger {
  border-bottom: 1px dashed currentColor;
  cursor: help;
}
</style>
