<template>
  <div>
    <section class="section">
      <div class="container">

        <div v-if="!loaded" class="review-loading">Loading…</div>

        <div v-else-if="!entry || !total" class="content">
          <h1 class="title">No contributions from “{{ name }}” in {{ year }}</h1>
          <p><NuxtLink :to="profileLink">See the profile of {{ name }}</NuxtLink></p>
        </div>

        <template v-else>
          <nav class="review-years" aria-label="Years">
            <NuxtLink :to="profileLink" class="review-back">
              <UiIcon name="arrow-left" size="small" /> {{ name }}
            </NuxtLink>
            <span class="review-year-links">
              <NuxtLink v-if="year > firstYear" :to="yearLink(year - 1)">{{ year - 1 }}</NuxtLink>
              <span aria-current="page">{{ year }}</span>
              <NuxtLink v-if="year < lastYear" :to="yearLink(year + 1)">{{ year + 1 }}</NuxtLink>
            </span>
          </nav>

          <header class="review-header">
            <p class="review-eyebrow">Year in review{{ isCurrentYear ? ", so far" : "" }}</p>
            <h1 class="review-title">{{ name }} in {{ year }}</h1>
            <p class="review-lede">
              {{ plural(authored.length, "commit") }} and {{ plural(reviewed.length, "review") }}
              across {{ plural(yearRepositories.length, "repository", "repositories") }},
              on {{ plural(activeDays, "day") }}.
              <template v-if="rank">
                The #{{ number(rank.position) }} author of {{ rank.repository }} this year,
                out of {{ number(rank.total) }}.
              </template>
            </p>
          </header>

          <dl class="review-stats">
            <div v-for="stat in stats" :key="stat.label" class="review-stat">
              <dt>{{ stat.label }}</dt>
              <dd>{{ stat.value }}</dd>
              <span v-if="stat.delta" class="review-delta" :class="stat.delta > 0 ? 'is-up' : 'is-down'">
                {{ stat.delta > 0 ? "+" : "" }}{{ stat.delta }}% vs {{ year - 1 }}
              </span>
            </div>
          </dl>

          <h2 class="title">Month by month</h2>
          <div class="review-months" role="img" :aria-label="monthsLabel">
            <div v-for="(month, i) in months" :key="i" class="review-month">
              <span class="month-count">{{ month.author + month.review || "" }}</span>
              <span class="month-bar">
                <span class="bar-review" :style="{ height: barHeight(month.review) }"></span>
                <span class="bar-author" :style="{ height: barHeight(month.author) }"></span>
              </span>
              <span class="month-name" :class="{ 'is-busiest': i === busiestMonth }">{{ MONTHS[i] }}</span>
            </div>
          </div>
          <p class="legend">
            <span class="dot bar-author"></span> Commits
            <span class="dot bar-review"></span> Reviews
          </p>

          <h2 class="title">Rhythm</h2>
          <ul class="review-facts">
            <li><strong>{{ MONTH_NAMES[busiestMonth] }}</strong> was the busiest month.</li>
            <li>Most active on <strong>{{ WEEKDAYS[busiestWeekday] }}s</strong>, around <strong>{{ busiestHour }}:00 UTC</strong>.</li>
            <li>Active in <strong>{{ activeWeeks }} of {{ plural(weeksInYear, "week") }}</strong>, the longest streak: <strong>{{ plural(longestWeekStreak.length, "week") }}</strong> in a row, from {{ formatDay(new Date(longestWeekStreak.from)) }} to {{ formatDay(new Date(longestWeekStreak.to)) }}.</li>
            <li>The longest streak of working days: <strong>{{ plural(longestWorkingStreak.length, "day") }}</strong> in a row, from {{ formatDay(new Date(longestWorkingStreak.from)) }} to {{ formatDay(new Date(longestWorkingStreak.to)) }}.</li>
            <li>The busiest day: <strong>{{ plural(busiestDay.count, "contribution") }}</strong> on <strong>{{ formatDay(new Date(busiestDay.day)) }}</strong>.</li>
            <li>The first contribution of the year on <strong>{{ formatDay(first) }}</strong>, the last on <strong>{{ formatDay(last) }}</strong>.</li>
          </ul>

          <div class="review-people">
            <div v-if="reviewers.length">
              <h2 class="title">Reviewed your code</h2>
              <ol class="review-peers">
                <li v-for="peer in reviewers" :key="peer.name">
                  <NuxtLink :to="`/developers/${encodeURIComponent(peer.name)}/${year}`">{{ peer.name }}</NuxtLink>
                  <span>{{ number(peer.count) }}</span>
                </li>
              </ol>
            </div>
            <div v-if="reviewees.length">
              <h2 class="title">You reviewed</h2>
              <ol class="review-peers">
                <li v-for="peer in reviewees" :key="peer.name">
                  <NuxtLink :to="`/developers/${encodeURIComponent(peer.name)}/${year}`">{{ peer.name }}</NuxtLink>
                  <span>{{ number(peer.count) }}</span>
                </li>
              </ol>
            </div>
          </div>

          <h2 class="title">Repositories</h2>
          <ul class="review-repositories">
            <li v-for="repository in yearRepositories" :key="repository.dirname">
              <NuxtLink :to="individualsLink(repository.dirname)">{{ repository.name }}</NuxtLink>
              <span>{{ plural(repository.author, "commit") }} · {{ plural(repository.review, "review") }}</span>
            </li>
          </ul>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import repositories_json from '../../../public/data/repositories.json';
