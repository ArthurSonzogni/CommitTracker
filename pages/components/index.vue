<template>
  <div>
    <section class="section">
      <div class="container">
        <header class="page-head">
          <div>
            <h1 class="title mb-1">Components &amp; Teams</h1>
            <p class="subtitle-text">
              Bridging Chromium’s <strong>{{ dataset ? fmtInt(dataset.stats.dirMetadataFiles) : "3,484" }}</strong>
              <code>DIR_METADATA</code> files across code size, commit velocity, fuzzers, memory safety, and CVE rewards.
            </p>
          </div>
          <UiSegmented
            v-model="tab"
            aria-label="Directory view"
            :options="[
              { value: 'components', label: `Components (${dataset ? dirMetaComponentsCount : '…'})`, icon: 'sitemap' },
              { value: 'teams', label: `Teams (${dataset ? dataset.teams.length : '…'})`, icon: 'account-group' },
            ]" />
        </header>

        <div v-if="loading" class="loading-box">Loading component &amp; team dossiers…</div>
        <div v-else-if="errorMsg" class="error-box">{{ errorMsg }}</div>

        <template v-else-if="dataset">
          <!-- Summary Strip -->
          <div class="summary-strip">
            <div class="stat-tile">
              <span class="stat-label"><code>DIR_METADATA</code> Files</span>
              <span class="stat-num">{{ fmtInt(dataset.stats.dirMetadataFiles) }}</span>
              <span class="stat-note">{{ fmtInt(dataset.stats.commonMetadataMixins) }} mixins ({{ fmtInt(dataset.stats.mixinEdgesResolved) }} refs)</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Tracked Components</span>
              <span class="stat-num">{{ fmtInt(dataset.stats.dirMetadataComponents) }}</span>
              <span class="stat-note">+{{ dataset.stats.totalComponents - dataset.stats.dirMetadataComponents }} submodule CVE components</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Engineering Teams</span>
              <span class="stat-num">{{ fmtInt(dataset.stats.uniqueTeams) }}</span>
              <span class="stat-note">Unique <code>team_email</code> owners</span>
            </div>
            <div class="stat-tile">
              <span class="stat-label">Mapped Fuzzers</span>
              <span class="stat-num">{{ fmtInt(dataset.stats.matchedFuzzers) }} <small>/ {{ dataset.stats.totalFuzzers }}</small></span>
              <span class="stat-note">Most-specific prefix resolved</span>
            </div>
            <div class="stat-tile is-callout" @click="activateHighVrpUnfuzzed">
              <span class="stat-label">High-VRP Unfuzzed C++</span>
              <span class="stat-num">{{ highVrpUnfuzzedList.length }}</span>
              <span class="stat-note">{{ fmtUsd(highVrpUnfuzzedSum) }} historical VRP · 0 fuzzers</span>
            </div>
          </div>

          <!-- Executive Spotlight: High-VRP Unfuzzed Components -->
          <div v-if="tab === 'components'" class="spotlight-box">
            <div class="spotlight-head">
              <div class="spotlight-title-wrap">
                <UiIcon name="shield-alert" class="spotlight-icon" />
                <div>
                  <h2 class="spotlight-title">High-VRP Unfuzzed C++ Components</h2>
                  <p class="spotlight-desc">
                    Chromium <code>DIR_METADATA</code> components with significant C++ surface (&ge;5k LoC), substantial VRP payouts, and <strong>zero</strong> registered fuzz targets in <code>fuzz-test</code>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="filter-toggle-btn"
                :class="{ 'is-active': preset === 'unfuzzed_vrp' }"
                @click="toggleUnfuzzedFilter">
                <UiIcon name="filter-variant" size="small" />
                {{ preset === "unfuzzed_vrp" ? "Showing all High-VRP Unfuzzed" : `Filter all ${highVrpUnfuzzedList.length} components` }}
              </button>
            </div>

            <div class="spotlight-cards">
              <NuxtLink
                v-for="comp in highVrpUnfuzzedList.slice(0, 6)"
                :key="comp.name"
                :to="componentPath(comp.name)"
                class="spot-card">
                <div class="spot-name">{{ comp.name }}</div>
                <div class="spot-vrp">{{ fmtUsd(comp.vrpTotal) }} <small>VRP</small></div>
                <div class="spot-meta">
                  <span>{{ comp.cveTotal }} CVEs</span>
                  <span>·</span>
                  <span>{{ fmtLoc(comp.cppLines) }} C++</span>
                  <span v-if="comp.unsafeBuffers > 0">· {{ comp.unsafeBuffers }} unsafe</span>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Filter & Sort Bar -->
          <div class="controls-bar">
            <div class="search-box">
              <UiIcon name="magnify" size="small" class="search-box-icon" />
              <input
                v-model="search"
                type="search"
                :placeholder="tab === 'components' ? 'Filter by component, directory, team email, or Buganizer ID…' : 'Filter by team email, component, or directory…'"
                aria-label="Filter directory" />
              <button
                v-if="search"
                type="button"
                class="clear-btn"
                aria-label="Clear search"
                @click="search = ''">
                <UiIcon name="close-circle" size="small" />
              </button>
            </div>

            <div v-if="tab === 'components'" class="control-item">
              <label class="control-label">Team</label>
              <select v-model="teamFilter" class="native-select" aria-label="Filter by team email">
                <option value="">All teams ({{ dataset.teams.length }})</option>
                <option v-for="t in dataset.teams" :key="t.email" :value="t.email">
                  {{ t.email }} ({{ t.componentCount }})
                </option>
              </select>
            </div>

            <div class="control-item">
              <label class="control-label">OS</label>
              <select v-model="osFilter" class="native-select" aria-label="Filter by OS">
                <option value="">All OS</option>
                <option v-for="os in availableOs" :key="os" :value="os">{{ os }}</option>
              </select>
            </div>

            <div class="control-item">
              <label class="control-label">Sort by</label>
              <select v-model="sortKey" class="native-select" aria-label="Sort by metric">
                <option value="lines">Code Size (LoC)</option>
                <option value="commits12m">12m Commits</option>
                <option value="vrpTotal">VRP Rewards ($)</option>
                <option value="cveTotal">Total CVEs</option>
                <option value="unsafeBuffers">Unsafe Buffers</option>
                <option value="fuzzerCount">Fuzzers</option>
              </select>
            </div>
          </div>

          <!-- Quick Filter Pills (Components Tab) -->
          <div v-if="tab === 'components'" class="preset-pills">
            <button
              type="button"
              class="pill-btn"
              :class="{ 'is-active': preset === 'all' }"
              @click="preset = 'all'">
              DIR_METADATA Components ({{ dirMetaComponentsCount }})
            </button>
            <button
              type="button"
              class="pill-btn is-danger-pill"
              :class="{ 'is-active': preset === 'unfuzzed_vrp' }"
              @click="preset = preset === 'unfuzzed_vrp' ? 'all' : 'unfuzzed_vrp'">
              High-VRP Unfuzzed ({{ highVrpUnfuzzedList.length }})
            </button>
            <button
              type="button"
              class="pill-btn"
              :class="{ 'is-active': preset === 'unsafe' }"
              @click="preset = preset === 'unsafe' ? 'all' : 'unsafe'">
              Has <code>unsafe_buffers</code>
            </button>
            <button
              type="button"
              class="pill-btn"
              :class="{ 'is-active': preset === 'fuzzed' }"
              @click="preset = preset === 'fuzzed' ? 'all' : 'fuzzed'">
              Has Fuzzers
            </button>
            <button
              type="button"
              class="pill-btn"
              :class="{ 'is-active': preset === 'with_submodules' }"
              @click="preset = preset === 'with_submodules' ? 'all' : 'with_submodules'">
              Include Submodule CVEs ({{ dataset.components.length }})
            </button>
            <span class="result-count">
              Showing <strong>{{ filteredComponents.length }}</strong> components
            </span>
          </div>

          <div v-else class="preset-pills">
            <span class="result-count">
              Showing <strong>{{ filteredTeams.length }}</strong> engineering teams
            </span>
          </div>

          <!-- Components Table -->
          <UiTable
            v-if="tab === 'components'"
            :data="filteredComponents"
            row-key="name"
            hoverable
            striped
            paginated
            :per-page="25">
            <UiTableColumn field="name" label="Component" sortable sticky v-slot="{ row }">
              <div class="comp-cell">
                <NuxtLink :to="componentPath(row.name)" class="comp-link">
                  {{ row.name }}
                </NuxtLink>
                <span v-if="row.isHighVrpUnfuzzed" class="badge-chip is-risk" title="High VRP payouts with 0 fuzzers">
                  Unfuzzed High-VRP
                </span>
                <span v-if="row.submodule" class="badge-chip is-sub" :title="row.submodule.label">
                  {{ row.submodule.repo }}
                </span>
                <span v-for="os in row.os" :key="os" class="badge-chip is-os">{{ os }}</span>
              </div>
              <div class="comp-sub">
                <NuxtLink v-if="row.primaryTeam" :to="teamPath(row.primaryTeam)" class="team-inline-link">
                  {{ row.primaryTeam }}
                </NuxtLink>
                <span v-if="row.roots[0]" class="root-hint">
                  <code>{{ row.roots[0].path }}</code>
                  <template v-if="row.rootCount > 1"> +{{ row.rootCount - 1 }}</template>
                </span>
              </div>
            </UiTableColumn>

            <UiTableColumn field="lines" label="Code (LoC)" numeric sortable v-slot="{ row }">
              <span class="mono">{{ fmtLoc(row.lines) }}</span>
            </UiTableColumn>

            <UiTableColumn field="commits12m" label="12m Commits" numeric sortable v-slot="{ row }">
              <span class="mono">{{ fmtInt(row.commits12m) }}</span>
            </UiTableColumn>

            <UiTableColumn field="cveTotal" label="CVEs (24m)" numeric sortable v-slot="{ row }">
              <span class="mono">
                {{ row.cveTotal }}
                <small v-if="row.cves.recent24m" class="muted-inline">({{ row.cves.recent24m }})</small>
              </span>
            </UiTableColumn>

            <UiTableColumn field="vrpTotal" label="VRP ($)" numeric sortable v-slot="{ row }">
              <span class="mono" :class="{ 'vrp-highlight': row.vrpTotal >= 100000 }">
                {{ row.vrpTotal > 0 ? fmtUsd(row.vrpTotal) : "—" }}
              </span>
            </UiTableColumn>

            <UiTableColumn field="unsafeBuffers" label="Unsafe Buf" numeric sortable v-slot="{ row }">
              <span class="mono" :class="{ 'warn-highlight': row.unsafeBuffers > 10 }">
                {{ row.unsafeBuffers }}
              </span>
            </UiTableColumn>

            <UiTableColumn field="fuzzerCount" label="Fuzzers" numeric sortable v-slot="{ row }">
              <span class="mono" :class="{ 'ok-highlight': row.fuzzerCount > 0 }">
                {{ row.fuzzerCount }}
              </span>
            </UiTableColumn>
          </UiTable>

          <!-- Teams Table -->
          <UiTable
            v-else
            :data="filteredTeams"
            row-key="email"
            hoverable
            striped
            paginated
            :per-page="25">
            <UiTableColumn field="email" label="Team Email" sortable sticky v-slot="{ row }">
              <div class="comp-cell">
                <NuxtLink :to="teamPath(row.email)" class="comp-link">
                  {{ row.email }}
                </NuxtLink>
                <span v-for="os in row.os" :key="os" class="badge-chip is-os">{{ os }}</span>
              </div>
              <div class="comp-sub">
                <span>{{ row.componentCount }} {{ row.componentCount === 1 ? "component" : "components" }}:</span>
                <NuxtLink
                  v-for="cName in row.components.slice(0, 2)"
                  :key="cName"
                  :to="componentPath(cName)"
                  class="team-inline-link">
                  {{ cName }}
                </NuxtLink>
                <span v-if="row.componentCount > 2" class="muted-inline">+{{ row.componentCount - 2 }}</span>
              </div>
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
              <span class="mono" :class="{ 'vrp-highlight': row.vrpTotal >= 100000 }">
                {{ row.vrpTotal > 0 ? fmtUsd(row.vrpTotal) : "—" }}
              </span>
            </UiTableColumn>

            <UiTableColumn field="unsafeBuffers" label="Unsafe Buf" numeric sortable v-slot="{ row }">
              <span class="mono">{{ row.unsafeBuffers }}</span>
            </UiTableColumn>

            <UiTableColumn field="fuzzerCount" label="Fuzzers" numeric sortable v-slot="{ row }">
              <span class="mono" :class="{ 'ok-highlight': row.fuzzerCount > 0 }">
                {{ row.fuzzerCount }}
              </span>
            </UiTableColumn>
          </UiTable>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import {
  componentPath,
  fetchComponentsDataset,
  teamPath,
  type ComponentEntry,
  type ComponentsDataset,
  type TeamEntry,
} from "~/utils/componentsData";

