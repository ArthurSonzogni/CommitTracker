<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">

        <div v-if="!loaded" class="profile-loading">Loading…</div>

        <div v-else-if="!entry" class="content">
          <h1 class="title">No developer named “{{ name }}”</h1>
          <p>Search for a developer instead:</p>
          <HomeSearch class="not-found-search" />
        </div>

        <template v-else>
          <header class="profile-header">
            <div class="monogram" aria-hidden="true">{{ name[0].toUpperCase() }}</div>
            <div class="profile-heading">
              <h1 class="title">{{ name }}</h1>
              <p class="profile-subtitle">
                Contributor to {{ repositories.length }}
                {{ repositories.length > 1 ? "repositories" : "repository" }}
                since {{ firstYear }}
              </p>
            </div>
            <div class="profile-actions">
              <NuxtLink class="button is-primary" :to="individualsLink(primaryRepository.dirname)">
                Explore in detail
                <UiIcon name="arrow-right" class="ml-1" size="small"></UiIcon>
              </NuxtLink>
              <NuxtLink class="button" :to="`/badges/list?developers=${encodeURIComponent(name)}`">
                Badges
              </NuxtLink>
            </div>
          </header>

          <dl class="profile-stats">
            <div v-for="stat in stats" :key="stat.label" class="profile-stat">
              <dt>{{ stat.label }}</dt>
              <dd>{{ stat.value }}</dd>
            </div>
          </dl>

          <h2 class="title">Repositories</h2>
          <ul class="profile-repositories">
            <li v-for="repository in repositories" :key="repository.dirname">
              <NuxtLink :to="individualsLink(repository.dirname)" class="profile-repository">
                <span class="repository-name">{{ repository.name }}</span>
                <span class="repository-bar">
                  <span
                    class="bar-author"
                    :style="{ width: barWidth(repository.author) }"
                    :title="`${repository.author} commits`"></span>
                  <span
                    class="bar-review"
                    :style="{ width: barWidth(repository.review) }"
                    :title="`${repository.review} reviews`"></span>
                </span>
                <span class="repository-counts">
                  {{ plural(repository.author, "commit") }} · {{ plural(repository.review, "review") }}
                </span>
                <span class="repository-years">
                  {{ repository.first === repository.last ? repository.first : `${repository.first}–${repository.last}` }}
                </span>
              </NuxtLink>
              <ul v-if="repository.children.length" class="profile-subdirectories">
                <li v-for="child in repository.children" :key="child.dirname">
                  <NuxtLink :to="individualsLink(child.dirname)" class="profile-repository is-child">
                    <span class="repository-name">
                      {{ child.name }}
                      <code class="repository-cone">{{ child.cone }}</code>
                    </span>
                    <span class="repository-bar">
                      <span
                        class="bar-author"
                        :style="{ width: barWidth(child.author) }"
                        :title="`${child.author} commits`"></span>
                      <span
                        class="bar-review"
                        :style="{ width: barWidth(child.review) }"
                        :title="`${child.review} reviews`"></span>
                    </span>
                    <span class="repository-counts">
                      {{ plural(child.author, "commit") }} · {{ plural(child.review, "review") }}
                    </span>
                    <span class="repository-years">
                      {{ child.first === child.last ? child.first : `${child.first}–${child.last}` }}
                    </span>
                  </NuxtLink>
                </li>
              </ul>
            </li>
          </ul>
          <p class="legend">
            <span class="dot bar-author"></span> Commits
            <span class="dot bar-review"></span> Reviews
          </p>

          <h2 class="title">Timeline in {{ primaryRepository.name }}</h2>
          <div class="profile-chart">
            <TimelineChart
              chart="line"
              :repositories="[primaryRepository.dirname]"
              :developers="[name]"
              :dates="dates"
              :author="true"
              :review="true"
              :stacked="false"
            />
          </div>

          <h2 class="title">Peers in {{ primaryRepository.name }}</h2>
          <PeersChart
            :repositories="[primaryRepository.dirname]"
            :developers="[name]"
            :dates="dates"
            :author="true"
            :review="true"
            :stacked="false"
            :take_n="15"
          />

          <template v-if="badges.length">
            <h2 class="title">Badges</h2>
            <div class="profile-badges">
              <NuxtLink
                v-for="badge in badges.slice(0, 12)"
                :key="badge.name"
                class="profile-badge"
                :to="`/badges/details?developer=${encodeURIComponent(name)}&badge=${encodeURIComponent(badge.name)}`">
                <img :src="badge.image" :alt="badge.name" loading="lazy" />
                <span>{{ badge.name }}</span>
              </NuxtLink>
            </div>
            <p v-if="badges.length > 12">
              <NuxtLink :to="`/badges/list?developers=${encodeURIComponent(name)}`">
                All {{ badges.length }} badges
              </NuxtLink>
            </p>
          </template>
        </template>

      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Explicit import: Nuxt 4's auto-import reads <TimelineChart> as the lazy
