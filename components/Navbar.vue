<template>
  <b-navbar type="is-primary">
    <template #brand>
      <b-navbar-item tag="router-link" :to="{ path: '/' }">
        <b-icon icon="home" >
        </b-icon>
      </b-navbar-item>
    </template>

    <template #start>
      <b-navbar-item tag="router-link" :to="{ path: '/individuals' }">
        <b-icon icon="account" class="mr-2"></b-icon>
        Individuals
      </b-navbar-item>

      <b-navbar-item tag="router-link" :to="{ path: '/communities' }">
        <b-icon icon="account-group" class="mr-2"></b-icon>
        Community graph
      </b-navbar-item>

      <b-navbar-item tag="router-link" :to="{ path: '/repositories' }">
        <b-icon icon="source-branch" class="mr-2"></b-icon>
        Repositories
      </b-navbar-item>

      <b-navbar-item tag="router-link" :to="{ path: '/treemap' }">
        <b-icon icon="chart-tree" class="mr-2"></b-icon>
        Treemap
      </b-navbar-item>

      <div class="ml-6"></div>

      <b-navbar-dropdown>
        <template #label>
          <b-icon icon="account-group" class="mr-2"></b-icon>
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
          <b-icon icon="security" class="mr-2"></b-icon>
          CVE
        </template>

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

      </b-navbar-dropdown>

      <b-navbar-dropdown>
        <template #label>
          <b-icon icon="one-up" class="mr-2"></b-icon>
          Misc
        </template>
        <b-navbar-item tag="router-link" :to="{ path: '/usernames' }">
          <b-icon icon="email" class="mr-2"></b-icon>
          Usernames distribution
        </b-navbar-item>

        <b-navbar-item tag="router-link" :to="{ path: '/leaderboard' }">
          <b-icon icon="trophy" class="mr-2"></b-icon>
          Leaderboard
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
          class="is-dark"
          href="https://github.com/ArthurSonzogni/ChromeCommitTracker">
        <b-icon icon="github" class="mr-2"></b-icon>
        Sources
      </b-navbar-item>
    </template>
  </b-navbar>
</template>