const { tab, search, teamFilter, osFilter, sortKey, preset } = useUrlState({
  tab: urlCodecs.enum(["components", "teams"] as const, "components"),
  search: { ...urlCodecs.string(""), key: "q" },
  teamFilter: { ...urlCodecs.string(""), key: "team" },
  osFilter: { ...urlCodecs.string(""), key: "os" },
  sortKey: {
    ...urlCodecs.enum(
      ["lines", "commits12m", "vrpTotal", "cveTotal", "unsafeBuffers", "fuzzerCount"] as const,
      "lines",
    ),
    key: "sort",
  },
  preset: {
    ...urlCodecs.enum(
      ["all", "unfuzzed_vrp", "unsafe", "fuzzed", "with_submodules"] as const,
      "all",
    ),
    key: "filter",
  },
});

const dataset = shallowRef<ComponentsDataset | null>(null);
const loading = ref(true);
const errorMsg = ref("");

onMounted(async () => {
  try {
    dataset.value = await fetchComponentsDataset();
  } catch (e: any) {
    errorMsg.value = e?.message || "Failed to load component metadata.";
  } finally {
    loading.value = false;
  }
});

const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const fmtUsd = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
const fmtLoc = (n: number) => {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const dirMetaComponentsCount = computed(
  () => dataset.value?.components.filter((c) => c.inDirMetadata).length || 0,
);

const availableOs = computed(() => {
  if (!dataset.value) return [];
  const s = new Set<string>();
  for (const c of dataset.value.components) {
    for (const o of c.os) s.add(o);
  }
  return [...s].sort();
});

const highVrpUnfuzzedList = computed<ComponentEntry[]>(() => {
  if (!dataset.value) return [];
  return dataset.value.components
    .filter((c) => c.isHighVrpUnfuzzed)
    .sort((a, b) => b.vrpTotal - a.vrpTotal || b.cppLines - a.cppLines);
});

const highVrpUnfuzzedSum = computed(() =>
  highVrpUnfuzzedList.value.reduce((acc, c) => acc + c.vrpTotal, 0),
);

const activateHighVrpUnfuzzed = () => {
  tab.value = "components";
  preset.value = "unfuzzed_vrp";
  sortKey.value = "vrpTotal";
};

const toggleUnfuzzedFilter = () => {
  if (preset.value === "unfuzzed_vrp") {
    preset.value = "all";
  } else {
    preset.value = "unfuzzed_vrp";
    sortKey.value = "vrpTotal";
  }
};

const filteredComponents = computed<ComponentEntry[]>(() => {
  if (!dataset.value) return [];
  const q = search.value.trim().toLowerCase();
  const qComp = q.replace(/\//g, ">");
  const key = sortKey.value;

  return dataset.value.components
    .filter((c) => {
      if (preset.value !== "with_submodules" && !c.inDirMetadata) return false;
      if (preset.value === "unfuzzed_vrp" && !c.isHighVrpUnfuzzed) return false;
      if (preset.value === "unsafe" && c.unsafeBuffers === 0) return false;
      if (preset.value === "fuzzed" && c.fuzzerCount === 0) return false;
      if (teamFilter.value && !c.teams.includes(teamFilter.value)) return false;
      if (osFilter.value && !c.os.includes(osFilter.value)) return false;
      if (!q) return true;

      if (c.name.toLowerCase().includes(qComp) || c.name.toLowerCase().includes(q)) return true;
      if (c.teams.some((t) => t.includes(q))) return true;
      if (c.roots.some((r) => r.path.toLowerCase().includes(q))) return true;
      if (c.bugPublicIds.some((id) => String(id).includes(q))) return true;
      if (c.bugIds.some((id) => String(id).includes(q))) return true;
      return false;
    })
    .sort((a, b) => (b[key] as number) - (a[key] as number) || a.name.localeCompare(b.name));
});

const filteredTeams = computed<TeamEntry[]>(() => {
  if (!dataset.value) return [];
  const q = search.value.trim().toLowerCase();
  const key = sortKey.value;

  return dataset.value.teams
    .filter((t) => {
      if (osFilter.value && !t.os.includes(osFilter.value)) return false;
      if (!q) return true;
      if (t.email.includes(q)) return true;
      if (t.components.some((c) => c.toLowerCase().includes(q))) return true;
      if (t.roots.some((r) => r.path.toLowerCase().includes(q))) return true;
      return false;
    })
    .sort((a, b) => (b[key] as number) - (a[key] as number) || a.email.localeCompare(b.email));
});
</script>

<style scoped>
.page-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1.35rem;
}

.subtitle-text {
  color: var(--muted);
  font-size: 0.95rem;
  margin: 0.25rem 0 0;
  max-width: 52rem;
}

.loading-box,
.error-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  padding: 2rem;
  text-align: center;
}

