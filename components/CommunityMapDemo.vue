<template>
  <section class="section feature">
    <div class="container">
      <header class="feature-header">
        <span class="feature-index">01</span>
        <h2 class="title">
          <NuxtLink to="/communities">Community graph</NuxtLink>
        </h2>
        <NuxtLink class="feature-link" to="/communities">
          Open
          <b-icon icon="arrow-right" size="is-small"></b-icon>
        </NuxtLink>
      </header>

      <div class="columns">
        <div class="column is-8 content">
          <NuxtLink to="/communities" class="frame">
            <img src="/community-map/illustration.jpg"/>
          </NuxtLink>
        </div>
        <div class="column is-4 content">
          <p>
            A data visualization of the interactions between developers. Find
            out what are the different communities, and how they evolved over
            the years.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
