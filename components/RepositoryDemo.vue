<template>
  <section class="section feature">
    <div class="container">
      <header class="feature-header">
        <span class="feature-index">03</span>
        <h2 class="title">
          <NuxtLink to="/repositories">Repositories statistics</NuxtLink>
        </h2>
        <NuxtLink class="feature-link" to="/repositories">
          Open
          <b-icon icon="arrow-right" size="is-small"></b-icon>
        </NuxtLink>
      </header>

      <div class="columns">
        <div class="column content">
          <div class="frame">
          <Contributions
            :repositories="['chromium']"
            percentile="0.5"
            :individual="300"
            grouping="yearly"
            what="contributors"
            display="average"
            kind="author"
            :developers="[]">
          </Contributions>
          </div>

        </div>
        <div class="column is-5 content">
          <p>
            Get statistics about every repositories:
          </p>
          <ul>
            <li>Number of commits</li>
            <li>Number of contributors</li>
            <li>Number of newcomers</li>
            <li>Individual statistics</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
