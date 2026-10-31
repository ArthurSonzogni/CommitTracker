<template>
  <div>
    <section class="section">
      <div class="container">
        <!-- Breadcrumb -->
        <nav class="dossier-crumbs" aria-label="Component hierarchy">
          <NuxtLink to="/components" class="crumb-link">
            <UiIcon name="sitemap" size="small" />
            Components
          </NuxtLink>
          <template v-for="(seg, idx) in hierarchySegments" :key="seg.full">
            <span class="crumb-sep">/</span>
            <NuxtLink
              v-if="idx < hierarchySegments.length - 1"
              :to="componentPath(seg.full)"
              class="crumb-link">
              {{ seg.label }}
            </NuxtLink>
            <span v-else class="crumb-current">{{ seg.label }}</span>
          </template>
        </nav>

        <div v-if="loading" class="state-card">Loading component dossier…</div>

        <div v-else-if="!entry" class="state-card">
          <h1 class="title is-4 mb-2">No component matching “{{ requestedLabel }}”</h1>
          <p class="mb-4">Browse all Chromium <code>DIR_METADATA</code> components or search below:</p>
          <NuxtLink to="/components" class="button is-primary">
            Browse all components
          </NuxtLink>
        </div>

        <template v-else>
          <!-- Executive Header -->
          <header class="dossier-header">
            <div class="dossier-title-block">
              <div class="eyebrow">
                <span>Chromium Component Dossier</span>
                <span v-if="isSyntheticNamespace" class="meta-tag is-sub">Component Namespace Rollup</span>
                <span v-else-if="!entry.inDirMetadata" class="meta-tag is-sub">External / Submodule Component</span>
                <span v-for="os in entry.os" :key="os" class="meta-tag">{{ os }}</span>
              </div>
              <h1 class="title dossier-h1">{{ entry.name }}</h1>

              <div class="identity-chips">
                <NuxtLink
                  v-for="team in entry.teams.slice(0, 5)"
                  :key="team"
                  :to="teamPath(team)"
                  class="id-chip is-team">
                  <UiIcon name="email-outline" size="small" />
                  {{ team }}
                </NuxtLink>
                <span v-if="entry.teams.length > 5" class="id-chip">
                  +{{ entry.teams.length - 5 }} teams
                </span>

                <a
                  v-for="bid in entry.bugPublicIds.slice(0, 4)"
                  :key="'bp-' + bid"
                  :href="`https://issues.chromium.org/issues?q=componentid:${bid}`"
                  target="_blank"
                  rel="noopener"
                  class="id-chip"
                  title="Open public Chromium Issue Tracker component">
                  Buganizer #{{ bid }}
                  <UiIcon name="open-in-new" size="small" />
                </a>

                <span
                  v-for="bid in entry.bugIds.slice(0, 3)"
                  :key="'bi-' + bid"
                  class="id-chip"
                  title="Internal Buganizer component ID">
                  Internal #{{ bid }}
                </span>
              </div>
            </div>

            <div class="header-actions">
              <NuxtLink
                v-if="entry.cves.total > 0"
                class="action-btn"
                :to="`/cve/list?component=${encodeURIComponent(entry.name)}`">
                <UiIcon name="shield-bug" size="small" />
                CVE List ({{ entry.cves.total }})
              </NuxtLink>
              <NuxtLink
                v-if="entry.roots[0]"
                class="action-btn is-primary-btn"
                :to="`/treemap?repositories=chromium&path=${entry.roots[0].path.split('/').map(encodeURIComponent).join(',')}&field_color=todo`">
                <UiIcon name="chart-tree" size="small" />
                Open in Treemap
              </NuxtLink>
            </div>
          </header>

          <!-- Submodule Cross-Link Callout (e.g. Blink>JavaScript -> V8) -->
          <div v-if="entry.submodule" class="callout-banner is-submodule">
            <div>
              <strong>{{ entry.submodule.label }}</strong> — Primary source lives in the standalone
              <code>{{ entry.submodule.repo }}</code> repository (git submodule in Chromium).
            </div>
            <div class="callout-links">
              <NuxtLink :to="`/repositories?repositories=${entry.submodule.repo}`" class="callout-btn">
                {{ entry.submodule.repo }} Contributors
              </NuxtLink>
              <NuxtLink :to="`/commit-rates?repository=${entry.submodule.repo}`" class="callout-btn">
                {{ entry.submodule.repo }} Commit Velocity
              </NuxtLink>
              <NuxtLink :to="`/accretion?repository=${entry.submodule.repo}`" class="callout-btn">
                {{ entry.submodule.repo }} Accretion
              </NuxtLink>
            </div>
          </div>

          <!-- High-VRP Unfuzzed Risk Callout -->
          <div v-if="entry.isHighVrpUnfuzzed" class="callout-banner is-risk">
            <div class="risk-banner-body">
              <UiIcon name="shield-alert" class="risk-icon" />
              <div>
                <strong>High-VRP Unfuzzed C++ Surface:</strong>
                <code>{{ entry.name }}</code> has paid out <strong>{{ fmtUsd(entry.vrpTotal) }}</strong> across
                <strong>{{ entry.cveTotal }}</strong> CVEs and maintains
                <strong>{{ fmtLoc(entry.cppLines) }}</strong> lines of C/C++ with
                <strong>0</strong> registered <code>FUZZ_TEST</code> or <code>fuzzer_test</code> targets in Chromium.
              </div>
            </div>
          </div>

          <!-- Shared Executive Metrics, Sparklines, Language/Safety & Owned Directories -->
          <DossierMetricsView
            :code="entry.code"
            :commits="entry.commits"
            :fuzzers="entry.fuzzers"
            :cves="entry.cves"
            :accretion="entry.accretion"
            :roots="entry.roots"
            :root-count="entry.rootCount"
            :dir-meta-count="entry.dirMetaCount"
            :owned-dir-count="entry.ownedDirCount"
            :quarter-labels="dataset?.quarterLabels || []"
            :cve-filter-component="isSyntheticNamespace ? undefined : entry.name"
            :is-high-vrp-unfuzzed="entry.isHighVrpUnfuzzed" />

          <!-- Child Subcomponents Hierarchy (e.g. Internals>GPU>*, Blink>JavaScript>*) -->
          <div v-if="childComponents.length > 0" class="panel-card mb-block">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Subcomponents under <code>{{ entry.name }}&gt;*</code> ({{ childComponents.length }})</h2>
                <p class="panel-subtitle">
                  Combined subcomponent footprint: {{ fmtLoc(childrenTotals.lines) }} LoC ·
                  {{ fmtInt(childrenTotals.commits12m) }} commits/12m ·
                  {{ fmtInt(childrenTotals.cves) }} CVEs ({{ fmtUsd(childrenTotals.vrp) }} VRP) ·
                  {{ fmtInt(childrenTotals.fuzzers) }} fuzzers
                </p>
              </div>
            </div>

            <UiTable :data="childComponents" row-key="name" hoverable striped :paginated="childComponents.length > 15" :per-page="15">
              <UiTableColumn field="name" label="Subcomponent" sortable v-slot="{ row }">
                <NuxtLink :to="componentPath(row.name)" class="subcomp-link">
                  {{ row.name }}
                </NuxtLink>
                <span v-if="row.isHighVrpUnfuzzed" class="inline-risk-tag">Unfuzzed High-VRP</span>
              </UiTableColumn>
              <UiTableColumn field="primaryTeam" label="Primary Team" sortable v-slot="{ row }">
                <NuxtLink v-if="row.primaryTeam" :to="teamPath(row.primaryTeam)" class="team-muted">
                  {{ row.primaryTeam }}
                </NuxtLink>
                <span v-else class="muted">—</span>
              </UiTableColumn>
              <UiTableColumn field="lines" label="LoC" numeric sortable v-slot="{ row }">
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
              <UiTableColumn field="fuzzerCount" label="Fuzzers" numeric sortable v-slot="{ row }">
                <span class="mono">{{ row.fuzzerCount }}</span>
              </UiTableColumn>
            </UiTable>
          </div>

          <!-- Notable / Recent CVEs Table (live from /cve/data.json) -->
          <div v-if="matchingCves.length > 0" class="panel-card">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">Notable &amp; Recent CVEs ({{ matchingCves.length }})</h2>
                <p class="panel-subtitle">Highest-reward and most recent vulnerabilities attributed to {{ entry.name }}</p>
              </div>
              <NuxtLink
                v-if="!isSyntheticNamespace"
                class="action-btn"
                :to="`/cve/list?component=${encodeURIComponent(entry.name)}`">
                Explore in CVE List
                <UiIcon name="arrow-right" size="small" />
              </NuxtLink>
            </div>

            <div class="table-wrap">
              <table class="cve-mini-table">
                <thead>
                  <tr>
                    <th>CVE</th>
                    <th>Published</th>
                    <th>Severity</th>
                    <th class="num">VRP Reward</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="cve in matchingCves.slice(0, 10)" :key="cve.id">
                    <td class="mono">
                      <NuxtLink :to="`/cve?id=${encodeURIComponent(cve.id)}`">
                        CVE-{{ cve.id }}
                      </NuxtLink>
                    </td>
                    <td class="mono muted">{{ (cve.published || "").slice(0, 10) }}</td>
                    <td>
                      <span :class="['sev-tag', `sev-${(cve.severity || 'unknown').toLowerCase()}`]">
                        {{ cve.severity || "unknown" }}
                      </span>
                    </td>
                    <td class="num mono">
                      {{ Number(cve.vrp_reward) > 0 ? fmtUsd(Number(cve.vrp_reward)) : "—" }}
                    </td>
                    <td class="summary-col">
                      {{ cve.title && cve.title !== "n/a" ? cve.title : cve.problem || cve.description?.slice(0, 110) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { fetchCveData, type CveRecord } from "~/utils/cve";
import {
  componentPath,
  fetchComponentsDataset,
  normalizeSlugToComponentCandidates,
  teamPath,
  type ComponentEntry,
  type ComponentsDataset,
} from "~/utils/componentsData";

const route = useRoute();

const dataset = shallowRef<ComponentsDataset | null>(null);
const allCves = shallowRef<CveRecord[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const [ds, cves] = await Promise.all([
      fetchComponentsDataset(),
      fetchCveData().catch(() => [] as CveRecord[]),
    ]);
    dataset.value = ds;
    allCves.value = cves;
  } finally {
    loading.value = false;
  }
});