// hydration modifier "Time" + "LineChart", and resolves it to LineChart.
import TimelineChart from '~/components/TimelineChart.vue'
import repositories_json from '../../public/data/repositories.json'

const route = useRoute();
const name = computed(() => String(route.params.name));

// scripts/derive-developers.mjs:
// {repository: [commits authored, reviews, first year, last year]}
const entry = shallowRef<Record<string, number[]> | null>(null);
const badges = shallowRef<{ name: string, image: string }[]>([]);
const loaded = ref(false);

const dates = [new Date("2000-01-01"), new Date()];
const number = new Intl.NumberFormat("en").format;
const plural = (count: number, word: string) =>
  `${number(count)} ${word}${count === 1 ? "" : "s"}`;

// The shard of a username. Kept in sync with scripts/derive-developers.mjs.
const shardOf = (username: string) => {
  const c = username[0].toLowerCase();
  return /[a-z0-9]/.test(c) ? c : "_";
};

const fetchJson = async (url: string) => {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
};

const load = async () => {
  loaded.value = false;
  const shard = await fetchJson(`/data/developers/${shardOf(name.value)}.json`);
  entry.value = shard?.[name.value] ?? null;
  loaded.value = true;

  // Badges: see pages/badges/list.vue.
  badges.value = [];
  const [allBadges, developerBadges] = await Promise.all([
    fetchJson("/badges.json"),
    fetchJson(`/badges/${name.value[0]}.json`),
  ]);
  badges.value = (developerBadges?.[name.value] ?? [])
    .map(([index]: [number]) => allBadges?.[index])
    .filter(Boolean);
};
watch(name, load, { immediate: true });

const byActivity = (a, b) => (b.author + b.review) - (a.author + a.review);

const allRepositories = computed(() => Object.entries(entry.value ?? {})
  .map(([dirname, [author, review, first, last]]) => {
    const repository = repositories_json.find(repo => repo.dirname === dirname);
    return {
      dirname,
      name: repository?.name ?? dirname,
      // Some repositories are a directory of another one, e.g. blink in
      // chromium. Their commits are also counted in the parent.
      parent: repository?.parent?.toLowerCase(),
      cone: repository?.cone,
      author,
      review,
      first,
      last,
    };
  }));

// The top-level repositories, with their sub-directories as children.
const repositories = computed(() => {
  const dirnames = new Set(allRepositories.value.map(r => r.dirname));
  return allRepositories.value
    .filter(r => !r.parent || !dirnames.has(r.parent))
    .map(r => ({
      ...r,
      children: allRepositories.value
        .filter(child => child.parent === r.dirname)
        .sort(byActivity),
    }))
    .sort(byActivity);
});

const primaryRepository = computed(() => repositories.value[0]);
const firstYear = computed(() => Math.min(...repositories.value.map(r => r.first)));
const lastYear = computed(() => Math.max(...repositories.value.map(r => r.last)));
const totalAuthor = computed(() => repositories.value.reduce((sum, r) => sum + r.author, 0));
const totalReview = computed(() => repositories.value.reduce((sum, r) => sum + r.review, 0));

const stats = computed(() => [
  { label: "Commits", value: number(totalAuthor.value) },
  { label: "Reviews", value: number(totalReview.value) },
  { label: "Repositories", value: repositories.value.length },
  { label: "Years active", value: lastYear.value - firstYear.value + 1 },
]);