.error-box {
  color: var(--tag-danger-ink);
}

.summary-strip {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
  margin-bottom: 1.25rem;
}

.stat-tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  padding: 0.85rem 1rem;
}

.stat-tile.is-callout {
  background: var(--tag-danger-bg);
  border-color: color-mix(in srgb, var(--tag-danger-ink) 35%, var(--line));
  cursor: pointer;
  transition: transform 0.12s;
}

.stat-tile.is-callout:hover {
  transform: translateY(-1px);
}

.stat-label {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
}

.stat-num {
  color: var(--ink);
  font-size: 1.45rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 0.2rem;
}

.stat-num small {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 500;
}

.stat-note {
  color: var(--muted);
  font-size: 0.76rem;
  margin-top: 0.15rem;
}

.spotlight-box {
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--severity-high) 35%, var(--line));
  border-radius: var(--radius);
  box-shadow: var(--shadow-xs);
  margin-bottom: 1.25rem;
  padding: 1rem 1.15rem;
}

.spotlight-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  margin-bottom: 0.85rem;
}

.spotlight-title-wrap {
  align-items: flex-start;
  display: flex;
  gap: 0.65rem;
}

.spotlight-icon {
  color: var(--severity-high);
  margin-top: 0.1rem;
}

.spotlight-title {
  color: var(--ink);
  font-size: 0.98rem;
  font-weight: 650;
  margin: 0;
}

