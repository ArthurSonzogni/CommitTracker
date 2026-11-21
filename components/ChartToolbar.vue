<template>
  <div class="chart-toolbar" role="toolbar" aria-label="Export chart">
    <button
      v-if="hasSvg"
      type="button"
      class="chart-tool-btn"
      title="Download PNG"
      aria-label="Download chart as PNG"
      @click="$emit('export-png')">
      <UiIcon name="image-outline" size="small" />
      <span>PNG</span>
    </button>
    <button
      v-if="hasSvg"
      type="button"
      class="chart-tool-btn"
      title="Download SVG"
      aria-label="Download chart as SVG"
      @click="$emit('export-svg')">
      <UiIcon name="file-code-outline" size="small" />
      <span>SVG</span>
    </button>
    <button
      v-if="hasCsv"
      type="button"
      class="chart-tool-btn"
      title="Download CSV"
      aria-label="Download data as CSV"
      @click="$emit('export-csv')">
      <UiIcon name="table-arrow-down" size="small" />
      <span>CSV</span>
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  hasSvg?: boolean;
  hasCsv?: boolean;
}>(), {
  hasSvg: true,
  hasCsv: true,
});

defineEmits<{
  "export-png": [];
  "export-svg": [];
  "export-csv": [];
}>();
</script>

<style scoped>
.chart-toolbar {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(6px);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: inline-flex;
  gap: 0.15rem;
  opacity: 0.25;
  padding: 0.15rem;
  position: absolute;
  right: 0.5rem;
  top: 0.35rem;
  transition: opacity 0.18s ease, box-shadow 0.18s ease;
  z-index: 6;
}

.chart-toolbar:hover,
.chart-toolbar:focus-within,
:hover > .chart-toolbar {
  box-shadow: var(--shadow-xs);
  opacity: 1;
}

.chart-tool-btn {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 560;
  gap: 0.22rem;
  padding: 0.2rem 0.42rem;
  transition: background 0.12s, color 0.12s;
}

.chart-tool-btn:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

@media (hover: none) {
  .chart-toolbar {
    opacity: 0.85;
  }
}
</style>
