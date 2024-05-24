<template>
  <div>
    <section class="hero is-primary">
      <div class="hero-body">
        <div class="container">
          <h1 class="title">
            ChromeCommitTracker
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

<style scoped>
h1 {
  text-shadow:
    0px 3px 4px rgba(0, 0, 0, 0.5),
    0px -1px 32px rgba(255, 255, 255, 1.0)
  ;
}

h2 {
  opacity: 0.5;
  transition: opacity 0.5s;
}

h2:hover {
  opacity: 1;
}
</style>