.spotlight-desc {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0.1rem 0 0;
}

.filter-toggle-btn {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 600;
  gap: 0.35rem;
  padding: 0.38rem 0.72rem;
}

.filter-toggle-btn.is-active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.spotlight-cards {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
}

.spot-card {
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  padding: 0.65rem 0.8rem;
  text-decoration: none;
  transition: border-color 0.15s;
}

.spot-card:hover {
  border-color: var(--accent);
}

.spot-name {
  color: var(--ink);
  font-size: 0.84rem;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spot-vrp {
  color: var(--severity-high);
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 700;
  margin-top: 0.2rem;
}

.spot-vrp small {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 500;
}

.spot-meta {
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.75rem;
  gap: 0.28rem;
  margin-top: 0.2rem;
}

.controls-bar {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.search-box {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  display: flex;
  flex: 1 1 280px;
  gap: 0.45rem;
  height: 2.35rem;
  padding: 0 0.7rem;
}

.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: var(--ring);
}

.search-box-icon {
  color: var(--faint);
}

.search-box input {
  background: transparent;
  border: none;
  color: var(--ink);
  flex: 1;
  font-size: 0.88rem;
  min-width: 0;
  outline: none;
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--faint);
  cursor: pointer;
  display: flex;
  padding: 0;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.control-label {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
}

.native-select {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 0.85rem;
  height: 2.35rem;
  max-width: 240px;
  padding: 0 0.6rem;
}

.preset-pills {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.9rem;
}

.pill-btn {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink-2);
  cursor: pointer;
  font-size: 0.79rem;
  font-weight: 500;
  padding: 0.26rem 0.7rem;
}

