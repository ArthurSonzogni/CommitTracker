<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="sr-only">Organizations emails</h1>

        <FilterPanel :summary="listSummary(repositoryNames(repositories), 'repositories')">
          <RepositorySelector
            v-model="repositories"
            size="medium"
            :allowMultiple="true"
            :allowAll="true">
          </RepositorySelector>
        </FilterPanel>
        <FetchError v-if="loadError" class="mt-4" :message="loadError" @retry="refresh" />
      </div>
    </section>

    <section class="container">
      <div class="card box" v-for="o in data" :key="o.org">
        <div class="card-header"
             style="background-color: var(--surface-sunken);">

          <div class="card-header-title">
            <NuxtLink
              :to="{ path: '/organizations/commits', query: { organizations: o.org } }"
              style="color: inherit;">
              {{ o.org }}
            </NuxtLink>
          </div>
          <div class="card-header-title">
            <UiTooltip :text="o.username_size + ' unique usernames'" position="bottom">
              <div>{{ o.emails.length }} emails</div>
            </UiTooltip>
          </div>
        </div>


        <div class="">
          <div class="content" v-if="o.collapsed">
            <ul>
              <li v-for="email in o.emails_short" :key="email">
                {{ email }}
              </li>
              <li>... <a @click="o.collapsed = false">Show all</a></li>
            </ul>
          </div>

          <div class="content" v-if="!o.collapsed">
            <ul>
              <li v-for="email in o.emails" :key="email">
                {{ email }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchJson, formatFetchError } from "~/utils/fetchJson";
import { listSummary, repositoryNames } from "~/utils/filter-summary";

interface OrganizationEmailsEntry {
  org: string;
  emails: string[];
  emails_short: string[];
  emails_size: number;
  username_size: number;
  collapsed: boolean;
}

const { repositories } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
});

const data = ref<OrganizationEmailsEntry[]>([]);
const loadError = ref<string | null>(null);
let requestId = 0;

const refresh = async () => {
  const id = ++requestId;
  const repos = [...repositories.value];
  loadError.value = null;
  if (repos.length === 0) {
    data.value = [];
    return;
  }

  let json_data: Record<string, string[]>[];
  try {
    json_data = await Promise.all(
      repos.map(repo => fetchJson<Record<string, string[]>>(`/data/${repo}/organizations_emails.json`, { cache: true })),
    );
  } catch (error) {
    if (id === requestId) {
      loadError.value = formatFetchError(error, "Failed to load organization emails.");
    }
    return;
  }
  if (id !== requestId) return;

  const emails: Record<string, Set<string>> = {};
  for (const d of json_data) {
    for (const org in d) {
      if (!emails[org]) {
        emails[org] = new Set();
      }
      for (const email of d[org]) {
        emails[org].add(email);
      }
    }
  }

  const new_data: OrganizationEmailsEntry[] = [];
  for (const [org, emails_data] of Object.entries(emails)) {
    const sortedEmails = Array.from(emails_data).sort();
    new_data.push({
      org,
      emails: sortedEmails,
      emails_short: sortedEmails.slice(0, 5),
      emails_size: sortedEmails.length,
      username_size: new Set(sortedEmails.map(e => e.split("@")[0])).size,
      collapsed: sortedEmails.length > 6,
    });
  }
  new_data.sort((a, b) => b.emails.length - a.emails.length);

  data.value = new_data;
};

onMounted(refresh);
watch(repositories, refresh);
</script>

