<template>
  <div>
    <section class="section">
      <div class="container">
        <nav class="dossier-crumbs" aria-label="Breadcrumb">
          <NuxtLink to="/components?tab=teams" class="crumb-link">
            <UiIcon name="account-group" size="small" />
            Teams
          </NuxtLink>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">{{ emailParam }}</span>
        </nav>

        <div v-if="loading" class="state-card">Loading team dossier…</div>

        <div v-else-if="!team" class="state-card">
          <h1 class="title is-4 mb-2">No team matching “{{ emailParam }}”</h1>
          <p class="mb-4">Browse all 243 Chromium <code>team_email</code> owners in the directory:</p>
          <NuxtLink to="/components?tab=teams" class="button is-primary">
            Browse all teams
          </NuxtLink>
        </div>

        <template v-else>
          <!-- Executive Header -->
          <header class="dossier-header">
            <div>
              <div class="eyebrow">
                <span>Chromium Engineering Team Dossier</span>
                <span v-for="os in team.os" :key="os" class="meta-tag">{{ os }}</span>
              </div>
              <h1 class="title dossier-h1">{{ team.email }}</h1>
              <div class="identity-chips">
                <span class="id-chip is-accent">
                  <UiIcon name="sitemap" size="small" />
                  {{ team.componentCount }} {{ team.componentCount === 1 ? "component" : "components" }}
                </span>
                <span class="id-chip">
                  <UiIcon name="folder-open" size="small" />
                  {{ fmtInt(team.dirMetaCount) }} DIR_METADATA files ({{ fmtInt(team.ownedDirCount) }} dirs)
                </span>
                <a
                  v-for="bid in team.bugPublicIds.slice(0, 4)"
                  :key="'bp-' + bid"
                  :href="`https://issues.chromium.org/issues?q=componentid:${bid}`"
                  target="_blank"
                  rel="noopener"
                  class="id-chip">
                  Buganizer #{{ bid }}
                  <UiIcon name="open-in-new" size="small" />
                </a>
              </div>
            </div>

            <div class="header-actions">
              <NuxtLink
                v-if="team.roots[0]"
                class="action-btn is-primary-btn"
                :to="`/treemap?repositories=chromium&path=${team.roots[0].path.split('/').map(encodeURIComponent).join(',')}&field_color=todo`">
                <UiIcon name="chart-tree" size="small" />
                Explore Primary Root in Treemap
              </NuxtLink>
            </div>
          </header>

          <!-- Owned Components Portfolio Table -->
          <div v-if="ownedComponentEntries.length > 0" class="panel-card mb-block">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Owned Components Portfolio ({{ ownedComponentEntries.length }})</h2>
                <p class="panel-subtitle">
                  Components mapped to <code>{{ team.email }}</code> via <code>DIR_METADATA</code>
                </p>
              </div>
            </div>

            <UiTable
              :data="ownedComponentEntries"
              row-key="name"
              hoverable
              striped
              :paginated="ownedComponentEntries.length > 15"
              :per-page="15">
              <UiTableColumn field="name" label="Component" sortable v-slot="{ row }">
                <NuxtLink :to="componentPath(row.name)" class="comp-link">
                  {{ row.name }}
                </NuxtLink>
                <span v-if="row.isHighVrpUnfuzzed" class="inline-risk-tag">Unfuzzed High-VRP</span>
              </UiTableColumn>
              <UiTableColumn field="lines" label="Code (LoC)" numeric sortable v-slot="{ row }">
                <span class="mono">{{ fmtLoc(row.lines) }}</span>
              </UiTableColumn>
              <UiTableColumn field="commits12m" label="12m Commits" numeric sortable v-slot="{ row }">
                <span class="mono">{{ fmtInt(row.commits12m) }}</span>
              </UiTableColumn>
              <UiTableColumn field="cveTotal" label="CVEs" numeric sortable v-slot="{ row }">
                <span class="mono">{{ row.cveTotal }}</span>
              </UiTableColumn>
              <UiTableColumn field="vrpTotal" label="VRP ($)" numeric sortable v-slot="{ row }">
                <span class="mono">{{ row.vrpTotal > 0 ? fmtUsd(row.vrpTotal) : "—" }}</span>
              </UiTableColumn>
              <UiTableColumn field="unsafeBuffers" label="Unsafe Buf" numeric sortable v-slot="{ row }">
                <span class="mono">{{ row.unsafeBuffers }}</span>
              </UiTableColumn>
              <UiTableColumn field="fuzzerCount" label="Fuzzers" numeric sortable v-slot="{ row }">
                <span class="mono">{{ row.fuzzerCount }}</span>
              </UiTableColumn>
            </UiTable>
          </div>

          <!-- Shared Executive Metrics, Sparklines, Language/Safety & Owned Directories -->
          <DossierMetricsView
            :code="team.code"
            :commits="team.commits"
            :fuzzers="team.fuzzers"
            :cves="team.cves"
            :accretion="team.accretion"
            :roots="team.roots"
            :root-count="team.rootCount"
            :dir-meta-count="team.dirMetaCount"
            :owned-dir-count="team.ownedDirCount"
            :quarter-labels="dataset?.quarterLabels || []"
            :cve-filter-component="team.components[0]" />
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  componentPath,
  fetchComponentsDataset,
  type ComponentEntry,
  type ComponentsDataset,
  type TeamEntry,
} from "~/utils/componentsData";

