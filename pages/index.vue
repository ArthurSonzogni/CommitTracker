<template>
  <div>
    <Navbar/>
    <section class="home-hero">
      <div class="container">
        <p class="eyebrow">
          <span class="live-dot"></span>
          Updated {{ lastUpdate }} · {{ repositoryCount }} repositories
        </p>

        <!-- A transition for the {repository}CommitTracker-->
        <h1 class="display" key="repository" ref="title">
          <span class="repository">{{repository}}</span><span class="caret non-selectable">|</span><wbr>CommitTracker
        </h1>

        <p class="lede">
          Open statistics about the people and organizations building Chromium
          and the wider web platform.
        </p>

        <HomeSearch class="hero-search" />
      </div>
    </section>
    <HomeBento/>
    <div class="container commit-rule" aria-hidden="true"><span /><span /><span /></div>
    <HomeHighlights/>
  </div>
</template>

<script setup lang="ts">
import repositories_json from '../public/data/repositories.json'
import repositories_stats from '../public/data/repositories_stats.json'

const repository = ref("Chromium");
const repositories = ref(repositories_json);

const all_stats = Object.values(repositories_stats);
const repositoryCount = all_stats.length;
const lastUpdate = new Date(
  Math.max(...all_stats.map(stat => new Date(stat.last_commit)))
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
    const random_repository = next_repository.shift();
    for(let j = 0; j < random_repository.length; j++) {
      repository.value += random_repository[j];
      await sleep(50);
    }
  }

  await sleep(500);
  title.value?.classList.add("flash");
  await sleep(500);
  title.value?.classList.remove("flash");
}

main().catch(() => {})
</script>

<style scoped>
/* A divider drawn like the commits of a git history, as in the logo. */
.commit-rule {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-block: 3rem;
  padding-inline: 1.5rem;
  position: relative;
}

.commit-rule::before {
  background: var(--line-strong);
  content: "";
  height: 2px;
  inset-inline: 1.5rem;
  position: absolute;
}

.commit-rule span {
  background: var(--bg);
  border: 2px solid var(--accent);
  border-radius: 999px;
  height: 12px;
  position: relative;
  width: 12px;
}

.home-hero {
  background:
    radial-gradient(60rem 28rem at 85% -10%, rgba(110, 86, 207, 0.16), transparent 70%),
    radial-gradient(40rem 22rem at -10% 10%, rgba(56, 189, 248, 0.10), transparent 70%),
    var(--bg);
  padding: 3.5rem 1.25rem 2.5rem;
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
  z-index: 2;
}

@media (min-width: 769px) {
  .home-hero {
    padding: 5.5rem 1.5rem 3.5rem;
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

.hero-search {
  margin-top: 2rem;
}

.lede {
  color: var(--ink-2);
  font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.25rem);
  line-height: 1.55;
  max-width: 40rem;
}









.non-selectable {
  user-select: none;
}

</style>
