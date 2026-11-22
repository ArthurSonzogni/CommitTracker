<template>
  <div class="report">
    <div :class="['warning-vignette', { persistent: hasWarning, flash: warningGlow }]" aria-hidden="true" />
    <section class="section">
      <SplitLayout :width="1080" aside-label="Report parameters">
        <template #header>
        <header ref="head" :class="['page-head', { 'has-caveats': caveats.length }]">
          <div>
            <p class="kicker">
              Report · {{ repositoryName }}<template v-if="data"> · {{ windowLabel(lastYear) }}</template>
              <!-- Caveats on the figures, so that they don't move the page: tags in
                   this line, or the overlay below on large screens. -->
              <span class="caveat-tags">
                <template v-for="caveat in caveats" :key="caveat.label">
                  ·
                  <UiTooltip :text="caveat.text" multiline position="bottom">
                    <span :class="['caveat', caveat.kind]" tabindex="0">
                      <UiIcon :name="caveat.kind === 'warning' ? 'alert-outline' : 'information-outline'" size="small" />
                      {{ caveat.label }}
                    </span>
                  </UiTooltip>
                </template>
              </span>
            </p>
            <h1 class="title mb-2">{{ repositoryName }} developer output</h1>
            <p class="lede">
              How many commits people land, and how big they are, against the same months a year
              earlier.
            </p>
          </div>
          <aside
            v-if="caveats.length"
            ref="overlay"
            :class="['caveat-overlay', { floating, flashing: warningGlow }]"
            :style="floating ? {
              top: `${floatingTop}px`,
              right: `${floatingRight}px`,
              transition: floatingMoves ? `top ${MOVE_MS}ms ease` : 'none',
            } : undefined"
            aria-label="Caveats">
            <p v-for="caveat in caveats" :key="caveat.label" :class="['caveat-note', caveat.kind]">
              <UiIcon :name="caveat.kind === 'warning' ? 'alert-outline' : 'information-outline'" size="small" />
              <span><strong>{{ caveat.label }}.</strong> {{ caveat.text }}</span>
            </p>
          </aside>
        </header>
        </template>

        <template #aside>
        <div class="group-bar">
          <div v-if="raw" class="selector">
            <h2 class="panel-title">Period</h2>
            <UiSelect v-model="endMonth" aria-label="Period">
              <option value="">Latest: {{ windowOfMonth(raw.months.at(-1)!) }}</option>
              <option v-for="month in endOptions" :key="month" :value="month">
                {{ windowOfMonth(month) }}
              </option>
            </UiSelect>
          </div>
          <div class="selector repository">
            <h2 class="panel-title">Repository</h2>
            <div class="repo-groups">
              <div class="repo-group">
                <span class="repo-group-label">Large</span>
                <RepositorySelector
                  v-model="repositorySelection"
                  :filter="(repo: { dirname: string }) => available.has(repo.dirname) && !repoWarnings.has(repo.dirname)" />
              </div>
              <div v-if="repoWarnings.size" class="repo-group smaller">
                <span
                  class="repo-group-label is-warning"
                  title="Fewer than 20 people active in both years, or stopped updating: figures swing more.">
                  <UiIcon name="alert-outline" size="small" />
                  Smaller
                </span>
                <RepositorySelector
                  v-model="repositorySelection"
                  :filter="(repo: { dirname: string }) => available.has(repo.dirname) && repoWarnings.has(repo.dirname)">
                  <template #chip="{ item }">
                    <span class="repo-chip-name" :title="repoWarnings.get(item.id)">{{ item.label }}</span>
                  </template>
                </RepositorySelector>
              </div>
            </div>
          </div>
          <div v-if="groupOptions.length > 1" class="selector">
            <h2 class="panel-title">Organization</h2>
            <UiSegmented v-model="groupId" :options="groupOptions" aria-label="Organization" />
          </div>
        </div>
        </template>

        <div class="report-stack">
        <FetchError v-if="loadError" :message="loadError" @retry="loadReport" />
        <div v-else-if="!data" class="skeleton kpi-skeleton" aria-hidden="true" />
        <template v-else-if="group">
          <section class="findings" aria-label="Key findings">
            <h2 class="panel-title">Key findings</h2>
            <ul>
              <li v-for="finding in findings" :key="finding.lead + finding.text">
                <strong>{{ finding.lead }}</strong> {{ finding.text }}
              </li>
            </ul>
          </section>

          <div>
            <div class="kpi-grid-wrap">
            <div class="kpi-grid">
              <component
                :is="card.metric ? 'button' : 'div'"
                v-for="card in kpis"
                :key="card.label"
                :type="card.metric ? 'button' : undefined"
                :class="['kpi-card', { selectable: card.metric, selected: card.metric === metric, wide: card.extra }]"
                :aria-pressed="card.metric ? card.metric === metric : undefined"
                :title="card.metric ? `Show ${card.label.toLowerCase()} month by month` : undefined"
                @click="card.metric && (metric = card.metric)">
                <span class="kpi-label">{{ card.label }}</span>
                <span class="kpi-value">{{ card.value }}</span>
                <span class="kpi-detail">{{ card.detail }}</span>
                <span v-if="card.extra" class="kpi-extra">
                  <strong>{{ card.extra.label }}: {{ card.extra.value }}</strong>
                  <span v-for="line in card.extra.lines" :key="line" class="kpi-extra-line">{{ line }}</span>
                </span>
                <span v-if="card.hint" class="kpi-hint">{{ card.hint }}</span>
              </component>
            </div>
            </div>
            <p class="kpi-caption">
              {{ windowLabel(lastYear) }} against {{ windowLabel(lastYear - 1) }}. Select a figure
              to see it month by month below.
            </p>
          </div>

          <section class="panel">
            <div>
              <h2 class="panel-title">{{ trendTitle }}</h2>
              <p v-if="trendView === 'yoy'" class="panel-text">
                Each bar compares a month with the same month a year earlier. The gray band is the
                usual range, from {{ usualLabel }}.
              </p>
              <p v-else class="panel-text">
                Each measure as a 3-month average, where 100 is its {{ usualLabel }} average.
              </p>
            </div>
            <div class="switches">
              <UiSegmented v-model="trendView" :options="TREND_VIEWS" aria-label="View" />
              <UiSegmented
                v-if="trendView === 'yoy'"
                v-model="metric"
                :options="metricOptions"
                aria-label="Measure" />
              <UiSegmented
                v-if="trendView === 'yoy' && metric === 'msg'"
                v-model="msgStat"
                :options="MSG_STATS"
                aria-label="Message length statistic" />
            </div>
            <template v-if="trendView === 'yoy'">
              <p v-if="METRIC_TEXT[metric]" class="metric-note">
                <strong>{{ metricLabel }}:</strong> {{ METRIC_TEXT[metric] }}
              </p>
              <div class="legend">
                <span><span class="legend-box past" />Before {{ lastYear }}</span>
                <span><span class="legend-box current" />{{ lastYear }}</span>
                <span><span class="legend-box band" />Usual range</span>
              </div>
              <ReportYoyChart
                :months="data.months"
                :values="metricValues"
                :label="metricLabel"
                :from="metricFrom(metric)"
                :format="metricFormat"
                :scale="metricScale"
                :highlight-from="`${lastYear}-01`"
                :baseline="usualMonths"
                :window-mark="windowMark" />
              <ReportDataTable
                :columns="['Month', metricLabel, 'A year earlier', 'Change']"
                :rows="yoyTable" />
            </template>
            <template v-else>
              <div class="legend">
                <span v-for="s in indexSeries" :key="s.label">
                  <span class="legend-line" :style="{ background: s.color }" />{{ s.label }}
                </span>
              </div>
              <ReportIndexChart
                :months="data.months"
                :series="indexSeries"
                :from="indexFrom"
                :highlight-from="`${lastYear}-01`"
                :baseline="usualMonths" />
              <ReportDataTable
                :columns="['Month', ...indexSeries.map(s => s.label)]"
                :rows="indexTable" />
            </template>
          </section>

          <section class="panel">
            <div>
              <h2 class="panel-title">{{ peopleTitle }}</h2>
              <p v-if="peopleView === 'year'" class="panel-text">
                The people with at least {{ data.min_window }} commits in both periods, so newcomers
                and leavers don't count. Each row: how their commits changed, against a year earlier.
              </p>
              <p v-else class="panel-text">
                The same comparison for the {{ data.window.length }} months ending at each month:
                the average change of the commits of the people active in both periods.
              </p>
            </div>
            <div class="switches">
              <UiSegmented v-model="peopleView" :options="PEOPLE_VIEWS" aria-label="Same people view" />
            </div>
            <template v-if="peopleView === 'year'">
              <div class="legend">
                <span><span class="legend-dot" />Median change</span>
                <span><span class="legend-range" />The middle half of the people</span>
                <span><strong>% up</strong>: the share who landed more commits</span>
              </div>
              <ReportCohortChart
                :rows="group.cohort"
                :window-label="windowLabel"
                :min-commits="data.min_window" />
              <ReportDataTable
                :columns="['Years', 'People', 'Median', '25th percentile', '75th percentile', '% up']"
                :rows="cohortTable" />
            </template>
            <template v-else>
              <ReportCohortMonthlyChart
                :months="data.months"
                :cohort="group.cohort_monthly"
                :window="data.window.length"
                :min-commits="data.min_window"
                :highlight-from="`${lastYear}-01`" />
              <ReportDataTable
                :columns="['Months', 'People', 'Average change', '% up']"
                :rows="cohortMonthlyTable" />
            </template>
          </section>

          <section class="panel">
            <div>
              <h2 class="panel-title">{{ activityTitle }}</h2>
              <p class="panel-text">
                The developers ranked by their commits in a month, from the median (p50) to the
                top 1% (p99). Under each: {{ lastYear }} against {{ lastYear - 1 }}.
              </p>
            </div>
            <div class="legend">
              <span><span class="legend-line past" />{{ percentileYears[0] }}–{{ lastYear - 2 }}</span>
              <span><span class="legend-line previous" />{{ lastYear - 1 }}</span>
              <span><span class="legend-line current" />{{ lastYear }}</span>
            </div>
            <ReportPercentileChart :quantiles="percentileQuantiles" :percentiles="percentileValues" />
            <ReportDataTable
              :columns="['Year', ...percentileQuantiles.map(q => `p${Math.round(q * 100)}`)]"
              :rows="percentileTable" />
          </section>

          <section class="panel">
            <div>
              <h2 class="panel-title">{{ sizeTitle }}</h2>
              <p class="panel-text">
                The same ranking of developers: the median size of their commits, in lines added
                plus deleted. Under each: {{ lastYear }} against {{ lastYear - 1 }}.
              </p>
            </div>
            <div class="size-layout">
              <div>
                <div class="legend">
                  <span><span class="legend-line past" />{{ sizeYears[0] }}–{{ lastYear - 2 }}</span>
                  <span><span class="legend-line previous" />{{ lastYear - 1 }}</span>
                  <span><span class="legend-line current" />{{ lastYear }}</span>
                </div>
                <ReportPercentileChart
                  :quantiles="percentileQuantiles"
                  :percentiles="sizeValues"
                  axis-title="Median lines per commit"
                  tip-title="developers by commits: their median commit, in lines" />
              </div>
              <dl class="size-facts">
                <div v-for="fact in sizeFacts" :key="fact.label">
                  <dt>{{ fact.label }}</dt>
                  <dd>
                    <span class="fact-value">{{ fact.previous }} → {{ fact.current }}</span>
                    <span class="fact-detail">{{ fact.detail }}</span>
                  </dd>
                </div>
              </dl>
            </div>
            <ReportDataTable
              :columns="['Year', ...percentileQuantiles.map(q => `p${Math.round(q * 100)}`), `≤ ${data.tiny_commit} lines`, 'Files (median)', 'Added']"
              :rows="sizeTable" />
          </section>

          <ReportTraitsSection
            v-model:trait-view="traitView"
            :group="group"
            :repository="repository!"
            :months="data.months"
            :window-length="data.window.length"
            :end-index="endOf()"
            :last-year="lastYear"
            :index-from="indexFrom" />

          <ReportOrganizationsTable
            v-if="repository!.organizations.length > 1"
            :rows="organizationRows"
            :organization-count="repository!.organizations.length - 1"
            :current-window-label="windowLabel(lastYear)"
            :previous-window-label="windowLabel(lastYear - 1)"
            :usual-label="usualLabel"
            :repository="repository?.dirname"
            :min-compared="MIN_COMPARED"
            :has-msg="repository!.has_msg"
            @select="selectGroup" />

          <ReportNotes
            :repository-name="repositoryName"
            :github-logins="repository!.github_logins"
            :top-organization="topOrganization"
            :window-length="data.window.length"
            :min-window="data.min_window"
            :reviews-from="repository!.reviews_from" />
        </template>
        </div>
      </SplitLayout>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import type { IndexSeries } from "~/components/ReportIndexChart.vue";