import { shardOf } from '~/utils/badges';
import { formatDeveloperYearDescription, formatDeveloperYearTitle } from '~/utils/pageMeta';
import { fetchUsernamesSummary } from '~/utils/usernamesSummary';

// A developer's year: computed from their commits and reviews in each
// repository (/data/<repository>/usernames/<name>.json).

const route = useRoute();
const { $chromiumData } = useNuxtApp();
const name = computed(() => String(route.params.name));
const year = computed(() => Number(route.params.year));
const isCurrentYear = computed(() => year.value === new Date().getUTCFullYear());

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const number = new Intl.NumberFormat("en").format;
const plural = (count: number, word: string, words = `${word}s`) =>
  `${number(count)} ${count === 1 ? word : words}`;
const formatDay = (date: Date) =>
  date.toLocaleDateString("en", { month: "long", day: "numeric", timeZone: "UTC" });

type YearRecord = {
  date: string;
  kind: "author" | "review";
  peers: string[];
  additions: number;
  deletions: number;
  files: number;
  repository: string;
};

// scripts/derive-developers.mjs: {repository: [authored, reviews, first year, last year]}
const entry = shallowRef<Record<string, number[]> | null>(null);
const records = shallowRef<YearRecord[]>([]);
const rank = shallowRef<{ position: number; total: number; repository: string } | null>(null);
const loaded = ref(false);

const fetchJson = async (url: string) => {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
};

// The repositories, without the directories of another one (e.g. blink in
// chromium): their commits are also counted in the parent.
const topLevel = (repositories: Record<string, number[]>) =>
  Object.keys(repositories).filter(dirname => {
    const parent = repositories_json.find(repo => repo.dirname === dirname)?.parent?.toLowerCase();
    return !parent || !repositories[parent];
  });

let requestId = 0;

const load = async () => {
  const id = ++requestId;
  const devName = name.value;
  const targetYear = year.value;

  loaded.value = false;
  rank.value = null;

  const shard = await fetchJson(`/data/developers/${shardOf(devName)}.json`);
  if (id !== requestId) return;
  entry.value = shard?.[devName] ?? null;
  records.value = [];

  if (entry.value) {
    // The previous year too, for the comparison.
    const active = topLevel(entry.value).filter(dirname => {
      const [, , first, last] = entry.value![dirname];
      return first <= targetYear && targetYear - 1 <= last;
    });
    const lists = await Promise.all(
      active.map(async dirname => {
        const result = await $chromiumData(dirname, devName);
        return result.data
          .filter(record => {
            if (record.kind !== "author" && record.kind !== "review") return false;
            const y = Number(record.date.slice(0, 4));
            return y === targetYear || y === targetYear - 1;
          })
          .map(record => ({
            date: record.date,
            kind: record.kind as "author" | "review",
            peers: record.peers,
            additions: record.additions ?? 0,
            deletions: record.deletions ?? 0,
            files: record.files ?? 0,
            repository: dirname,
          }));
      }),
    );
    if (id !== requestId) return;
    records.value = lists.flat();
  }
  loaded.value = true;

  // The rank among the authors of the main repository of the year.
  const primary = yearRepositories.value[0];
  if (primary?.author) {
    const summary = await fetchUsernamesSummary(primary.dirname, "commit", "yearly", "author");
    if (id !== requestId) return;
    const counts = Object.values(summary)
      .map(years => years[targetYear] ?? 0)
      .filter(count => count > 0);
    rank.value = {
      position: 1 + counts.filter(count => count > primary.author).length,
      total: counts.length,
      repository: primary.name,
    };
  }
};
watch([name, year], load, { immediate: true });