const candidates = computed(() =>
  normalizeSlugToComponentCandidates(route.params.slug as string | string[] | undefined),
);

const requestedLabel = computed(() => candidates.value[0] || "");

const directMatch = computed<ComponentEntry | null>(() => {
  if (!dataset.value) return null;
  for (const cand of candidates.value) {
    const exact = dataset.value.componentsByName.get(cand);
    if (exact) return exact;
    const lower = dataset.value.componentsByLower.get(cand.toLowerCase());
    if (lower) return lower;
  }
  return null;
});

const childComponents = computed<ComponentEntry[]>(() => {
  if (!dataset.value) return [];
  const targetName = (directMatch.value?.name || requestedLabel.value).toLowerCase();
  if (!targetName) return [];
  const prefix = targetName + ">";
  return dataset.value.components
    .filter((c) => c.name.toLowerCase().startsWith(prefix))
    .sort((a, b) => b.lines - a.lines || b.vrpTotal - a.vrpTotal);
});

const isSyntheticNamespace = computed(
  () => !directMatch.value && childComponents.value.length > 0,
);

// Build synthetic rollup if user navigates to a pure namespace prefix (e.g. /components/UI)
const entry = computed<ComponentEntry | null>(() => {
  if (directMatch.value) return directMatch.value;
  const kids = childComponents.value;
  if (!kids.length || !dataset.value) return null;

  const canonicalPrefix = kids[0].name
    .split(">")
    .slice(0, requestedLabel.value.split(">").length)
    .join(">");

  const qLen = dataset.value.quarterLabels.length;
  const quarterly = new Array(qLen).fill(0);
  const byYearMap = new Map<number, { year: number; count: number; vrp: number }>();
  for (let y = dataset.value.cveStartYear; y <= dataset.value.cveEndYear; y++) {
    byYearMap.set(y, { year: y, count: 0, vrp: 0 });
  }

  const teamsSet = new Set<string>();
  const osSet = new Set<string>();
  const code = {
    files: 0,
    lines: 0,
    langs: { cpp: 0, rust: 0, jsTs: 0, javaKt: 0, mojom: 0, other: 0 },
    rawPtr: 0,
    rawRef: 0,
    dangling: 0,
    unsafeBuffers: 0,
    unsafeBufferLines: 0,
    unsafeLibc: 0,
    unsafeTodo: 0,
    disabledTests: 0,
    tests: 0,
    todos: 0,
  };
  let commitsAll = 0;
  let commits12m = 0;
  let commitsPrev12m = 0;
  let fzCount = 0;
  let fzTests = 0;
  let fzTargets = 0;
  let cveTotal = 0;
  let cve24m = 0;
  let vrpTotal = 0;
  let vrp24m = 0;
  let vrpCount = 0;
  let vrpMax = 0;
  const severities = { Critical: 0, High: 0, Medium: 0, Low: 0 };

  for (const k of kids) {
    k.teams.forEach((t) => teamsSet.add(t));
    k.os.forEach((o) => osSet.add(o));
    code.files += k.code.files;
    code.lines += k.code.lines;
    code.langs.cpp += k.code.langs.cpp;
    code.langs.rust += k.code.langs.rust;
    code.langs.jsTs += k.code.langs.jsTs;
    code.langs.javaKt += k.code.langs.javaKt;
    code.langs.mojom += k.code.langs.mojom;
    code.langs.other += k.code.langs.other;
    code.rawPtr += k.code.rawPtr;
    code.rawRef += k.code.rawRef;
    code.dangling += k.code.dangling;
    code.unsafeBuffers += k.code.unsafeBuffers;
    code.unsafeBufferLines += k.code.unsafeBufferLines;
    code.unsafeLibc += k.code.unsafeLibc;
    code.unsafeTodo += k.code.unsafeTodo;
    code.disabledTests += k.code.disabledTests;
    code.tests += k.code.tests;
    code.todos += k.code.todos;

    commitsAll += k.commits.all;
    commits12m += k.commits.last12m;
    commitsPrev12m += k.commits.prev12m;
    for (let i = 0; i < qLen; i++) quarterly[i] += k.commits.quarterly[i] || 0;

    fzCount += k.fuzzers.count;
    fzTests += k.fuzzers.fuzzTests;
    fzTargets += k.fuzzers.fuzzTargets;

    cveTotal += k.cves.total;
    cve24m += k.cves.recent24m;
    vrpTotal += k.cves.vrpTotal;
    vrp24m += k.cves.vrpRecent24m;
    vrpCount += k.cves.vrpCount;
    if (k.cves.vrpMax > vrpMax) vrpMax = k.cves.vrpMax;
    severities.Critical += k.cves.severities.Critical;
    severities.High += k.cves.severities.High;
    severities.Medium += k.cves.severities.Medium;
    severities.Low += k.cves.severities.Low;
    for (const yr of k.cves.byYear) {
      const slot = byYearMap.get(yr.year);
      if (slot) {
        slot.count += yr.count;
        slot.vrp += yr.vrp;
      }
    }
  }

  const allRoots = kids
    .flatMap((k) => k.roots)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 14);

  return {
    name: canonicalPrefix,
    inDirMetadata: true,
    submodule: null,
    teams: [...teamsSet],
    primaryTeam: [...teamsSet][0] || "",
    os: [...osSet],
    bugPublicIds: [],
    bugIds: [],
    dirMetaCount: kids.reduce((s, k) => s + k.dirMetaCount, 0),
    rootCount: kids.reduce((s, k) => s + k.rootCount, 0),
    ownedDirCount: kids.reduce((s, k) => s + k.ownedDirCount, 0),
    roots: allRoots,
    code,
    commits: { all: commitsAll, last12m: commits12m, prev12m: commitsPrev12m, quarterly },
    fuzzers: {
      count: fzCount,
      fuzzTests: fzTests,
      fuzzTargets: fzTargets,
      items: kids.flatMap((k) => k.fuzzers.items).slice(0, 12),
    },
    cves: {
      total: cveTotal,
      recent24m: cve24m,
      vrpTotal,
      vrpRecent24m: vrp24m,
      vrpCount,
      vrpMax,
      severities,
      topCwes: [],
      byYear: [...byYearMap.values()],
    },
    accretion: null,
    lines: code.lines,
    cppLines: code.langs.cpp,
    commits12m,
    cveTotal,
    vrpTotal,
    unsafeBuffers: code.unsafeBuffers,
    fuzzerCount: fzCount,
    isHighVrpUnfuzzed: false,
  };
});