import type { TraitView } from "~/components/report/TraitsSection.vue";
import { fetchJson, formatFetchError } from "~/utils/fetchJson";
import {
  MIN_COMPARED,
  USUAL_SPAN,
  reportAt,
  type Group,
  type Organization,
  type RawReport,
  type Report,
  type Repository,
} from "~/utils/developerOutput";

const METRICS = {
  commits: "Commits",
  per_author: "Commits per author",
  lines: "Lines per commit",
  msg: "Message length",
  per_reviewer: "Reviews per reviewer",
  authors: "Active authors",
} as const;
type Metric = keyof typeof METRICS;
type MsgStat = "p50" | "mean";
const MSG_STATS: { value: MsgStat; label: string }[] = [
  { value: "p50", label: "Median" },
  { value: "mean", label: "Mean" },
];
// What each measure is, in the month.
// Only the ones that need a definition.
const METRIC_TEXT: Partial<Record<Metric, string>> = {
  per_author: "the commits divided by the people who landed at least one.",
  lines: "the median of the lines added plus deleted by each commit.",
  msg: "characters of the commit description without footers/trailers, excluding reverts and rolls.",
  per_reviewer: "the reviews divided by the people who reviewed at least one commit. A review is " +
    "a reviewer named in a commit message.",
};

const TREND_VIEWS = [
  { value: "yoy", label: "Against a year earlier" },
  { value: "index", label: "Against the usual years" },
];
const PEOPLE_VIEWS = [
  { value: "year", label: "By year" },
  { value: "month", label: "Month by month" },
];

