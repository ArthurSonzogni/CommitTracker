<template>
  <div>
    <Navbar/>
    <section class="home-hero">
      <div class="container">
        <!-- A transition for CommitTracker / {repository} -->
        <h1 class="display" key="repository" ref="title">
          CommitTracker
          <span class="display-repo">
            <span class="display-sep" aria-hidden="true">/</span>
            <span class="repository">{{repository}}</span><span class="caret non-selectable">|</span>
          </span>
        </h1>

        <p class="lede">
          Open statistics about the people and organizations building Chromium
          and the wider web platform.
        </p>

        <HomeSearch class="hero-search" />

        <p class="hero-meta">
          <NuxtLink to="/repo-info">{{ repositoryCount }} repositories</NuxtLink>
          <span aria-hidden="true">·</span>
          <span>Updated {{ lastUpdate }}</span>
        </p>
      </div>
    </section>
    <HomeBento/>
    <HomeHighlights/>
  </div>
</template>

<script setup lang="ts">
import repositories_json from '../public/data/repositories.json'
import repositories_stats from '../public/data/repositories_stats.json'

const repository = ref("Chromium");

const all_stats = Object.values(repositories_stats);
const repositoryCount = all_stats.length;
const lastUpdate = new Date(
  Math.max(...all_stats.map(stat => new Date(stat.last_commit).getTime()))
).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

const title = ref<HTMLElement | null>(null);

// Stop the animation when leaving the page: sleep() throws once unmounted.
let unmounted = false;
onBeforeUnmount(() => {
  unmounted = true;
});

const sleep = async (delay = 500) => {
  await new Promise(resolve => setTimeout(resolve, delay));
  if (unmounted) {
    throw new Error("unmounted");
  }
};


// Setup a timer updating the repository every 5 seconds
// An animation will be triggered in the UI
const main = async() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

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
    const random_repository = next_repository.shift()!;
    for(let j = 0; j < random_repository.length; j++) {
      repository.value += random_repository[j];
      await sleep(50);
    }
  }
}

main().catch(() => {})
</script>

<style scoped>
.home-hero {
  padding: 2.75rem 1.25rem 2rem;
}

@media (min-width: 769px) {
  .home-hero {
    padding: 4rem 1.5rem 2.5rem;
  }
}

.display {
  color: var(--ink);
  font-size: clamp(2.1rem, 1.2rem + 4.2vw, 3.75rem);
  font-weight: 660;
  letter-spacing: -0.04em;
  line-height: 1.05;
  margin: 0 0 0.85rem;
}

.display-repo {
  font-weight: 520;
  white-space: nowrap;
}

.display-sep {
  color: var(--line-strong);
  font-weight: 350;
  margin-inline: 0.15em 0.2em;
}

.repository {
  color: var(--accent);
}

.caret {
  color: var(--faint);
  font-weight: 300;
  margin: 0 0.04em;
}

.lede {
  color: var(--muted);
  font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  line-height: 1.55;
  max-width: 38rem;
}

.hero-search {
  margin-top: 1.5rem;
}

.hero-meta {
  align-items: center;
  color: var(--faint);
  display: flex;
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  gap: 0.45rem;
  margin-top: 0.75rem;
}

.hero-meta a {
  color: var(--muted);
}

.hero-meta a:hover {
  color: var(--ink);
}

.non-selectable {
  user-select: none;
}
</style>
