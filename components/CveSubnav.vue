<template>
  <nav class="cve-subnav" aria-label="CVE views">
    <div class="container">
      <div class="cve-subnav-links">
        <NuxtLink
          v-for="tab in TABS"
          :key="tab.to"
          :to="tab.to"
          class="cve-tab"
          :class="{ 'is-active': route.path === tab.to }">
          <UiIcon :name="tab.icon" size="small" />
          <span>{{ tab.label }}</span>
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
const route = useRoute();

const TABS = [
  { to: '/cve/overview', label: 'Overview', icon: 'chart-pie' },
  { to: '/cve/list', label: 'List', icon: 'format-list-bulleted' },
  { to: '/cve/pivot-table', label: 'Pivot table', icon: 'table' },
  { to: '/cve/lifespan', label: 'Lifespan & SLA', icon: 'timer-sand' },
  { to: '/cve/reward_per_components', label: 'Rewards by component', icon: 'chart-sankey' },
  { to: '/cve/money-tree', label: 'Money tree', icon: 'currency-usd' },
];
</script>

<style scoped>
.cve-subnav {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.cve-subnav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.45rem 0;
}

.cve-tab {
  align-items: center;
  border-radius: var(--radius-sm);
  color: var(--muted);
  display: inline-flex;
  font-size: 0.85rem;
  font-weight: 520;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  text-decoration: none;
  transition: background 0.14s, color 0.14s;
}

.cve-tab:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.cve-tab.is-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}
</style>