// Each change is a new history entry: Back returns to the previous view.
const { endMonth, repositoryId, groupId, metric, msgStat, trendView, peopleView, traitView } = useUrlState({
  // The last month of the period, "YYYY-MM"; empty for the latest.
  endMonth: { ...urlCodecs.string(""), key: "end", history: "push" },
  repositoryId: { ...urlCodecs.string("chromium"), key: "repository", history: "push" },
  groupId: { ...urlCodecs.string("all"), key: "organization", history: "push" },
  metric: { ...urlCodecs.enum(Object.keys(METRICS) as Metric[], "per_author"), history: "push" },
  msgStat: { ...urlCodecs.enum(["p50", "mean"] as MsgStat[], "p50"), key: "msg_stat", history: "push" },
  trendView: { ...urlCodecs.enum(["yoy", "index"] as const, "yoy"), key: "view", history: "push" },
  peopleView: { ...urlCodecs.enum(["year", "month"] as const, "year"), key: "people", history: "push" },
  traitView: {
    ...urlCodecs.enum(["msg", "reverts", "bypasses", "bugs", "bugs_per_author", "bug_churn"] as TraitView[], "msg"),
    key: "trait",
    history: "push",
  },
});

const raw = shallowRef<RawReport | null>(null);
const loadError = ref<string | null>(null);
const loadReport = async () => {
  loadError.value = null;
  try {
    raw.value = await fetchJson<RawReport>("/data/developer-output.json", { cache: true });
  } catch (error) {
    loadError.value = formatFetchError(error, "Failed to load developer output report.");
  }
};
onMounted(loadReport);
// The first end month offered: a year of comparisons before it.
const FIRST_END = "2017-01";
// The end month, from the URL: the latest when absent or unknown.
const endIndex = computed(() => {
  const months = raw.value?.months ?? [];
  const i = months.indexOf(endMonth.value);
  return i >= 0 && months[i] >= FIRST_END ? i : months.length - 1;
});
const data = computed(() => raw.value ? reportAt(raw.value, endIndex.value) : null);
// The periods to pick from, the latest first.
const endOptions = computed(() => (raw.value?.months ?? []).filter(m => m >= FIRST_END).reverse());

const repository = computed(() =>
  data.value?.repositories.find(r => r.dirname === repositoryId.value) ?? data.value?.repositories[0]);
// The repositories with a report, in the site's usual selector.
const available = computed(() => new Set((data.value?.repositories ?? []).map(r => r.dirname)));
const repositorySelection = computed({
  get: () => [repositoryId.value],
  set: (ids: string[]) => {
    if (ids[0]) repositoryId.value = ids[0];
  },
});
// Few people in the same-people comparison: the figures are fragile.
const FEW = 20;
const repositoryName = computed(() => repository.value?.name ?? "Chromium");
const repoWarnings = computed(() => {
  const map = new Map<string, string>();
  const d = data.value;
  if (!d) return map;
  const latestMonth = d.months.at(-1)!;
  for (const r of d.repositories) {
    const reasons: string[] = [];
    if (r.last_month && r.last_month < latestMonth) {
      reasons.push(`Data stopped in ${monthShort(r.last_month)}`);
    }
    const n = r.groups[0]?.cohort.at(-1)?.n ?? 0;
    if (n < FEW) {
      reasons.push(`Few people (${n} active in both years)`);
    }
    if (reasons.length) map.set(r.dirname, reasons.join(" · "));
  }
  return map;
});

const group = computed(() =>
  repository.value?.groups.find(g => g.id === groupId.value) ?? repository.value?.groups[0]);
const groupOptions = computed(() =>
  (repository.value?.groups ?? []).map(g => ({ value: g.id, label: g.id === "all" ? "All" : g.label })));
// The largest organization, the one "Everyone else" excludes.
const topOrganization = computed(() => repository.value?.groups[1]?.label ?? "the largest one");

// A repository doesn't have every organization, nor always the reviews.
watch(repository, r => {
  if (!r) return;
  if (!r.groups.some(g => g.id === groupId.value)) groupId.value = "all";
  if (metric.value === "per_reviewer" && !r.reviews_from) metric.value = "per_author";
  if (metric.value === "msg" && !r.has_msg) metric.value = "per_author";
});
// The people of the selection in the same-people comparison.
const people = computed(() => group.value?.cohort.at(-1)?.n ?? 0);
const few = computed(() => people.value < FEW);
const small = computed(() => people.value < 100);

// Periods ------------------------------------------------------------------

const lastYear = computed(() => data.value ? +data.value.months.at(-1)!.slice(0, 4) : 0);
const shortMonth = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
const monthShort = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
const windowMonths = computed(() => data.value
  ? `${shortMonth(data.value.window[0])}–${shortMonth(data.value.window.at(-1)!)}`
  : "");
// The window, shifted to end in `year`: "Aug–Oct 2026", or "Nov 2025–Jan 2026".
const windowLabel = (year: number) => {
  if (!data.value) return "";
  const shift = year - lastYear.value;
  const [first, last] = [data.value.window[0], data.value.window.at(-1)!];
  const y0 = +first.slice(0, 4) + shift, y1 = +last.slice(0, 4) + shift;
  return y0 === y1
    ? `${shortMonth(first)}–${shortMonth(last)} ${y1}`
    : `${shortMonth(first)} ${y0}–${shortMonth(last)} ${y1}`;
};
// The window ending at `month`: "Aug–Oct 2026", or "Nov 2025–Jan 2026".
const windowOfMonth = (month: string) => {
  const months = raw.value!.months, i = months.indexOf(month), first = months[i - raw.value!.window + 1];
  return first.slice(0, 4) === month.slice(0, 4)
    ? `${shortMonth(first)}–${shortMonth(month)} ${month.slice(0, 4)}`
    : `${monthShort(first)}–${monthShort(month)}`;
};
const usualMonths = computed<[string, string]>(() => data.value
  ? [`${data.value.usual_years[0]}-01`, `${data.value.usual_years[1]}-12`]
  : ["2021-01", "2025-12"]);
const usualLabel = computed(() => data.value ? `${data.value.usual_years[0]}–${data.value.usual_years[1]}` : "");
const percentileYears = computed(() =>
  Object.keys(group.value?.percentiles ?? {}).map(Number).sort((a, b) => a - b));

