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
          <span v-if="route.path === tab.to" class="cve-tab-pill" aria-hidden="true" />
          <UiIcon :name="tab.icon" size="small" class="cve-tab-content" />
          <span class="cve-tab-content">{{ tab.label }}</span>
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
  position: relative;
  text-decoration: none;
  transition: background 0.14s, color 0.14s;
}

.cve-tab-pill {
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  bottom: -0.45rem;
  height: 2.5px;
  left: 0.4rem;
  pointer-events: none;
  position: absolute;
  right: 0.4rem;
  view-transition-name: cve-active-tab;
  z-index: 2;
}

.cve-tab-content {
  position: relative;
  z-index: 1;
}

.cve-tab:hover:not(.is-active) {
  background: var(--surface-sunken);
  color: var(--ink);
}

.cve-tab.is-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}
</style>
