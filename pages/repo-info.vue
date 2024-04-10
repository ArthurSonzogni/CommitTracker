<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Repositories info</h1>

        <div class="columns is-multiline">

          <RepoCard
          v-for="repo in repositories"
          :key="repo.name"
          :repo="repo"
          />

          <div class="flex"></div>
        </div>
      </div>
    </section>

    <section>
      <div class="container">
        <h1 class="title">
          Raw data
        </h1>
        <a class="button is-small is-primary"
          href="/data/repositories.json">
          Download
        </a>
        <a class="button is-small is-primary"
          href="https://github.com/ArthurSonzogni/ChromeCommitTracker/tree/main/repositories.json5">
          Source
        </a>
        <pre class="content">{{json}}</pre>
      </div>
    </section>
  </div>
</template>

<script>
import repositories_raw from 'static/data/repositories.json'

export default {
  data() {
    const json = JSON.stringify(repositories_raw, null, 2);
    let repositories = structuredClone(repositories_raw);

    return {
      json,
      repositories,
    }
  },
}

</script>
