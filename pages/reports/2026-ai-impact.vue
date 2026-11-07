<template>
  <div class="report">
    <section class="section">
      <div class="container">
      <div class="report-stack">
        <header class="page-head">
          <div>
            <p class="kicker">Report · {{ repositoryName }} · 2026</p>
            <h1 class="title mb-2">{{ chromium ? "Chromium's 2026 acceleration" : `${repositoryName} in 2026` }}</h1>
            <p v-if="chromium" class="lede">
              From 2016 to 2025, commits per person in Chromium stayed nearly flat. In 2026 they
              break out of that range: people land more commits, and each commit is bigger. Every
              chart below compares 2026 against the years before it.
            </p>
            <p v-else class="lede">
              The same report for {{ repositoryName }}: how commits per person changed in 2026.
              Every chart below compares 2026 against the years before it.
            </p>
          </div>
          <span v-if="data" class="snapshot-badge">
            <UiIcon name="clock-outline" size="small" />
            Through {{ monthLabel(data.months.at(-1)!) }}
          </span>
        </header>

        <aside class="group-bar" aria-label="Report parameters">
          <div class="selector repository">
            <h2 class="panel-title">Repository</h2>
            <RepositorySelector
              v-model="repositorySelection"
              :filter="(repo: { dirname: string }) => available.has(repo.dirname)" />
          </div>
          <div class="selector">
            <h2 class="panel-title">Organization</h2>
            <UiSegmented v-model="groupId" :options="groupOptions" aria-label="Organization" />
          </div>
        </aside>

        <div v-if="!data" class="skeleton kpi-skeleton" aria-hidden="true" />
        <template v-else-if="group">
          <p v-if="few" class="few-warning" role="note">
            <UiIcon name="alert-outline" size="small" />
            <span>
              <strong>Few people.</strong> Only {{ repository!.n }} people in {{ repositoryName }}
              committed at least {{ data.min_window }} times in both {{ windowLabel(lastYear - 1) }}
              and {{ windowLabel(lastYear) }}. With so few, one or two people can move the figures
              by a lot: read the direction, not the exact numbers. {{ repositoryName }} is left out
              of the comparison across repositories below 20 people.
            </span>
          </p>
          <p v-else-if="small" class="small-note">
            <UiIcon name="information-outline" size="small" />
            A small group: fewer than 100 people in the same-people comparison, so single months
            swing a lot. Read the trend, not individual bars.
          </p>
          <p v-if="repository!.parent" class="small-note">
            <UiIcon name="information-outline" size="small" />
            {{ repositoryName }} is a part of the {{ repository!.parent }} repository: its commits
            are also counted in {{ repository!.parent }}.
          </p>

          <div>
            <div class="kpi-grid">
              <div v-for="card in kpis" :key="card.label" class="kpi-card">
                <span class="kpi-label">{{ card.label }}</span>
                <span class="kpi-value">{{ card.value }}</span>
                <span class="kpi-detail">{{ card.detail }}</span>
              </div>
            </div>
            <p class="kpi-caption">
              {{ windowLabel(lastYear) }} against {{ windowLabel(lastYear - 1) }}.
            </p>
          </div>

          <section class="panel">
            <div>
              <h2 class="panel-title">Year-over-year change, month by month</h2>
              <p class="panel-text">
                Each bar compares a month with the same month a year earlier, which removes
                seasonality. The gray band is the usual range: the 2021–2025 mean ± 2 standard
                deviations. All the measures share the same scale.
              </p>
            </div>
            <UiSegmented v-model="metric" :options="metricOptions" aria-label="Measure" class="metric" />
            <div class="legend">
              <span><span class="legend-box past" />Before 2026</span>
              <span><span class="legend-box current" />2026</span>
              <span><span class="legend-box band" />Usual range</span>
            </div>
            <ReportYoyChart
              :months="data.months"
              :values="metricValues"
              :label="metricLabel"
              :from="metricFrom(metric)"
              :format="metricFormat"
              :scale="metricScale" />
            <ReportDataTable
              :columns="['Month', metricLabel, 'A year earlier', 'Change']"
              :rows="yoyTable" />
          </section>

          <section class="panel">
            <div>
              <h2 class="panel-title">Indexed to the 2021–2025 average</h2>
              <p class="panel-text">
                3-month trailing average, where 100 is the 2021–2025 average of each measure.
                <template v-if="chromium">
                  The number of active authors moves little. Commits per author and lines per commit
                  break away in 2026.
                </template>
              </p>
            </div>
            <div class="legend">
              <span v-for="s in indexSeries" :key="s.label">
                <span class="legend-line" :style="{ background: s.color }" />{{ s.label }}
              </span>
            </div>
            <ReportIndexChart :months="data.months" :series="indexSeries" :from="indexFrom" />
            <ReportDataTable
              :columns="['Month', ...indexSeries.map(s => s.label)]"
              :rows="indexTable" />
          </section>

          <div class="row2">
            <section class="panel">
              <div>
                <h2 class="panel-title">The same people, a year apart</h2>
                <p class="panel-text">
                  Contributors with at least {{ data.min_window }} commits in
                  {{ windowLabel(lastYear - 1) }} and {{ windowLabel(lastYear) }}, and the same
                  months of the years before. Each person's change in commits is one value; each
                  row summarizes those values.
                </p>
              </div>
              <div class="legend">
                <span><span class="legend-dot" />Median change</span>
                <span><span class="legend-range" />25th to 75th percentile: the middle half of the people</span>
                <span><strong>% up</strong>: the share of people who landed more commits</span>
              </div>
              <ReportCohortChart
                :rows="group.cohort"
                :window-label="windowLabel"
                :min-commits="data.min_window" />
              <ReportDataTable
                :columns="['Years', 'People', 'Median', '25th percentile', '75th percentile', '% up']"
                :rows="cohortTable" />
            </section>

            <section class="panel">
              <div>
                <h2 class="panel-title">{{ chromium ? "Every percentile moves up" : "Every percentile" }}</h2>
                <p class="panel-text">
                  Commits per active person-month, {{ windowMonths }} of each year, from the median
                  (p50) to the top 1% (p99). Under each percentile, how many times higher
                  {{ lastYear }} is than {{ lastYear - 1 }}.
                  <template v-if="chromium">The heavier the contributor, the bigger the jump.</template>
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
          </div>

          <section class="panel">
            <div>
              <h2 class="panel-title">Not only {{ repositoryName }}</h2>
              <p class="panel-text">
                The same people, a year apart, in the other repositories tracked by this site, for
                all their contributors. The dot is the median change from {{ windowLabel(lastYear - 1) }}
                to {{ windowLabel(lastYear) }}; the bar spans the medians of
                {{ data.usual_years[0] }}–{{ data.usual_years[1] }}, the usual range of each
                repository. Repositories with fewer than 20 such people are left out, as their
                median swings too much from year to year, and so are the parts of another repository.
                <template v-if="few || repository!.parent">
                  {{ repositoryName }} is shown, as it is selected.
                </template>
              </p>
            </div>
            <div class="legend">
              <span><span class="legend-dot current" />Median change, {{ lastYear }}</span>
              <span><span class="legend-range" />Usual median, {{ data.usual_years[0] }}–{{ data.usual_years[1] }}</span>
            </div>
            <ReportRepositoryChart
              :rows="comparedRepositories"
              :min-commits="data.min_window"
              :usual-years="data.usual_years"
              :featured="repository!.dirname" />
            <ReportDataTable
              :columns="['Repository', 'People', `Median, ${lastYear}`, `Usual, ${data.usual_years[0]}–${data.usual_years[1]}`, 'Commits per author a month']"
              :rows="repositoryTable" />
          </section>

          <section class="notes">
            <h2 class="panel-title">Notes</h2>
            <ul>
              <li>
                Source: the commits of the {{ repositoryName }} repository, as on the rest of this
                site. A person is a username:
                <template v-if="repository!.github_logins">the GitHub login, or else the email address.</template>
                <template v-else>the part of the email address before the <code>@</code>.</template>
              </li>
              <li>
                The organization selection applies to every chart except "Not only
                {{ repositoryName }}".
                Organizations: each commit belongs to the organization of its author at its date,
                from the email domain and the
                <NuxtLink to="/organizations/emails">known affiliations</NuxtLink>. A person counts
                for the organization of most of their commits in the period. <em>Everyone else</em>
                groups all the organizations other than {{ topOrganization }}, the individuals, and
                the unknown email domains. The other organizations are shown when they average at
                least 15 active authors a month.
              </li>
              <li>
                The figures at the top compare the last {{ data.window.length }} complete months,
                {{ windowLabel(lastYear) }}, with the same months a year earlier. A single month can
                be unusual; three months are steadier.
              </li>
              <li>
                Commit size is the number of lines added plus deleted, as a median: a few very large
                commits don't move it.
                <template v-if="repository!.reviews_from">
                  Reviews come from the commit message trailers, compared from
                  {{ repository!.reviews_from.slice(0, 4) }}, once they are recorded steadily.
                </template>
                <template v-else>
                  Reviews aren't shown: this repository doesn't record them consistently over time.
                </template>
              </li>
              <li v-if="chromium">
                Commits per person were higher in Chromium's early years, when the project was much
                smaller: 2026 is the highest since 2013.
              </li>
              <li>
                This shows when and how much output changed, not why. The timing fits the adoption
                of AI coding tools, but the commit history doesn't say how a change was written.
                Commits and lines measure output, not value.
              </li>
            </ul>
          </section>
        </template>
      </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import type { CohortRow } from "~/components/ReportCohortChart.vue";
