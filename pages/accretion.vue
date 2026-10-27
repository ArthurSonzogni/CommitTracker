<template>
  <div>
    <Navbar />
    <section class="section">
      <div class="container">
        <h1 class="title">Code accretion</h1>
        <FilterPanel :summary="listSummary(repositoryNames(selection), 'repositories')">
          <RepositorySelector v-model="selection" size="is-medium"
            :allowMultiple="false" :allowAll="false" />
        </FilterPanel>
        <p class="mb-4">
          The lines of code of {{ name }} alive over time, per year they were
          written in. Each year adds a new layer on top, which slowly erodes as
          its lines are rewritten.
        </p>

        <div class="mb-4">
        <AboutData modal title="How is this computed?">
          <p>
            Each line belongs to the commit that last changed it, like
            <code>git blame</code>, replaying the first-parent history of the
            main branch. A line is dated by the author date of its commit.
            The data is updated daily, and sampled every week.
          </p>
          <ul>
            <li>
              <strong>Scope:</strong> <code>third_party/</code> is excluded,
              except Blink for Chromium, and so are the translations
              (<code>*.xtb</code>, <code>locales/</code>) and the binary
              files.
            </li>
            <li>
              <strong>Moves:</strong> renamed and moved files keep their lines,
              using the rename detection of git.
            </li>
            <li>
              <strong>Mechanical changes:</strong> the commits listed in
              <code>.git-blame-ignore-revs</code>, the <em>Ruff: reformat</em>
              and <em>Update copyright headers</em> commits, and those touching
              at least 1000 files with at most 3 added lines per file on
              average, don't take the lines they change. Their lines keep the
              commits of the lines they replace.
            </li>
            <li>
              <strong>Imported histories:</strong> a repository merged with
              its own history, like Blink into Chromium in 2015, keeps the
              dates of its lines. They count from the merge.
            </li>
          </ul>
          <p>
            The developers have the lines of their commits, merging their
            identities like the rest of the site. The bots aren't listed, and
            the lines nobody wrote by hand go to <em>generated</em>, which
            isn't listed either. They still count in the years:
          </p>
          <ul>
            <li>
              The generated files: in a <code>gen/</code>,
              <code>generated/</code> or <code>generated_*/</code> directory,
              named <code>*autogen*</code>, the
              <code>WPT_BASE_MANIFEST*.json</code> manifests, and
              <code>testing/buildbot/*.json</code>.
            </li>
            <li>
              The vendored code: the <code>third_party/</code> directories
              inside the others, like <code>base/third_party/</code>, the
              <code>node_modules/</code> directories, and the copies of the
              Speedometer, MotionMark and Dromaeo benchmarks.
            </li>
            <li>
              The imports of the web-platform-tests and of the WebGPU
              conformance tests: the commits titled <em>Import …</em>,
              <em>Manual import …</em>, <em>Sync WPT …</em> or
              <em>Update CTS …</em> touching <code>web_tests/external/</code>,
              or <code>tests/wpt/</code> in Servo, even when landed by a
              developer. The tests written by developers keep their authors.
            </li>
          </ul>
          <p>
            These rules were checked on Chromium. Other repositories have
            their own conventions for vendored and generated code, only some
            of which are known, like Firefox's vendored libraries. Their
            developer rankings are approximate.
          </p>
          <p>The figures:</p>
          <ul>
            <li><strong>Fresh code:</strong> the share of the lines written in the last 365 days.</li>
            <li><strong>Median line age:</strong> half of the lines are older.</li>
            <li>
              <strong>Old code rewritten:</strong> the share of the lines older
              than a year, removed or rewritten during the last year.
            </li>
            <li>
              <strong>Yearly reduction:</strong> the share of the lines of a
              year gone during each of the following years, from January to
              January. The <strong>half-life</strong> applies the median rates.
            </li>
            <li>
              <strong>Markers:</strong> the 6 commits adding or removing the
              most lines at once, skipping the smaller ones close to a larger
              one. Each is explained in a few words, or by the directory where
              its lines were added or removed.
            </li>
            <li>
              <strong>Directories:</strong> up to 3 levels deep, with Blink as
              a top-level directory. Sampled every 4 weeks.
            </li>
          </ul>
          <p>
            Changing the method moves the shares by a couple of points at
            most. Not following the renames would change them the most, with
            2 to 5 more points of fresh code.
          </p>
        </AboutData>
        </div>

        <p v-if="missing" class="mb-4">
          No data yet for {{ name }}.
        </p>

        <nav class="breadcrumb mb-4" aria-label="breadcrumbs">
          <ul>
            <li :class="{ 'is-active': !directory }">
              <a href="#" @click.prevent="directory = ''">{{ name }}</a>
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
            :milestones="directory ? [] : repositoryMilestones" />
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
            :milestones="directory ? [] : repositoryMilestones" />
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
          merged. Point at a value to see the year its lines were written in,
          the year they were removed in, and their age.
        </p>
        <HexReduction v-model="crossed" :years="reductionYears" />
        <p v-if="crossed" class="crossed-detail">
          Lines written in <strong>{{ crossed.written }}</strong>, removed or
          rewritten during <strong>{{ crossed.removed }}</strong>, at
          <strong>{{ crossed.age }} year{{ crossed.age > 1 ? "s" : "" }}</strong>
          old: <strong>{{ percent(crossed.value) }}</strong>.
        </p>

        <h2 class="title is-4 mt-6">Developers</h2>
        <p class="mb-4">
          The lines each developer wrote, still alive over time, in all of
          {{ name }}.
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
import repositories_json from '../public/data/repositories.json'
// Short explanations of the largest events, by commit hash prefix.
import eventLabels from '../utils/accretion-events.json'

const route = useRoute();
const router = useRouter();


const lines = format(",");
const compact = format(".3~s");
const percent = value => value === null || isNaN(value) ? "" : format(".1%")(value);
const signedCompact = format("+.2~s");
const truncate = (text, length) => text.length > length ? `${text.slice(0, length - 1)}…` : text;
const signedPercent = value => value === null || isNaN(value) ? "" : format("+.1%")(value);
const years = value => value === null ? "" : `${value.toFixed(1)} y`;

const share = ref(route.query.share === "true");
const repository = ref(route.query.repository || "chromium");
const directory = ref(route.query.dir || "");
const developers = ref(route.query.developers
  ? route.query.developers.split(",")
  : []);

const cohorts = shallowRef(null);       // All of Chromium.
const directories = shallowRef([]);     // The summary of every directory.
const directoryData = shallowRef(null); // The selected directory.
const leaderboard = shallowRef([]);
const developerData = shallowRef([]);

const missing = ref(false);

const fetchJson = url => fetch(url)
  .then(response => response.ok ? response.json() : null)
  .catch(() => null);

const name = computed(() => repositories_json
  .find(repo => repo.dirname === repository.value)?.name || repository.value);

// The markers explaining the largest steps of the chart: the commits adding
// or removing the most lines at once. The smaller ones close to a larger one
// are skipped, as they are often part of the same story, like a revert and
// its reland.
const events = shallowRef([]);
const repositoryMilestones = computed(() => {
  const start = cohorts.value?.dates[0];
  if (!start) return [];
  const span = new Date(cohorts.value.dates.at(-1)) - new Date(start);
  const spacing = Math.max(3 * 86400e3, 0.03 * span);
  const picked = [];
  const sorted = events.value
    .filter(event => event.date >= start)
    .sort((a, b) => Math.abs(b.lines) - Math.abs(a.lines));
  for (const event of sorted) {
    if (picked.length === 6) break;
    if (!picked.some(other => Math.abs(new Date(other.date) - new Date(event.date)) < spacing)) {
      picked.push(event);
    }
  }
  return picked
    .map(event => {
      // Without an explanation: where the lines were added or removed.
      const label = eventLabels[event.hash.slice(0, 12)] || (event.path
        ? `${event.lines > 0 ? "Added" : "Removed"} ${event.path}/`
        : truncate(event.subject, 50));
      return {
        date: event.date,
        lines: event.lines,
        label: `${label} (${signedCompact(event.lines)})`,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
});

// The repositories defined as a directory of another one (cone) are shown as
// this directory.
const parentDirname = repo => repositories_json.find(parent =>
  parent.dirname.toLowerCase() === repo.parent.toLowerCase())?.dirname;
const selection = computed({
  get: () => {
    const cone = repositories_json.find(repo => repo.cone &&
      parentDirname(repo) === repository.value && repo.cone === directory.value);
    return [cone ? cone.dirname : repository.value];
  },
  set: value => {
    // After a selection, the chips also send it with the previous one: the
    // current selection is kept.
    const dirname = value.includes(selection.value[0]) ? selection.value[0] : value[0];
    const repo = repositories_json.find(repo => repo.dirname === dirname);
    if (!repo) return;
    const next = repo.cone ? parentDirname(repo) : repo.dirname;
    if (next !== repository.value) developers.value = [];
    repository.value = next;
    directory.value = repo.cone || "";
  },
});

watch(repository, async () => {
  const repo = repository.value;
  const [cohortsJson, directoriesJson, leaderboardJson, eventsJson] = await Promise.all([
    fetchJson(`/accretion/${repo}/cohorts.json`),
    fetchJson(`/accretion/${repo}/directories.json`),
    fetchJson(`/accretion/${repo}/leaderboard.json`),
    fetchJson(`/accretion/${repo}/events.json`),
  ]);
  // Another repository was selected meanwhile.
  if (repo !== repository.value) return;
  missing.value = !cohortsJson;
  cohorts.value = cohortsJson;
  events.value = eventsJson || [];
  directories.value = directoriesJson || [];
  leaderboard.value = (leaderboardJson || []).map((entry, i) => ({ ...entry, rank: i + 1 }));
  if (developers.value.length === 0) {
    developers.value = leaderboard.value.slice(0, 5).map(entry => entry.username);
  }
}, { immediate: true });

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

// The directories and the developers are grouped in files, like the importer
// does: per top-level directory, and per first letter.
const files = new Map();
const fetchFile = url => {
  if (!files.has(url)) files.set(url, fetchJson(url));
  return files.get(url);
};
const directoryPack = path => path.startsWith("third_party/blink")
  ? "third_party/blink"
  : path.split("/")[0];
const usernameBucket = username =>
  /^[a-z0-9]/i.test(username) ? username[0].toLowerCase() : "_";

watch([repository, directory], async () => {
  const pack = directory.value && await fetchFile(
    `/accretion/${repository.value}/directories/${directoryPack(directory.value)}.json`);
  directoryData.value = pack?.[directory.value] || null;
}, { immediate: true });

// The data of the selected scope: the repository, or a directory.
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
    // Within 3 weeks, for the directories sampled every 4 weeks.
    if (distance(i, year) > 21 * 86400e3) return;
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

// The value selected on the hexagonal grid of the reductions.
const crossed = shallowRef(null);
watch(scope, () => crossed.value = null);
const reductionYears = computed(() => reduction.value.rows
  .filter(row => row.label !== "Median")
  .map(row => ({ written: Number(row.label), values: row.values })));

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
    series(name.value, cohorts.value),
  ].filter(entry => entry);
});

watch(developers, async () => {
  const buckets = await Promise.all(developers.value.map(username => fetchFile(
    `/accretion/${repository.value}/usernames/${usernameBucket(username)}.json`)));
  developerData.value = developers.value
    .map((username, i) => {
      const user = buckets[i]?.users[username];
      return user && {
        label: username,
        values: user.lines.map((lines, j) => ({
          x: new Date(buckets[i].dates[user.first + j]),
          y: lines,
        })),
      };
    })
    .filter(entry => entry);
}, { immediate: true });

// The state is in the URL. Selecting a repository or a directory adds an
// entry to the history, for the back and forward buttons. The other changes
// replace it.
const query = () => ({
  repository: repository.value === "chromium" ? undefined : repository.value,
  share: share.value ? "true" : undefined,
  dir: directory.value || undefined,
  developers: developers.value.join(",") || undefined,
});
const sameQuery = (a, b) => {
  const defined = q => JSON.stringify(Object.entries(q)
    .filter(([, value]) => value !== undefined).sort());
  return defined(a) === defined(b);
};
watch([share, repository, directory, developers],
  ([, newRepository, newDirectory], [, oldRepository, oldDirectory]) => {
    if (sameQuery(query(), route.query)) return;
    const navigation = newRepository !== oldRepository || newDirectory !== oldDirectory;
    router[navigation ? "push" : "replace"]({ query: query() });
  });

// Back and forward.
watch(() => route.query, value => {
  share.value = value.share === "true";
  repository.value = value.repository || "chromium";
  directory.value = value.dir || "";
  const list = value.developers ? value.developers.split(",") : [];
  if (list.join(",") !== developers.value.join(",")) developers.value = list;
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

.crossed-detail {
  color: var(--ink-2);
  font-size: 0.875rem;
}
</style>
