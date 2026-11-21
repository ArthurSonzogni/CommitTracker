<template>
  <section class="panel">
    <div>
      <h2 class="panel-title">The largest organizations</h2>
      <p class="panel-text">
        The {{ organizationCount }} organizations with the most active
        authors over the last 12 months: {{ currentWindowLabel }} against
        {{ previousWindowLabel }}, and the same change in the usual years
        ({{ usualLabel }}). With fewer than {{ minCompared }} people active in both years,
        an organization is too small to measure. Select one to see it in detail.
      </p>
    </div>
    <div class="table-scroll">
      <table class="organizations">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Active authors a month</th>
            <th>Commits per author</th>
            <th>Commits by the same people</th>
            <th>Lines per commit</th>
            <th v-if="hasMsg">Message length</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.label"
            :class="{ small: !row.measured, selected: row.selected }">
            <th scope="row">
              <button
                v-if="row.group"
                type="button"
                class="row-link"
                :title="`Show ${row.label}`"
                @click="emit('select', row.group)">
                {{ row.label }}
              </button>
              <template v-else>{{ row.label }}</template>
            </th>
            <td>
              <span v-if="row.authors" class="figure">{{ row.authors }}</span>
              <span class="cell-detail">{{ row.authorsDetail }}</span>
            </td>
            <template v-if="row.measured">
              <td>
                <span class="figure">{{ row.perAuthor }}</span>
                <span class="cell-detail">{{ row.perAuthorDetail }} a month</span>
                <span class="cell-usual">{{ row.usual.perAuthor }}</span>
              </td>
              <td>
                <span class="figure">{{ row.same }}</span>
                <span class="cell-detail">{{ row.people }} people</span>
                <span class="cell-usual">{{ row.usual.same }}</span>
              </td>
              <td>
                <span class="figure">{{ row.lines }}</span>
                <span class="cell-detail">{{ row.linesDetail }} lines</span>
                <span class="cell-usual">{{ row.usual.lines }}</span>
              </td>
              <td v-if="hasMsg">
                <span class="figure">{{ row.msg }}</span>
                <span class="cell-detail">{{ row.msgDetail }} chars</span>
                <span class="cell-usual">{{ row.usual.msg }}</span>
              </td>
            </template>
            <td v-else :colspan="hasMsg ? 4 : 3" class="too-few">
              Too few people to measure ({{ row.people }} active in both years)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface ReportOrgRow {
  label: string;
  group?: string;
  selected: boolean;
  measured: boolean;
  authors?: string;
  authorsDetail?: string;
  perAuthor?: string;
  perAuthorDetail?: string;
  same?: string;
  people?: number | string;
  lines?: string;
  linesDetail?: string;
  msg?: string;
  msgDetail?: string;
  usual: {
    perAuthor?: string;
    same?: string;
    lines?: string;
    msg?: string;
  };
}

defineProps<{
  rows: ReportOrgRow[];
  organizationCount: number;
  currentWindowLabel: string;
  previousWindowLabel: string;
  usualLabel: string;
  minCompared: number;
  hasMsg?: boolean;
}>();

const emit = defineEmits<{
  select: [group: string];
}>();
</script>

<style scoped>
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  align-content: start;
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding: 1.1rem 1.2rem;
}

.panel-title {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 640;
  margin-bottom: 0.15rem;
  text-wrap: balance;
}

.panel-text {
  color: var(--muted);
  font-size: 0.86rem;
  max-width: 85ch;
}

.table-scroll {
  overflow-x: auto;
}

.organizations {
  border-collapse: collapse;
  font-size: 0.86rem;
  min-width: 540px;
  width: 100%;
}

.organizations th,
.organizations td {
  border-bottom: 1px solid var(--line);
  padding: 0.4rem 0.6rem;
  text-align: right;
  white-space: nowrap;
}

.organizations thead th {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  vertical-align: bottom;
  white-space: normal;
}

.organizations th:first-child {
  text-align: left;
  background: var(--surface);
  left: 0;
  position: sticky;
}

.organizations tr.selected th:first-child {
  background: var(--surface-sunken);
}

.organizations tbody th {
  font-weight: 600;
}

.organizations td {
  font-variant-numeric: tabular-nums;
}

.organizations .figure {
  display: block;
  font-weight: 640;
}

.organizations tr.selected {
  background: var(--surface-sunken);
}

.organizations tr.small th,
.organizations tr.small td {
  color: var(--muted);
  font-weight: 400;
}

.organizations .too-few {
  font-size: 0.78rem;
  font-style: italic;
  text-align: left;
}

.cell-usual {
  color: var(--muted);
  font-style: italic;
  display: block;
  font-size: 0.72rem;
}

.row-link {
  background: none;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}

.row-link:hover,
.row-link:focus-visible {
  text-decoration: underline;
}

.cell-detail {
  color: var(--muted);
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
}
</style>