import type { IndexSeries } from "~/components/ReportIndexChart.vue";
import type { RepositoryRow } from "~/components/ReportRepositoryChart.vue";

interface Group {
  id: string;
  label: string;
  commits: number[];
  authors: number[];
  reviews: number[];
  lines: (number | null)[];
  cohort: CohortRow[];
  percentiles: Record<string, number[]>;
  kpi: {
    commits: [number, number];
    person_months: [number, number];
    authors: [number, number];
    lines: [number | null, number | null];
  };
}

interface Repository extends RepositoryRow {
  p25: number;
  p75: number;
  per_author: [number, number];
  // The repository this one is a subdirectory of, or null.
  parent: string | null;
  // Whether the usernames are GitHub logins, rather than email local parts.
  github_logins: boolean;
  // The first full year of data, as "YYYY-01".
  data_from: string;
  // The first month the reviews are compared, or null when they aren't.
  reviews_from: string | null;
  groups: Group[];
}

interface Report {
  months: string[];
  window: string[];
  min_window: number;
  quantiles: number[];
  usual_years: [number, number];
  repositories: Repository[];
}

const METRICS = {
  commits: "Commits",
  per_author: "Commits per author",
  lines: "Lines per commit (median)",
  reviews: "Reviews",
  authors: "Active authors",
} as const;
type Metric = keyof typeof METRICS;

