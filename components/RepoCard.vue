<template>
  <div class="column is-full-mobile is-half-desktop is-one-third-widescreen">
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
            :href="`https://github.com/${repo.owner}/${repo.repository}/tree/HEAD/${repo.cone || '/'}`">
            {{repo.cone || '/'}}
          </a>
        </b-field>
      </div>
    </div>
  </div>
  </section>

</template>

<script>

export default {
  props: {
    repo: Object
  },
  name: 'RepoCard',
}

</script>
