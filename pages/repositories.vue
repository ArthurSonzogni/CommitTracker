<template>
  <div>
    <section class="section">
      <SplitLayout>
        <template #header>
          <h1 class="title">Repositories charts</h1>
        </template>

        <template #aside>
        <FilterPanel :summary="summary">
          <UiField label="Repositories">
            <RepositorySelector
              v-model="repositories"
              size="medium"
              :allowMultiple="true"
              :allowAll="true"
              />
          </UiField>
        </FilterPanel>
        </template>

        <!-- The settings of the chart, above it. -->
        <FilterPanel :summary="settingsSummary">
          <div class="form-row settings-row">
          <UiField label="Metric">
            <UiSegmented v-model="what" :options="what_options" />
          </UiField>


          <UiField label="Display" v-if="what == 'per_contributor'">
            <UiSegmented
              v-model="display"
              :options="[
              { value: 'average', label: 'Average' },
              { value: 'percentile', label: `Top ${sliderTransform(percentile).toFixed(2)} %` },
              { value: 'individual', label: `Top ${individual} individual` },
              { value: 'someone', label: 'Someone' },
              { value: 'someone_rank', label: 'Someone (rank)' },
              { value: 'someone_rank_percent', label: 'Someone (rank %)' },
            ]" />
          </UiField>

          <UiField v-if="what == 'per_contributor' && display == 'percentile'" class="setting-slider">
            <UiSlider v-model="percentile" :min="0" :max="1" :step="0.001" :formatter="(val) => sliderTransform(val).toFixed(2) + '%'" :tooltip="false" indicator lazy></UiSlider>
          </UiField>

          <UiField v-if="what == 'per_contributor' && display == 'individual'" class="setting-slider">
            <UiSlider v-model="individual" :min="1" :max="1000" :step="1" :tooltip="false" lazy indicator></UiSlider>
          </UiField>

          <UiField v-if="what == 'per_contributor' && display.startsWith('someone')" expanded class="setting-developers">
                   <DevelopersInput v-model="developers"></DevelopersInput>
          </UiField>

            <UiField label="Count as" v-if="what != 'commit' && !isTraitMetric">
              <UiSegmented
                v-model="kind"
                :options="[
                { value: 'author', label: 'Author' },
                { value: 'review', label: 'Reviewer' },
                { value: 'both', label: 'Both' },
              ]" />
            </UiField>

            <UiField label="Grouping" v-if="!isTraitMetric">
              <UiSegmented
                v-model="grouping"
                :options="[
                { value: 'forever', label: 'Forever' },
                { value: 'decennial', label: 'Decennial' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'monthly', label: 'Monthly' },
              ]" />
            </UiField>

            <UiField label="Smoothing" v-if="isTraitMetric">
              <UiSegmented
                v-model="smoothing"
                :options="[
                { value: '3m', label: '3-month avg' },
                { value: '12m', label: '12-month avg' },
                { value: '1m', label: 'Monthly' },
              ]" />
            </UiField>

            <UiField label="Developer min total contributions" v-if="min_contributions_enabled">
                     <UiNumberInput v-model="min_contributions"></UiNumberInput>
            </UiField>
          </div>
        </FilterPanel>

        <div v-if="isTraitMetric" class="culture-panel">
          <div class="culture-head">
            <h2 class="culture-title">{{ traitMeta.title }}</h2>
            <p class="culture-text">{{ traitMeta.text }}</p>
            <div class="culture-presets">
              <button type="button" class="button is-small" @click="repositories = ['chromium', 'firefox', 'webkit', 'llvm', 'v8', 'webrtc']">
                Major engines
              </button>
              <button type="button" class="button is-small" @click="repositories = ['chromium', 'v8', 'skia', 'dawn', 'angle', 'webrtc', 'pdfium']">
                Chromium family
              </button>
            </div>
          </div>
          <div v-if="traitSeries.length" class="culture-legend">
            <span v-for="s in traitSeries" :key="s.label">
              <span class="culture-swatch" :style="{ background: s.color }" />{{ s.label }}
            </span>
          </div>
          <ReportTraitChart
            v-if="traitData && traitSeries.length"
            :months="traitData.months"
            :series="traitSeries"
            from="2017-01"
            :highlight-from="`${latestTraitYear}-01`"
            :format="traitMeta.format"
            :axis-format="traitMeta.axisFormat"
            :aria-label="traitMeta.title" />
          <div v-if="traitRows.length" class="culture-table-wrap">
            <table class="culture-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Latest 12 months</th>
                  <th>2020–2024 average</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in traitRows" :key="row.dirname">
                  <th scope="row">
                    <span class="culture-dot" :style="{ background: row.color }" />
                    {{ row.name }}
                  </th>
                  <td>{{ row.recent }}</td>
                  <td>{{ row.baseline }}</td>
                  <td>{{ row.delta }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <Contributions
          v-else
          :repositories="repositories"
          :percentile="sliderTransform(percentile)"
          :individual="individual"
          :grouping="grouping"
          :what="what"
          :display="display"
          :kind="kind"
          :developers="developers"
          :min_contributions="min_contributions_enabled ? min_contributions : 0"
          />
      </SplitLayout>
    </section>

    <section class="section pt-0">
      <div class="container">
        <AboutData>
          <ul>
            <li>
              Data are refreshed <strong>weekly</strong>, and
              <strong>automatically</strong>. See <a
                href="https://github.com/ArthurSonzogni/CommitTracker/actions/workflows/importer-commit-timeline.yaml">Jobs</a>
            </li>
            <li>
              Chromium's <strong>reviewers data before 2017 are missing</strong>.
              This informations wasn't part of the commit description before.
            </li>
            <li>
              <strong>Leaving contributors:</strong>: Every contributor increase
              the bucket representing their last commit.
              This is normal to see a huge increase in the last bucket, or in
              the second to last.
            </li>
            <li>
              <strong>New Contributors:</strong> Every contributor increase the
              bucket representing their first commit. This is normal to see a
              relative small number at the end, as the year is not completed yet.
            </li>
          </ul>
        </AboutData>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { capitalize, listSummary, repositoryNames } from "~/utils/filter-summary";
import repositoriesJson from "../public/data/repositories.json";
import type { TraitSeries } from "~/components/ReportTraitChart.vue";

const DEFAULT_REPOSITORIES = [
  "angle",
  "chromeos",
  "chromium",
  "dawn",
  "devtool-frontend",
  "gn",
  "pdfium",
  "perfetto",
  "swiftshader",
  "v8",
  "webrtc",
] as const;

const {
  repositories,
  what,
  grouping,
  smoothing,
  display,
  kind,
  percentile,
  individual,
  developers,
  min_contributions,
} = useUrlState({
  repositories: urlCodecs.csv(DEFAULT_REPOSITORIES),
  what: urlCodecs.enum(
    ["commit", "contributors", "first_commit", "last_commit", "per_contributor", "message_length", "revert_rate", "bug_linked"] as const,
    "commit",
  ),
  grouping: urlCodecs.enum(
    ["forever", "decennial", "yearly", "quarterly", "monthly"] as const,
    "yearly",
  ),
  smoothing: urlCodecs.enum(["1m", "3m", "12m"] as const, "3m"),
  display: urlCodecs.enum(
    ["average", "percentile", "individual", "someone", "someone_rank", "someone_rank_percent"] as const,
    "average",
  ),
  kind: urlCodecs.enum(["author", "review", "both"] as const, "author"),
  percentile: urlCodecs.number(0.7071, { min: 0, max: 1 }),
  individual: urlCodecs.number(300, { min: 1, max: 1000, integer: true }),
  developers: urlCodecs.csv([]),
  min_contributions: urlCodecs.number(0, { min: 0, integer: true }),
});

const what_options = [
  { value: 'commit', label: 'Commits' },
  { value: 'contributors', label: 'Contributors' },
  { value: 'first_commit', label: 'New contributors' },
  { value: 'last_commit', label: 'Leaving contributors' },
  { value: 'per_contributor', label: 'Commits per developer' },
  { value: 'message_length', label: 'Message length' },
  { value: 'revert_rate', label: 'Revert rate' },
  { value: 'bug_linked', label: 'Bug-linked' },
];

const isTraitMetric = computed(() =>
  what.value === 'message_length' || what.value === 'revert_rate' || what.value === 'bug_linked',
);

const summary = computed(() => listSummary(repositoryNames(repositories.value), "repositories"));
const settingsSummary = computed(() => [
  what_options.find(option => option.value == what.value)?.label,
  isTraitMetric.value ? smoothing.value : capitalize(grouping.value),
].join(" · "));

const sliderTransform = (value: number) => {
  return 100 * value * value;
}

const min_contributions_enabled = computed(() => {
  if (isTraitMetric.value) return false;
  return what.value != 'per_contributor' || (
    display.value != 'someone' &&
    display.value != 'someone_rank' &&
    display.value != 'someone_rank_percent'
  )
});

// Cross-repo culture comparison (backed by developer-output.json).
type DevOutputData = {
  months: string[];
  repositories: {
    dirname: string;
    name: string;
    groups: {
      id: string;
      msg?: (number | null)[];
      traits?: {
        revert?: (number | null)[];
        bug?: (number | null)[];
      };
    }[];
  }[];
};

const traitData = shallowRef<DevOutputData | null>(null);
const ensureTraitData = async () => {
  if (traitData.value) return;
  const response = await fetch("/data/developer-output.json");
  if (response.ok) traitData.value = await response.json();
};
watch(isTraitMetric, active => {
  if (active) ensureTraitData();
}, { immediate: true });

const repoColor = new Map(repositoriesJson.map(r => [r.dirname, r.color]));
const latestTraitYear = computed(() => traitData.value?.months.at(-1)?.slice(0, 4) ?? "2026");

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

const traitMeta = computed(() => {
  if (what.value === "revert_rate") {
    return {
      title: "Revert rate across repositories",
      text: "Share of authored commits that revert an earlier commit (highlighting differences in tree-sheriffing and backout culture).",
      format: pct1,
      axisFormat: (v: number) => `${+(v * 100).toFixed(1)}%`,
    };
  }
  if (what.value === "bug_linked") {
    return {
      title: "Bug-linked commits across repositories",
      text: "Share of authored commits referencing a numeric bug ID.",
      format: pct1,
      axisFormat: (v: number) => `${Math.round(v * 100)}%`,
    };
  }
  return {
    title: "Commit message length across repositories",
    text: "Median character length of commit descriptions without footers/trailers, excluding reverts and rolls.",
    format: (v: number) => `${integer.format(v)} chars`,
    axisFormat: (v: number) => integer.format(v),
  };
});

const rawSeriesOf = (repo: DevOutputData["repositories"][number]): (number | null)[] => {
  const g = repo.groups[0];
  if (!g) return [];
  if (what.value === "revert_rate") return g.traits?.revert ?? [];
  if (what.value === "bug_linked") return g.traits?.bug ?? [];
  return g.msg ?? [];
};

const smoothSeries = (values: (number | null)[], windowSize: number): (number | null)[] => {
  if (windowSize <= 1) return values;
  return values.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
      if (values[j] !== null && values[j] !== undefined) {
        sum += values[j]!;
        count++;
      }
    }
    return count >= Math.ceil(windowSize / 2) ? sum / count : null;
  });
};

