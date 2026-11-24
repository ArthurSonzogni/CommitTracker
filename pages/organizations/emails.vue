<template>
  <div class="org-emails-page">
    <section class="section pb-4">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">Organizations emails</h1>
            <p class="subtitle-text">
              Every organization in {{ repoListLabel }}, sized by the log of its email count —
              largest at the center, smallest around the rim. Click any bubble to inspect its
              domains and emails.
            </p>
          </div>
        </div>

        <FilterPanel
          class="mt-4"
          :summary="listSummary(repositoryNames(repositories), 'repositories')"
        >
          <RepositorySelector
            v-model="repositories"
            size="medium"
            :allowMultiple="true"
            :allowAll="true"
          />
        </FilterPanel>

        <FetchError v-if="loadError" class="mt-4" :message="loadError" @retry="refresh" />

        <div v-else-if="repositories.length === 0" class="empty-state mt-5">
          <UiIcon name="email" size="medium" />
          <p>Select at least one repository above to inspect organization email mappings.</p>
        </div>

        <div v-else-if="loading && organizations.length === 0" class="mt-4">
          <div class="skeleton" style="height: 20px; width: 46ch; max-width: 100%" />
        </div>

        <template v-else-if="organizations.length > 0">
          <p class="summary-line mt-4">
            <strong>{{ fmtInt(totalEmails) }}</strong> emails
            (<strong>{{ fmtInt(totalUsernames) }}</strong> unique usernames) across
            <strong>{{ fmtInt(organizations.length) }}</strong> organizations and
            <strong>{{ fmtInt(totalDomains) }}</strong> domains in {{ repoListLabel }}.
          </p>

          <!-- Main Split: Packed Bubble Galaxy + Organization Selector -->
          <div class="workspace mt-4">
            <div
              class="bubble-stage"
              ref="stageEl"
              @mouseleave="hoveredBubble = null"
            >
              <svg
                class="bubble-svg"
                :viewBox="packedLayout.viewBox"
                role="img"
                aria-label="Organizations packed by log of email count"
              >
                <g
                  v-for="node in packedLayout.nodes"
                  :key="node.org"
                  class="bubble-node"
                  :class="{
                    'is-selected': selectedOrgName === node.org,
                    'is-hovered': hoveredBubble?.org === node.org,
                  }"
                  :transform="`translate(${node.x.toFixed(2)}, ${node.y.toFixed(2)})`"
                  tabindex="0"
                  role="button"
                  :aria-label="`${node.org}: ${fmtInt(node.count)} emails`"
                  :aria-pressed="selectedOrgName === node.org"
                  @click="selectOrg(node.org)"
                  @keydown.enter.prevent="selectOrg(node.org)"
                  @keydown.space.prevent="selectOrg(node.org)"
                  @mouseenter="onBubbleEnter(node, $event)"
                  @mousemove="onBubbleMove($event)"
                  @focus="hoveredBubble = node"
                  @blur="hoveredBubble = null"
                >
                  <circle
                    :r="node.drawR"
                    class="bubble-circle"
                    :style="{ '--bubble-color': node.color }"
                  />
                  <text
                    v-if="node.label"
                    class="bubble-label"
                    :y="node.showCount ? -node.fontSize * 0.28 : 0"
                    :font-size="node.fontSize"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {{ node.label }}
                  </text>
                  <text
                    v-if="node.showCount"
                    class="bubble-count"
                    :y="node.fontSize * 0.85"
                    :font-size="Math.max(8, node.fontSize * 0.72)"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {{ fmtCompact(node.count) }}
                  </text>
                </g>
              </svg>

              <!-- Floating Hover Tooltip -->
              <div
                v-if="hoveredBubble"
                class="bubble-tooltip"
                :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
              >
                <div class="tooltip-title">
                  <span
                    class="tooltip-dot"
                    :style="{ background: hoveredBubble.color }"
                  />
                  {{ hoveredBubble.org }}
                </div>
                <div class="tooltip-meta">
                  {{ fmtInt(hoveredBubble.count) }}
                  {{ hoveredBubble.count === 1 ? "email" : "emails" }}
                  · {{ fmtInt(hoveredBubble.usernameCount) }}
                  {{ hoveredBubble.usernameCount === 1 ? "user" : "users" }}
                  · {{ fmtInt(hoveredBubble.domainCount) }}
                  {{ hoveredBubble.domainCount === 1 ? "domain" : "domains" }}
                </div>
              </div>
            </div>

            <!-- Organization Selector on the Right -->
            <aside class="org-selector-panel" aria-label="Organizations">
              <div class="selector-head">
                <span class="selector-title">Organizations</span>
                <span class="selector-count">
                  {{ fmtInt(selectorOrgs.length) }}
                </span>
              </div>

              <div class="selector-list">
                <button
                  v-for="item in selectorOrgs"
                  :key="item.entry.org"
                  type="button"
                  class="selector-item"
                  :class="{
                    'is-selected': selectedOrgName === item.entry.org,
                    'is-hovered': hoveredBubble?.org === item.entry.org,
                  }"
                  @click="selectOrg(item.entry.org)"
                  @mouseenter="hoveredBubble = nodeByName.get(item.entry.org) ?? null"
                  @mouseleave="hoveredBubble = null"
                >
                  <span
                    class="selector-dot"
                    :style="{ background: seriesColor(item.entry.org) }"
                  />
                  <span class="selector-name">{{ item.entry.org }}</span>
                  <span class="selector-meta">
                    {{ fmtInt(item.visibleCount) }}
                  </span>
                </button>
                <p v-if="selectorOrgs.length === 0" class="selector-empty">
                  No matching organizations.
                </p>
              </div>
            </aside>
          </div>

          <!-- Selected Organization Emails Below (Full Width) -->
          <OrganizationsEmailInspector
            v-if="selectedEntry"
            :entry="selectedEntry"
            :color="seriesColor(selectedEntry.org)"
            :commits-link="orgCommitsLink(selectedEntry.org)"
            :emails-filtered="selectedEmailsFiltered"
            v-model:selected-domain="selectedDomain"
            v-model:email-limit="emailLimit"
            :individual-link="individualLink"
            @toggle-domain="toggleDomain"
          />
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { packEnclose, packSiblings } from "d3-hierarchy";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchJson, formatFetchError } from "~/utils/fetchJson";
import { listSummary, repositoryNames } from "~/utils/filter-summary";
import { seriesColor } from "~/utils/palette";

