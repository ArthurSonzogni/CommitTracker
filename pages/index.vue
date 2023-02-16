<template>
  <div>
    <section class="hero is-primary">
      <div class="container">
        <div class="hero-body">
          <p class="title">
            ChromeCommitTracker
          </p>
          <p class="subtitle">
            By @arthursonzogni
          </p>
        </div>
      </div>
    </section>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">
          <NuxtLink to="/timeline">
          The timeline
          </NuxtLink>
        </h1>

        <div class="columns">
          <div class="column">
            <p>
              The timeline page shows instantaneously the evolution of the
              number of commits over time. You can filter by developer, authors,
              reviewers and date.
            </p>
          </div>

          <div class="column">
            <TimelineChartRoll/>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