const route = useRoute();

const dataset = shallowRef<ComponentsDataset | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    dataset.value = await fetchComponentsDataset();
  } finally {
    loading.value = false;
  }
});

const emailParam = computed(() => {
  const raw = route.params.email;
  const val = Array.isArray(raw) ? raw[0] : raw;
  try {
    return decodeURIComponent(val || "").trim().toLowerCase();
  } catch {
    return (val || "").trim().toLowerCase();
  }
});

const team = computed<TeamEntry | null>(() => {
  if (!dataset.value || !emailParam.value) return null;
  return dataset.value.teamsByEmail.get(emailParam.value) || null;
});

const ownedComponentEntries = computed<ComponentEntry[]>(() => {
  if (!dataset.value || !team.value) return [];
  return team.value.components
    .map((name) => dataset.value!.componentsByName.get(name))
    .filter((c): c is ComponentEntry => Boolean(c))
    .sort((a, b) => b.lines - a.lines || b.vrpTotal - a.vrpTotal);
});

useHead(() => ({
  title: team.value ? `${team.value.email} · Team Dossier` : "Team Dossier",
}));

const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const fmtUsd = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
const fmtLoc = (n: number) => {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};
</script>

<style scoped>
.dossier-crumbs {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.85rem;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.crumb-link {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  gap: 0.25rem;
  text-decoration: none;
}

.crumb-link:hover {
  color: var(--accent);
}

.crumb-sep {
  color: var(--faint);
}

.crumb-current {
  color: var(--ink);
  font-weight: 600;
}

.state-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 2rem;
  text-align: center;
}

.dossier-header {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.eyebrow {
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.76rem;
  font-weight: 600;
  gap: 0.45rem;
  letter-spacing: 0.03em;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
}

.meta-tag {
  background: var(--surface-sunken);
  border-radius: 999px;
  color: var(--ink-2);
  font-size: 0.7rem;
  padding: 0.08rem 0.5rem;
}

.dossier-h1 {
  font-family: var(--font-mono);
  font-size: 1.65rem;
  line-height: 1.25;
  margin: 0 0 0.6rem;
  word-break: break-all;
}

.identity-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.id-chip {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.79rem;
  gap: 0.3rem;
  padding: 0.2rem 0.65rem;
  text-decoration: none;
}

.id-chip.is-accent {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
  font-weight: 600;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.action-btn {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  display: inline-flex;
  font-size: 0.84rem;
  font-weight: 600;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  text-decoration: none;
}

.action-btn.is-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.action-btn.is-primary-btn:hover {
  background: var(--accent-hover);
  color: #fff;
}

.panel-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-xs);
  padding: 1.1rem 1.2rem;
}

.mb-block {
  margin-bottom: 1.25rem;
}

.panel-head {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.85rem;
}

.panel-title {
  color: var(--ink);
  font-size: 1.02rem;
  font-weight: 650;
  margin: 0;
}

.panel-subtitle {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0.15rem 0 0;
}

.comp-link {
  font-weight: 600;
  text-decoration: none;
}

.inline-risk-tag {
  background: var(--tag-danger-bg);
  border-radius: 999px;
  color: var(--tag-danger-ink);
  font-size: 0.68rem;
  font-weight: 600;
  margin-left: 0.4rem;
  padding: 0.05rem 0.42rem;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
