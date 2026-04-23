<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container is-fluid">
        <h1 class="title">Repositories info</h1>

        <div class="table-container is-hidden-touch">
          <table class="table is-striped is-hoverable is-fullwidth">
            <thead>
              <tr>
                <th @click="sortBy('name')" class="is-clickable">
                  <b-tooltip label="The display name of the project in this tracker" position="is-bottom">
                    <span class="has-tooltip-dotted">Name</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'name'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('repository')" class="is-clickable">
                  <b-tooltip label="The source repository hosted on GitHub" position="is-bottom">
                    <span class="has-tooltip-dotted">GitHub Repository</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'repository'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('path')" class="is-clickable">
                  <b-tooltip label="The specific sub-directory tracked (for monorepos)" position="is-bottom">
                    <span class="has-tooltip-dotted">Path</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'path'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('reviewers')" class="has-text-centered is-clickable">
                  <b-tooltip label="Indicates if reviewer data (CR+1/CQ+1) is tracked for this project" position="is-bottom" multilined>
                    <span class="has-tooltip-dotted">Reviewers</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'reviewers'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('treemap')" class="has-text-centered is-clickable">
                  <b-tooltip label="Indicates if a component treemap visualization is available" position="is-bottom">
                    <span class="has-tooltip-dotted">Treemap</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'treemap'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('commits')" class="has-text-right is-clickable has-left-border">
                  <b-tooltip label="Total authored commits recorded in our database" position="is-bottom">
                    <span class="has-tooltip-dotted">Commits</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'commits'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('contributors')" class="has-text-right is-clickable">
                  <b-tooltip label="Total number of unique contributors recorded" position="is-bottom">
                    <span class="has-tooltip-dotted">Contributors</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'contributors'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('driver_1')" class="is-clickable has-left-border">
                  <b-tooltip label="The organization or group with the most commits in the last 5 years" position="is-bottom" multilined>
                    <span class="has-tooltip-dotted">Driver 1</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'driver_1'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('driver_2')" class="is-clickable">
                  <b-tooltip label="The organization or group with the 2nd most commits in the last 5 years" position="is-bottom" multilined>
                    <span class="has-tooltip-dotted">Driver 2</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'driver_2'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('driver_3')" class="is-clickable">
                  <b-tooltip label="The organization or group with the 3rd most commits in the last 5 years" position="is-bottom" multilined>
                    <span class="has-tooltip-dotted">Driver 3</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'driver_3'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('last_commit')" class="is-clickable has-left-border">
                  <b-tooltip label="The date of the most recent commit fetched into the database" position="is-bottom" multilined>
                    <span class="has-tooltip-dotted">Last Commit</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'last_commit'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
                <th @click="sortBy('state')" class="is-clickable">
                  <b-tooltip label="How up-to-date the local data is compared to the source (green: < 2 days, yellow: < 7 days, red: outdated)" position="is-bottom" multilined>
                    <span class="has-tooltip-dotted">State</span>
                  </b-tooltip>
                  <b-icon v-if="sortKey === 'state'" :icon="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" size="is-small"></b-icon>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="repo in sortedRepositories" :key="repo.name">
                <td>
                  <span class="tag" :style="{ backgroundColor: repo.color, color: getContrastColor(repo.color) }">
                    {{ repo.name }}
                  </span>
                </td>
                <td>
                  <a :href="`https://github.com/${repo.owner}/${repo.repository}`" target="_blank" class="is-family-monospace is-size-7">
                    {{ repo.owner }}/{{ repo.repository }}
                  </a>
                </td>
                <td class="path-cell">
                  <a v-if="repo.cone" :href="`https://github.com/${repo.owner}/${repo.repository}/tree/HEAD/${repo.cone}`" target="_blank" class="is-size-7">
                    <code>{{ repo.cone }}</code>
                  </a>
                  <span v-else class="has-text-grey-light">/</span>
                </td>
                <td class="has-text-centered">
                  <b-icon v-if="repo.reviewers" icon="check" type="is-success" size="is-small"></b-icon>
                  <b-icon v-else icon="close" type="is-danger" size="is-small"></b-icon>
                </td>
                <td class="has-text-centered">
                  <b-icon v-if="repo.treemap" icon="check" type="is-success" size="is-small"></b-icon>
                  <b-icon v-else icon="close" type="is-danger" size="is-small"></b-icon>
                </td>
                <td class="has-text-right is-family-monospace is-size-7 has-left-border">
                  {{ formatNumber(stats[repo.dirname]?.total_commits) }}
                </td>
                <td class="has-text-right is-family-monospace is-size-7">
                  {{ formatNumber(stats[repo.dirname]?.total_contributors) }}
                </td>
                <td class="is-size-7 has-left-border">
                  {{ stats[repo.dirname]?.top_organizations?.[0] || '-' }}
                </td>
                <td class="is-size-7">
                  {{ stats[repo.dirname]?.top_organizations?.[1] || '-' }}
                </td>
                <td class="is-size-7">
                  {{ stats[repo.dirname]?.top_organizations?.[2] || '-' }}
                </td>
                <td class="has-left-border">
                  <span class="is-size-7">
                    {{ formatMetadata(repo.dirname)?.date || 'N/A' }}
                  </span>
                </td>
                <td>
                  <span v-if="formatMetadata(repo.dirname)" :class="['tag', 'is-small', getStateClass(repo.dirname)]">
                    {{ formatMetadata(repo.dirname).days }}d ago
                  </span>
                  <span v-else class="tag is-small is-light">Unknown</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="is-hidden-desktop">
          <div class="box mb-4 p-4" v-for="repo in sortedRepositories" :key="repo.name + '-mobile'">
            <div class="is-flex" style="justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span class="tag is-medium" :style="{ backgroundColor: repo.color, color: getContrastColor(repo.color) }">
                {{ repo.name }}
              </span>
              <span v-if="formatMetadata(repo.dirname)" :class="['tag', getStateClass(repo.dirname)]">
                {{ formatMetadata(repo.dirname).days }}d ago
              </span>
              <span v-else class="tag is-light">Unknown</span>
            </div>
            
            <div class="content is-small">
              <p style="margin-bottom: 0.5rem;">
                <strong>Repo:</strong> 
                <a :href="`https://github.com/${repo.owner}/${repo.repository}`" target="_blank" class="is-family-monospace">
                  {{ repo.owner }}/{{ repo.repository }}
                </a>
              </p>
              <p style="margin-bottom: 0.5rem;" v-if="repo.cone">
                <strong>Path:</strong> 
                <a :href="`https://github.com/${repo.owner}/${repo.repository}/tree/HEAD/${repo.cone}`" target="_blank">
                  <code>{{ repo.cone }}</code>
                </a>
              </p>
              <p style="margin-bottom: 0.5rem;">
                <strong>Commits:</strong> {{ formatNumber(stats[repo.dirname]?.total_commits) }}
              </p>
              <p style="margin-bottom: 0.5rem;">
                <strong>Contributors:</strong> {{ formatNumber(stats[repo.dirname]?.total_contributors) }}
              </p>
              <p style="margin-bottom: 0.5rem;">
                <strong>Top Driver:</strong> {{ stats[repo.dirname]?.top_organizations?.[0] || '-' }}
              </p>
              <div class="is-flex mt-2" style="gap: 0.5rem; align-items: center;">
                <span class="has-text-grey">Features:</span>
                <span class="tag is-light">
                  <b-icon v-if="repo.reviewers" icon="check" type="is-success" size="is-small"></b-icon>
                  <b-icon v-else icon="close" type="is-danger" size="is-small"></b-icon>
                  <span class="ml-1">Reviewers</span>
                </span>
                <span class="tag is-light">
                  <b-icon v-if="repo.treemap" icon="check" type="is-success" size="is-small"></b-icon>
                  <b-icon v-else icon="close" type="is-danger" size="is-small"></b-icon>
                  <span class="ml-1">Treemap</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container is-fluid">
        <h1 class="title">Raw data</h1>
        <div class="buttons">
          <a class="button is-small is-primary" href="/data/repositories.json">
            Download JSON
          </a>
          <a class="button is-small is-primary" href="https://github.com/ArthurSonzogni/ChromeCommitTracker/tree/main/repositories.json5" target="_blank">
            Source (repositories.json5)
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import repositories_raw from '~/public/data/repositories.json'

