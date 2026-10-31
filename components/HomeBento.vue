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
            <div class="treemap-stage" aria-hidden="true">
              <svg viewBox="0 0 300 120" preserveAspectRatio="none">
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
              <span
                v-for="(tile, index) in treemapTiles"
                :key="index"
                v-show="tile.x1 - tile.x0 >= 38 && tile.y1 - tile.y0 >= 22"
                class="treemap-label"
                :style="{
                  left: `${(tile.x0 / 300) * 100}%`,
                  top: `${(tile.y0 / 120) * 100}%`,
                  width: `${((tile.x1 - tile.x0) / 300) * 100}%`,
                  height: `${((tile.y1 - tile.y0) / 120) * 100}%`,
                }">
                {{ tile.data.name }}
              </span>
            </div>
            <p class="bento-caption">Chromium directories by size and metric</p>
          </div>
        </NuxtLink>

      </div>

      <div class="bento-more">
        <NuxtLink
          v-for="item in moreLinks"
          :key="item.to"
          :to="item.to"
          class="bento-more-item">
          <UiIcon :name="item.icon" size="small" class="bento-more-icon" />
          <div class="bento-more-body">
            <h3>
              {{ item.label }}
              <UiIcon name="arrow-right" size="small" class="bento-arrow" />
            </h3>
            <p>{{ item.description }}</p>
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

const moreLinks = [
  {
    to: "/accretion",
    label: "Code accretion",
    icon: "layers",
    description: "Lines of code alive over time, per year written and author.",
  },
  {
    to: "/organizations/commits",
    label: "Organizations",
    icon: "domain",
    description: "Contributions and email domains of companies across repositories.",
  },
  {
    to: "/cve/overview",
    label: "CVEs & bug bounties",
    icon: "shield-bug",
    description: "Security vulnerabilities, severities, components, and rewards.",
  },
  {
    to: "/commit-rates-sankey",
    label: "Commit rates",
    icon: "chart-sankey",
    description: "Directory commit velocity explored as an interactive Sankey diagram.",
  },
  {
    to: "/leaderboard",
    label: "Leaderboard",
    icon: "trophy",
    description: "Most active authors and reviewers by month, quarter, or year.",
  },
  {
    to: "/badges/list",
    label: "Badges",
    icon: "certificate",
    description: "Achievements awarded to contributors from their commit history.",
  },
];

// Representative Chromium top-level directories, grouped into 3 subsystems.
const treemapColors = [
  categoricalPalette[0],
  categoricalPalette[2],
  categoricalPalette[1],
];
type TreemapDatum = { name?: string, value?: number, group?: number, children?: TreemapDatum[] };
const treemapTiles = treemap<TreemapDatum>()
  .size([300, 120])
  .paddingInner(1)(
    hierarchy<TreemapDatum>({
      children: [
        {
          group: 0,
          children: [
            { name: "blink/", value: 32, group: 0 },
            { name: "content/", value: 18, group: 0 },
            { name: "v8/", value: 13, group: 0 },
            { name: "net/", value: 7, group: 0 },
          ],
        },
        {
          group: 1,
          children: [
            { name: "chrome/", value: 26, group: 1 },
            { name: "components/", value: 15, group: 1 },
            { name: "ios/", value: 8, group: 1 },
            { name: "ash/", value: 7, group: 1 },
          ],
        },
        {
          group: 2,
          children: [
            { name: "services/", value: 8, group: 2 },
            { name: "gpu/", value: 6, group: 2 },
            { name: "media/", value: 5, group: 2 },
            { name: "base/", value: 4, group: 2 },
          ],
        },
      ],
    }).sum(d => d.value ?? 0)
  )
  .leaves()
  .map((tile, index) => ({
    ...tile,
    color: treemapColors[tile.data.group ?? 0],
    opacity: 0.85 - (index % 4) * 0.11,
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

.treemap-stage {
  position: relative;
}

.treemap-label {
  box-sizing: border-box;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 550;
  line-height: 1.15;
  overflow: hidden;
  padding: 0.25rem 0.35rem;
  pointer-events: none;
  position: absolute;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  white-space: nowrap;
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

.bento-more {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin-top: 0.75rem;
  overflow: hidden;
}

@media (min-width: 769px) {
  .bento-more {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .bento-more {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.bento-more-item {
  align-items: flex-start;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  color: var(--ink-2);
  display: flex;
  gap: 0.8rem;
  margin: 0 -1px -1px 0;
  padding: 1rem 1.25rem;
  transition: background 0.15s;
}

.bento-more-item:hover {
  background: color-mix(in srgb, var(--surface-sunken) 45%, var(--surface));
  color: var(--ink-2);
}

.bento-more-icon {
  color: var(--muted);
  flex-shrink: 0;
  margin-top: 0.15rem;
}

.bento-more-body {
  flex: 1;
  min-width: 0;
}

.bento-more-body h3 {
  align-items: center;
  color: var(--ink);
  display: flex;
  font-size: 0.95rem;
  font-weight: 620;
  gap: 0.4rem;
  justify-content: space-between;
  letter-spacing: -0.015em;
  margin-bottom: 0.15rem;
}

.bento-more-item:hover .bento-arrow {
  color: var(--ink);
  transform: translateX(2px);
}

.bento-more-body p {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
}
</style>