const { repositoryId, groupId, metric } = useUrlState({
  repositoryId: { ...urlCodecs.string("chromium"), key: "repository" },
  groupId: { ...urlCodecs.string("all"), key: "organization" },
  metric: urlCodecs.enum(Object.keys(METRICS) as Metric[], "commits"),
});

const data = shallowRef<Report | null>(null);
onMounted(async () => {
  const response = await fetch("/data/ai-impact.json");
  data.value = await response.json();
});

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
const few = computed(() => (repository.value?.n ?? 0) < FEW);
// The comparison across repositories: the independent ones with enough
// people, and the selected one.
const comparedRepositories = computed(() => (data.value?.repositories ?? [])
  .filter(r => (r.n >= FEW && !r.parent) || r.dirname === repository.value?.dirname));
const repositoryName = computed(() => repository.value?.name ?? "Chromium");
const chromium = computed(() => repository.value?.dirname === "chromium");

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
  if (metric.value === "reviews" && !r.reviews_from) metric.value = "commits";
});
const small = computed(() => (group.value?.cohort.at(-1)?.n ?? 0) < 100);

// Periods ------------------------------------------------------------------

const lastYear = computed(() => data.value ? +data.value.months.at(-1)!.slice(0, 4) : 0);
const shortMonth = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
const monthShort = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) =>
  new Date(`${month}-15T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
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
const percentileYears = computed(() =>
  Object.keys(group.value?.percentiles ?? {}).map(Number).sort((a, b) => a - b));

// Formatting ---------------------------------------------------------------

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;

// KPIs ---------------------------------------------------------------------

const kpis = computed(() => {
  const g = group.value!;
  const k = g.kpi;
  const perAuthor = [k.commits[0] / k.person_months[0], k.commits[1] / k.person_months[1]];
  const latest = g.cohort.at(-1)!;
  const usual = g.cohort
    .filter(row => row.year >= 2021 && row.year <= 2025 && row.n >= 10 && row.p50 !== null)
    .map(row => 2 ** row.p50! - 1);
  const enough = latest.n >= 10 && latest.p50 !== null;
  return [
    {
      label: "Commits",
      value: pct(k.commits[1] / k.commits[0] - 1),
      detail: `${integer.format(k.commits[0])} → ${integer.format(k.commits[1])}`,
    },
    {
      label: "Commits per author",
      value: pct(perAuthor[1] / perAuthor[0] - 1),
      detail: `${decimal.format(perAuthor[0])} → ${decimal.format(perAuthor[1])} a month`,
    },
    {
      label: "Lines per commit",
      value: k.lines[0] && k.lines[1] !== null ? pct(k.lines[1] / k.lines[0] - 1) : "—",
      detail: `median ${k.lines[0] ?? "—"} → ${k.lines[1] ?? "—"}`,
    },
    {
      label: "Same people",
      value: enough ? pct(2 ** latest.p50! - 1) : "—",
      detail: enough
        ? `${integer.format(latest.n)} people` +
          (usual.length ? `; 2021–25: ${pct(Math.min(...usual))} to ${pct(Math.max(...usual))}` : "")
        : "too few people to summarize",
    },
    {
      label: "Active authors",
      value: pct(k.authors[1] / k.authors[0] - 1),
      detail: `${integer.format(k.authors[0])} → ${integer.format(k.authors[1])} a month`,
    },
  ];
});

// Charts -------------------------------------------------------------------

const metrics = computed(() => (Object.keys(METRICS) as Metric[])
  .filter(m => m !== "reviews" || repository.value?.reviews_from));
const metricOptions = computed(() => metrics.value.map(value => ({ value, label: METRICS[value] })));
// A year after the first full year of data, to compare with it.
const metricFrom = (m: Metric) => {
  const r = repository.value!;
  if (m === "reviews") return r.reviews_from!;
  const from = `${+r.data_from.slice(0, 4) + 1}-01`;
  return from > "2017-01" ? from : "2017-01";
};
// The 3-month averages within the first full year of data.
const indexFrom = computed(() => {
  const from = repository.value!.data_from;
  return from > "2016-01" ? `${from.slice(0, 4)}-03` : "2016-01";
});
const metricLabel = computed(() => METRICS[metric.value]);
const perAuthor = (g: Group) => g.commits.map((c, i) => g.authors[i] ? c / g.authors[i] : null);
const valuesOf = (g: Group, m: Metric): (number | null)[] => {
  switch (m) {
    case "commits": return g.commits;
    case "per_author": return perAuthor(g);
    case "lines": return g.lines;
    case "reviews": return g.reviews;
    case "authors": return g.authors;
  }
};
const metricValues = computed(() => valuesOf(group.value!, metric.value));
// All the measures share the scale of the chart, to compare them.
const metricScale = computed(() => metrics.value.map(m => ({
  values: valuesOf(group.value!, m),
  from: metricFrom(m),
})));
const metricFormat = computed(() =>
  metric.value === "per_author" ? (v: number) => decimal.format(v) : (v: number) => integer.format(v));

const indexSeries = computed<IndexSeries[]>(() => {
  const g = group.value!;
  return [
    { label: "Commits per author", short: "Per author", color: "var(--series-1)", values: perAuthor(g) },
    { label: "Lines per commit (median)", short: "Lines/commit", color: "var(--series-2)", values: g.lines },
    { label: "Active authors", short: "Authors", color: "var(--series-3)", values: g.authors },
  ];
});

// From the median: the lower percentiles are 1 or 2 commits every year.
const percentileStart = computed(() => Math.max(0, data.value!.quantiles.findIndex(q => q >= 0.5)));
const percentileQuantiles = computed(() => data.value!.quantiles.slice(percentileStart.value));
const percentileValues = computed(() => Object.fromEntries(
  Object.entries(group.value!.percentiles).map(([year, values]) => [year, values.slice(percentileStart.value)])));

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

const percentileTable = computed(() => Object.entries(percentileValues.value)
  .sort((a, b) => +b[0] - +a[0])
  .map(([year, values]) => [year, ...values.map(v => integer.format(v))]));

const repositoryTable = computed(() => comparedRepositories.value.map(r => [
  r.name,
  integer.format(r.n),
  change(r.p50),
  r.usual ? `${pct(r.usual[0])} to ${pct(r.usual[1])}` : "—",
  `${decimal.format(r.per_author[0])} → ${decimal.format(r.per_author[1])}`,
]));
</script>

<style scoped>
/* A reading column, narrower than the site's container. */
.report-stack {
  display: grid;
  gap: 1.75rem;
  grid-template-columns: minmax(0, 1fr);
  margin-inline: auto;
  max-width: 1080px;
}

/* On large screens, the parameters sit in a column on the left, and stay in
 * view while the report scrolls. */
@media (min-width: 1280px) {
  .report-stack {
    column-gap: 2.5rem;
    grid-template-columns: 200px minmax(0, 1fr);
    max-width: calc(1080px + 200px + 2.5rem);
  }

  .report-stack > * {
    grid-column: 2;
  }

  .report-stack > .page-head {
    grid-column: 1 / -1;
  }

  .report-stack > .group-bar {
    align-self: start;
    border-bottom: none;
    display: grid;
    gap: 1.5rem;
    grid-column: 1;
    grid-row: 2 / span 20;
    justify-content: stretch;
    /* Taller than the window: it scrolls on its own. */
    max-height: calc(100vh - 3rem);
    overflow-y: auto;
    padding-bottom: 0;
    position: sticky;
    scrollbar-width: thin;
    top: 1.5rem;
  }

  .group-bar .selector {
    justify-items: stretch;
  }

  /* The options, one per line. */
  .group-bar :deep(.chip-track),
  .group-bar :deep(.segmented) {
    animation: none;
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    mask-image: none;
    max-height: none;
    overflow: visible;
    width: 100%;
  }

  .group-bar :deep(.chip-track .chip),
  .group-bar :deep(.segmented-option) {
    justify-content: flex-start;
  }
}

/* The selectors scroll sideways on narrow screens. */
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

.snapshot-badge {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  white-space: nowrap;
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

.few-warning {
  align-items: flex-start;
  background: var(--tag-warning-bg);
  border: 1px solid color-mix(in srgb, var(--tag-warning-ink) 35%, transparent);
  border-radius: var(--radius-lg);
  color: var(--ink);
  display: flex;
  font-size: 0.88rem;
  gap: 0.5rem;
  line-height: 1.5;
  padding: 0.75rem 0.9rem;
}

.few-warning :deep(.icon) {
  color: var(--tag-warning-ink);
  flex: none;
  margin-top: 0.15rem;
}

.small-note {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  font-size: 0.86rem;
  gap: 0.4rem;
  margin-top: -0.75rem;
}

.kpi-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.1rem;
  padding: 0.9rem 1rem;
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
}

.kpi-caption {
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.kpi-skeleton {
  height: 118px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  align-content: start;
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.8rem;
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

.row2 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 900px) {
  .row2 {
    grid-template-columns: minmax(0, 1fr);
  }
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

.notes {
  color: var(--ink-2);
  font-size: 0.88rem;
  max-width: 85ch;
}

.notes ul {
  list-style: disc;
  margin: 0.5rem 0 0 1.2rem;
}

.notes li + li {
  margin-top: 0.3rem;
}
</style>
