<template>
  <div
    @mouseover="onDotHover"
    @mouseout="onDotLeave"
    @focusin="onDotHover"
    @focusout="onDotLeave"
    @click="onDotClick"
  >
    <CveSubnav />
    <section class="section pb-2">
      <div class="container">
        <h1 class="sr-only">CVE overview</h1>
        <p class="intro-note">
          Note: vulnerabilities aren't always associated with a CVE. Bugs are
          often fixed before affecting stable releases. Some are immediately found
          using fuzzers, or internal audits. This page only displays CVEs,
          normalized into a two-level vulnerability taxonomy. For a more complete
          view of Chromium security issues, please refer to
          <NuxtLink
            to="https://crbug.com/issues?q=((componentid:1363614%2B%20type:vulnerability)%20%7C%20collaborator:security@chromium.org)%20-status:(new%20%7C%20duplicate%20%7C%20infeasible%20%7C%20intended_behavior%20%7C%20not_reproducible%20%7C%20obsolete)%20hotlistid:(5432902%20%7C%205432548)"
          >the bug tracker</NuxtLink>.
        </p>
      </div>
    </section>

    <section class="section sticky">
      <div class="container">
        <div class="controls-bar">
          <UiField label="Severity">
            <div class="chips">
              <UiToggle v-model="severities" value="Low">Low</UiToggle>
              <UiToggle v-model="severities" value="Medium">Medium</UiToggle>
              <UiToggle v-model="severities" value="High">High</UiToggle>
              <UiToggle v-model="severities" value="Critical">Critical</UiToggle>
            </div>
          </UiField>

          <UiField label="Grouping">
            <UiSegmented
              v-model="grouping"
              :options="[
                { value: 'detailed', label: 'Categories + Subgroups' },
                { value: 'categories', label: 'Categories only' },
              ]"
            />
          </UiField>

          <div class="severity-legend" aria-label="Severity legend">
            <span v-if="severities.includes('Low')" class="legend-item">
              <span class="cve-dot severity-low" /> Low
            </span>
            <span v-if="severities.includes('Medium')" class="legend-item">
              <span class="cve-dot severity-medium" /> Medium
            </span>
            <span v-if="severities.includes('High')" class="legend-item">
              <span class="cve-dot severity-high" /> High
            </span>
            <span v-if="severities.includes('Critical')" class="legend-item">
              <span class="cve-dot severity-critical" /> Critical
            </span>
          </div>
        </div>
      </div>
    </section>

    <section
      class="section year-section"
      v-for="(data, i) in cve_by_year"
      :key="data.year"
    >
      <div class="container">
        <h2 class="title">{{ data.year }}</h2>

        <ClientOnly>
          <CveProgressionGraph
            v-if="filtered_cves.length > 0"
            :year="data.year"
            :data="filtered_cves"
            :totalPrevious="data.total_previous || 0"
            :projection="i === 0 ? { low: projection.low, high: projection.high } : undefined"
          />
        </ClientOnly>

        <div class="year-summary">
          <div class="grid">
            <strong>Total : </strong>
            <p>{{ data.total }} CVEs</p>

            <template v-if="i === 0">
              <strong>Projection :</strong>
              <p>
                [ {{ projection.low }} CVEs , {{ projection.high }} CVEs ]
              </p>
              <strong>Y/Y projection :</strong>
              <p v-if="data.total_previous > 0">
                [
                {{ cve_percent_format((projection.low - data.total_previous) / data.total_previous * 100) }} %
                ,
                {{ cve_percent_format((projection.high - data.total_previous) / data.total_previous * 100) }} %
                ]
              </p>
              <p v-else>—</p>
            </template>
            <template v-else-if="data.total_previous > 0">
              <strong>Y/Y :</strong>
              <p>
                {{ cve_percent_format((data.total - data.total_previous) / data.total_previous * 100) }} %
              </p>
            </template>
          </div>

          <div v-if="data.total > 0" class="category-breakdown">
            <div class="breakdown-bar" role="img" :aria-label="`Category breakdown for ${data.year}`">
              <button
                v-for="cat in data.categories"
                :key="cat.id"
                type="button"
                class="breakdown-segment"
                :style="{
                  width: `${(cat.total / data.total) * 100}%`,
                  backgroundColor: cat.color,
                }"
                :title="`${cat.label}: ${cat.total} CVEs (${formatShare(cat.total, data.total)}) — ${cat.description}`"
                @click="toggleCategory(data.year, cat.id)"
              />
            </div>
            <div class="breakdown-legend">
              <button
                v-for="cat in data.categories"
                :key="cat.id"
                type="button"
                class="breakdown-pill"
                :class="{ 'is-collapsed': !isExpanded(data.year, cat.id) }"
                :title="`Click to ${isExpanded(data.year, cat.id) ? 'collapse' : 'expand'} ${cat.label}`"
                @click="toggleCategory(data.year, cat.id)"
              >
                <span class="cat-dot" :style="{ backgroundColor: cat.color }" />
                <span class="pill-label">{{ cat.label }}</span>
                <span class="pill-pct">{{ formatShare(cat.total, data.total) }}</span>
                <span class="pill-count">({{ cat.total }})</span>
              </button>
            </div>
          </div>
        </div>

        <hr />

        <div class="table-container">
          <table class="table is-bordered is-narrow is-hoverable cve-matrix">
            <thead>
              <tr>
                <th scope="col" class="col-class">Category / Vulnerability class</th>
                <th scope="col" class="col-total">Total</th>
                <th
                  scope="col"
                  v-for="project in project_list"
                  :key="project"
                  class="col-project"
                  :style="{ width: columnWidthsByYear.get(data.year)?.[project] }"
                >
                  {{ project }}
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="cat in data.categories" :key="cat.id">
                <tr
                  class="category-row"
                  :class="{ 'is-expanded': isExpanded(data.year, cat.id) }"
                  @click="toggleCategory(data.year, cat.id)"
                >
                  <th
                    scope="row"
                    class="category-cell"
                    :style="{ '--cat-color': cat.color }"
                  >
                    <button
                      type="button"
                      class="category-toggle"
                      :aria-expanded="isExpanded(data.year, cat.id)"
                      @click.stop="toggleCategory(data.year, cat.id)"
                    >
                      <UiIcon
                        v-if="isExpanded(data.year, cat.id)"
                        name="chevron-down"
                        class="chevron"
                      />
                      <UiIcon
                        v-else
                        name="chevron-right"
                        class="chevron"
                      />
                      <span class="cat-dot" :style="{ backgroundColor: cat.color }" />
                      <span class="cat-name">{{ cat.label }}</span>
                      <span class="cat-share">{{ formatShare(cat.total, data.total) }}</span>
                      <span
                        v-if="!isExpanded(data.year, cat.id) && cat.subgroups.length > 1"
                        class="cat-subcount"
                      >
                        {{ cat.subgroups.length }} classes
                      </span>
                    </button>
                  </th>
                  <td class="col-total category-total">{{ cat.total }}</td>
                  <td
                    v-for="project in project_list"
                    :key="project"
                    class="project-cell"
                  >
                    <template v-if="isExpanded(data.year, cat.id)">
                      <span
                        v-if="cat.byProject[project]?.length"
                        class="project-subtotal"
                      >
                        {{ cat.byProject[project].length }}
                      </span>
                    </template>
                    <div v-else-if="cat.byProject[project]?.length" class="dots">
                      <a
                        v-for="cve in cat.byProject[project]"
                        :key="cve.id"
                        :href="`/cve?id=${cve.id}`"
                        :data-cve="cve.id"
                        :class="['cve-dot', cve.severityClass]"
                        :aria-label="`${cve.id}: ${cve.title || cve.subgroup}`"
                      />
                    </div>
                  </td>
                </tr>

                <template v-if="isExpanded(data.year, cat.id)">
                  <tr
                    v-for="sub in cat.subgroups"
                    :key="`${cat.id}:${sub.name}`"
                    class="subgroup-row"
                  >
                    <th
                      scope="row"
                      class="subgroup-cell"
                      :style="{ '--cat-color': cat.color }"
                      :title="sub.rawProblems.length > 1 ? `Includes: ${sub.rawProblems.join(' · ')}` : sub.rawProblems[0]"
                    >
                      <span class="subgroup-name">{{ sub.name }}</span>
                    </th>
                    <td class="col-total subgroup-total">{{ sub.total }}</td>
                    <td
                      v-for="project in project_list"
                      :key="project"
                      class="project-cell"
                    >
                      <div v-if="sub.byProject[project]?.length" class="dots">
                        <a
                          v-for="cve in sub.byProject[project]"
                          :key="cve.id"
                          :href="`/cve?id=${cve.id}`"
                          :data-cve="cve.id"
                          :class="['cve-dot', cve.severityClass]"
                          :aria-label="`${cve.id}: ${cve.title || cve.subgroup}`"
                        />
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
            <tfoot v-if="data.total > 0">
              <tr class="total-row">
                <th scope="row">Total</th>
                <td class="col-total">{{ data.total }}</td>
                <td
                  v-for="project in project_list"
                  :key="project"
                  class="col-total"
                >
                  {{ data.projectTotals[project] || "" }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>

    <!-- Single shared floating tooltip for all CVE dots (event-delegated). -->
    <div
      v-if="hoveredCve"
      class="floating-cve-tip"
      :class="tooltipBelow ? 'is-below' : 'is-above'"
      role="tooltip"
      :style="tooltipStyle"
    >
      <p class="cve-tip-title">
        <strong>{{ hoveredCve.id }}</strong> — {{ hoveredCve.title || hoveredCve.description }}
      </p>
      <p class="cve-tip-meta">
        <strong>Class:</strong> {{ hoveredCve.subgroup }}
        <span v-if="hoveredCve.rawProblem && hoveredCve.rawProblem.toLowerCase() !== hoveredCve.subgroup.toLowerCase()">
          ({{ hoveredCve.rawProblem }})
        </span>
        <span v-if="hoveredCve.cweId && !hoveredCve.rawProblem.includes(String(hoveredCve.cweId))">
          · CWE-{{ hoveredCve.cweId }}
        </span>
      </p>
      <p v-if="hoveredCve.vrp_reward" class="cve-tip-meta">
        <strong>Reward:</strong> ${{ hoveredCve.vrp_reward }}
      </p>
      <p v-if="hoveredCve.components?.length" class="cve-tip-meta">
        <strong>Components:</strong> {{ hoveredCve.components.join(", ") }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { format } from "d3-format";
import { jStat } from "jstat";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchCveSummary, type CveRecord } from "~/utils/cve";
import { CVE_CATEGORIES, classifyCve } from "~/utils/cveClassification";

interface Cve extends Omit<CveRecord, "year"> {
  year: number;
  project: string;
  categoryId: string;
  subgroup: string;
  rawProblem: string;
  severityClass: string;
}

interface SubgroupRow {
  name: string;
  total: number;
  byProject: Record<string, Cve[]>;
  rawProblems: string[];
}

interface CategoryGroup {
  id: string;
  label: string;
  description: string;
  color: string;
  total: number;
  byProject: Record<string, Cve[]>;
  subgroups: SubgroupRow[];
}

interface YearSummary {
  year: number;
  categories: CategoryGroup[];
  projectTotals: Record<string, number>;
  total: number;
  total_previous: number;
}

const router = useRouter();

const getCveYear = (cve: { published: string; year?: string | number }): number => {
  return Number(cve.year) || new Date(cve.published).getFullYear();
};

const cve_percent_format = format("+.1f");

const formatShare = (part: number, total: number): string => {
  if (!total) return "0%";
  const pct = (part / total) * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
};

const { severities, grouping } = useUrlState({
  severities: urlCodecs.csv(["High", "Critical"]),
  grouping: urlCodecs.enum(["detailed", "categories"] as const, "detailed"),
});

// Per-year/category manual expand/collapse overrides relative to `grouping`.
const toggledKeys = shallowRef<Set<string>>(new Set());
watch(grouping, () => {
  toggledKeys.value = new Set();
});

const isExpanded = (year: number, categoryId: string): boolean => {
  const defaultOpen = grouping.value === "detailed";
  return toggledKeys.value.has(`${year}:${categoryId}`) ? !defaultOpen : defaultOpen;
};

const toggleCategory = (year: number, categoryId: string) => {
  const key = `${year}:${categoryId}`;
  const next = new Set(toggledKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  toggledKeys.value = next;
};

const all_cve_data = shallowRef<readonly Cve[]>([]);
let cveById = new Map<string, Cve>();

// Single delegated tooltip state.
const hoveredCve = shallowRef<Cve | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const tooltipBelow = ref(false);

const tooltipStyle = computed(() => ({
  left: `${tooltipX.value}px`,
  top: `${tooltipY.value}px`,
}));

const showTooltipFor = (el: HTMLElement) => {
  const id = el.dataset.cve;
  if (!id) return;
  const cve = cveById.get(id);
  if (!cve) return;
  const rect = el.getBoundingClientRect();
  const halfWidth = Math.min(220, window.innerWidth * 0.42);
  const clampedX = Math.max(halfWidth + 12, Math.min(window.innerWidth - halfWidth - 12, rect.left + rect.width / 2));
  const showBelow = rect.top < 170;
  tooltipX.value = clampedX;
  tooltipY.value = showBelow ? rect.bottom + 10 : rect.top - 10;
  tooltipBelow.value = showBelow;
  hoveredCve.value = cve;
};

const onDotHover = (e: Event) => {
  const target = e.target as HTMLElement | null;
  if (target?.dataset?.cve) {
    showTooltipFor(target);
  }
};

const onDotLeave = (e: Event) => {
  const target = e.target as HTMLElement | null;
  if (target?.dataset?.cve) {
    hoveredCve.value = null;
  }
};

const onDotClick = (e: MouseEvent) => {
  const target = (e.target as HTMLElement | null)?.closest?.("a[data-cve]") as HTMLAnchorElement | null;
  if (!target) return;
  e.stopPropagation();
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  hoveredCve.value = null;
  router.push(`/cve?id=${target.dataset.cve}`);
};

const clearTooltip = () => {
  if (hoveredCve.value) hoveredCve.value = null;
};

const project_list = [
  "angle",
  "chromium",
  "dawn",
  "skia",
  "swiftshader",
  "v8",
  "webrtc",
];

const subprojects = project_list.filter((p) => p !== "chromium");

const cve_project = (cve: CveRecord): string => {
  const desc = (cve.description || "").toLowerCase();
  for (const project of subprojects) {
    if (desc.includes(project)) {
      return project;
    }
  }
  if (Array.isArray(cve.repos)) {
    for (const project of subprojects) {
      if (cve.repos.includes(project)) {
        return project;
      }
    }
  }
  return "chromium";
};

const SEVERITY_CLASS: Record<string, string> = {
  Low: "severity-low",
  Medium: "severity-medium",
  High: "severity-high",
  Critical: "severity-critical",
};

/**
 * Calculates the projected interval, ensuring the Lower Bound
 * never drops below the already observed count.
 */
function calculateProjectedInterval(count: number, timeFraction: number, confidence = 0.9) {
  const alpha = 1 - confidence;

  const lowerLambda = count === 0
    ? 0
    : jStat.chisquare.inv(alpha / 2, 2 * count) / 2;

  const upperLambda = jStat.chisquare.inv(1 - alpha / 2, 2 * (count + 1)) / 2;

  const projectedLowerRate = lowerLambda / timeFraction;
  const projectedUpperRate = upperLambda / timeFraction;
  const projectedMean = count / timeFraction;

  const finalLower = Math.max(count, projectedLowerRate);
  const finalUpper = Math.max(count, projectedUpperRate);

  return {
    observedCount: count,
    timeFraction,
    projectedMean: parseFloat(projectedMean.toFixed(2)),
    confidenceInterval: {
      lower: parseFloat(finalLower.toFixed(2)),
      upper: parseFloat(finalUpper.toFixed(2)),
      constraintApplied: finalLower === count ? "Yes (Floor)" : "No",
    },
  };
}

onMounted(async () => {
  window.addEventListener("scroll", clearTooltip, { passive: true });
  const data = await fetchCveSummary();
  const map = new Map<string, Cve>();
  const enriched: Cve[] = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const cve = data[i];
    const cls = classifyCve(cve);
    const item: Cve = Object.freeze({
      ...cve,
      year: getCveYear(cve),
      project: cve_project(cve),
      categoryId: cls.categoryId,
      subgroup: cls.subgroup,
      rawProblem: cls.rawProblem,
      severityClass: SEVERITY_CLASS[cve.severity] || "",
    });
    enriched[i] = item;
    map.set(item.id, item);
  }
  cveById = map;
  all_cve_data.value = enriched;
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", clearTooltip);
});

const filtered_cves = computed(() => {
  const allowed = new Set(severities.value);
  return all_cve_data.value.filter((cve) => {
    return cve.year > 2020 && allowed.has(cve.severity);
  });
});

const severity_map = new Map<string, number>([
  ["Low", 0],
  ["Medium", 1],
  ["High", 2],
  ["Critical", 3],
]);

const groupByProject = (items: Cve[]): Record<string, Cve[]> => {
  const out: Record<string, Cve[]> = {};
  for (const cve of items) {
    (out[cve.project] ??= []).push(cve);
  }
  return out;
};

const cve_by_year = computed<YearSummary[]>(() => {
  if (all_cve_data.value.length === 0) {
    return [];
  }
  const repo_data = filtered_cves.value;

  const yearBuckets = new Map<number, Cve[]>();
  for (const cve of repo_data) {
    let list = yearBuckets.get(cve.year);
    if (!list) {
      list = [];
      yearBuckets.set(cve.year, list);
    }
    list.push(cve);
  }

  const current_year = new Date().getFullYear();
  if (!yearBuckets.has(current_year)) {
    yearBuckets.set(current_year, []);
  }

  const year_list = Array.from(yearBuckets.keys()).sort((a, b) => b - a);

  const list: YearSummary[] = year_list.map((year) => {
    const out = (yearBuckets.get(year) || []).sort(
      (a, b) => (severity_map.get(a.severity) ?? 0) - (severity_map.get(b.severity) ?? 0),
    );

    const projectTotals: Record<string, number> = {};
    const catBuckets = new Map<string, Cve[]>();
    for (const cve of out) {
      projectTotals[cve.project] = (projectTotals[cve.project] || 0) + 1;
      let bucket = catBuckets.get(cve.categoryId);
      if (!bucket) {
        bucket = [];
        catBuckets.set(cve.categoryId, bucket);
      }
      bucket.push(cve);
    }

    const categories: CategoryGroup[] = [];
    for (const catDef of CVE_CATEGORIES) {
      const catItems = catBuckets.get(catDef.id);
      if (!catItems?.length) continue;

      const subBuckets = new Map<string, Cve[]>();
      for (const cve of catItems) {
        let sb = subBuckets.get(cve.subgroup);
        if (!sb) {
          sb = [];
          subBuckets.set(cve.subgroup, sb);
        }
        sb.push(cve);
      }

      const subgroups: SubgroupRow[] = Array.from(subBuckets.entries())
        .map(([name, items]) => ({
          name,
          total: items.length,
          byProject: groupByProject(items),
          rawProblems: Array.from(new Set(items.map((c) => c.rawProblem))).sort(),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

      categories.push({
        id: catDef.id,
        label: catDef.label,
        description: catDef.description,
        color: catDef.color,
        total: catItems.length,
        byProject: groupByProject(catItems),
        subgroups,
      });
    }

    // Order categories by count descending, keeping "other" at the bottom.
    categories.sort((a, b) => {
      if (a.id === "other") return 1;
      if (b.id === "other") return -1;
      return b.total - a.total;
    });

    return {
      year,
      categories,
      projectTotals,
      total: out.length,
      total_previous: 0,
    };
  });

  for (let i = 0; i < list.length - 1; i++) {
    if (list[i + 1]) {
      list[i].total_previous = list[i + 1].total;
    }
  }

  return list;
});

// Precompute proportional project column widths per year (reacting only when
// year data, grouping, or expand/collapse state changes).
const columnWidthsByYear = computed(() => {
  const result = new Map<number, Record<string, string>>();
  for (const data of cve_by_year.value) {
    const weights: number[] = project_list.map((project) => {
      let largest = 0;
      for (const cat of data.categories) {
        if (isExpanded(data.year, cat.id)) {
          for (const sub of cat.subgroups) {
            const n = sub.byProject[project]?.length ?? 0;
            if (n > largest) largest = n;
          }
        } else {
          const n = cat.byProject[project]?.length ?? 0;
          if (n > largest) largest = n;
        }
      }
      return Math.max(1, Math.ceil(Math.sqrt(largest)));
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const widths: Record<string, string> = {};
    for (let i = 0; i < project_list.length; i++) {
      widths[project_list[i]] = `${((weights[i] / totalWeight) * 76).toFixed(1)}%`;
    }
    result.set(data.year, widths);
  }
  return result;
});

const projection = computed(() => {
  if (cve_by_year.value.length === 0) return { low: 0, high: 0 };

  const now = new Date();
  const year_percent =
    (now.getTime() - new Date(`${now.getFullYear()}-01-01`).getTime()) /
    (new Date(`${now.getFullYear() + 1}-01-01`).getTime() - new Date(`${now.getFullYear()}-01-01`).getTime());

  const proj = calculateProjectedInterval(
    cve_by_year.value[0].total,
    year_percent,
    0.95,
  );

  return {
    low: Math.round(proj.confidenceInterval.lower),
    high: Math.round(proj.confidenceInterval.upper),
  };
});
</script>

<style scoped>
.intro-note {
  color: var(--muted);
  font-size: 0.92rem;
}

.sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(10px);
  margin-bottom: 0;
  margin-top: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  background-color: color-mix(in srgb, var(--surface) 82%, transparent);
  border-bottom: 1px solid var(--line);
}

.controls-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem 1.75rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.severity-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
  padding-bottom: 0.35rem;
  font-size: 0.875rem;
  color: var(--ink-2);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.year-summary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.75rem;
}

.grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.15rem 0.5em;
}

.grid > strong {
  text-align: right;
}

.grid > p {
  margin: 0;
}

/* Stacked category breakdown bar */
.category-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.breakdown-bar {
  display: flex;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface-sunken);
  gap: 1px;
}

.breakdown-segment {
  border: 0;
  padding: 0;
  cursor: pointer;
  min-width: 3px;
  transition: filter 0.15s ease;
}

.breakdown-segment:hover {
  filter: brightness(1.12);
}

.breakdown-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.65rem;
}

.breakdown-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease;
}