const repositories = ref(structuredClone(repositories_raw));
const stats = ref<Record<string, any>>({});

const sortKey = ref<string | null>(null);
const sortOrder = ref('asc');

const sortedRepositories = computed(() => {
  if (!sortKey.value) return repositories.value;

  return [...repositories.value].sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;

    switch (sortKey.value) {
      case 'name':
        valA = a.name; valB = b.name; break;
      case 'repository':
        valA = `${a.owner}/${a.repository}`; valB = `${b.owner}/${b.repository}`; break;
      case 'path':
        valA = a.cone || ''; valB = b.cone || ''; break;
      case 'commits':
        valA = stats.value[a.dirname]?.total_commits || 0; valB = stats.value[b.dirname]?.total_commits || 0; break;
      case 'contributors':
        valA = stats.value[a.dirname]?.total_contributors || 0; valB = stats.value[b.dirname]?.total_contributors || 0; break;
      case 'driver_1':
        valA = stats.value[a.dirname]?.top_organizations?.[0] || ''; valB = stats.value[b.dirname]?.top_organizations?.[0] || ''; break;
      case 'driver_2':
        valA = stats.value[a.dirname]?.top_organizations?.[1] || ''; valB = stats.value[b.dirname]?.top_organizations?.[1] || ''; break;
      case 'driver_3':
        valA = stats.value[a.dirname]?.top_organizations?.[2] || ''; valB = stats.value[b.dirname]?.top_organizations?.[2] || ''; break;
      case 'reviewers':
        valA = a.reviewers ? 1 : 0; valB = b.reviewers ? 1 : 0; break;
      case 'treemap':
        valA = a.treemap ? 1 : 0; valB = b.treemap ? 1 : 0; break;
      case 'last_commit':
        valA = stats.value[a.dirname]?.last_commit || ''; valB = stats.value[b.dirname]?.last_commit || ''; break;
      case 'state':
        valA = formatMetadata(a.dirname)?.days ?? Infinity; valB = formatMetadata(b.dirname)?.days ?? Infinity; break;
    }

    if (valA < valB) return sortOrder.value === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder.value === 'asc' ? 1 : -1;
    return 0;
  });
});