interface DomainBucket {
  domain: string;
  count: number;
}

interface OrgEntry {
  org: string;
  emails: string[];
  usernameCount: number;
  domains: DomainBucket[];
}

interface BubbleNode {
  org: string;
  count: number;
  usernameCount: number;
  domainCount: number;
  color: string;
  x: number;
  y: number;
  drawR: number;
  label: string;
  fontSize: number;
  showCount: boolean;
}

const { repositories } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
});

const organizations = ref<OrgEntry[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const selectedOrgName = ref<string | null>(null);
const selectedDomain = ref<string | null>(null);
const emailLimit = ref(120);

const stageEl = ref<HTMLElement | null>(null);
const hoveredBubble = ref<BubbleNode | null>(null);
const tooltipPos = reactive({ x: 0, y: 0 });

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};

const repoListLabel = computed(() => {
  const names = repositoryNames(repositories.value);
  if (names.length === 0) return "selected repositories";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} repositories`;
});

const emailDomain = (email: string): string => {
  const idx = email.indexOf("@");
  return idx === -1 ? "" : email.slice(idx + 1).toLowerCase();
};

const totalEmails = computed(() =>
  organizations.value.reduce((sum, o) => sum + o.emails.length, 0),
);

const totalUsernames = computed(() => {
  const users = new Set<string>();
  for (const o of organizations.value) {
    for (const e of o.emails) {
      users.add(e.split("@")[0]);
    }
  }
  return users.size;
});

const totalDomains = computed(() => {
  const set = new Set<string>();
  for (const o of organizations.value) {
    for (const d of o.domains) {
      set.add(d.domain);
    }
  }
  return set.size;
});

const orgByName = computed(() => {
  const map = new Map<string, OrgEntry>();
  for (const o of organizations.value) map.set(o.org, o);
  return map;
});

const selectorOrgs = computed(() =>
  organizations.value.map((entry) => ({
    entry,
    visibleCount: entry.emails.length,
  })),
);

const nodeByName = computed(() => {
  const map = new Map<string, BubbleNode>();
  for (const n of packedLayout.value.nodes) map.set(n.org, n);
  return map;
});

// Log-scaled circle packing: largest at center (0,0), smaller packed around it
const packedLayout = computed(() => {
  const sorted = [...organizations.value].sort(
    (a, b) => b.emails.length - a.emails.length || a.org.localeCompare(b.org),
  );
  if (sorted.length === 0) {
    return { viewBox: "0 0 100 100", nodes: [] as BubbleNode[] };
  }

  const PAD = 2.5;
  const circles = sorted.map((entry) => {
    const count = entry.emails.length;
    // Radius proportional to log10(count + 1) so 1-email orgs remain visible & clickable
    // while Google (7,679) stands out clearly at the center.
    const drawR = 11 + 24 * Math.pow(Math.log10(count + 1), 1.35);
    return {
      entry,
      drawR,
      r: drawR + PAD,
      x: 0,
      y: 0,
    };
  });

  packSiblings(circles);
  const enclose = packEnclose(circles);
  const margin = 10;
  const minX = enclose.x - enclose.r - margin;
  const minY = enclose.y - enclose.r - margin;
  const size = (enclose.r + margin) * 2;

  const nodes: BubbleNode[] = circles.map((c) => {
    const { entry, drawR, x, y } = c;
    const maxChars = Math.max(2, Math.floor((drawR * 1.72) / (Math.min(18, Math.max(8, drawR * 0.28)) * 0.6)));
    const showCount = drawR >= 30;
    let fontSize = Math.min(22, Math.max(7.5, drawR * 0.27));
    if (entry.org.length > 6) {
      fontSize = Math.min(fontSize, (drawR * 1.72) / (Math.min(entry.org.length, maxChars) * 0.62));
      fontSize = Math.max(7.2, fontSize);
    }

    let label = "";
    if (drawR >= 16) {
      const charBudget = Math.max(3, Math.floor((drawR * 1.74) / (fontSize * 0.58)));
      label =
        entry.org.length <= charBudget
          ? entry.org
          : entry.org.slice(0, Math.max(2, charBudget - 1)).trimEnd() + "…";
    }

    return {
      org: entry.org,
      count: entry.emails.length,
      usernameCount: entry.usernameCount,
      domainCount: entry.domains.length,
      color: seriesColor(entry.org),
      x,
      y,
      drawR,
      label,
      fontSize,
      showCount,
    };
  });

  return {
    viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}`,
    nodes,
  };
});

