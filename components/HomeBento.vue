<template>
  <section class="bento-section">
    <div class="container">
      <div class="bento">

        <NuxtLink to="/communities" class="bento-card is-community">
          <div class="bento-text">
            <h2>Community graph</h2>
            <p>Who reviews whom: the communities of developers, and how they evolved over the years.</p>
          </div>
          <div class="bento-preview is-image">
            <img src="/community-map/illustration.jpg" alt="" loading="lazy" />
          </div>
          <span class="bento-link">Explore communities <UiIcon name="arrow-right" size="small"></UiIcon></span>
        </NuxtLink>

        <NuxtLink to="/individuals" class="bento-card is-individuals">
          <div class="bento-text">
            <h2>Individuals</h2>
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
          <span class="bento-link">Explore developers <UiIcon name="arrow-right" size="small"></UiIcon></span>
        </NuxtLink>

        <NuxtLink to="/repositories" class="bento-card is-repositories">
          <div class="bento-text">
            <h2>Repositories</h2>
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
                rx="2"
                class="bar"
              />
            </svg>
            <p class="bento-caption">Chromium commits per year</p>
          </div>
          <span class="bento-link">Explore repositories <UiIcon name="arrow-right" size="small"></UiIcon></span>
        </NuxtLink>

        <NuxtLink to="/treemap" class="bento-card is-treemap">
          <div class="bento-text">
            <h2>Treemap</h2>
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
                rx="3"
                :fill-opacity="tile.opacity"
                class="tile"
              />
            </svg>
          </div>
          <span class="bento-link">Explore the treemap <UiIcon name="arrow-right" size="small"></UiIcon></span>
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
const latestYear = ref("");

// Decorative only: a squarified treemap of fixed weights.
const treemapTiles = treemap()
  .size([300, 120])
  .padding(0)(
    hierarchy({ children: [34, 21, 13, 9, 8, 5, 4, 3, 2, 2, 1, 1].map(value => ({ value })) })
      .sum(d => d.value ?? 0)
  )
  .leaves()
  .map((tile, index) => ({ ...tile, opacity: 0.85 - index * 0.06 }));

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
  padding: 1rem 1.25rem 4rem;
}

.bento {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
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
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-xs);
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  padding: 1.4rem 1.4rem 1.2rem;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s, border-color 0.2s;
}

.bento-card:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-lg);
  color: var(--ink-2);
  transform: translateY(-2px);
}

.bento-text h2 {
  color: var(--ink);
  font-size: 1.25rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin-bottom: 0.3rem;
}

.bento-text p {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.bento-preview {
  flex: 1;
  min-height: 7rem;
}

.bento-preview svg {
  display: block;
  height: 7.5rem;
  width: 100%;
}

.is-individuals .bento-preview {
  display: flex;
  flex-direction: column;
}

.is-individuals .bento-preview svg {
  flex: 1;
  min-height: 10rem;
}

.bento-preview.is-image {
  align-items: center;
  display: flex;
  justify-content: center;
}

.bento-preview.is-image img {
  filter: var(--illustration-filter);
  max-height: 16rem;
  object-fit: contain;
  width: 100%;
}

.bar {
  fill: var(--accent);
  opacity: 0.85;
}

.tile {
  fill: var(--accent);
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
  font-size: 0.8rem;
  gap: 0.35rem;
}

.dot {
  border-radius: 50%;
  height: 0.5rem;
  width: 0.5rem;
}

.bento-caption {
  color: var(--faint);
  font-size: 0.75rem;
  margin-top: 0.5rem;
}

.bento-link {
  align-items: center;
  color: var(--accent);
  display: flex;
  font-size: 1rem;
  font-weight: 600;
  gap: 0.3rem;
}

.bento-card:hover .bento-link {
  color: var(--accent-ink);
}

.bento-link .icon {
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.bento-card:hover .bento-link .icon {
  transform: translateX(3px);
}
</style>