function sortBy(key: string) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = ['commits', 'contributors', 'reviewers', 'treemap', 'last_commit'].includes(key) ? 'desc' : 'asc';
  }
}

onMounted(async () => {
  try {
    const response = await fetch('/data/repositories_stats.json');
    if (response.ok) {
      stats.value = await response.json();
    }
  } catch (e) {
    console.error('Failed to fetch stats:', e);
  }
});

function formatMetadata(dirname: string) {
  const dateStr = stats.value[dirname]?.last_commit;
  if (!dateStr) return null;

  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    date: date.toLocaleDateString(),
    days: diffDays
  };
}

function getStateClass(dirname: string) {
  const meta = formatMetadata(dirname);
  if (!meta) return 'is-light';
  if (meta.days < 2) return 'is-success';
  if (meta.days < 7) return 'is-warning';
  return 'is-danger';
}

function getContrastColor(hexColor: string) {
  if (!hexColor) return '#000';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000' : '#fff';
}

function formatNumber(num: number | undefined) {
  if (num === undefined) return 'N/A';
  return new Intl.NumberFormat().format(num);
}

</script>

<style scoped>
.table th {
  vertical-align: middle;
  white-space: nowrap;
}
.tag {
  font-weight: bold;
}
.has-tooltip-dotted {
  cursor: help;
}
.is-clickable {
  cursor: pointer;
  user-select: none;
}
.is-clickable:hover {
  background-color: rgba(0,0,0,0.02);
}
.has-left-border {
  border-left: 2px solid hsl(0, 0%, 86%);
}
</style>