// Formatting ---------------------------------------------------------------

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// The sign of the rounded value: no "−0%".
const pct = (v: number) => {
  const p = Math.round(v * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}%`;
};

// KPIs ---------------------------------------------------------------------

const kpis = computed(() => {
  const g = group.value!;
  const k = g.kpi;
  const perAuthor: [number | null, number | null] = [
    k.person_months[0] ? k.commits[0] / k.person_months[0] : null,
    k.person_months[1] ? k.commits[1] / k.person_months[1] : null,
  ];
  const ratioPct = (before: number | null, after: number | null) =>
    before && before > 0 && after !== null && Number.isFinite(after / before) ? pct(after / before - 1) : "—";
  const latest = g.cohort.at(-1);
  const [u0, u1] = data.value!.usual_years;
  const usual = g.cohort
    .filter(row => row.year >= u0 && row.year <= u1 && row.n >= 10 && row.p50 !== null)
    .map(row => 2 ** row.p50! - 1);
  const enough = !!latest && latest.n >= 10 && latest.p50 !== null;
  return [
    {
      label: "Commits",
      metric: "commits" as Metric,
      value: ratioPct(k.commits[0], k.commits[1]),
      detail: `${integer.format(k.commits[0])} → ${integer.format(k.commits[1])}`,
    },
    {
      label: "Commits per author",
      metric: "per_author" as Metric,
      value: ratioPct(perAuthor[0], perAuthor[1]),
      detail: `${perAuthor[0] !== null ? decimal.format(perAuthor[0]) : "—"} → ${perAuthor[1] !== null ? decimal.format(perAuthor[1]) : "—"} a month`,
      // The same, without the people who came or left.
      extra: {
        label: "Commits by the same people",
        value: enough ? pct(2 ** latest!.p50! - 1) : "—",
        lines: enough
          ? [
              `Median of ${integer.format(latest!.n)} people active in both years`,
              ...(usual.length ? [`Usual years (${u0}–${String(u1).slice(2)}): ${pct(Math.min(...usual))} to ${pct(Math.max(...usual))}`] : []),
            ]
          : ["Too few people active in both years to summarize"],
      },
      hint: "Commits divided by active authors.",
    },
    {
      label: "Lines per commit",
      metric: "lines" as Metric,
      value: ratioPct(k.lines[0], k.lines[1]),
      detail: `${k.lines[0] ?? "—"} → ${k.lines[1] ?? "—"} lines`,
      hint: "Lines added plus deleted by the median commit.",
    },
    ...(repository.value?.has_msg ? [{
      label: "Message length",
      metric: "msg" as Metric,
      value: ratioPct(k.msg[0], k.msg[1]),
      detail: `${k.msg[0] !== null ? integer.format(k.msg[0]) : "—"} → ${k.msg[1] !== null ? integer.format(k.msg[1]) : "—"} chars`,
      hint: "Median description without footers, reverts, or rolls.",
    }] : []),
    {
      label: "Active authors",
      metric: "authors" as Metric,
      value: ratioPct(k.authors[0], k.authors[1]),
      detail: `${integer.format(k.authors[0])} → ${integer.format(k.authors[1])} a month`,
    },
  ];
});

// Organizations ------------------------------------------------------------

const organizationRows = computed(() => {
  const r = repository.value!;
  const ratio = (v: [number | null, number | null]) => v[0] && v[1] !== null ? pct(v[1] / v[0] - 1) : "—";
  const usual = (values: number[]) => values.length ? `usual ${range(values)}` : "";
  return r.organizations.map(o => {
    const measured = o.people >= MIN_COMPARED;
    return {
      label: o.label,
      // The group to select, when it has one.
      group: r.groups.find(g => g.label === o.label)?.id ?? null,
      measured,
      selected: o.label === group.value?.label,
      usual: {
        perAuthor: usual(o.usual.per_author),
        same: usual(o.usual.same),
        lines: usual(o.usual.lines),
        msg: usual(o.usual.msg),
      },
      authors: measured && o.authors[0] ? pct(o.authors[1] / o.authors[0] - 1) : "",
      authorsDetail: `${integer.format(o.authors[0])} → ${integer.format(o.authors[1])}`,
      perAuthor: ratio(o.per_author),
      perAuthorDetail: `${decimal.format(o.per_author[0])} → ${decimal.format(o.per_author[1])}`,
      same: o.same !== null ? pct(2 ** o.same - 1) : "—",
      people: integer.format(o.people),
      lines: ratio(o.lines),
      linesDetail: `${o.lines[0] ?? "—"} → ${o.lines[1] ?? "—"}`,
      msg: ratio(o.msg),
      msgDetail: `${o.msg[0] !== null ? integer.format(o.msg[0]) : "—"} → ${o.msg[1] !== null ? integer.format(o.msg[1]) : "—"}`,
    };
  });
});

// Selects an organization from the table, and shows it from the top.
const selectGroup = (id: string) => {
  groupId.value = id;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// Charts -------------------------------------------------------------------

const metrics = computed(() => (Object.keys(METRICS) as Metric[])
  .filter(m => (m !== "per_reviewer" || repository.value?.reviews_from) && (m !== "msg" || repository.value?.has_msg)));
const metricOptions = computed(() => metrics.value.map(value => ({ value, label: METRICS[value] })));
// A year after the first full year of data, to compare with it.
const metricFrom = (m: Metric) => {
  const r = repository.value!;
  if (m === "per_reviewer") return r.reviews_from!;
  const from = `${+r.data_from.slice(0, 4) + 1}-01`;
  return from > "2017-01" ? from : "2017-01";
};
// The 3-month averages within the first full year of data.
const indexFrom = computed(() => {
  const from = repository.value!.data_from;
  return from > "2016-01" ? `${from.slice(0, 4)}-03` : "2016-01";
});
const metricLabel = computed(() => {
  if (metric.value !== "msg") return METRICS[metric.value];
  const stat = MSG_STATS.find(s => s.value === msgStat.value)?.label.toLowerCase() ?? "median";
  return `Message length (${stat})`;
});
const perAuthor = (g: Group) => g.commits.map((c, i) => g.authors[i] ? c / g.authors[i] : null);
const perReviewer = (g: Group) => g.reviews.map((r, i) => g.reviewers[i] ? r / g.reviewers[i] : null);
const msgSeriesOf = (g: Group, stat: MsgStat) =>
  stat === "mean" ? g.msg_mean : g.msg;
const valuesOf = (g: Group, m: Metric): (number | null)[] => {
  switch (m) {
    case "commits": return g.commits;
    case "per_author": return perAuthor(g);
    case "lines": return g.lines;
    case "msg": return msgSeriesOf(g, msgStat.value);
    case "per_reviewer": return perReviewer(g);
    case "authors": return g.authors;
  }
};
const metricValues = computed(() => valuesOf(group.value!, metric.value));
// All the measures share the scale of the chart, to compare them.
const metricScale = computed(() => metrics.value.map(m => ({
  values: valuesOf(group.value!, m),
  from: metricFrom(m),
})));
const metricFormat = computed(() => {
  if (metric.value === "per_author" || metric.value === "per_reviewer") return (v: number) => decimal.format(v);
  if (metric.value === "msg") return (v: number) => `${integer.format(v)} chars`;
  return (v: number) => integer.format(v);
});

const indexSeries = computed<IndexSeries[]>(() => {
  const g = group.value!;
  return [
    { label: "Commits per author", color: "var(--series-1)", values: perAuthor(g) },
    { label: "Lines per commit", color: "var(--series-2)", values: g.lines },
    ...(repository.value?.has_msg
      ? [{ label: "Message length", color: "var(--series-4)", values: g.msg }]
      : []),
    { label: "Active authors", color: "var(--series-3)", values: g.authors },
  ];
});

// From the median: the lower percentiles are 1 or 2 commits every year.
const percentileStart = computed(() => Math.max(0, data.value!.quantiles.findIndex(q => q >= 0.5)));
const percentileQuantiles = computed(() => data.value!.quantiles.slice(percentileStart.value));
const percentileValues = computed(() => Object.fromEntries(
  Object.entries(group.value!.percentiles).map(([year, values]) => [year, values.slice(percentileStart.value)])));

// The size of the commits.
const sizeYears = computed(() =>
  Object.keys(group.value?.size_by_activity ?? {}).map(Number).sort((a, b) => a - b));
// From the median developer, as "Every percentile".
const sizeValues = computed(() => Object.fromEntries(
  Object.entries(group.value!.size_by_activity).map(([year, values]) => [year, values.slice(percentileStart.value)])));
const share = (v: number) => `${Math.round(v * 100)}%`;
const sizeFacts = computed(() => {
  const sizes = group.value!.commit_size;
  const current = sizes[lastYear.value], previous = sizes[lastYear.value - 1];
  if (!current || !previous) return [];
  const median = data.value!.size_quantiles.indexOf(0.5);
  return [
    {
      label: "Tiny commits",
      previous: share(previous.tiny),
      current: share(current.tiny),
      detail: `of the commits change ${data.value!.tiny_commit} lines or fewer`,
    },
    {
      label: "Files per commit",
      previous: `${previous.files}`,
      current: `${current.files}`,
      detail: current.files === previous.files
        ? "the median: the same files, with more lines in each"
        : "the median",
    },
    {
      label: "Added lines",
      previous: share(previous.added),
      current: share(current.added),
      detail: "of the lines changed are added, the rest deleted",
    },
  ];
});

// Titles and findings: computed, so that they hold for any period --------

// The sum of the window of `values` ending at month `last`.
const windowSum = (values: number[], last: number) => {
  let total = 0;
  for (let i = Math.max(0, last - data.value!.window.length + 1); i <= last; i++) total += values[i];
  return total;
};
const endOf = () => data.value!.months.length - 1;
// A measure over the window ending at `last`, or null.
const windowValue = (g: Group, m: Metric, last: number): number | null => {
  if (last < data.value!.window.length - 1) return null;
  switch (m) {
    case "commits": return windowSum(g.commits, last);
    case "per_author": {
      const authors = windowSum(g.authors, last);
      return authors ? windowSum(g.commits, last) / authors : null;
    }
    case "lines": {
      const size = g.commit_size[+data.value!.months[last].slice(0, 4)];
      return size ? size.q[data.value!.size_quantiles.indexOf(0.5)] : null;
    }
    case "msg": {
      const mw = g.msg_window[+data.value!.months[last].slice(0, 4)];
      return mw ? mw[msgStat.value] : null;
    }
    case "per_reviewer": {
      const reviewers = windowSum(g.reviewers, last);
      return reviewers ? windowSum(g.reviews, last) / reviewers : null;
    }
    case "authors": return windowSum(g.authors, last) / data.value!.window.length;
  }
};
// The change of a measure over the window ending `back` years before the end.
const windowChange = (g: Group, m: Metric, back = 0) => {
  const last = endOf() - 12 * back;
  const after = windowValue(g, m, last), before = windowValue(g, m, last - 12);
  return after !== null && before ? after / before - 1 : null;
};
// The changes of the usual years, the 5 before the end's.
const usualChanges = (g: Group, m: Metric) => {
  const out: number[] = [];
  for (let back = 1; back <= USUAL_SPAN; back++) {
    if (data.value!.months[endOf() - 12 * back - 12] < repository.value!.data_from) break;
    const c = windowChange(g, m, back);
    if (c !== null) out.push(c);
  }
  return out;
};
const range = (values: number[]) => values.length === 1
  ? pct(values[0])
  : `${pct(Math.min(...values))} to ${pct(Math.max(...values))}`;

const windowMark = computed(() => {
  const g = group.value!, change = windowChange(g, metric.value);
  const values = metricValues.value, i = values.length - 1;
  const month = values[i] !== null && values[i - 12] ? values[i]! / values[i - 12]! - 1 : null;
  if (change === null) return undefined;
  return {
    size: data.value!.window.length,
    text: `${windowLabel(lastYear.value)}: ${pct(change)}` +
      (month === null ? "" : ` · ${shortMonth(data.value!.months[i])} alone: ${pct(month)}`),
  };
});

const trendTitle = computed(() => {
  if (trendView.value === "index") return `Against the ${usualLabel.value} average`;
  const change = windowChange(group.value!, metric.value);
  return change === null
    ? metricLabel.value
    : `${metricLabel.value}: ${pct(change)} in ${windowLabel(lastYear.value)}`;
});

// The change of the same people at the end, when there are enough of them.
const samePeople = computed(() => {
  const latest = group.value!.cohort.at(-1);
  return latest && latest.n >= 10 && latest.p50 !== null
    ? { change: 2 ** latest.p50 - 1, n: latest.n }
    : null;
});
const peopleTitle = computed(() => {
  const same = samePeople.value;
  if (!same) return "The same people, a year apart";
  const p = Math.round(same.change * 100);
  return Math.abs(p) < 2
    ? "The same people land about as many commits"
    : `The same people land ${Math.abs(p)}% ${p > 0 ? "more" : "fewer"} commits`;
});

// Whether `values` are above (1), below (-1) the year before at every
// percentile, by at least 5%, or neither (0).
const direction = (byYear: Record<string, number[]>) => {
  const current = byYear[lastYear.value], previous = byYear[lastYear.value - 1];
  if (!current || !previous) return 0;
  const factors = current.map((v, k) => previous[k] ? v / previous[k] : 1);
  return factors.every(f => f >= 1.05) ? 1 : factors.every(f => f <= 0.95) ? -1 : 0;
};
const activityTitle = computed(() => ({
  1: "More commits at every activity level",
  [-1]: "Fewer commits at every activity level",
  0: "Commits per developer, by activity level",
})[direction(percentileValues.value)]!);
const sizeTitle = computed(() => ({
  1: "Bigger commits at every activity level",
  [-1]: "Smaller commits at every activity level",
  0: "Commit size, by activity level",
})[direction(sizeValues.value)]!);

// Caveats on the figures of the selection.
const caveats = computed(() => {
  const r = repository.value, out: { kind: "warning" | "info"; label: string; text: string }[] = [];
  if (!r || !data.value) return out;
  if (r.last_month && r.last_month < data.value.months.at(-1)!) {
    out.push({
      kind: "warning",
      label: "Data stopped",
      text: `This repository's data ends in ${monthShort(r.last_month)}. Pick an earlier period on the side to inspect it.`,
    });
  }
  if (few.value) {
    out.push({
      kind: "warning",
      label: "Few people",
      text: `Only ${people.value} ${people.value === 1 ? "person" : "people"}` +
        (group.value!.id === "all" ? "" : ` of ${group.value!.label}`) +
        ` ${people.value === 1 ? "was" : "were"} active in both years: one or two can move the figures a lot. ` +
        "Read the direction, not the exact numbers.",
    });
  } else if (small.value) {
    out.push({
      kind: "info",
      label: "Small group",
      text: `Only ${people.value} people were active in both years, so single months swing a lot. ` +
        "Read the trend, not individual bars.",
    });
  }
  if (r.parent) {
    out.push({
      kind: "info",
      label: `Part of ${r.parent}`,
      text: `Its commits are also counted in ${r.parent}.`,
    });
  }
  return out;
});