.pill-btn.is-active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}

.pill-btn.is-danger-pill.is-active {
  background: var(--tag-danger-bg);
  border-color: var(--tag-danger-ink);
  color: var(--tag-danger-ink);
}

.result-count {
  color: var(--muted);
  font-size: 0.82rem;
  margin-left: auto;
}

.comp-cell {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.comp-link {
  font-weight: 650;
  text-decoration: none;
}

.comp-sub {
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.76rem;
  gap: 0.45rem;
  margin-top: 0.12rem;
}

.team-inline-link {
  color: var(--muted);
  text-decoration: none;
}

.team-inline-link:hover {
  color: var(--accent);
  text-decoration: underline;
}

.root-hint code {
  font-size: 0.73rem;
}

.badge-chip {
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.06rem 0.44rem;
}

.badge-chip.is-risk {
  background: var(--tag-danger-bg);
  color: var(--tag-danger-ink);
}

.badge-chip.is-sub {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.badge-chip.is-os {
  background: var(--surface-sunken);
  color: var(--muted);
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.muted-inline {
  color: var(--muted);
}

.vrp-highlight {
  color: var(--severity-high);
  font-weight: 650;
}

.warn-highlight {
  color: var(--tag-warning-ink);
  font-weight: 650;
}

.ok-highlight {
  color: var(--tag-success-ink);
  font-weight: 650;
}
</style>
