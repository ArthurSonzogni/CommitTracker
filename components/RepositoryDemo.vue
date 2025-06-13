<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/repositories">
        3. Repositories statistics
        </NuxtLink>
      </h1>

      <div class="columns">
        <div class="column content">
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
