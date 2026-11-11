<template>
  <div>
    <section class="section">
      <div class="container content page-view">
        <h1 class="title">Page view</h1>
        <UiLoading v-model="loading" :is-full-page="false" />
        <template v-if="quarters.length">
          <p>
            Since <strong>{{ days[0].date }}</strong>, the website has
            been visited <strong>{{ number(totalHits) }}</strong> times,
            with <strong>{{ number(json.today_hits) }}</strong> visits today.
          </p>

          <h2 class="subtitle">Per quarter</h2>
          <table class="quarters">
            <thead>
              <tr>
                <th>Quarter</th>
                <th>Page views</th>
                <th class="number">Per day</th>
                <th class="number" title="Visits per day, compared to the previous quarter">Growth</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="quarter in quarters"
                :key="quarter.label"
                :class="{ selected: quarter.label === range }"
                tabindex="0"
                :title="`Show ${quarter.label} in the timeline`"
                @click="range = quarter.label"
                @keydown.enter="range = quarter.label">
                <td>{{ quarter.label }}</td>
                <td>
                  <div class="bar-cell">
                    <div class="bar" :style="{ width: 70 * quarter.hits / maxQuarterHits + '%' }" />
                    <span>{{ number(quarter.hits) }}</span>
                    <small v-if="quarter.pace" class="pace">
                      on pace for {{ number(quarter.pace) }}
                    </small>
                  </div>
                </td>
                <td class="number">{{ number(quarter.perDay) }}</td>
                <td
                  class="number"
                  :class="{ up: quarter.growth > 0, down: quarter.growth < 0 }">
                  {{ quarter.growth === null ? "" : growth(quarter.growth) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="has-text-centered">
            <small>
              {{ excludedFrom }} to {{ excludedTo }} are left out: tests and
              dev servers were counted as visits.
            </small>
          </p>

          <h2 class="subtitle">Timeline</h2>
          <UiField>
            <UiSegmented
              v-model="range"
              aria-label="Time range"
              :options="[
                { value: 'all', label: 'All' },
                ...quarters.map(quarter => ({ value: quarter.label, label: quarter.label })),
              ]" />
          </UiField>
          <div class="timeline">
            <LineChart :data="data" :formatter="number" />
          </div>

          <h2 class="subtitle">Per day of the week</h2>
          <BarChart
            time-label="Day"
            value-label="Page views per day"
            :data="weekdays"
            :formatter="number" />
        </template>
        <p v-else-if="!loading">The visit counts could not be loaded.</p>

        <hr>
        <p class="has-text-centered">
          Powered by <a href="https://hitscounter.dev/">hitscounter</a>.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";

const target = new URL('https://chrome-commit-tracker.arthursonzogni.com');
const hitscounter = new URL('https://hitscounter.dev/api/history');
hitscounter.searchParams.append('url', target.toString());

const number = format(",.0f");
const growth = format("+.0%");

// Days polluted by tests and dev servers counted as visits, before
// Navbar.vue counted the deployed website's visits only.
const excludedFrom = "2026-10-24";
const excludedTo = "2026-10-28";
const isExcluded = (date: string) => date >= excludedFrom && date <= excludedTo;

const DAY = 24 * 60 * 60 * 1000;
const dateString = (time: number) => new Date(time).toISOString().slice(0, 10);
const quarterOf = (date: string) =>
  `${date.slice(0, 4)} Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;

const loading = ref(true);
const json = shallowRef<any>({});

interface Day {
  date: string;
  hits: number | null; // null for the excluded days.
  average: number | null; // Over the last 7 days.
  isToday: boolean;
}

// Every calendar day since the first visit.
const days = computed<Day[]>(() => {
  const history = json.value.history ?? [];
  if (!history.length) return [];
  const byDate = new Map(history.map((item: any) => [item.hit_date, item]));
  const first = Date.parse(history[0].hit_date);
  const last = Date.parse(history[history.length - 1].hit_date);
  const result: Day[] = [];
  for (let time = first; time <= last; time += DAY) {
    const date = dateString(time);
    const item: any = byDate.get(date);
    result.push({
      date,
      hits: isExcluded(date) ? null : (item?.hit_count ?? 0),
      average: null,
      isToday: !!item?.is_today,
    });
  }
  result.forEach((day, i) => {
    if (day.hits === null) return;
    const week = result.slice(Math.max(0, i - 6), i + 1)
      .filter(other => other.hits !== null);
    day.average = week.reduce((sum, other) => sum + other.hits!, 0) / week.length;
  });
  return result;
});

const totalHits = computed(() => json.value.total_hits -
  (json.value.history ?? [])
    .filter((item: any) => isExcluded(item.hit_date))
    .reduce((sum: number, item: any) => sum + item.hit_count, 0));

// Oldest first.
const quarters = computed(() => {
  const byQuarter = new Map<string, Day[]>();
  for (const day of days.value) {
    const quarter = quarterOf(day.date);
    byQuarter.set(quarter, [...(byQuarter.get(quarter) ?? []), day]);
  }
  let previousPerDay: number | null = null;
  return [...byQuarter].map(([label, quarterDays]) => {
    const counted = quarterDays.filter(day => day.hits !== null);
    const hits = counted.reduce((sum, day) => sum + day.hits!, 0);
    const perDay = hits / counted.length;
    const growth = previousPerDay === null ? null : perDay / previousPerDay - 1;
    previousPerDay = perDay;

    // The current quarter's projected total.
    let pace = null;
    if (quarterDays[quarterDays.length - 1].isToday) {
      const [year, q] = label.split(" Q").map(Number);
      const length = (Date.UTC(year, 3 * q) - Date.UTC(year, 3 * q - 3)) / DAY;
      pace = perDay * length;
    }
    return { label, days: quarterDays, hits, perDay, growth, pace };
  });
});
const maxQuarterHits = computed(() =>
  Math.max(...quarters.value.map(quarter => quarter.pace ?? quarter.hits)));

// The quarter shown by the timeline, e.g. "2026 Q4", or "all".
const { range } = useUrlState({ range: urlCodecs.string("all") });

const selectedDays = computed(() =>
  quarters.value.find(quarter => quarter.label === range.value)?.days ?? days.value);

const data = computed(() => [
  {
    label: 'Page view',
    color: 'color-mix(in srgb, var(--accent) 45%, transparent)',
    strokeWidth: 1.25,
    values: selectedDays.value.map(day => ({ x: new Date(day.date), y: day.hits })),
  },
  {
    label: '7-day average',
    color: 'var(--accent)',
    strokeWidth: 2.5,
    values: selectedDays.value.map(day => ({ x: new Date(day.date), y: day.average })),
  },
]);

// The average visits per day of the week, over the selected range. Today is
// left out, as it isn't over.
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdays = computed(() => {
  const sums = weekdayNames.map(() => ({ hits: 0, days: 0 }));
  for (const day of selectedDays.value) {
    if (day.hits === null || day.isToday) continue;
    const sum = sums[new Date(day.date).getUTCDay()];
    sum.hits += day.hits;
    sum.days += 1;
  }
  // Monday first.
  return [1, 2, 3, 4, 5, 6, 0].map(i => ({
    label: weekdayNames[i].slice(0, 3),
    values: [{
      label: weekdayNames[i],
      value: sums[i].days ? sums[i].hits / sums[i].days : 0,
      color: 'var(--accent)',
    }],
  }));
});

onMounted(async () => {
  try {
    const response = await fetch(hitscounter.toString());
    json.value = await response.json();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
  loading.value = false;
});

</script>

<style scoped>

.page-view {
  min-height: 200px;
  position: relative;
}

.timeline {
  height: 320px;
}

.quarters {
  width: 100%;
}

.quarters th,
.quarters td {
  padding: 0.3rem 0.5rem;
  vertical-align: middle;
  white-space: nowrap;
}

.quarters th:nth-child(2) {
  width: 100%;
}

.quarters td:nth-child(2) {
  white-space: normal;
}

.quarters tbody tr {
  cursor: pointer;
}

.quarters tbody tr:hover,
.quarters tbody tr:focus-visible {
  background: var(--surface-sunken);
}

.quarters tbody tr.selected {
  background: var(--accent-soft);
}

.quarters .number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bar-cell {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.5rem;
  white-space: normal;
}

.bar {
  background: var(--accent);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  height: 1.1rem;
  opacity: 0.7;
}

.pace {
  color: var(--muted);
}

@media (max-width: 600px) {
  .quarters th,
  .quarters td {
    padding: 0.3rem 0.25rem;
  }
}

.up {
  color: var(--tag-success-ink);
}

.down {
  color: var(--tag-danger-ink);
}

</style>