// A caveat appearing while the header is scrolled out of view floats for a
// while, then goes back to the header. While it floats, it sticks: at the top
// of the window, or at its place in the header once that is in view (below the
// navigation bar, which scrolls with the page). It slides from the header and
// back to it, so that the switch to and from `fixed` doesn't jump.
const hasWarning = computed(() => caveats.value.some(c => c.kind === "warning"));
const isLargeScreen = ref(false);
let largeMedia: MediaQueryList | null = null;
const onMediaChange = (e: MediaQueryListEvent) => {
  isLargeScreen.value = e.matches;
  syncPinnedWarning();
};

const FLOATING_MS = 6000;
const MOVE_MS = 450;
const STICKY_TOP = 16;
const head = ref<HTMLElement | null>(null);
const overlay = ref<HTMLElement | null>(null);
const floating = ref(false);
const floatingTop = ref(0);
const floatingRight = ref(STICKY_TOP);
// Whether `top` transitions: while sliding in or back, not while scrolling.
const floatingMoves = ref(false);
const warningGlow = ref(false);
let floatingTimer: ReturnType<typeof setTimeout> | undefined;
let moveTimer: ReturnType<typeof setTimeout> | undefined;
let glowTimer: ReturnType<typeof setTimeout> | undefined;
let docking = false;
const triggerWarningGlow = () => {
  warningGlow.value = false;
  clearTimeout(glowTimer);
  requestAnimationFrame(() => {
    warningGlow.value = true;
    glowTimer = setTimeout(() => {
      warningGlow.value = false;
    }, 650);
  });
};
const headTop = () => head.value?.getBoundingClientRect().top ?? 0;
const headRightOffset = () => {
  const rect = head.value?.getBoundingClientRect();
  return rect ? Math.max(STICKY_TOP, window.innerWidth - rect.right) : STICKY_TOP;
};
const stickyTop = () => Math.max(STICKY_TOP, headTop());
const syncPinnedWarning = () => {
  if (!hasWarning.value || !isLargeScreen.value) return;
  clearTimeout(floatingTimer);
  docking = false;
  if (headTop() < STICKY_TOP) {
    floatingMoves.value = false;
    floatingRight.value = headRightOffset();
    floatingTop.value = STICKY_TOP;
    floating.value = true;
  } else {
    floating.value = false;
  }
};
const onScroll = () => {
  if (hasWarning.value && isLargeScreen.value) {
    syncPinnedWarning();
  } else if (floating.value && !docking) {
    floatingTop.value = stickyTop();
  }
};
const moveTo = (top: number, done?: () => void) => {
  floatingMoves.value = true;
  floatingTop.value = top;
  clearTimeout(moveTimer);
  // A little after the transition, so as not to cut its end.
  moveTimer = setTimeout(() => {
    floatingMoves.value = false;
    done?.();
  }, MOVE_MS + 50);
};
const dock = () => {
  if (hasWarning.value && isLargeScreen.value && headTop() < STICKY_TOP) return;
  docking = true;
  moveTo(headTop(), () => {
    floating.value = false;
    docking = false;
  });
};
watch(
  () => caveats.value.filter(c => c.kind === "warning").map(c => `${repository.value?.dirname}:${c.label}`).join("|"),
  (warnings, previous) => {
    if (warnings && warnings !== previous) triggerWarningGlow();
  },
);
watch(() => caveats.value.map(c => c.label).join("|"), async (labels, previous) => {
  const rect = head.value?.getBoundingClientRect();
  if (!labels) {
    clearTimeout(floatingTimer);
    floating.value = false;
    return;
  }
  if (hasWarning.value && isLargeScreen.value) {
    clearTimeout(floatingTimer);
    if (!rect || rect.top >= STICKY_TOP) {
      floating.value = false;
      return;
    }
    floatingRight.value = headRightOffset();
    docking = false;
    if (!floating.value) {
      floatingMoves.value = false;
      floatingTop.value = rect.top;
      floating.value = true;
      await nextTick();
      overlay.value?.getBoundingClientRect();
    }
    moveTo(STICKY_TOP);
    return;
  }
  if (labels === previous || !rect || rect.top >= 0) return;
  floatingRight.value = headRightOffset();
  docking = false;
  if (!floating.value) {
    // From the header, where it is.
    floatingMoves.value = false;
    floatingTop.value = rect.top;
    floating.value = true;
    await nextTick();
    // The style at the header, computed before moving: a new element has
    // none yet, and wouldn't transition from it.
    overlay.value?.getBoundingClientRect();
  }
  moveTo(stickyTop());
  clearTimeout(floatingTimer);
  floatingTimer = setTimeout(dock, FLOATING_MS);
});
onMounted(() => {
  largeMedia = window.matchMedia("(min-width: 1280px)");
  isLargeScreen.value = largeMedia.matches;
  largeMedia.addEventListener("change", onMediaChange);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", syncPinnedWarning, { passive: true });
  syncPinnedWarning();
});
onBeforeUnmount(() => {
  largeMedia?.removeEventListener("change", onMediaChange);
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", syncPinnedWarning);
  clearTimeout(floatingTimer);
  clearTimeout(moveTimer);
  clearTimeout(glowTimer);
});

