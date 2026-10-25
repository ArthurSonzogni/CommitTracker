<template>
  <span
    class="ui-tooltip"
    :class="[`is-${position}`, { 'is-multiline': multiline, 'is-dashed': dashed }]"
    :style="popover ? { anchorName } : undefined"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="hovered = true"
    @focusout="hovered = false">
    <span
      v-show="popover || hovered"
      ref="content"
      class="tooltip-content"
      role="tooltip"
      :popover="popover ? 'manual' : undefined"
      :style="popover ? { positionAnchor: anchorName } : undefined">
      <slot name="content">{{ text }}</slot>
    </span>
    <span class="tooltip-trigger"><slot /></span>
  </span>
</template>

<script setup lang="ts">
import { anchorSupported, uniqueAnchorName } from "~/utils/anchor";

// A tooltip over its content, on hover and focus.

withDefaults(defineProps<{
  text?: string;
  position?: "top" | "bottom" | "left" | "right";
  multiline?: boolean;
  // Underline the content, hinting at the tooltip.
  dashed?: boolean;
}>(), {
  position: "top",
});

const hovered = ref(false);
const content = ref<HTMLElement | null>(null);
const popover = anchorSupported();
const anchorName = uniqueAnchorName();

watch(hovered, (value) => {
  if (popover && content.value) {
    content.value.togglePopover(value);
  }
});
</script>

<style scoped>
.ui-tooltip {
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

/* As a popover, in the top layer, tethered to the trigger. */
.ui-tooltip .tooltip-content:popover-open {
  border: none;
  inset: auto;
  margin: 0;
  overflow: visible;
  position: fixed;
  transform: none;
}

.ui-tooltip.is-top .tooltip-content:popover-open {
  margin-bottom: 8px;
  position-area: top;
}

.ui-tooltip.is-bottom .tooltip-content:popover-open {
  margin-top: 8px;
  position-area: bottom;
}

.ui-tooltip.is-left .tooltip-content:popover-open {
  margin-right: 8px;
  position-area: left;
}

.ui-tooltip.is-right .tooltip-content:popover-open {
  margin-left: 8px;
  position-area: right;
}

.is-dashed .tooltip-trigger {
  border-bottom: 1px dashed currentColor;
  cursor: help;
}
</style>
