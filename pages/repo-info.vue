<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">Repositories info</h1>

        <div class="columns is-multiline">
          <div class="column is-full-mobile is-half-desktop is-one-third-widescreen"
               v-for="repo in repositories"
               :key="repo.name"
               >
            <div class="card">
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
                  <b-icon icon="github">
                  </b-icon>
                    <a :href="`https://github.com/${repo.owner}/${repo.repository}`">
                      {{repo.owner}}/{{repo.repository}}
                    </a>
                </b-field>

                <b-field>
                  <b-icon icon="subdirectory-arrow-right">
                  </b-icon>
                  <a
                    :href="`https://github.com/${repo.owner}/${repo.repository}/tree/${repo.branches[0]}/${repo.cone || '/'}`">
                    {{repo.cone || '/'}}
                  </a>
                </b-field>

                <b-field v-for="(branch, i) in repo.branches" :key="branch">
                  <b-icon icon="source-branch"></b-icon>
                  <a :href="`https://github.com/${repo.owner}/${repo.repository}/tree/${branch}/${repo.cone || '/'}`">
                    {{branch}}
                  </a>

                  :

                  <a :href="`https://github.com/${repo.owner}/${repo.repository}/commit/${repo.last_commit ? repo.last_commit[i] : branch}`">
                    {{repo.last_commit ? repo.last_commit[i] : '...'}}
                  </a>
                </b-field>
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
           href="https://github.com/ArthurSonzogni/ChromeCommitTracker/tree/main/repositories.json5">
          Source
        </a>
        <pre class="content">{{json}}</pre>
      </div>
    </section>
  </div>
</template>

<script>
import repositories from 'static/data/repositories.json'

export default {
  data() {
    const json = JSON.stringify(repositories, null, 2);
    for(let repo of repositories) {
      repo.last_commit = [];
    }
    return {
      json,
      repositories,
    }
  },

  mounted() {
    setTimeout(() => {
      this.fetchRepositories();
    }, 100);
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
      for(let branch in repo.branches) {
        repo.last_commit.push(json[repo.branches[branch]])
      }
    },
  },
}

</script>

<style scoped>
.cone {
  font-size: 0.8em !important;
}
</style>
