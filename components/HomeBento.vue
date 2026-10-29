<template>
  <section class="bento-section">
    <div class="container">
      <div class="bento">

        <NuxtLink to="/communities" class="bento-card is-community">
          <div class="bento-text">
            <div class="bento-head">
              <h2>Community graph</h2>
              <UiIcon name="arrow-right" size="small" class="bento-arrow" />
            </div>
            <p>Who reviews whom: the communities of developers, and how they evolved over the years.</p>
          </div>
          <div class="bento-preview is-image">
            <img src="/community-map/illustration.jpg" alt="" loading="lazy" />
          </div>
        </NuxtLink>

        <NuxtLink to="/individuals" class="bento-card is-individuals">
          <div class="bento-text">
            <div class="bento-head">
              <h2>Individuals</h2>
              <UiIcon name="arrow-right" size="small" class="bento-arrow" />
            </div>
            <p>Commits and reviews of any developer, over time, by hour, and with their peers.</p>
          </div>
          <div class="bento-preview">
            <svg v-if="topDevelopers.length" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
              <path
                v-for="(developer, index) in topDevelopers"
                :key="developer.name"
                :d="developer.path"
                fill="none"
                :stroke="categoricalPalette[index]"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
                stroke-linejoin="round"
              />
            </svg>
            <ul class="bento-legend">
              <li v-for="(developer, index) in topDevelopers" :key="developer.name">
                <span class="dot" :style="{ background: categoricalPalette[index] }"></span>
                {{ developer.name }}
              </li>
            </ul>
            <p class="bento-caption">Commits per year of the top authors of {{ latestYear }}</p>
          </div>
        </NuxtLink>

        <NuxtLink to="/repositories" class="bento-card is-repositories">
          <div class="bento-text">
            <div class="bento-head">
              <h2>Repositories</h2>
              <UiIcon name="arrow-right" size="small" class="bento-arrow" />
            </div>
            <p>Commits, contributors and newcomers of {{ repositoryCount }} repositories.</p>
          </div>
          <div class="bento-preview">
            <svg v-if="yearlyCommits.length" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
              <rect
                v-for="(bar, index) in yearlyCommits"
                :key="bar.year"
                :x="index * (300 / yearlyCommits.length) + 1"
                :y="120 - bar.height"
                :width="300 / yearlyCommits.length - 2"
                :height="bar.height"
                rx="1.5"
                class="bar"
              />
            </svg>
            <p class="bento-caption">
              Chromium commits per year<span v-if="firstYear"> · {{ firstYear }}–{{ latestYear }}</span>
            </p>
          </div>
        </NuxtLink>

        <NuxtLink to="/treemap" class="bento-card is-treemap">
          <div class="bento-text">
            <div class="bento-head">
              <h2>Treemap</h2>
              <UiIcon name="arrow-right" size="small" class="bento-arrow" />
            </div>
            <p>Codebase metrics over space and time: memory safety, TODOs, and more.</p>
          </div>
          <div class="bento-preview">
            <svg viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
              <rect
                v-for="(tile, index) in treemapTiles"
                :key="index"
                :x="tile.x0 + 1"
                :y="tile.y0 + 1"
                :width="Math.max(tile.x1 - tile.x0 - 2, 0)"
                :height="Math.max(tile.y1 - tile.y0 - 2, 0)"
                rx="2"
                :fill="tile.color"
                :fill-opacity="tile.opacity"
              />
            </svg>
            <p class="bento-caption">Codebase size and metrics by directory</p>
          </div>
        </NuxtLink>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { hierarchy, treemap } from 'd3-hierarchy'
import { categoricalPalette } from '~/utils/palette'
import repositories_stats from '../public/data/repositories_stats.json'

const repositoryCount = Object.keys(repositories_stats).length;

const yearlyCommits = shallowRef<{ year: string, height: number }[]>([]);
const topDevelopers = shallowRef<{ name: string, path: string }[]>([]);
const firstYear = ref("");
const latestYear = ref("");