.breakdown-pill:hover {
  border-color: var(--line-strong);
  background: var(--surface-sunken);
}

.breakdown-pill.is-collapsed {
  opacity: 0.68;
}

.pill-pct {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.pill-count {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.cat-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Group-of-groups matrix table */
.cve-matrix {
  width: 100%;
  table-layout: auto;
  contain: layout style;
}

.cve-matrix thead th {
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--muted);
  white-space: nowrap;
  padding: 0.35rem 0.45rem;
}

.col-class {
  width: 20%;
  min-width: 185px;
}

.col-total {
  width: 4%;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.col-project {
  padding-left: 0.4rem;
  padding-right: 0.4rem;
}

.category-row {
  background-color: var(--surface-sunken);
  cursor: pointer;
}

.category-row:hover {
  background-color: color-mix(in srgb, var(--surface-sunken) 70%, var(--line));
}

.category-cell {
  border-left: 4px solid var(--cat-color) !important;
  padding: 0.3rem 0.45rem;
}

.category-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.chevron {
  color: var(--muted);
  flex-shrink: 0;
}

.cat-name {
  font-weight: 650;
}

.cat-share {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  margin-left: 0.1rem;
  flex-shrink: 0;
}

.cat-subcount {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--faint);
  margin-left: auto;
  padding-left: 0.4rem;
  white-space: nowrap;
}

.category-total {
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--ink);
}