const inYear = computed(() => records.value.filter(r => Number(r.date.slice(0, 4)) === year.value));
const authored = computed(() => inYear.value.filter(r => r.kind === "author"));
const reviewed = computed(() => inYear.value.filter(r => r.kind === "review"));
const total = computed(() => inYear.value.length);

const firstYear = computed(() => Math.min(...Object.values(entry.value ?? {}).map(r => r[2])));
const lastYear = computed(() => Math.max(...Object.values(entry.value ?? {}).map(r => r[3])));

const sum = (list: YearRecord[], key: "additions" | "deletions" | "files") =>
  list.reduce((acc, r) => acc + (r[key] ?? 0), 0);

// The change from the previous year, in percent, when it had some.
const delta = (current: number, kind: string) => {
  const previous = records.value
    .filter(r => Number(r.date.slice(0, 4)) === year.value - 1 && r.kind === kind).length;
  return previous && !isCurrentYear.value ? Math.round(100 * (current - previous) / previous) : 0;
};

const stats = computed(() => [
  { label: "Commits", value: number(authored.value.length), delta: delta(authored.value.length, "author") },
  { label: "Reviews", value: number(reviewed.value.length), delta: delta(reviewed.value.length, "review") },
  { label: "Lines added", value: number(sum(authored.value, "additions")) },
  { label: "Lines removed", value: number(sum(authored.value, "deletions")) },
]);

const months = computed(() => {
  const out = Array.from({ length: 12 }, () => ({ author: 0, review: 0 }));
  for (const r of inYear.value) {
    out[Number(r.date.slice(5, 7)) - 1][r.kind]++;
  }
  return out;
});
const maxMonth = computed(() => Math.max(1, ...months.value.map(m => m.author + m.review)));
const barHeight = (count: number) => `${100 * count / maxMonth.value}%`;
const busiestMonth = computed(() => {
  const totals = months.value.map(m => m.author + m.review);
  return totals.indexOf(Math.max(...totals));
});
const monthsLabel = computed(() => months.value
  .map((m, i) => `${MONTH_NAMES[i]}: ${m.author} commits, ${m.review} reviews`).join("; "));

const argmax = (counts: number[]) => counts.indexOf(Math.max(...counts));
const busiestWeekday = computed(() => {
  const counts = new Array(7).fill(0);
  inYear.value.forEach(r => counts[new Date(r.date).getUTCDay()]++);
  return argmax(counts);
});
const busiestHour = computed(() => {
  const counts = new Array(24).fill(0);
  inYear.value.forEach(r => counts[new Date(r.date).getUTCHours()]++);
  return argmax(counts);
});

const days = computed(() => [...new Set(inYear.value.map(r => r.date.slice(0, 10)))].sort());
const activeDays = computed(() => days.value.length);
const DAY = 86400000;

// The longest run of sorted days whose keys follow each other, with its first
// and last day. Its length counts the distinct keys.
const longestRun = (sorted: string[], key: (time: number) => number) => {
  let longest = { length: 0, from: "", to: "" };
  let current = { length: 0, from: "", to: "" };
  let previous = NaN;
  for (const day of sorted) {
    const value = key(Date.parse(day));
    if (value - previous === 1) {
      current = { ...current, length: current.length + 1, to: day };
    } else if (value !== previous) {
      current = { length: 1, from: day, to: day };
    } else {
      current = { ...current, to: day };
    }
    if (current.length >= longest.length) longest = current;
    previous = value;
  }
  return longest;
};

// Weeks start on Monday. The epoch was a Thursday.
const weekOf = (time: number) => Math.floor((time / DAY + 3) / 7);
const activeWeeks = computed(() => new Set(days.value.map(day => weekOf(Date.parse(day)))).size);
const weeksInYear = computed(() => {
  const end = Math.min(Date.UTC(year.value, 11, 31), Date.now());
  return weekOf(end) - weekOf(Date.UTC(year.value, 0, 1)) + 1;
});
const longestWeekStreak = computed(() => longestRun(days.value, weekOf));

