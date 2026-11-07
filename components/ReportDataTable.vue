<template>
  <!-- The numbers behind a chart, folded by default. -->
  <details class="report-data">
    <summary>
      <UiIcon name="table" size="small" />
      Show data
    </summary>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, k) in rows" :key="k">
            <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>

<script setup lang="ts">
defineProps<{
  columns: string[];
  // Formatted cells; the first column is a label, the others are numbers.
  rows: (string | number)[][];
}>();
</script>

<style scoped>
.report-data summary {
  align-items: center;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.8rem;
  gap: 0.3rem;
}

.report-data summary:hover {
  color: var(--ink-2);
}

.table-wrap {
  margin-top: 0.5rem;
  max-height: 320px;
  overflow: auto;
}

table {
  border-collapse: collapse;
  font-size: 0.8rem;
  width: 100%;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 0.3rem 0.6rem;
  text-align: right;
  white-space: nowrap;
}

th:first-child,
td:first-child {
  text-align: left;
}

th {
  background: var(--surface);
  color: var(--muted);
  font-weight: 600;
  position: sticky;
  top: 0;
}

td {
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
</style>
