<template>
  <div class="report">
    <section class="section">
      <SplitLayout :width="1080" aside-label="Report parameters">
        <template #header>
        <header class="page-head">
          <h1 class="title mb-2">{{ repositoryName }} developer output</h1>
          <p class="lede">
            Commit volume, per-developer activity, and patch size
            <template v-if="data">
              for <span class="page-period">{{ windowLabel(lastYear) }}</span> vs {{ windowLabel(lastYear - 1) }}.
            </template>
            <template v-else>compared against the same months a year earlier.</template>
          </p>
          <div v-if="caveats.length" class="caveat-list" aria-label="Caveats">
            <p v-for="caveat in caveats" :key="caveat.label" :class="['caveat-note', caveat.kind]">
              <UiIcon :name="caveat.kind === 'warning' ? 'alert-outline' : 'information-outline'" size="small" />
              <span><strong>{{ caveat.label }}:</strong> {{ caveat.text }}</span>
            </p>
          </div>
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
          <ReportFindingsStrip
            :kpis="kpis"
            :metric="metric"
            @update:metric="metric = $event"
          />

          <section class="panel">
            <div>
              <h2 class="panel-title">Monthly trend</h2>
              <p v-if="trendView === 'yoy'" class="panel-text">
                Year-over-year change per month. The shaded band marks the {{ usualLabel }} range.
              </p>
              <p v-else class="panel-text">
                3-month rolling average indexed to {{ usualLabel }} = 100.
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
              <h2 class="panel-title">Same developers, year over year</h2>
              <p v-if="peopleView === 'year'" class="panel-text">
                Restricted to developers with at least {{ data.min_window }} commits in both periods, excluding newcomers and leavers.
              </p>
              <p v-else class="panel-text">
                Rolling {{ data.window.length }}-month commit change for developers active in both periods.
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
              <h2 class="panel-title">Activity percentiles</h2>
              <p class="panel-text">
                Monthly commits per developer from the median (p50) to the top 1% (p99), comparing {{ lastYear }} with {{ lastYear - 1 }}.
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
              <h2 class="panel-title">Commit size</h2>
              <p class="panel-text">
                Median lines changed (added + deleted) per commit across developer activity levels.
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
        label: "Same people",
        value: enough ? pct(2 ** latest!.p50! - 1) : "—",
        lines: enough
          ? [
              `Median of ${integer.format(latest!.n)} active in both years`,
              ...(usual.length ? [`${u0}–${String(u1).slice(2)}: ${pct(Math.min(...usual))} to ${pct(Math.max(...usual))}`] : []),
            ]
          : ["Too few active in both years"],
      },
    },
    {
      label: "Lines per commit",
      metric: "lines" as Metric,
      value: ratioPct(k.lines[0], k.lines[1]),
      detail: `${k.lines[0] ?? "—"} → ${k.lines[1] ?? "—"} lines`,
    },
    ...(repository.value?.has_msg ? [{
      label: "Message length",
      metric: "msg" as Metric,
      value: ratioPct(k.msg[0], k.msg[1]),
      detail: `${k.msg[0] !== null ? integer.format(k.msg[0]) : "—"} → ${k.msg[1] !== null ? integer.format(k.msg[1]) : "—"} chars`,
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

// Caveats on the figures of the selection.
const caveats = computed(() => {
  const r = repository.value, out: { kind: "warning" | "info"; label: string; text: string }[] = [];
  if (!r || !data.value) return out;
  if (r.last_month && r.last_month < data.value.months.at(-1)!) {
    out.push({
      kind: "warning",
      label: "Data stopped",
      text: `Data ends in ${monthShort(r.last_month)}. Pick an earlier period to inspect it.`,
    });
  }
  if (few.value) {
    out.push({
      kind: "warning",
      label: "Small sample",
      text: `Only ${people.value} ${people.value === 1 ? "person" : "people"}` +
        (group.value!.id === "all" ? "" : ` in ${group.value!.label}`) +
        ` active in both years, so percentages swing widely.`,
    });
  } else if (small.value) {
    out.push({
      kind: "info",
      label: "Small group",
      text: `${people.value} people active in both years; single months are noisy.`,
    });
  }
  if (r.parent) {
    out.push({
      kind: "info",
      label: `Part of ${r.parent}`,
      text: `Commits are also included in ${r.parent}.`,
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
  display: grid;
  gap: 0.35rem;
}

.title {
  text-wrap: balance;
}

.lede {
  color: var(--ink-2);
  font-size: 1rem;
  line-height: 1.55;
  margin: 0;
  max-width: 66ch;
}

.caveat-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin-top: 0.5rem;
}

.caveat-note {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.84rem;
  gap: 0.35rem;
  line-height: 1.4;
  margin: 0;
}

.caveat-note.warning {
  color: var(--tag-warning-ink);
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

.kpi-skeleton {
  height: 112px;
}

.panel {
  align-content: start;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 0.85rem;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding-top: 1.5rem;
}

.panel:first-of-type {
  border-top: 0;
  padding-top: 0;
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