// Decorative only: a squarified treemap grouped into 3 subsystems.
const treemapColors = [
  categoricalPalette[0],
  categoricalPalette[2],
  categoricalPalette[1],
];
const treemapTiles = treemap<{ children?: unknown[], value?: number, group?: number }>()
  .size([300, 120])
  .paddingInner(1)(
    hierarchy({
      children: [
        { group: 0, children: [34, 21, 13, 8].map(value => ({ value, group: 0 })) },
        { group: 1, children: [16, 11, 7, 4].map(value => ({ value, group: 1 })) },
        { group: 2, children: [9, 6, 4, 2].map(value => ({ value, group: 2 })) },
      ],
    }).sum(d => d.value ?? 0)
  )
  .leaves()
  .map((tile, index) => ({
    ...tile,
    color: treemapColors[tile.data.group ?? 0],
    opacity: 0.85 - (index % 4) * 0.12,
  }));

onMounted(async () => {
  // {developer: {year: commits}}
  const response = await fetch("/data/chromium/usernames_summary_commit_yearly_author.json");
  const summary: Record<string, Record<string, number>> = await response.json();

  const totals: Record<string, number> = {};
  for (const years of Object.values(summary)) {
    for (const [year, commits] of Object.entries(years)) {
      totals[year] = (totals[year] ?? 0) + commits;
    }
  }
  const years = Object.keys(totals).sort();
  const max = Math.max(...Object.values(totals));
  yearlyCommits.value = years.map(year => ({ year, height: 4 + 116 * totals[year] / max }));

  // The top 3 authors of the latest year, over the last 10 years.
  firstYear.value = years[0];
  const latest = years[years.length - 1];
  latestYear.value = latest;
  const recent = years.slice(-10);
  const top = Object.entries(summary)
    .sort((a, b) => (b[1][latest] ?? 0) - (a[1][latest] ?? 0))
    .slice(0, 3);
  const topMax = Math.max(...top.flatMap(([, y]) => recent.map(year => y[year] ?? 0)));
  topDevelopers.value = top.map(([name, y]) => ({
    name,
    path: recent.map((year, i) => {
      const x = 4 + i * 292 / (recent.length - 1);
      const yy = 136 - 128 * (y[year] ?? 0) / topMax;
      return `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`;
    }).join(""),
  }));
});
</script>

<style scoped>
.bento-section {
  padding: 0.5rem 1.25rem 3rem;
}

@media (min-width: 769px) {
  .bento-section {
    padding: 0.5rem 1.5rem 3.5rem;
  }
}

.bento {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
}

@media (min-width: 769px) {
  .bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .is-community {
    grid-column: span 2;
  }
}

@media (min-width: 1024px) {
  .bento {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .is-community {
    grid-column: 1 / span 2;
  }
  .is-individuals {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}

.bento-card {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0 -1px -1px 0;
  overflow: hidden;
  padding: 1.35rem 1.5rem;
  transition: background 0.15s;
}

.bento-card:hover {
  background: color-mix(in srgb, var(--surface-sunken) 45%, var(--surface));
  color: var(--ink-2);
}

.bento-head {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.bento-text h2 {
  color: var(--ink);
  font-size: 1.1rem;
  font-weight: 640;
  letter-spacing: -0.02em;
}

.bento-arrow {
  color: var(--faint);
  transition: color 0.15s, transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.bento-card:hover .bento-arrow {
  color: var(--ink);
  transform: translateX(2px);
}

.bento-text p {
  color: var(--muted);
  font-size: 0.875rem;
  line-height: 1.5;
}

.bento-preview {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 7rem;
}

.bento-preview svg {
  display: block;
  height: 7rem;
  width: 100%;
}

.is-individuals .bento-preview svg {
  flex: 1;
  min-height: 11rem;
}

.bento-preview.is-image {
  align-items: center;
  justify-content: center;
}

.bento-preview.is-image img {
  filter: var(--illustration-filter);
  max-height: 15.5rem;
  object-fit: contain;
  width: 100%;
}

.bar {
  fill: var(--series-1);
  opacity: 0.82;
}

.bento-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
  list-style: none;
  margin: 0.75rem 0 0;
}

.bento-legend li {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  gap: 0.35rem;
}

.dot {
  border-radius: 50%;
  height: 0.5rem;
  width: 0.5rem;
}

.bento-caption {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  margin-top: 0.5rem;
}
</style>
