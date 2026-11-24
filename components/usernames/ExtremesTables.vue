<template>
  <div class="extremes-grid mt-5">
    <div class="panel-card">
      <h2 class="section-title mb-1">Shortest usernames</h2>
      <p class="section-subtitle mb-3">
        The most compact handles in the current selection.
      </p>
      <div class="extremes-list">
        <NuxtLink
          v-for="u in shortestList"
          :key="u"
          :to="individualLink(u)"
          class="extreme-item"
        >
          <code class="extreme-handle">{{ u }}</code>
          <span class="extreme-meta">
            <span class="extreme-len">{{ u.length }} {{ u.length === 1 ? "char" : "chars" }}</span>
            <span v-if="commitCounts.get(u)" class="muted-text">
              · {{ fmtCompact(commitCounts.get(u)!) }} commits
            </span>
          </span>
        </NuxtLink>
      </div>
    </div>

    <div class="panel-card">
      <h2 class="section-title mb-1">Longest usernames</h2>
      <p class="section-subtitle mb-3">
        The longest handles in the current selection.
      </p>
      <div class="extremes-list">
        <NuxtLink
          v-for="u in longestList"
          :key="u"
          :to="individualLink(u)"
          class="extreme-item"
        >
          <code class="extreme-handle">{{ u }}</code>
          <span class="extreme-meta">
            <span class="extreme-len">{{ u.length }} chars</span>
            <span v-if="commitCounts.get(u)" class="muted-text">
              · {{ fmtCompact(commitCounts.get(u)!) }} commits
            </span>
          </span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

defineProps<{
  shortestList: string[];
  longestList: string[];
  commitCounts: Map<string, number>;
  individualLink: (username: string) => RouteLocationRaw;
  fmtCompact: (n: number) => string;
}>();
</script>

<style scoped>
.panel-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 1.25rem 1.35rem;
}

.section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  color: var(--ink);
}

.section-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.extremes-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

@media (max-width: 760px) {
  .extremes-grid {
    grid-template-columns: 1fr;
  }
}

.extremes-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.extreme-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  text-decoration: none;
  color: var(--ink);
  transition: background-color 0.12s ease;
}

.extreme-item:hover {
  background: var(--accent-soft);
}

.extreme-handle {
  font-family: var(--font-mono);
  font-size: 0.84rem;
  color: var(--accent-ink);
  background: transparent;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extreme-meta {
  font-size: 0.78rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.extreme-len {
  font-weight: 600;
  color: var(--ink-2);
}
</style>