// Weekends neither break nor extend a streak of working days.
const isWeekend = (date: Date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;
const workingDayOf = (time: number) => {
  const day = Math.floor(time / DAY) + 3; // Days since a Monday.
  return 5 * Math.floor(day / 7) + day % 7;
};
const longestWorkingStreak = computed(() => longestRun(
  days.value.filter(day => !isWeekend(new Date(day))), workingDayOf));

const busiestDay = computed(() => {
  const counts = new Map<string, number>();
  inYear.value.forEach(r => counts.set(r.date.slice(0, 10), (counts.get(r.date.slice(0, 10)) ?? 0) + 1));
  const [day, count] = [...counts].reduce((a, b) => b[1] > a[1] ? b : a);
  return { day, count };
});
const first = computed(() => new Date(days.value[0]));
const last = computed(() => new Date(days.value.at(-1)!));

// The peers of a list of records, most frequent first.
const topPeers = (list: YearRecord[]) => {
  const counts = new Map<string, number>();
  list.forEach(r => r.peers.forEach(peer => counts.set(peer, (counts.get(peer) ?? 0) + 1)));
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};
const reviewers = computed(() => topPeers(authored.value));
const reviewees = computed(() => topPeers(reviewed.value));

const yearRepositories = computed(() => {
  const out = new Map<string, { dirname: string, name: string, author: number, review: number }>();
  for (const r of inYear.value) {
    const repository = out.get(r.repository) ?? {
      dirname: r.repository,
      name: repositories_json.find(repo => repo.dirname === r.repository)?.name ?? r.repository,
      author: 0,
      review: 0,
    };
    repository[r.kind]++;
    out.set(r.repository, repository);
  }
  return [...out.values()].sort((a, b) => (b.author + b.review) - (a.author + a.review));
});

const profileLink = computed(() => `/developers/${encodeURIComponent(name.value)}`);
const yearLink = (y: number) => `${profileLink.value}/${y}`;
const individualsLink = (repository: string) =>
  `/individuals?developers=${encodeURIComponent(name.value)}&repositories=${repository}`;

// Also written into the generated HTML by scripts/static-meta.mjs.
useSeoMeta({
  title: () => formatDeveloperYearTitle(name.value, year.value),
  ogTitle: () => formatDeveloperYearTitle(name.value, year.value),
  description: () => total.value
    ? formatDeveloperYearDescription(
        name.value,
        year.value,
        authored.value.length,
        reviewed.value.length,
        yearRepositories.value.length,
      )
    : `The year ${year.value} of ${name.value} in the web platform.`,
});
</script>

<style scoped>
.review-loading {
  color: var(--muted);
  padding: 4rem 0;
}

.review-years {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 2rem;
}

.review-back {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  gap: 0.25rem;
}

.review-year-links {
  display: flex;
  font-family: var(--font-mono);
  gap: 1rem;
}

.review-year-links [aria-current] {
  color: var(--ink);
  font-weight: 600;
}

.review-header {
  margin-bottom: 2rem;
}

.review-eyebrow {
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.review-title {
  color: var(--ink);
  font-size: clamp(2rem, 1.2rem + 4vw, 3.5rem);
  font-weight: 680;
  letter-spacing: -0.04em;
  line-height: 1.05;
  margin: 0.4rem 0 1rem;
  overflow-wrap: anywhere;
}

.review-lede {
  color: var(--ink-2);
  font-size: 1.1rem;
  max-width: 44rem;
}

.review-stats {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 3rem;
  overflow: hidden;
}

@media (min-width: 769px) {
  .review-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.review-stat {
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  margin: 0 -1px -1px 0;
  padding: 1rem 1.25rem;
}

.review-stat dt {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 520;
}

.review-stat dd {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
  font-weight: 550;
  letter-spacing: -0.03em;
  margin: 0.15rem 0 0;
}

.review-delta {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.review-delta.is-up {
  color: var(--tag-success-ink, #1baf7a);
}

.review-delta.is-down {
  color: var(--muted);
}

.review-months {
  align-items: end;
  display: grid;
  gap: 0.4rem;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  height: 12rem;
  margin-bottom: 0.75rem;
}

.review-month {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  height: 100%;
}

.month-count {
  color: var(--muted);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.month-bar {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: end;
  width: 100%;
}

.month-bar > span {
  display: block;
}

.month-bar > span:first-child {
  border-radius: 4px 4px 0 0;
}

.month-name {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.month-name.is-busiest {
  color: var(--ink);
  font-weight: 600;
}

.bar-author {
  background: var(--series-1);
}

.bar-review {
  background: var(--series-3);
}

.legend {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 0.8rem;
  gap: 0.4rem;
  margin-bottom: 3rem;
}

.legend .dot {
  border-radius: 50%;
  display: inline-block;
  height: 0.55rem;
  margin-left: 0.6rem;
  width: 0.55rem;
}

.legend .dot:first-child {
  margin-left: 0;
}

.review-facts {
  color: var(--ink-2);
  display: grid;
  gap: 0.5rem;
  margin-bottom: 3rem;
}

.review-people {
  display: grid;
  gap: 0 2rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

.review-peers,
.review-repositories {
  margin-bottom: 3rem;
  padding: 0;
}

.review-peers li,
.review-repositories li {
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.review-peers span,
.review-repositories span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
