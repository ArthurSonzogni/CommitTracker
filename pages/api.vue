<template>
  <div>
    <Navbar/>

    <section class="hero">
      <div class="hero-body">
        <p class="title">
          Contributors list
        </p>
      </div>
    </section>

    <section>
      <div class="container">
        <div class="title">Contributor list</div>
        <p>
          This page lists all the contributors of the Chromium project.
          The list is generated from the git log.
          <code>/data/users.json</code>
        </p>

        <div class="title">/data/users/${user}.json</div>
      </div>
    </section>
  </div>
</template>
