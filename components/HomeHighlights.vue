<template>
  <section v-if="highlights" class="highlights-section">
    <div class="container">
      <h2 class="highlights-title">{{ monthName }} in Chromium</h2>
      <p class="highlights-lede">
        {{ number(highlights.commits) }} commits
        <span :class="delta >= 0 ? 'is-up' : 'is-down'">({{ delta >= 0 ? "+" : "" }}{{ delta }}%)</span>
        by {{ number(highlights.contributors) }} contributors,
        including {{ highlights.newcomers }} first-time contributors.
      </p>

      <div class="highlights">
        <div class="highlight">
          <h3>Top authors</h3>
          <ol>
            <li v-for="[name, count] in highlights.top_authors" :key="name">
              <NuxtLink :to="`/developers/${encodeURIComponent(name)}`">{{ name }}</NuxtLink>
              <span>{{ number(count) }}</span>
            </li>
          </ol>
        </div>

        <div class="highlight">
          <h3>Top reviewers</h3>
          <ol>
            <li v-for="[name, count] in highlights.top_reviewers" :key="name">
              <NuxtLink :to="`/developers/${encodeURIComponent(name)}`">{{ name }}</NuxtLink>
              <span>{{ number(count) }}</span>
            </li>
          </ol>
        </div>

        <div class="highlight">
          <h3>Top organizations, {{ quarterName }}</h3>
          <ol>
            <li v-for="[name, count] in highlights.top_organizations" :key="name">
              <NuxtLink :to="`/organizations/commits?organizations=${encodeURIComponent(name)}&grouping=quarterly`">{{ name }}</NuxtLink>
              <span>{{ number(count) }}</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Facts about the last complete month, derived at deployment by
// scripts/derive-highlights.mjs.

import { format } from "d3-format";

type Ranking = [string, number][];
const highlights = ref<{
  month: string;
  commits: number;
  previous_commits: number;
  contributors: number;
  newcomers: number;
  top_authors: Ranking;
  top_reviewers: Ranking;
  quarter: string;
  top_organizations: Ranking;
} | null>(null);

onMounted(async () => {
  try {
    const response = await fetch("/data/highlights.json");
    if (response.ok) {
      highlights.value = await response.json();
    }
  } catch (e) {}
});

const number = format(",d");

const monthName = computed(() =>
  new Date(highlights.value!.month + "-15").toLocaleString("en", { month: "long", year: "numeric" }));

const quarterName = computed(() => highlights.value!.quarter.replace("Q", " Q"));

const delta = computed(() => Math.round(
  100 * (highlights.value!.commits / highlights.value!.previous_commits - 1)));
</script>

<style scoped>
.highlights-section {
  padding: 0 1.25rem 4rem;
}

.highlights-title {
  color: var(--ink);
  font-size: 1.25rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
}

.highlights-lede {
  color: var(--muted);
  margin-bottom: 1.25rem;
}

.is-up,
.is-down {
  color: var(--ink-2);
  font-weight: 600;
}

.highlights {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.highlight {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1rem 1.25rem;
}

.highlight h3 {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 560;
  letter-spacing: 0.04em;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.highlight ol {
  counter-reset: rank;
  list-style: none;
  margin: 0;
  padding: 0;
}

.highlight li {
  align-items: baseline;
  counter-increment: rank;
  display: flex;
  gap: 0.5rem;
  padding: 0.3rem 0;
}

.highlight li::before {
  color: var(--faint);
  content: counter(rank);
  font-variant-numeric: tabular-nums;
  width: 1rem;
}

.highlight li a {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight li span {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
</style>