const hierarchySegments = computed(() => {
  const full = entry.value?.name || requestedLabel.value;
  if (!full) return [];
  const parts = full.split(">").filter(Boolean);
  return parts.map((label, idx) => ({
    label,
    full: parts.slice(0, idx + 1).join(">"),
  }));
});

const childrenTotals = computed(() => {
  return childComponents.value.reduce(
    (acc, c) => {
      acc.lines += c.lines;
      acc.commits12m += c.commits12m;
      acc.cves += c.cveTotal;
      acc.vrp += c.vrpTotal;
      acc.fuzzers += c.fuzzerCount;
      return acc;
    },
    { lines: 0, commits12m: 0, cves: 0, vrp: 0, fuzzers: 0 },
  );
});

const matchingCves = computed(() => {
  if (!entry.value || !allCves.value.length) return [];
  const target = entry.value.name;
  const isNs = isSyntheticNamespace.value;
  return allCves.value
    .filter((c) =>
      c.components?.some((comp) =>
        isNs ? comp.startsWith(target + ">") : comp === target,
      ),
    )
    .sort(
      (a, b) =>
        (Number(b.vrp_reward) || 0) - (Number(a.vrp_reward) || 0) ||
        (b.published || "").localeCompare(a.published || ""),
    );
});

useHead(() => ({
  title: entry.value ? `${entry.value.name} · Component Dossier` : "Component Dossier",
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

.meta-tag.is-sub {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.dossier-h1 {
  font-size: 1.85rem;
  line-height: 1.2;
  margin: 0 0 0.6rem;
  word-break: break-word;
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

.id-chip.is-team {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
  font-weight: 500;
}

.id-chip:hover {
  border-color: var(--accent);
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

.action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
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

.callout-banner {
  border-radius: var(--radius);
  font-size: 0.88rem;
  margin-bottom: 1.15rem;
  padding: 0.85rem 1.05rem;
}

.callout-banner.is-submodule {
  align-items: center;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--ink);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
}

.callout-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.callout-btn {
  background: var(--surface);
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-sm);
  color: var(--accent-ink);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  text-decoration: none;
}

.callout-banner.is-risk {
  background: var(--tag-danger-bg);
  border: 1px solid color-mix(in srgb, var(--tag-danger-ink) 35%, var(--line));
  color: var(--ink);
}

.risk-banner-body {
  align-items: flex-start;
  display: flex;
  gap: 0.6rem;
}

.risk-icon {
  color: var(--tag-danger-ink);
  flex-shrink: 0;
  margin-top: 0.1rem;
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
  flex-wrap: wrap;
  gap: 0.75rem;
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

.subcomp-link {
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

.team-muted {
  color: var(--muted);
  font-size: 0.82rem;
  text-decoration: none;
}

.team-muted:hover {
  color: var(--accent);
}

.table-wrap {
  overflow-x: auto;
}

.cve-mini-table {
  border-collapse: collapse;
  font-size: 0.85rem;
  width: 100%;
}

.cve-mini-table th {
  border-bottom: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.45rem 0.6rem;
  text-align: left;
  text-transform: uppercase;
}

.cve-mini-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.5rem 0.6rem;
  vertical-align: middle;
}

.cve-mini-table th.num,
.cve-mini-table td.num {
  text-align: right;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--muted);
}

.summary-col {
  color: var(--ink-2);
  max-width: 460px;
}

.sev-tag {
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
}

.sev-critical {
  background: color-mix(in srgb, var(--severity-critical) 16%, transparent);
  color: var(--severity-critical);
}

.sev-high {
  background: color-mix(in srgb, var(--severity-high) 16%, transparent);
  color: var(--severity-high);
}

.sev-medium {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.sev-low,
.sev-unknown {
  background: var(--surface-sunken);
  color: var(--muted);
}
</style>