const selectOrg = (org: string) => {
  selectedOrgName.value = org;
  selectedDomain.value = null;
  emailLimit.value = 120;
};

const toggleDomain = (domain: string) => {
  selectedDomain.value = selectedDomain.value === domain ? null : domain;
  emailLimit.value = 120;
};

const selectedEntry = computed(() =>
  selectedOrgName.value ? orgByName.value.get(selectedOrgName.value) ?? null : null,
);

const selectedEmailsFiltered = computed(() => {
  const emails = selectedEntry.value?.emails ?? [];
  if (!selectedDomain.value) return emails;
  return emails.filter((e) => emailDomain(e) === selectedDomain.value);
});

const updateTooltipPos = (event: MouseEvent) => {
  const stage = stageEl.value;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const x = event.clientX - rect.left + 14;
  const y = event.clientY - rect.top - 10;
  tooltipPos.x = Math.min(Math.max(8, x), Math.max(8, rect.width - 230));
  tooltipPos.y = Math.min(Math.max(8, y), Math.max(8, rect.height - 64));
};

const onBubbleEnter = (node: BubbleNode, event: MouseEvent) => {
  hoveredBubble.value = node;
  updateTooltipPos(event);
};

const onBubbleMove = (event: MouseEvent) => {
  if (hoveredBubble.value) {
    updateTooltipPos(event);
  }
};

const orgCommitsLink = (org: string) => ({
  path: "/organizations/commits",
  query: {
    organizations: org,
    ...(repositories.value.length > 0
      ? { repositories: repositories.value.join(",") }
      : {}),
  },
});

const individualLink = (email: string) => ({
  path: "/individuals",
  query: {
    developers: email,
    ...(repositories.value.length > 0
      ? { repositories: repositories.value.join(",") }
      : {}),
  },
});

let requestId = 0;

