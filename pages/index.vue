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
h2 {
  opacity: 0.5;
  transition: opacity 0.5s;
}
h2:hover {
  opacity: 1;
}
</style>
