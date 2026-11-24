<template>
  <div class="stat-strip-wrap">
    <div class="stat-strip">
      <component
        :is="card.metric ? 'button' : 'div'"
        v-for="card in kpis"
        :key="card.label"
        :type="card.metric ? 'button' : undefined"
        :class="['kpi-card', { selectable: card.metric, selected: card.metric === metric, wide: card.extra }]"
        :aria-pressed="card.metric ? card.metric === metric : undefined"
        @click="card.metric && emit('update:metric', card.metric)">
        <span class="kpi-label">{{ card.label }}</span>
        <span class="kpi-value">{{ card.value }}</span>
        <span class="kpi-detail">{{ card.detail }}</span>
        <span v-if="card.extra" class="kpi-extra">
          <strong>{{ card.extra.label }}: {{ card.extra.value }}</strong>
          <span v-for="line in card.extra.lines" :key="line" class="kpi-extra-line">{{ line }}</span>
        </span>
      </component>
    </div>
  </div>
</template>

<script setup lang="ts" generic="TMetric extends string = string">
export interface KpiCardItem<TMetric extends string = string> {
  label: string;
  value: string;
  detail: string;
  metric?: TMetric;
  extra?: {
    label: string;
    value: string;
    lines: string[];
  };
}

defineProps<{
  kpis: KpiCardItem<TMetric>[];
  metric: TMetric;
}>();

const emit = defineEmits<{
  "update:metric": [metric: TMetric];
}>();
</script>

<style scoped>
.stat-strip-wrap {
  container-type: inline-size;
}

.stat-strip {
  border-bottom: 1px solid var(--line);
  border-top: 1px solid var(--line);
  display: grid;
  gap: 1rem 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  padding: 1rem 0;
}

@container (min-width: 860px) {
  .stat-strip {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .kpi-card.wide {
    grid-column: span 2;
  }
}

.kpi-card {
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.25rem 0 0.5rem;
}

button.kpi-card {
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 0.15s;
}

button.kpi-card:hover {
  border-bottom-color: var(--line-strong);
}

button.kpi-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.kpi-card.selected {
  border-bottom-color: var(--accent);
}

.kpi-card.selected .kpi-label {
  color: var(--accent-ink);
}

.kpi-label {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 500;
}

.kpi-value {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.kpi-detail {
  color: var(--muted);
  font-size: 0.8rem;
}

.kpi-extra {
  color: var(--muted);
  font-size: 0.78rem;
  margin-top: 0.25rem;
}

.kpi-extra-line {
  display: block;
}

.kpi-extra strong {
  color: var(--ink-2);
  display: block;
  font-weight: 550;
}
</style>