const maxCount = computed(() =>
  Math.max(1, ...repositories.value.flatMap(r => [r.author, r.review])));
const barWidth = (count: number) => `${100 * count / maxCount.value}%`;

const individualsLink = (repository: string) =>
  `/individuals?developers=${encodeURIComponent(name.value)}&repositories=${repository}`;

// Also written into the generated HTML by scripts/static-meta.mjs.
useSeoMeta({
  title: () => `${name.value} · CommitTracker`,
  ogTitle: () => `${name.value} · CommitTracker`,
  description: () => entry.value
    ? `${name.value}: ${number(totalAuthor.value)} commits and ${number(totalReview.value)} reviews across ${repositories.value.length} web platform repositories, since ${firstYear.value}.`
    : `Contributions of ${name.value} to the web platform.`,
});
</script>

<style scoped>
.profile-loading {
  color: var(--muted);
  padding: 4rem 0;
}

.not-found-search {
  margin-top: 1rem;
}

.profile-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.monogram {
  align-items: center;
  background: linear-gradient(135deg, var(--accent), #3b82f6);
  border-radius: 22px;
  color: #fff;
  display: flex;
  flex: 0 0 auto;
  font-size: 2.2rem;
  font-weight: 650;
  height: 4.5rem;
  justify-content: center;
  width: 4.5rem;
}

.profile-heading {
  flex: 1 1 14rem;
  min-width: 0;
}

.profile-heading .title {
  margin-bottom: 0.25rem;
  overflow-wrap: anywhere;
}

.profile-subtitle {
  color: var(--muted);
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.profile-stats {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 3rem;
  overflow: hidden;
}

@media (min-width: 769px) {
  .profile-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.profile-stat {
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  margin: 0 -1px -1px 0;
  padding: 1rem 1.25rem;
}

.profile-stat dt {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 520;
}

.profile-stat dd {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
  font-weight: 550;
  letter-spacing: -0.03em;
  margin: 0.15rem 0 0;
}

.profile-repositories {
  list-style: none;
  margin: 0 0 0.75rem;
}

.profile-repository {
  align-items: center;
  border-radius: var(--radius);
  color: var(--ink-2);
  display: grid;
  gap: 0.25rem 1rem;
  grid-template-columns: 9rem minmax(0, 1fr) auto auto;
  padding: 0.45rem 0.6rem;
}

.profile-repository:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

@media (max-width: 768px) {
  .profile-repository {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .repository-bar {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .repository-counts {
    grid-row: 3;
  }
}

.repository-name {
  font-weight: 560;
  min-width: 0;
}

/* Sub-directories of a repository, e.g. blink in chromium. */
.profile-subdirectories {
  border-left: 1px solid var(--line);
  list-style: none;
  margin: 0 0 0.35rem 1.1rem;
}

@media (min-width: 769px) {
  /* Keep the bars aligned with the parent's, despite the indentation. */
  .profile-repository.is-child {
    grid-template-columns: 7.9rem minmax(0, 1fr) auto auto;
  }
}

.is-child .repository-name {
  color: var(--muted);
  font-weight: 520;
}

.repository-cone {
  background: none;
  color: var(--faint);
  display: block;
  font-size: 0.68rem;
  overflow: hidden;
  padding: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-bar {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.repository-bar > span {
  border-radius: 3px;
  display: block;
  height: 6px;
  min-width: 2px;
}

.bar-author {
  background: var(--series-1);
}

.bar-review {
  background: var(--series-3);
}

.repository-counts {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.repository-years {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.legend {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 0.8rem;
  gap: 0.4rem;
  margin-bottom: 3rem;
}

.legend .dot {
  border-radius: 50%;
  display: inline-block;
  height: 0.55rem;
  margin-left: 0.6rem;
  width: 0.55rem;
}

.legend .dot:first-child {
  margin-left: 0;
}

.profile-chart {
  height: 22rem;
  margin-bottom: 3rem;
}

.profile-badges {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  margin-bottom: 1rem;
}

.profile-badge {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  gap: 0.4rem;
  text-align: center;
}

.profile-badge img {
  aspect-ratio: 1;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  object-fit: cover;
  width: 100%;
}
</style>
