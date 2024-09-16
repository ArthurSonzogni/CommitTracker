<template>
  <div>
    <section class="hero is-primary">
      <div class="hero-body">
        <div class="container">
          <!-- A transition for the {repository}CommitTracker-->
          <h1 class="title" key="repository">
            {{repository}}<span class="non-selectable">|</span>CommitTracker
          </h1>

          <h2 class="subtitle">
            @arthursonzogni
          </h2>
        </div>
      </div>
    </section>
    <Navbar/>
    <CommunityMapDemo/>
    <StatsDemo/>
    <RepositoryDemo/>
    <TreemapDemo/>
  </div>
</template>

<script setup lang="ts">
import repositories_json from '../public/data/repositories.json'

const repository = ref("Chromium");
const repositories = ref(repositories_json);

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

h1 {
  transition: all 0.3s;
}

.flash {
  text-shadow:
    0 0 2px white,
    0 0 20px white;
}

h2 {
  opacity: 0.5;
  transition: opacity 0.5s;
}
h2:hover {
  opacity: 1;
}

.non-selectable {
  user-select: none;
}

</style>