const findings = computed(() => {
  const g = group.value!, out: { lead: string; text: string }[] = [];
  const perAuthor = windowChange(g, "per_author");
  if (perAuthor !== null) {
    const usual = usualChanges(g, "per_author");
    out.push({
      lead: `${pct(perAuthor)} commits per author`,
      text: `in ${windowLabel(lastYear.value)}, against a year earlier` +
        (usual.length ? `. In the usual years (${usualLabel.value}): ${range(usual)}.` : "."),
    });
  }
  const same = samePeople.value;
  if (!same) {
    out.push({
      lead: "Commits by the same people:",
      text: `too few people active in both years (${group.value!.cohort.at(-1)?.n ?? 0}) to compare. ` +
        "Read the direction of the figures, not the exact numbers.",
    });
  } else {
    // The same people explain the change when they move the same way.
    const explains = perAuthor !== null && Math.sign(same.change) === Math.sign(perAuthor) &&
      Math.abs(same.change) >= Math.abs(perAuthor) / 2;
    out.push({
      lead: `${pct(same.change)} commits by the same people:`,
      text: `the median of the ${integer.format(same.n)} people active in both years` +
        (explains ? ", so not because of who joined or left." : "."),
    });
  }
  const lines = windowChange(g, "lines");
  if (lines !== null) {
    const after = windowValue(g, "lines", endOf()), before = windowValue(g, "lines", endOf() - 12);
    const level = direction(sizeValues.value);
    out.push({
      lead: `${pct(lines)} lines per commit`,
      text: `(the median commit: ${before} → ${after} lines)` +
        (level === 1 ? ", bigger at every activity level, including the people who land the most."
          : level === -1 ? ", smaller at every activity level." : "."),
    });
  }
  const mwCur = g.msg_window[lastYear.value], mwPrev = g.msg_window[lastYear.value - 1];
  if (repository.value?.has_msg && mwCur && mwPrev && mwPrev.p50 > 0) {
    out.push({
      lead: `${pct(mwCur.p50 / mwPrev.p50 - 1)} commit message length`,
      text: `(median ${integer.format(mwPrev.p50)} → ${integer.format(mwCur.p50)} chars; ` +
        `mean ${integer.format(mwPrev.mean)} → ${integer.format(mwCur.mean)}), excluding footers, reverts, and rolls.`,
    });
  }
  return out;
});

