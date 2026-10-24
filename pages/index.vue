<template>
  <div>
    <Navbar/>
    <section class="home-hero">
      <div class="container">
        <p class="eyebrow">
          <span class="live-dot"></span>
          Updated {{ lastUpdate }} · {{ repositoryCount }} repositories tracked
        </p>

        <!-- A transition for the {repository}CommitTracker-->
        <h1 class="display" key="repository">
          <span class="repository">{{repository}}</span><span class="caret non-selectable">|</span><wbr>CommitTracker
        </h1>

        <p class="lede">
          Open statistics about the people and organizations building Chromium
          and the wider web platform: commits, reviews, communities, codebase
          health and security.
        </p>

        <div class="actions">
          <NuxtLink class="button is-primary is-medium" to="/individuals">
            Explore contributors
            <b-icon icon="arrow-right" size="is-small" class="ml-1"></b-icon>
          </NuxtLink>
          <NuxtLink class="button is-medium" to="/cve/overview">
            Security dashboard
          </NuxtLink>
        </div>

        <dl class="stats">
          <div v-for="stat in stats" :key="stat.label" class="stat">
            <dt>{{ stat.label }}</dt>
            <dd>{{ stat.value }}</dd>
          </div>
        </dl>

        <p class="byline">
          Made by
          <a href="https://github.com/ArthurSonzogni">@arthursonzogni</a>
        </p>
      </div>
    </section>
    <CommunityMapDemo/>
    <StatsDemo/>
    <RepositoryDemo/>
    <TreemapDemo/>
  </div>
</template>

<script setup lang="ts">
import repositories_json from '../public/data/repositories.json'
import repositories_stats from '../public/data/repositories_stats.json'

const repository = ref("Chromium");
const repositories = ref(repositories_json);

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const all_stats = Object.values(repositories_stats);
const chromium_stats = repositories_stats.chromium;
const repositoryCount = all_stats.length;
const lastUpdate = new Date(
  Math.max(...all_stats.map(stat => new Date(stat.last_commit)))
).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

const stats = [
  {
    label: "Chromium commits",
    value: compact.format(chromium_stats.total_commits),
  },
  {
    label: "Chromium contributors",
    value: compact.format(chromium_stats.total_contributors),
  },
  {
    label: "Commits, all repositories",
    value: compact.format(
      all_stats.reduce((sum, stat) => sum + stat.total_commits, 0)),
  },
  {
    label: "Repositories",
    value: repositoryCount,
  },
];

const sleep = async (delay = 500) => {
  return new Promise(resolve => setTimeout(resolve, delay));
};


// Setup a timer updating the repository every 5 seconds
// An animation will be triggered in the UI
const main = async() => {

  // Select 5 random repositories to cycle through.
  const next_repository = repositories_json
    .map(repo => repo.name)
    .filter(repo => repo !== "Chromium")
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  next_repository.push("Chromium");

  await sleep(1500);
  while(next_repository.length > 0) {
    await sleep(1500);
    // Clear the repository name, one letter at a time
    while(repository.value.length > 0) {
      repository.value = repository.value.slice(0, -1);
      await sleep(30);
    }

    await sleep(200);

    // Set the repository name, one letter at a time
    const random_repository = next_repository.shift();
    for(let j = 0; j < random_repository.length; j++) {
      repository.value += random_repository[j];
      await sleep(50);
    }
  }

  const h1 = document.querySelector("h1");
  await sleep(500);
  h1.classList.add("flash");
  await sleep(500);
  h1.classList.remove("flash");
}

main()
</script>

<style scoped>

.home-hero {
  background:
    radial-gradient(60rem 28rem at 85% -10%, rgba(110, 86, 207, 0.16), transparent 70%),
    radial-gradient(40rem 22rem at -10% 10%, rgba(56, 189, 248, 0.10), transparent 70%),
    var(--bg);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  padding: 4rem 1.25rem 3rem;
  position: relative;
}

/* Faint grid, fading out towards the bottom. */
.home-hero::before {
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 44px 44px;
  content: "";
  inset: 0;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent 75%);
  position: absolute;
  pointer-events: none;
}

.home-hero .container {
  position: relative;
}

@media (min-width: 769px) {
  .home-hero {
    padding: 6.5rem 1.5rem 4.5rem;
  }
}

.eyebrow {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow-xs);
  color: var(--muted);
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 520;
  gap: 0.5rem;
  padding: 0.3rem 0.8rem 0.3rem 0.65rem;
}

.live-dot {
  background: #22a06b;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(34, 160, 107, 0.18);
  height: 0.45rem;
  width: 0.45rem;
}

.display {
  color: var(--ink);
  font-size: clamp(2.4rem, 1.2rem + 6vw, 5rem);
  font-weight: 680;
  letter-spacing: -0.045em;
  line-height: 1;
  margin: 1.5rem 0 1.25rem;
  transition: all 0.3s;
}

.repository {
  background: linear-gradient(100deg, var(--accent) 10%, #3b82f6 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.caret {
  color: var(--accent);
  font-weight: 300;
  margin: 0 0.05em;
}

.flash {
  text-shadow: 0 0 24px rgba(110, 86, 207, 0.45);
}

.lede {
  color: var(--ink-2);
  font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.25rem);
  line-height: 1.55;
  max-width: 40rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 2rem;
}

.stats {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-xs);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 3rem;
  overflow: hidden;
}

@media (min-width: 769px) {
  .stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.stat {
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  margin: -1px -1px 0 0;
  padding: 1.1rem 1.25rem;
}

.stat dt {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 520;
}

.stat dd {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
  font-weight: 550;
  letter-spacing: -0.03em;
  margin: 0.15rem 0 0;
}

.byline {
  color: var(--faint);
  font-size: 0.8rem;
  margin-top: 1.25rem;
}

.byline a {
  color: var(--muted);
}

.non-selectable {
  user-select: none;
}

</style>