.project-subtotal {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.subgroup-row {
  background-color: var(--surface);
}

.subgroup-cell {
  border-left: 4px solid color-mix(in srgb, var(--cat-color) 32%, transparent) !important;
  padding: 0.25rem 0.45rem 0.25rem 1.45rem !important;
  font-size: 0.84rem;
  font-weight: 450;
  color: var(--ink-2);
}

.subgroup-total {
  color: var(--muted);
  font-size: 0.82rem;
}

.project-cell {
  vertical-align: middle;
  padding: 0.25rem 0.4rem !important;
}

.dots {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  line-height: 0;
  contain: layout style;
}

.cve-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
  text-decoration: none;
  transition: transform 0.12s ease;
}

a.cve-dot:hover,
a.cve-dot:focus-visible {
  transform: scale(1.5);
  outline: none;
}

.total-row th,
.total-row td {
  font-weight: 700;
  font-size: 0.85rem;
  background-color: var(--surface-sunken);
  border-top: 2px solid var(--line-strong);
  padding: 0.3rem 0.45rem;
}

/* Single shared floating tooltip */
.floating-cve-tip {
  position: fixed;
  z-index: 40;
  pointer-events: none;
  width: min(440px, 84vw);
  background: var(--tooltip-bg);
  color: var(--tooltip-ink);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 0.5rem 0.7rem;
  font-size: 0.78rem;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.floating-cve-tip.is-above {
  transform: translate(-50%, -100%);
}

.floating-cve-tip.is-below {
  transform: translate(-50%, 0);
}

.floating-cve-tip p {
  margin: 0;
}

.cve-tip-title {
  white-space: pre-line;
}

.cve-tip-meta {
  font-size: 0.9em;
  opacity: 0.9;
}

.severity-low {
  color: var(--series-1);
}

.severity-medium {
  color: var(--series-4);
}

.severity-high {
  color: var(--severity-high);
}

.severity-critical {
  color: var(--severity-critical);
}
</style>
