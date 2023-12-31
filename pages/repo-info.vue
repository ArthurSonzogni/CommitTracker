<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Repositories info</h1>

        <div class="columns is-multiline">
          <div class="column is-full-mobile is-half-desktop is-one-third-widescreen"
               v-for="repo in repositories">
            <div class="card"
                 >
              <div class="card-header">
                <div class="card-header-title"
                 :style='{
                   backgroundColor: repo.color + "66",
                 }
                 '>
                  {{repo.name}}
                </div>
              </div>

              <div class="card-content">
                 <b-field>
                   <b-tag icon="source-branch">{{repo.head}}</b-tag>
                 </b-field>

                 <b-field>
                   <b-tag icon="source-commit">
                     <a
                      :href="'https://github.com' + '/' + repo.owner + '/' +
                      repo.repository + '/commit/' + repo.last_commit">
                       {{repo.last_commit}}
                     </a>
                   </b-tag>
                 </b-field>

                   <a :href="'https://github.com' + '/' + repo.owner + '/' + repo.repository">
                     {{repo.owner}}/{{repo.repository}}
                   </a>
              </div>
            </div>
          </div>
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
           href="https://github.com/ArthurSonzogni/ChromeCommitTracker/tree/main/static/repositories.json">
          Source
        </a>
        <pre class="content">{{json}}</pre>
      </div>
    </section>
  </div>
</template>

<script>
import repositories from 'static/repositories.json'

export default {
  data() {
    const json = JSON.stringify(repositories, null, 2);
    for(let repo of repositories) {
      repo.last_commit = "...";
      repo.last_commit_date = 0;
    }
    return {
      json,
      repositories: repositories,
    }
  },

  mounted() {
    this.fetchRepositories();
  },

  methods: {
    fetchRepositories() {
      for(let repo of this.repositories) {
        this.fetchRepository(repo);
      }
    },

    async fetchRepository(repo) {
      const response = await fetch(`/data/${repo.dirname}/last.json`);
      const json = await response.json();
      repo.last_commit = json.sha;
    },
  },
}

</script>