// The numbers behind the charts --------------------------------------------

const yoyTable = computed(() => {
  const values = metricValues.value, months = data.value!.months, rows: string[][] = [];
  const from = metricFrom(metric.value);
  for (let i = months.length - 1; i >= 12 && months[i] >= from; i--) {
    const value = values[i], previous = values[i - 12];
    if (value === null || previous === null || !(previous > 0)) continue;
    rows.push([monthShort(months[i]), metricFormat.value(value), metricFormat.value(previous), pct(value / previous - 1)]);
  }
  return rows;
});

const indexTable = computed(() => {
  const months = data.value!.months, series = indexSeries.value, rows: string[][] = [];
  for (let i = months.length - 1; i >= 0 && months[i] >= indexFrom.value; i--) {
    rows.push([monthShort(months[i]), ...series.map(s => {
      const v = s.values[i];
      return v === null ? "—" : s.label === "Commits per author" ? decimal.format(v) : integer.format(v);
    })]);
  }
  return rows;
});

const change = (log2: number | null) => log2 === null ? "—" : pct(2 ** log2 - 1);
const cohortTable = computed(() => [...group.value!.cohort].reverse().map(row => [
  `${row.year - 1} → ${row.year}`,
  integer.format(row.n),
  ...(row.n >= 10
    ? [change(row.p50), change(row.p25), change(row.p75), `${Math.round(row.up * 100)}%`]
    : ["—", "—", "—", "—"]),
]));

const cohortMonthlyTable = computed(() => {
  const months = data.value!.months, c = group.value!.cohort_monthly, rows: string[][] = [];
  const w = data.value!.window.length;
  for (let i = months.length - 1; i >= 0 && c.n[i] !== null; i--) {
    const n = c.n[i]!, first = months[i - w + 1];
    rows.push([
      `${first.slice(0, 4) === months[i].slice(0, 4) ? shortMonth(first) : monthShort(first)}–${monthShort(months[i])}`,
      integer.format(n),
      ...(n >= 10 ? [change(c.mean[i]), `${Math.round(c.up[i]! * 100)}%`] : ["—", "—"]),
    ]);
  }
  return rows;
});

const percentileTable = computed(() => Object.entries(percentileValues.value)
  .sort((a, b) => +b[0] - +a[0])
  .map(([year, values]) => [year, ...values.map(v => integer.format(v))]));

const sizeTable = computed(() => Object.entries(group.value!.commit_size)
  .sort((a, b) => +b[0] - +a[0])
  .map(([year, size]) => [
    year,
    ...(sizeValues.value[year] ?? []).map(v => integer.format(v)),
    share(size.tiny),
    `${size.files}`,
    share(size.added),
  ]));
</script>

<style scoped>
.report-stack {
  display: grid;
  gap: 1.75rem;
  grid-template-columns: minmax(0, 1fr);
}

.page-head,
.group-bar {
  margin-bottom: 1.75rem;
}

.group-bar {
  align-items: flex-start;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  justify-content: space-between;
  padding-bottom: 0.9rem;
}

/* On large screens, the parameters are in the column on the left: their
 * options one per line, as they are few. */