const traitSeries = computed<TraitSeries[]>(() => {
  if (!traitData.value) return [];
  const win = smoothing.value === "12m" ? 12 : smoothing.value === "3m" ? 3 : 1;
  const selected = new Set(repositories.value);
  return traitData.value.repositories
    .filter(r => selected.has(r.dirname))
    .map(r => ({
      label: r.name,
      color: repoColor.get(r.dirname) ?? "var(--series-1)",
      values: smoothSeries(rawSeriesOf(r), win),
    }))
    .filter(s => s.values.some(v => v !== null && v > 0));
});

const traitRows = computed(() => {
  if (!traitData.value) return [];
  const months = traitData.value.months;
  const selected = new Set(repositories.value);
  const fmt = traitMeta.value.format;
  const avgRange = (vals: (number | null)[], pred: (m: string, i: number) => boolean) => {
    let sum = 0, n = 0;
    for (let i = 0; i < months.length; i++) {
      if (pred(months[i], i) && vals[i] !== null && vals[i] !== undefined) {
        sum += vals[i]!;
        n++;
      }
    }
    return n ? sum / n : null;
  };
  return traitData.value.repositories
    .filter(r => selected.has(r.dirname))
    .map(r => {
      const vals = rawSeriesOf(r);
      const recent = avgRange(vals, (_, i) => i >= months.length - 12);
      const base = avgRange(vals, m => m >= "2020-01" && m <= "2024-12");
      let delta = "—";
      if (recent !== null && base !== null && base > 0) {
        if (what.value === "message_length") {
          const p = Math.round((recent / base - 1) * 100);
          delta = `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}%`;
        } else {
          const pp = (recent - base) * 100;
          delta = `${pp > 0 ? "+" : pp < 0 ? "−" : ""}${Math.abs(pp).toFixed(1)} pp`;
        }
      }
      return {
        dirname: r.dirname,
        name: r.name,
        color: repoColor.get(r.dirname) ?? "var(--series-1)",
        recentNum: recent ?? -1,
        recent: recent !== null ? fmt(recent) : "—",
        baseline: base !== null ? fmt(base) : "—",
        delta,
      };
    })
    .filter(r => r.recentNum >= 0)
    .sort((a, b) => b.recentNum - a.recentNum);
});

</script>

<style scoped>
/* The slider and the developers of a display take a line of their own. */
.setting-slider,
.setting-developers {
  flex-basis: 100%;
}

.culture-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem 1.2rem;
}

.culture-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  justify-content: space-between;
  align-items: flex-start;
}

.culture-title {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 640;
  margin: 0;
  width: 100%;
}

.culture-text {
  color: var(--muted);
  font-size: 0.86rem;
  margin: 0;
  max-width: 72ch;
}

.culture-presets {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.culture-legend {
  color: var(--ink-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.35rem 1rem;
}

.culture-swatch {
  border-radius: 2px;
  display: inline-block;
  height: 3px;
  margin-right: 0.35rem;
  vertical-align: middle;
  width: 14px;
}

.culture-table-wrap {
  overflow-x: auto;
}

.culture-table {
  border-collapse: collapse;
  font-size: 0.86rem;
  width: 100%;
}

.culture-table th,
.culture-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.4rem 0.6rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.culture-table thead th {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.culture-table th:first-child {
  text-align: left;
}

.culture-dot {
  border-radius: 50%;
  display: inline-block;
  height: 8px;
  margin-right: 0.45rem;
  width: 8px;
}
</style>
