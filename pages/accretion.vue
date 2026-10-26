<template>
  <div>
    <Navbar />
    <section class="section">
      <div class="container">
        <h1 class="title">Code accretion</h1>
        <p class="mb-4">
          The lines of code of Chromium alive over time, per year they were
          written in. Each year adds a new layer on top, which slowly erodes as
          its lines are rewritten. Computed like <code>git blame</code>, along
          the first-parent history, ignoring the formatting commits listed in
          <code>.git-blame-ignore-revs</code>, and excluding
          <code>third_party/</code> except Blink, and the translations.
        </p>

        <nav class="breadcrumb mb-4" aria-label="breadcrumbs">
          <ul>
            <li :class="{ 'is-active': !directory }">
              <a href="#" @click.prevent="directory = ''">Chromium</a>
            </li>
            <li v-for="part in breadcrumb" :key="part.path"
              :class="{ 'is-active': part.path === directory }">
              <a href="#" @click.prevent="directory = part.path">{{ part.name }}</a>
            </li>
          </ul>
        </nav>

        <div class="figures mb-5">
          <div v-for="figure in figures" :key="figure.label" class="figure">
            <div class="figure-label">{{ figure.label }}</div>
            <div class="figure-value">{{ figure.value }}</div>
            <div class="figure-detail">{{ figure.detail }}</div>
          </div>
        </div>

        <FilterPanel :summary="share ? 'Share of the total' : 'Number of lines'">
          <UiField label="Display">
            <UiSegmented v-model="share" :options="[
              { value: false, label: 'Lines' },
              { value: true, label: 'Share' },
            ]" />
          </UiField>
        </FilterPanel>

        <div class="chart">
          <AccretionChart :data="scope" :share="share"
            :milestones="directory ? [] : milestones" />
        </div>

        <template v-if="children.length">
          <h2 class="title is-4 mt-6">Directories</h2>
          <p class="mb-4">
            Click a directory to look into it. <em>Growth</em> is over the
            last year. <em>Fresh</em> is the share of lines written in the
            last 12 months. <em>Old code rewritten</em> is the share of the
            lines older than a year, removed or rewritten during the last year.
          </p>
          <UiTable :data="children" hoverable striped :paginated="children.length > 25"
            :per-page="25">
            <UiTableColumn field="name" label="Directory" v-slot="props" sortable>
              <a href="#" @click.prevent="directory = props.row.path">{{ props.row.name }}</a>
            </UiTableColumn>
            <UiTableColumn field="lines" label="Lines" v-slot="props" numeric sortable>
              {{ compact(props.row.lines) }}
            </UiTableColumn>
            <UiTableColumn field="growth" label="Growth" v-slot="props" numeric sortable>
              {{ signedPercent(props.row.growth) }}
            </UiTableColumn>
            <UiTableColumn field="fresh" label="Fresh" v-slot="props" numeric sortable>
              {{ percent(props.row.fresh) }}
            </UiTableColumn>
            <UiTableColumn field="median_age" label="Median age" v-slot="props" numeric sortable>
              {{ years(props.row.median_age) }}
            </UiTableColumn>
            <UiTableColumn field="rewritten" label="Old code rewritten" v-slot="props" numeric sortable>
              {{ percent(props.row.rewritten) }}
            </UiTableColumn>
          </UiTable>
        </template>

        <h2 class="title is-4 mt-6">Fresh code</h2>
        <p class="mb-4">
          The share of the lines written in the last 365 days, among all the
          lines alive.
        </p>
        <div class="chart">
          <LineChart :data="freshness" :formatter="percent"
            :milestones="directory ? [] : milestones" />
        </div>

        <h2 class="title is-4 mt-6">Yearly reduction</h2>
        <p class="mb-4">
          The share of the lines of a year removed or rewritten during each of
          the following years, from January to January.
          <template v-if="halfLife">
            With the median rates, half of the lines of a year are gone
            <strong>{{ halfLife.toFixed(1) }} years</strong> after it ends.
          </template>
          Negative when lines were added to an old year, like when Blink was
          merged.
        </p>
        <div class="table-container">
          <table class="table is-narrow is-hoverable reduction">
            <thead>
              <tr>
                <th>Written in</th>
                <th v-for="age in reduction.ages" :key="age">Year {{ age }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reduction.rows" :key="row.label"
                :class="{ median: row.label === 'Median' }">
                <th>{{ row.label }}</th>
                <td v-for="(value, i) in row.values" :key="i"
                  :style="value === null ? null : { '--value': Math.max(0, Math.min(1, value / 0.4)) }">
                  {{ value === null ? "" : percent(value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 class="title is-4 mt-6">Developers</h2>
        <p class="mb-4">
          The lines each developer wrote, still alive over time, in all of
          Chromium.
        </p>
        <UiField>
          <DevelopersInput v-model="developers" />
        </UiField>
        <div class="chart">
          <LineChart :data="developerData" :formatter="lines" />
        </div>

        <h2 class="title is-4 mt-6">Most lines alive</h2>
        <UiTable :data="leaderboard" hoverable striped :paginated="true" :per-page="20">
          <UiTableColumn field="rank" label="#" v-slot="props" numeric>
            {{ props.row.rank }}
          </UiTableColumn>
          <UiTableColumn field="username" label="Developer" v-slot="props">
            <NuxtLink :to="`/developers/${props.row.username}`">
              {{ props.row.username }}
            </NuxtLink>
          </UiTableColumn>
          <UiTableColumn field="lines" label="Lines alive" v-slot="props" numeric sortable>
            {{ lines(props.row.lines) }}
          </UiTableColumn>
          <UiTableColumn field="peak" label="Peak" v-slot="props" numeric sortable>
            {{ lines(props.row.peak) }}
          </UiTableColumn>
        </UiTable>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";

const route = useRoute();
const router = useRouter();

const repository = "chromium";

// The events explaining the largest steps of the chart.
const milestones = [
  { date: "2009-08-21", label: "Hunspell moved to DEPS" },
  { date: "2015-09-23", label: "Blink merged into Chromium" },
  { date: "2018-10-24", label: "Redundant web test baselines removed" },
  { date: "2023-11-28", label: "Legacy DOM conformance tests removed" },
  { date: "2024-05-17", label: "Content extraction test data trimmed" },
  { date: "2025-06-26", label: "native_client_sdk removed" },
];

const lines = format(",");
const compact = format(".3~s");
const percent = value => value === null || isNaN(value) ? "" : format(".1%")(value);
const signedPercent = value => value === null || isNaN(value) ? "" : format("+.1%")(value);
const years = value => value === null ? "" : `${value.toFixed(1)} y`;

const share = ref(route.query.share === "true");
const directory = ref(route.query.dir || "");
const developers = ref(route.query.developers
  ? route.query.developers.split(",")
  : []);

const cohorts = shallowRef(null);       // All of Chromium.
const directories = shallowRef([]);     // The summary of every directory.
const directoryData = shallowRef(null); // The selected directory.
const leaderboard = shallowRef([]);
const developerData = shallowRef([]);

const fetchJson = url => fetch(url).then(response => response.ok
  ? response.json()
  : null);

onMounted(async () => {
  const [cohortsJson, directoriesJson, leaderboardJson] = await Promise.all([
    fetchJson(`/accretion/${repository}/cohorts.json`),
    fetchJson(`/accretion/${repository}/directories.json`),
    fetchJson(`/accretion/${repository}/leaderboard.json`),
  ]);
  cohorts.value = cohortsJson;
  directories.value = directoriesJson || [];
  leaderboard.value = (leaderboardJson || []).map((entry, i) => ({ ...entry, rank: i + 1 }));
  if (developers.value.length === 0) {
    developers.value = leaderboard.value.slice(0, 5).map(entry => entry.username);
  }
});

// Blink is a top-level directory.
const parentOf = path => path === "third_party/blink" || !path.includes("/")
  ? ""
  : path.slice(0, path.lastIndexOf("/"));

const breadcrumb = computed(() => {
  const parts = [];
  for (let path = directory.value; path; path = parentOf(path)) {
    parts.unshift({ path, name: path.slice(parentOf(path).length).replace(/^\//, "") });
  }
  return parts;
});

watch(directory, async () => {
  directoryData.value = directory.value
    ? await fetchJson(`/accretion/${repository}/directories/${directory.value}.json`)
    : null;
}, { immediate: true });

// The data of the selected scope: Chromium, or a directory.
const scope = computed(() => directory.value ? directoryData.value : cohorts.value);

const total = row => row.reduce((a, b) => a + b, 0);

const children = computed(() => directories.value
  .filter(entry => entry.path !== directory.value && parentOf(entry.path) === directory.value)
  .map(entry => ({
    ...entry,
    name: entry.path.slice(directory.value.length).replace(/^\//, ""),
    growth: entry.year_ago ? entry.lines / entry.year_ago - 1 : null,
    fresh: entry.recent / entry.lines,
    rewritten: entry.year_ago ? 1 - (entry.lines - entry.recent) / entry.year_ago : null,
  })));

// For each year, the share of its lines removed during each following year,
// measured at the sample closest to each January 1st.
const reduction = computed(() => {
  const data = scope.value;
  if (!data) return { ages: [], rows: [] };
  const { dates, years, lines } = data;
  const january = {};
  const distance = (i, year) => Math.abs(new Date(dates[i]) - new Date(`${year}-01-01`));
  dates.forEach((date, i) => {
    const year = Number(date.slice(0, 4)) + (date.slice(5) > "07" ? 1 : 0);
    // Within 7 weeks, for the directories sampled every 13 weeks.
    if (distance(i, year) > 49 * 86400e3) return;
    if (january[year] === undefined || distance(i, year) < distance(january[year], year)) {
      january[year] = i;
    }
  });
  const rows = [];
  for (const year of years.filter(year => year !== "unknown")) {
    const column = years.indexOf(year);
    const values = [];
    for (let age = 1; ; age++) {
      const start = january[Number(year) + age];
      const end = january[Number(year) + age + 1];
      if (start === undefined || end === undefined) break;
      const before = lines[start][column];
      values.push(before ? 1 - lines[end][column] / before : null);
    }
    if (values.length) rows.push({ label: year, values });
  }
  const ages = Array.from(
    { length: Math.max(0, ...rows.map(row => row.values.length)) },
    (_, i) => i + 1);
  const median = ages.map((_, i) => {
    const values = rows.map(row => row.values[i])
      .filter(value => value !== null && value !== undefined)
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  });
  return {
    ages,
    rows: [{ label: "Median", values: median }, ...rows.reverse().map(row => ({
      ...row,
      values: ages.map((_, i) => row.values[i] ?? null),
    }))],
  };
});

// The years for half of the lines of a year to be gone, with the median
// reduction of each age.
const halfLife = computed(() => {
  const median = reduction.value.rows[0]?.values || [];
  let alive = 1;
  for (let age = 0; age < median.length; age++) {
    if (median[age] === null) return null;
    const next = alive * (1 - median[age]);
    if (next <= 0.5) return age + (alive - 0.5) / (alive - next);
    alive = next;
  }
  return null;
});

// The headline figures of the selected scope.
const figures = computed(() => {
  const data = scope.value;
  if (!data?.recent) return [];
  const last = data.dates.length - 1;
  const now = new Date(data.dates[last]);
  // The last sample at least a year before.
  let before = last;
  while (before > 0 && now - new Date(data.dates[before]) < 365 * 86400e3) before--;
  const current = total(data.lines[last]);
  const recent = data.recent[last];
  const year_ago = before < last ? total(data.lines[before]) : null;
  const entry = directories.value.find(entry => entry.path === directory.value);
  const median_age = directory.value
    ? entry?.median_age ?? null
    : data.median_age / 365.25;
  const figures = [
    {
      label: "Lines alive",
      value: compact(current),
      detail: year_ago ? `${signedPercent(current / year_ago - 1)} in a year` : "",
    },
    {
      label: "Fresh code",
      value: percent(recent / current),
      detail: "written in the last 365 days",
    },
    {
      label: "Median line age",
      value: median_age === null || isNaN(median_age) ? "" : `${median_age.toFixed(1)} years`,
      detail: "half of the lines are older",
    },
    {
      label: "Old code rewritten",
      value: year_ago ? percent(1 - (current - recent) / year_ago) : "",
      detail: "of the lines older than a year, during the last year",
    },
  ];
  if (halfLife.value) {
    figures.push({
      label: "Half-life",
      value: `${halfLife.value.toFixed(1)} years`,
      detail: "for half of a year's lines to be gone",
    });
  }
  return figures;
});

// The first year is skipped: all its lines are less than a year old.
const freshness = computed(() => {
  const series = (label, data) => {
    if (!data?.recent) return null;
    const start = new Date(data.dates[0]).getTime() + 365 * 86400e3;
    return {
      label,
      values: data.dates
        .map((date, i) => ({ x: new Date(date), y: data.recent[i] / total(data.lines[i]) }))
        .filter(point => point.x.getTime() >= start),
    };
  };
  return [
    directory.value ? series(directory.value, directoryData.value) : null,
    series("Chromium", cohorts.value),
  ].filter(entry => entry);
});

watch(developers, async () => {
  const jsons = await Promise.all(developers.value.map(username =>
    fetchJson(`/accretion/${repository}/usernames/${username}.json`)));
  developerData.value = developers.value
    .map((username, i) => jsons[i] && {
      label: username,
      values: jsons[i].dates.map((date, j) => ({
        x: new Date(date),
        y: jsons[i].lines[j],
      })),
    })
    .filter(entry => entry);
});

watch([share, directory, developers], () => {
  router.replace({
    query: {
      share: share.value ? "true" : undefined,
      dir: directory.value || undefined,
      developers: developers.value.join(",") || undefined,
    },
  });
});
</script>

<style scoped>
.chart {
  height: 500px;
}

.figures {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.figure {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 0.9rem 1.1rem;
}

.figure-label {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.figure-value {
  color: var(--ink);
  font-size: 1.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.figure-detail {
  color: var(--muted);
  font-size: 0.8rem;
}

.reduction td {
  background: color-mix(in srgb, var(--series-8) calc(var(--value, 0) * 60%), transparent);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.reduction tr.median {
  font-weight: bold;
}
</style>