const refresh = async () => {
  const id = ++requestId;
  const repos = [...repositories.value];
  loadError.value = null;
  selectedDomain.value = null;
  emailLimit.value = 60;

  if (repos.length === 0) {
    organizations.value = [];
    selectedOrgName.value = null;
    loading.value = false;
    return;
  }

  loading.value = true;

  let jsonData: Record<string, string[]>[];
  try {
    jsonData = await Promise.all(
      repos.map((repo) =>
        fetchJson<Record<string, string[]>>(`/data/${repo}/organizations_emails.json`, {
          cache: true,
        }),
      ),
    );
  } catch (error) {
    if (id === requestId) {
      loading.value = false;
      loadError.value = formatFetchError(error, "Failed to load organization emails.");
    }
    return;
  }
  if (id !== requestId) return;

  const emailsByOrg = new Map<string, Set<string>>();
  for (const d of jsonData) {
    for (const [org, list] of Object.entries(d)) {
      let set = emailsByOrg.get(org);
      if (!set) {
        set = new Set();
        emailsByOrg.set(org, set);
      }
      for (const email of list) {
        set.add(email);
      }
    }
  }

  const entries: OrgEntry[] = [];
  for (const [org, set] of emailsByOrg.entries()) {
    const sortedEmails = Array.from(set).sort((a, b) => a.localeCompare(b));
    const users = new Set<string>();
    const domainCounts = new Map<string, number>();

    for (const email of sortedEmails) {
      users.add(email.split("@")[0]);
      const dom = emailDomain(email);
      if (dom) {
        domainCounts.set(dom, (domainCounts.get(dom) || 0) + 1);
      }
    }

    const domains: DomainBucket[] = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

    entries.push({
      org,
      emails: sortedEmails,
      usernameCount: users.size,
      domains,
    });
  }

  entries.sort((a, b) => b.emails.length - a.emails.length || a.org.localeCompare(b.org));
  organizations.value = entries;
  if (!selectedOrgName.value || !emailsByOrg.has(selectedOrgName.value)) {
    selectedOrgName.value = entries[0]?.org ?? null;
  }
  loading.value = false;
};

onMounted(refresh);
watch(repositories, refresh);
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.subtitle-text {
  color: var(--muted);
  font-size: 0.95rem;
  max-width: 72ch;
  margin: 0;
}

.summary-line {
  margin: 0;
  font-size: 0.95rem;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.muted-text {
  color: var(--muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2.75rem 1.5rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  color: var(--muted);
  text-align: center;
}

/* Main Split Workspace */
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 1.15rem;
  align-items: stretch;
}

@media (max-width: 960px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}

/* Bubble Galaxy */
.bubble-stage {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.bubble-svg {
  width: 100%;
  height: auto;
  max-height: 70vh;
  display: block;
  user-select: none;
}

.bubble-node {
  cursor: pointer;
  outline: none;
  transition: opacity 0.2s ease;
}

.bubble-node.is-dimmed {
  opacity: 0.16;
}

.bubble-circle {
  fill: color-mix(in srgb, var(--bubble-color) 18%, var(--surface));
  stroke: color-mix(in srgb, var(--bubble-color) 62%, transparent);
  stroke-width: 1.5;
  transition: fill 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease;
}

.bubble-node:hover .bubble-circle,
.bubble-node:focus-visible .bubble-circle,
.bubble-node.is-hovered .bubble-circle,
.bubble-node.is-matched .bubble-circle {
  fill: color-mix(in srgb, var(--bubble-color) 30%, var(--surface));
  stroke: var(--bubble-color);
  stroke-width: 2.2;
}

.bubble-node.is-selected .bubble-circle {
  fill: color-mix(in srgb, var(--bubble-color) 36%, var(--surface));
  stroke: var(--ink);
  stroke-width: 3;
}

.bubble-label {
  fill: var(--ink);
  font-family: var(--font-sans);
  font-weight: 600;
  pointer-events: none;
}

.bubble-count {
  fill: var(--ink-2);
  font-family: var(--font-sans);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  opacity: 0.85;
}

.bubble-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.45rem 0.7rem;
  box-shadow: var(--shadow-lg);
  min-width: 170px;
}

.tooltip-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.86rem;
  font-weight: 650;
  color: var(--ink);
}

.tooltip-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tooltip-meta {
  margin-top: 0.15rem;
  font-size: 0.77rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* Organization Selector Panel */
.org-selector-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  overflow: hidden;
}

@media (max-width: 960px) {
  .org-selector-panel {
    max-height: 280px;
  }
}

.selector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.selector-count {
  font-variant-numeric: tabular-nums;
}

.selector-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.selector-item:hover,
.selector-item.is-hovered {
  background: var(--surface-sunken);
}

.selector-item.is-selected {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.selector-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.selector-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selector-meta {
  font-size: 0.78rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.selector-item.is-selected .selector-meta {
  color: var(--accent-ink);
}

.selector-empty {
  padding: 1.5rem 0.75rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0;
}
</style>
