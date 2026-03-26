<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container content">
        <h1 class="title">The API</h1>
        <p>
          This is a static server. All the responses are static JSON files. They
          are refreshed every week by a bot running on Github actions.
        </p>

        <p>
          Those responses are giving informations about the emails, usernames
          and organizations of the contributors.
        </p>

        <h2>
          Endpoints
        </h2>

        <ul>
          <li> <a href="/data/repositories.json">
              <code>/data/repositories.json</code>
            </a>: The list of repositories that we want to track.
          </li>

          <li> <a href="/data/repositories_stats.json">
              <code>/data/repositories_stats.json</code>
            </a>: Global statistics for each repository (commits, contributors, top organizations).
          </li>

          <li>
            <ul>
              <li>
                <a href="/data/chromium/emails.json">
                  <code>/data/${repo}/emails.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/emails/arthursonzogni@chromium.org.json">
                  <code>/data/${repo}/emails/${email}.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/emails_summary_commit_yearly_author.json">
                  <code>/data/${repo}/emails_summary_commit_${group_by}_{side}.json</code>
                </a>
              </li>
            </ul>
          </li>

          <li>
            <ul>
              <li> <a href="/data/chromium/usernames.json">
                  <code>/data/${repo}/usernames.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/usernames/arthursonzogni.json">
                  <code>/data/${repo}/usernames/${username}.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/usernames_summary_commit_yearly_author.json">
                  <code>/data/${repo}/usernames_summary_commit_${group_by}_{side}.json</code>
                </a>
              </li>
            </ul>
          </li>

          <li>
            <ul>

              <li>
                <a href="/data/chromium/organizations.json">
                  <code>/data/${repo}/organizations.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/organizations_summary_commit_yearly_author.json">
                  <code>/data/${repo}/organizations_summary_commit_${group_by}_{side}.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/organizations_summary_contributor_yearly_author.json">
                  <code>/data/${repo}/organizations_summary_contributor_${group_by}_{side}.json</code>
                </a>
              </li>

            </ul>
          </li>
        </ul>

        <h2>Params</h2>
        <ul>
          <li>
            <code>repo</code> is one of:
            <span class="tags" style="display: inline-flex; flex-wrap: wrap; gap: 0.5rem; vertical-align: middle; margin-left: 0.5rem;">
              <b-tag v-for="repo in sortedRepos" :key="repo">{{ repo }}</b-tag>
            </span>
          </li>
          <li>
            <code>email</code> is an email address.
          </li>
          <li>
            <code>group_by</code> is one of:
            <b-tag>forever</b-tag> <b-tag>decennial</b-tag> <b-tag>yearly</b-tag> <b-tag>quarterly</b-tag> <b-tag>monthly</b-tag>
          </li>
          <li>
            <code>side</code> is one of:
            <b-tag>author</b-tag> <b-tag>review</b-tag> <b-tag>both</b-tag>
          </li>
        </ul>

        <h2>Guarantees</h2>
        <p>
          There are no guarantees about how long the API will stay in the
          current shape. Please let me know when you start relying on it, so
          that I can consider not to change it anymore, or to provide a better
          service.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import repositories_raw from 'public/data/repositories.json'

const sortedRepos = computed(() => {
  return repositories_raw.map(r => r.dirname).sort((a, b) => a.localeCompare(b));
});
</script>
