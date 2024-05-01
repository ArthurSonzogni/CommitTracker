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

<script setup lang="ts">
import repositories_raw from 'public/data/repositories.json'

const json = ref(JSON.stringify(repositories_raw, null, 2));
const repositories = ref(structuredClone(repositories_raw));

</script>
