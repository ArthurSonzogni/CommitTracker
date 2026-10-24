<template>
  <div class="site-header">
    <img
      async
      style="position: absolute; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none;"
      alt=""
      src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fchrome-commit-tracker.arthursonzogni.com%2F&label=commit-tracker&icon=heart-fill&color=%23fd86aa"
    />
    <b-navbar class="site-navbar">
      <template #brand>
        <b-navbar-item tag="router-link" :to="{ path: '/' }" class="brand">
          <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3v18M6 8c0 4 12 2 12 7v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="6" cy="6" r="2.4" fill="currentColor"/>
            <circle cx="6" cy="18" r="2.4" fill="currentColor"/>
            <circle cx="18" cy="17" r="2.4" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>
          </svg>
          <span class="brand-name">Commit<span>Tracker</span></span>
        </b-navbar-item>
      </template>

      <template #start>
        <b-navbar-item tag="router-link" :to="{ path: '/individuals' }">
          Individuals
        </b-navbar-item>

        <b-navbar-item tag="router-link" :to="{ path: '/communities' }">
          Community graph
        </b-navbar-item>

        <b-navbar-item tag="router-link" :to="{ path: '/treemap' }">
          Treemap
        </b-navbar-item>

        <b-navbar-dropdown>
          <template #label>
            Repositories
          </template>
          <b-navbar-item tag="router-link" :to="{ path: '/repositories' }">
            <b-icon icon="format-list-bulleted" class="mr-2"></b-icon>
            Charts
          </b-navbar-item>
          <b-navbar-item tag="router-link" :to="{ path: '/pulse' }">
            <b-icon icon="pulse" class="mr-2"></b-icon>
            Heatmap
          </b-navbar-item>
        </b-navbar-dropdown>

        <b-navbar-dropdown>
          <template #label>
            Organizations
          </template>
          <b-navbar-item tag="router-link" :to="{ path: '/organizations/commits' }">
            <b-icon icon="source-branch" class="mr-2"></b-icon>
            Commits
          </b-navbar-item>
          <b-navbar-item tag="router-link" :to="{ path: '/organizations/emails' }">
            <b-icon icon="email" class="mr-2"></b-icon>
            Emails
          </b-navbar-item>
        </b-navbar-dropdown>

        <b-navbar-dropdown>
          <template #label>
            CVE
          </template>

          <b-navbar-item tag="router-link" :to="{ path: '/cve/overview' }">
            <b-icon icon="chart-pie" class="mr-2"></b-icon>
            Overview
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/cve/list' }">
            <b-icon icon="format-list-bulleted" class="mr-2"></b-icon>
            List
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/cve/pivot-table' }">
            <b-icon icon="table" class="mr-2"></b-icon>
            Pivot table
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path:
          '/cve/reward_per_components' }">
            <b-icon icon="chart-sankey" class="mr-2"></b-icon>
            Reward per component
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path:
          '/cve/money-tree' }">
            <b-icon icon="currency-usd" class="mr-2"></b-icon>
            Money tree
          </b-navbar-item>

        </b-navbar-dropdown>

        <b-navbar-dropdown>
          <template #label>
            More
          </template>
          <b-navbar-item tag="router-link" :to="{ path: '/usernames' }">
            <b-icon icon="email" class="mr-2"></b-icon>
            Usernames distribution
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/leaderboard' }">
            <b-icon icon="trophy" class="mr-2"></b-icon>
            Leaderboard
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/badges/list' }">
            <b-icon icon="certificate" class="mr-2"></b-icon>
            Badges
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/fuzz-test' }">
            <b-icon icon="bug" class="mr-2"></b-icon>
            Fuzz test
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/api' }">
            <b-icon icon="code-json" class="mr-2"></b-icon>
            API
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/repo-info' }">
            <b-icon icon="source-branch" class="mr-2"></b-icon>
            Repositories tracking info
          </b-navbar-item>

          <b-navbar-item tag="router-link" :to="{ path: '/page-view' }">
            <b-icon icon="eye" class="mr-2"></b-icon>
            Page view
          </b-navbar-item>
        </b-navbar-dropdown>

      </template>

      <template #end>
        <b-navbar-item
          class="github-link"
          href="https://github.com/ArthurSonzogni/CommitTracker">
          <b-icon icon="github" class="mr-1"></b-icon>
          GitHub
        </b-navbar-item>
      </template>
    </b-navbar>
  </div>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 40;
}

.brand {
  gap: 0.55rem;
}

.brand-mark {
  color: var(--accent);
  height: 1.4rem;
  width: 1.4rem;
}

/* Some pages inline SVGs with global styles, e.g. the community graph. */
.brand-mark path {
  stroke-opacity: 1;
}

.brand-name {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.brand-name span {
  color: var(--muted);
  font-weight: 500;
}

.github-link {
  color: var(--muted) !important;
}
</style>