@media (min-width: 1280px) {
  .report :deep(.container.split-layout) {
    --aside-width: 316px;
  }

  .group-bar {
    border-bottom: none;
    display: grid;
    gap: 1.5rem;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .group-bar .selector {
    justify-items: stretch;
  }

  .group-bar .selector :deep(.chip-track),
  .group-bar .selector :deep(.segmented) {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    max-height: none;
    overflow: visible;
    width: 100%;
  }

  .group-bar .selector :deep(.chip-track .chip),
  .group-bar .selector :deep(.segmented-option) {
    justify-content: flex-start;
  }

  .repo-groups {
    align-items: start;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }

  .repo-group.smaller {
    border-right: 1px solid var(--line);
    order: -1;
    padding-right: 0.65rem;
  }

  .repo-group :deep(.chip-track .chip) {
    min-width: 0;
    padding: 0 0.45rem;
    width: 100%;
  }
}

@media (min-width: 1408px) {
  .report :deep(.container.split-layout) {
    --aside-width: 336px;
  }
}

/* The selectors scroll sideways on narrow screens. */
.group-bar :deep(.segmented),
.report-stack :deep(.segmented) {
  max-width: 100%;
  overflow-x: auto;
}

.page-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.kicker {
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 640;
  letter-spacing: 0.05em;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.title {
  text-wrap: balance;
}

.lede {
  color: var(--ink-2);
  font-size: 1.05rem;
  line-height: 1.6;
  max-width: 66ch;
}

.selector {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
  min-width: 0;
}

.selector.repository {
  flex-basis: 100%;
  justify-items: stretch;
}

.selector.repository :deep(.repository-selector) {
  padding: 0;
}

.repo-groups {
  display: grid;
  gap: 0.65rem;
  width: 100%;
}

.repo-group {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.repo-group-label {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.7rem;
  font-weight: 600;
  gap: 0.25rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.repo-group-label.is-warning {
  color: var(--tag-warning-ink);
  cursor: help;
}

.repo-chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caveat {
  align-items: center;
  border-radius: 999px;
  cursor: help;
  display: inline-flex;
  gap: 0.2rem;
  padding: 0 0.4rem;
}

.caveat.warning {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.caveat.info {
  background: var(--surface-sunken);
  color: var(--ink-2);
}

/* Large screens: the caveats in full, over the empty right of the header, out
 * of the flow so that they never move the page. Elsewhere, the tags. */
.caveat-overlay {
  display: none;
}

@media (min-width: 1280px) {
  .page-head {
    position: relative;
  }

  .page-head.has-caveats > div {
    padding-right: 410px;
  }

  .caveat-tags {
    display: none;
  }

  .caveat-overlay {
    display: grid;
    gap: 0.3rem;
    position: absolute;
    right: 0;
    top: 0;
    width: 390px;
    z-index: 2;
  }
}

/* Fixed while it floats, on any screen: its top comes from the script. */
.caveat-overlay.floating {
  display: grid;
  gap: 0.3rem;
  position: fixed;
  width: min(390px, calc(100vw - 2rem));
  z-index: 20;
}

/* Orange edge shadow around the viewport: flashes on new warning, and stays
 * softly visible on large screens while a warning is active. */
.warning-vignette {
  --warn-orange: color-mix(in srgb, var(--series-2) 48%, var(--series-4) 52%);
  box-shadow: inset 0 0 85px 14px var(--warn-orange);
  inset: 0;
  opacity: 0;
  pointer-events: none;
  position: fixed;
  transition: opacity 1.1s ease-out, box-shadow 1.1s ease-out;
  z-index: 19;
}

@media (min-width: 1280px) {
  .warning-vignette.persistent {
    opacity: 0.16;
  }
}

.warning-vignette.flash {
  box-shadow: inset 0 0 115px 24px var(--warn-orange);
  opacity: 0.46;
  transition: opacity 0.22s ease-in, box-shadow 0.22s ease-in;
}

@media (prefers-reduced-motion: reduce) {
  .caveat-overlay.floating {
    transition: none !important;
  }

  .warning-vignette {
    transition: none !important;
  }

  .warning-vignette.flash {
    opacity: 0.16;
  }
}

.caveat-note {
  align-items: flex-start;
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent);
  display: flex;
  font-size: 0.76rem;
  gap: 0.45rem;
  line-height: 1.35;
  margin: 0;
  padding: 0.4rem 0.65rem;
  transition: box-shadow 0.9s ease-out, border-color 0.9s ease-out;
}

.caveat-note :deep(.icon) {
  flex: none;
  margin-top: 0.1rem;
}

.caveat-note.warning {
  --warn-orange: color-mix(in srgb, var(--series-2) 48%, var(--series-4) 52%);
  background: var(--tag-warning-bg);
  border: 1px solid color-mix(in srgb, var(--warn-orange) 55%, transparent);
  box-shadow:
    0 4px 18px color-mix(in srgb, var(--warn-orange) 26%, transparent),
    0 0 0 1px color-mix(in srgb, var(--warn-orange) 18%, transparent);
  color: var(--ink);
}

.caveat-overlay.flashing .caveat-note.warning {
  border-color: var(--warn-orange);
  box-shadow:
    0 0 28px 6px color-mix(in srgb, var(--warn-orange) 42%, transparent),
    0 0 0 2px color-mix(in srgb, var(--warn-orange) 40%, transparent);
  transition: box-shadow 0.22s ease-in, border-color 0.22s ease-in;
}

.caveat-note.warning :deep(.icon) {
  color: var(--tag-warning-ink);
}

.caveat-note.info {
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-2);
}

/* The explanation, in the body text style rather than the kicker's. */
.kicker :deep(.tooltip-content) {
  font-family: var(--font-sans);
  font-weight: 400;
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
}

.caveat:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.kpi-grid-wrap {
  container-type: inline-size;
}

.kpi-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

/* On one row, the card with more to say gets twice the width. */
@container (min-width: 860px) {
  .kpi-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .kpi-card.wide {
    grid-column: span 2;
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.9rem 1rem;
}

/* The figures that select the measure of the chart below. */
button.kpi-card {
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
}

button.kpi-card:hover {
  border-color: var(--line-strong);
}

button.kpi-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.kpi-card.selected {
  border-color: var(--accent-line);
  box-shadow: inset 0 0 0 1px var(--accent-line);
}

.kpi-card.selected .kpi-label {
  color: var(--accent-ink);
}

.kpi-label {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.kpi-value {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.kpi-detail {
  color: var(--ink-2);
  font-size: 0.8rem;
  margin-bottom: 0.45rem;
}

.kpi-extra {
  color: var(--ink-2);
  font-size: 0.78rem;
  margin-bottom: 0.45rem;
}

.kpi-extra-line {
  display: block;
}

.kpi-extra strong {
  color: var(--ink);
  display: block;
  font-weight: 600;
}

.kpi-hint {
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.35;
  /* At the bottom, lined up across the cards. */
  margin-top: auto;
  padding-top: 0.45rem;
}

.kpi-caption {
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.kpi-skeleton {
  height: 211px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  align-content: start;
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding: 1.1rem 1.2rem;
}

.panel-title {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 640;
  margin-bottom: 0.15rem;
  text-wrap: balance;
}

.panel-text {
  color: var(--muted);
  font-size: 0.86rem;
  max-width: 85ch;
}

.metric {
  justify-self: start;
  max-width: 100%;
}

.metric-note {
  color: var(--ink-2);
  font-size: 0.86rem;
  max-width: 85ch;
}

/* The size of the commits: the chart, and the facts beside it. */
.size-layout {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 1fr) 260px;
}

@media (max-width: 900px) {
  .size-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.size-facts {
  align-content: start;
  display: grid;
  gap: 1rem;
  margin: 0;
}

.size-facts dt {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.size-facts dd {
  display: grid;
  margin: 0;
}

.trait-facts {
  display: grid;
  gap: 0.75rem 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  margin: 0;
}

.trait-facts dt {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.trait-facts dd {
  display: grid;
  margin: 0;
}

.fact-value {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.fact-detail {
  color: var(--ink-2);
  font-size: 0.8rem;
}

.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

/* On narrow screens, a switch scrolls instead of widening the page. */
.switches > * {
  max-width: 100%;
  min-width: 0;
}

.findings {
  background: var(--surface);
  border: 1px solid var(--accent-line);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius-lg);
  padding: 1rem 1.2rem;
}

.findings ul {
  display: grid;
  gap: 0.45rem;
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}

.findings li {
  color: var(--ink-2);
  font-size: 0.95rem;
  line-height: 1.45;
}

.findings strong {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.legend {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.35rem 1.1rem;
}

.legend-box {
  border-radius: 2px;
  display: inline-block;
  height: 10px;
  margin-right: 0.4rem;
  vertical-align: baseline;
  width: 14px;
}

.legend-box.past {
  background: var(--line-strong);
}

.legend-box.current {
  background: var(--accent);
}

.legend-box.band {
  background: var(--surface-sunken);
  border: 1px solid var(--line);
}

.legend-line {
  border-radius: 2px;
  display: inline-block;
  height: 3px;
  margin-right: 0.4rem;
  vertical-align: middle;
  width: 16px;
}

.legend-dot {
  background: var(--ink-2);
  border-radius: 50%;
  display: inline-block;
  height: 10px;
  margin-right: 0.4rem;
  vertical-align: baseline;
  width: 10px;
}

.legend-dot.current {
  background: var(--accent);
}

.legend-dot.usual {
  background: var(--muted);
  opacity: 0.55;
}

.legend-range {
  background: var(--line-strong);
  border-radius: 4px;
  display: inline-block;
  height: 7px;
  margin-right: 0.4rem;
  vertical-align: middle;
  width: 22px;
}

.legend-line.past {
  background: var(--line-strong);
}

.legend-line.previous {
  background: var(--ink-2);
}

.legend-line.current {
  background: var(--accent);
}
</style>
