<template>
  <div class="pulse-page">
    <section class="section pb-4">
      <SplitLayout>
        <template #aside>
          <FilterPanel
            :summary="listSummary(repositoryNames(repositories), 'repositories')"
          >
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

        <h1 class="sr-only">Repositories heatmap</h1>

        <FetchError v-if="loadError" class="mb-4" :message="loadError" @retry="loadRepositories" />

        <div v-else-if="repositories.length === 0" class="empty-state">
          <UiIcon name="pulse" size="medium" />
          <p>Select at least one repository to inspect its commit rhythm.</p>
        </div>

        <div v-else-if="loading && !rawAligned">
          <div class="skeleton" style="height: 220px; width: 100%; border-radius: var(--radius-lg)" />
        </div>

        <template v-else-if="pulseStats.totalCommits > 0">
          <!-- Weekly Rhythm: Day-of-week × Hour-of-day -->
          <div class="panel-card">
            <div class="section-head">
              <div>
                <h2 class="section-title">Weekly rhythm</h2>
                <p class="section-subtitle">
                  Commits by day of week and hour of day.
                  Peak hour: <strong>{{ pulseStats.peakHourLabel }}</strong>
                  ({{ fmtInt(pulseStats.peakHourCount) }} commits).
                </p>
              </div>
              <UiSegmented
                v-model="tzMode"
                :options="tzOptions"
                aria-label="Timezone"
              />
            </div>

            <div
              class="rhythm-container mt-4"
              ref="rhythmEl"
              @mouseleave="hoveredCell = null"
            >
              <div class="rhythm-scroll">
                <div class="rhythm-grid" role="img" aria-label="Commits by day of week and hour of day">
                  <!-- Header row: hours -->
                  <div class="rhythm-corner" />
                  <div class="rhythm-hours">
                    <span v-for="h in 24" :key="h - 1" class="rhythm-hour-label">
                      {{ (h - 1) % 3 === 0 ? String(h - 1).padStart(2, "0") : "" }}
                    </span>
                  </div>
                  <div class="rhythm-share-head">Share</div>

                  <!-- 7 weekday rows (Mon .. Sun) -->
                  <template v-for="row in weeklyRows" :key="row.dayName">
                    <div class="rhythm-day-label" :class="{ 'is-weekend': row.isWeekend }">
                      {{ row.dayName }}
                    </div>
                    <div class="rhythm-cells">
                      <div
                        v-for="cell in row.cells"
                        :key="cell.hour"
                        class="rhythm-cell"
                        :style="{ backgroundColor: cell.color }"
                        @mouseenter="onCellEnter(row.dayName, cell, $event)"
                        @mousemove="onCellMove($event)"
                      />
                    </div>
                    <div class="rhythm-share">
                      <span class="rhythm-share-bar-track">
                        <span
                          class="rhythm-share-bar-fill"
                          :class="{ 'is-weekend': row.isWeekend }"
                          :style="{ width: row.barPct + '%' }"
                        />
                      </span>
                      <span class="rhythm-share-pct">{{ row.sharePct }}%</span>
                    </div>
                  </template>
                </div>
              </div>

              <div
                v-if="hoveredCell"
                class="rhythm-tooltip"
                :style="{ left: rhythmTooltip.x + 'px', top: rhythmTooltip.y + 'px' }"
              >
                <div class="tooltip-title">
                  {{ hoveredCell.dayName }} · {{ hoveredCell.hourLabel }} {{ tzShortLabel }}
                </div>
                <div class="tooltip-meta">
                  <strong>{{ fmtInt(hoveredCell.count) }}</strong>
                  {{ hoveredCell.count === 1 ? "commit" : "commits" }}
                  ({{ hoveredCell.pct }}% of total)
                </div>
              </div>
            </div>
          </div>

          <!-- Global Commits Per Week Across All Years -->
          <div v-if="weeklySeries.length > 0" class="panel-card mt-5">
            <div class="section-head">
              <div>
                <h2 class="section-title">Commits per week</h2>
                <p class="section-subtitle">
                  <template v-if="effectiveWeeklyWindow === 1">
                    Weekly commit volume across the selected period.
                  </template>
                  <template v-else>
                    {{ effectiveWeeklyWindow }}-week rolling average across the selected period.
                  </template>
                </p>
              </div>
              <UiSegmented
                v-model="weeklyWindow"
                :options="weeklyWindowOptions"
                aria-label="Weekly averaging window"
              />
            </div>
            <div class="weekly-chart-wrap mt-3">
              <LineChart :data="weeklySeries" :formatter="formatWeekly" />
            </div>
          </div>

          <!-- Daily Calendar Heatmap -->
          <div class="panel-card mt-5">
            <div class="section-head mb-2">
              <div>
                <h2 class="section-title">Daily calendar</h2>
                <p class="section-subtitle">
                  Commits per day (UTC). Hover any square for the exact count.
                </p>
              </div>
            </div>
            <CalendarHeatmap :data="dailySeries" />
          </div>
        </template>

        <div v-else-if="rawAligned" class="empty-state mt-5">
          <p>No commits in the selected date range.</p>
        </div>
      </SplitLayout>
    </section>

    <section class="section sticky bottom">
      <UiField expanded>
        <Timeline v-model="dates" />
      </UiField>
    </section>
  </div>
</template>

<script setup lang="ts">
import { scalePow } from "d3-scale";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchJson, formatFetchError } from "~/utils/fetchJson";
import { listSummary, repositoryNames } from "~/utils/filter-summary";

interface CommitsPerHourResponse {
  startDate: string;
  commits: number[];
}

interface AlignedCommitsPerHour {
  minDateMs: number;
  repos: string[];
  summed: number[];
}

interface RhythmCell {
  hour: number;
  count: number;
  color: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Display Mon..Sun so the weekend sits together at the bottom.
const DISPLAY_DAYS = [
  { jsDay: 1, name: "Mon", isWeekend: false },
  { jsDay: 2, name: "Tue", isWeekend: false },
  { jsDay: 3, name: "Wed", isWeekend: false },
  { jsDay: 4, name: "Thu", isWeekend: false },
  { jsDay: 5, name: "Fri", isWeekend: false },
  { jsDay: 6, name: "Sat", isWeekend: true },
  { jsDay: 0, name: "Sun", isWeekend: true },
];

const { repositories, dates } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
  dates: urlCodecs.dateRange("2000-01-01"),
});

const rawAligned = shallowRef<AlignedCommitsPerHour | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const tzMode = ref<"local" | "utc">("local");
const weeklyWindow = ref<"auto" | 1 | 4 | 13 | 26 | 52>("auto");
const themeTick = ref(0);

const rhythmEl = ref<HTMLElement | null>(null);
const hoveredCell = ref<{
  dayName: string;
  hourLabel: string;
  count: number;
  pct: string;
} | null>(null);
const rhythmTooltip = reactive({ x: 0, y: 0 });

const localTzName = computed(() => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(
      new Date(),
    );
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "Local";
  } catch {
    return "Local";
  }
});

const tzOptions = computed(() => [
  { value: "local", label: `Local (${localTzName.value})` },
  { value: "utc", label: "UTC" },
]);

const tzShortLabel = computed(() => (tzMode.value === "utc" ? "UTC" : localTzName.value));

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const formatWeekly = (n: number) => `${fmtInt(n)} / wk`;

const repoListLabel = computed(() => {
  const names = repositoryNames(repositories.value);
  if (names.length === 0) return "selected repositories";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} repositories`;
});

let requestId = 0;

const loadRepositories = async () => {
  const id = ++requestId;
  const repos = [...repositories.value];
  loadError.value = null;
  if (repos.length === 0) {
    rawAligned.value = null;
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const jsons = await Promise.all(
      repos.map((repo) =>
        fetchJson<CommitsPerHourResponse>(`/data/${repo}/commits_per_hour.json`, { cache: true }),
      ),
    );
    if (id !== requestId) return;

    const minStartDate = jsons
      .map((json) => json.startDate)
      .reduce((a, b) => (a < b ? a : b));
    const minDateMs = new Date(minStartDate).getTime();
    const size = Math.max(0, ...jsons.map((json) => json.commits.length));

    // Sum all selected repositories into a single hourly timeline.
    const summed = new Array<number>(size).fill(0);
    for (const json of jsons) {
      const offset = size - json.commits.length;
      for (let i = 0; i < json.commits.length; i++) {
        summed[i + offset] += json.commits[i];
      }
    }

    rawAligned.value = { minDateMs, repos, summed };
    loading.value = false;
  } catch (error) {
    if (id === requestId) {
      loading.value = false;
      console.error("Failed to fetch commits_per_hour:", error);
      loadError.value = formatFetchError(error, "Failed to load heatmap data.");
    }
  }
};

// Single pass over the selected time range: computes daily points, 7x24 matrix, and summary stats.
const aggregated = computed(() => {
  const raw = rawAligned.value;
  if (!raw || raw.summed.length === 0) {
    return {
      dailyPoints: [] as { x: Date; y: number }[],
      matrix: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
      totalCommits: 0,
      activeDays: 0,
      peakDayCount: 0,
      peakDayMs: 0,
    };
  }

  const { minDateMs, summed } = raw;
  const size = summed.length;
  const d0Ms = dates.value[0].getTime();
  const d1Ms = dates.value[1].getTime();
  const startIdx = Math.max(0, Math.ceil((d0Ms - minDateMs) / HOUR_MS));
  const endIdx = Math.min(size - 1, Math.floor((d1Ms - minDateMs) / HOUR_MS));

  const matrix = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  if (endIdx < startIdx) {
    return {
      dailyPoints: [] as { x: Date; y: number }[],
      matrix,
      totalCommits: 0,
      activeDays: 0,
      peakDayCount: 0,
      peakDayMs: 0,
    };
  }

  const useLocal = tzMode.value === "local";
  const localOffsetMs = useLocal ? -new Date().getTimezoneOffset() * 60 * 1000 : 0;

  const dailyMap = new Map<number, number>();
  let totalCommits = 0;

  // Trim leading/trailing zeros so the calendar starts at the first active day in range.
  let firstActiveIdx = -1;
  let lastActiveIdx = -1;
  for (let i = startIdx; i <= endIdx; i++) {
    if (summed[i] > 0) {
      if (firstActiveIdx === -1) firstActiveIdx = i;
      lastActiveIdx = i;
    }
  }

  if (firstActiveIdx === -1) {
    return {
      dailyPoints: [] as { x: Date; y: number }[],
      matrix,
      totalCommits: 0,
      activeDays: 0,
      peakDayCount: 0,
      peakDayMs: 0,
    };
  }

  for (let i = firstActiveIdx; i <= lastActiveIdx; i++) {
    const val = summed[i];
    const tsMs = minDateMs + i * HOUR_MS;
    const utcDayMs = Math.floor(tsMs / DAY_MS) * DAY_MS;
    dailyMap.set(utcDayMs, (dailyMap.get(utcDayMs) ?? 0) + val);

    if (val > 0) {
      totalCommits += val;
      const shiftedMs = tsMs + localOffsetMs;
      const totalHours = Math.floor(shiftedMs / HOUR_MS);
      const hour = ((totalHours % 24) + 24) % 24;
      // 1970-01-01 was a Thursday (4)
      const jsDay = (((Math.floor(totalHours / 24) + 4) % 7) + 7) % 7;
      matrix[jsDay][hour] += val;
    }
  }

  const dailyPoints: { x: Date; y: number }[] = [];
  let peakDayCount = 0;
  let peakDayMs = 0;
  for (const [dayMs, count] of dailyMap.entries()) {
    dailyPoints.push({ x: new Date(dayMs), y: count });
    if (count > peakDayCount) {
      peakDayCount = count;
      peakDayMs = dayMs;
    }
  }

  return {
    dailyPoints,
    matrix,
    totalCommits,
    activeDays: dailyPoints.length,
    peakDayCount,
    peakDayMs,
  };
});

const dailySeries = computed(() => {
  if (aggregated.value.dailyPoints.length === 0) return [];
  return [{ label: repoListLabel.value, values: aggregated.value.dailyPoints }];
});

// Chronological weekly commits across all selected years (Monday-aligned UTC weeks).
const rawWeeklyBuckets = computed(() => {
  const pts = aggregated.value.dailyPoints;
  if (pts.length < 14) return [] as Array<{ ms: number; sum: number }>;

  const WEEK_MS = 7 * DAY_MS;
  // Offset so weeks start on Monday (1970-01-01 was Thursday = 4)
  const MONDAY_OFFSET = 3 * DAY_MS;
  const weeks = new Map<number, { sum: number; days: number }>();

  for (const pt of pts) {
    const ms = pt.x.getTime();
    const weekStartMs = Math.floor((ms + MONDAY_OFFSET) / WEEK_MS) * WEEK_MS - MONDAY_OFFSET;
    let bucket = weeks.get(weekStartMs);
    if (!bucket) {
      bucket = { sum: 0, days: 0 };
      weeks.set(weekStartMs, bucket);
    }
    bucket.sum += pt.y;
    bucket.days += 1;
  }

  const sorted = Array.from(weeks.entries()).sort((a, b) => a[0] - b[0]);
  // Drop incomplete trailing week so the chart doesn't falsely plunge on the current partial week.
  if (sorted.length > 2 && sorted[sorted.length - 1][1].days < 7) {
    sorted.pop();
  }
  return sorted.map(([ms, b]) => ({ ms, sum: b.sum }));
});

const autoWeeklyWindow = computed<1 | 4 | 13 | 26 | 52>(() => {
  const buckets = rawWeeklyBuckets.value;
  const n = buckets.length;
  if (n < 4) return 1;

  let total = 0;
  let zeros = 0;
  let absDiff = 0;
  for (let i = 0; i < n; i++) {
    const v = buckets[i].sum;
    total += v;
    if (v === 0) zeros++;
    if (i > 0) absDiff += Math.abs(v - buckets[i - 1].sum);
  }
  const mean = total / n;
  const zeroFrac = zeros / n;
  // Mean relative week-to-week jump (roughness)
  const roughness = mean > 0 ? absDiff / (n - 1) / mean : 1;

  // Target ~150 commits per rolling window for low Poisson noise, boosted by
  // empty-week sparsity and week-to-week roughness, plus a mild span floor.
  const needForCount = mean > 0 ? 150 / mean : 52;
  const needForSpan = n / 250;
  const need =
    Math.max(needForCount * (1 + zeroFrac * 2), needForSpan) *
    (0.6 + 0.8 * Math.min(roughness, 1.5));

  const maxSensible = Math.max(1, Math.floor(n / 3));
  const candidates: Array<1 | 4 | 13 | 26 | 52> = [1, 4, 13, 26, 52];
  const valid = candidates.filter((w) => w <= maxSensible);
  if (valid.length === 0) return 1;
  return valid.find((w) => w >= need) ?? valid[valid.length - 1];
});

const effectiveWeeklyWindow = computed<number>(() =>
  weeklyWindow.value === "auto" ? autoWeeklyWindow.value : weeklyWindow.value,
);

const weeklyWindowOptions = computed(() => [
  { value: "auto", label: `Auto (${autoWeeklyWindow.value}w)` },
  { value: 1, label: "1w" },
  { value: 4, label: "4w" },
  { value: 13, label: "13w" },
  { value: 26, label: "26w" },
  { value: 52, label: "52w" },
]);

const weeklySeries = computed(() => {
  const buckets = rawWeeklyBuckets.value;
  if (buckets.length < 2) return [];

  const w = effectiveWeeklyWindow.value;
  if (w <= 1) {
    return [
      {
        label: repoListLabel.value,
        values: buckets.map((b) => ({ x: new Date(b.ms), y: b.sum })),
      },
    ];
  }

  // Centered rolling average using prefix sums (O(n)) so peaks stay aligned in time.
  const n = buckets.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + buckets[i].sum;
  }
  const halfBefore = Math.floor(w / 2);
  const halfAfter = w - 1 - halfBefore;

  return [
    {
      label: repoListLabel.value,
      values: buckets.map((b, i) => {
        const lo = Math.max(0, i - halfBefore);
        const hi = Math.min(n - 1, i + halfAfter);
        const avg = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
        return { x: new Date(b.ms), y: Math.round(avg) };
      }),
    },
  ];
});

const pulseStats = computed(() => {
  const { totalCommits, activeDays, peakDayCount, peakDayMs, matrix } = aggregated.value;
  const avgPerDay = activeDays > 0 ? totalCommits / activeDays : 0;
  const peakDayDate = peakDayMs ? new Date(peakDayMs).toISOString().slice(0, 10) : "—";

  let weekendCommits = 0;
  for (const d of [0, 6]) {
    for (let h = 0; h < 24; h++) weekendCommits += matrix[d][h];
  }
  const weekendPct = totalCommits > 0 ? ((weekendCommits / totalCommits) * 100).toFixed(1) : "0";

  let peakHourCount = 0;
  let peakDay = 1;
  let peakHour = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (matrix[d][h] > peakHourCount) {
        peakHourCount = matrix[d][h];
        peakDay = d;
        peakHour = h;
      }
    }
  }
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const peakHourLabel = `${dayNames[peakDay]} ${String(peakHour).padStart(2, "0")}:00 ${tzShortLabel.value}`;

  return {
    totalCommits,
    avgPerDay,
    peakDayCount,
    peakDayDate,
    weekendPct,
    peakHourCount,
    peakHourLabel,
  };
});

const weeklyRows = computed(() => {
  void themeTick.value;
  const { matrix, totalCommits } = aggregated.value;
  let maxCell = 1;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (matrix[d][h] > maxCell) maxCell = matrix[d][h];
    }
  }

  let zeroColor = "#ebedf0";
  let highColor = "#216e39";
  if (typeof document !== "undefined") {
    const css = getComputedStyle(document.documentElement);
    zeroColor = css.getPropertyValue("--surface-sunken").trim() || zeroColor;
    highColor = css.getPropertyValue("--heat-high").trim() || highColor;
  }

  const colorScale = scalePow<string>()
    .domain([0, maxCell])
    .range([zeroColor, highColor])
    .exponent(0.75)
    .clamp(true);

  const dayTotals = DISPLAY_DAYS.map((d) =>
    matrix[d.jsDay].reduce((sum, v) => sum + v, 0),
  );
  const maxDayTotal = Math.max(1, ...dayTotals);

  return DISPLAY_DAYS.map((d, idx) => {
    const dayTotal = dayTotals[idx];
    const cells: RhythmCell[] = matrix[d.jsDay].map((count, hour) => ({
      hour,
      count,
      color: count === 0 ? zeroColor : colorScale(count),
    }));
    return {
      dayName: d.name,
      isWeekend: d.isWeekend,
      cells,
      sharePct: totalCommits > 0 ? ((dayTotal / totalCommits) * 100).toFixed(1) : "0.0",
      barPct: (dayTotal / maxDayTotal) * 100,
    };
  });
});

const updateRhythmTooltip = (event: MouseEvent) => {
  const box = rhythmEl.value;
  if (!box) return;
  const rect = box.getBoundingClientRect();
  const x = event.clientX - rect.left + 14;
  const y = event.clientY - rect.top - 52;
  rhythmTooltip.x = Math.min(Math.max(8, x), Math.max(8, rect.width - 210));
  rhythmTooltip.y = Math.max(4, y);
};

const onCellEnter = (dayName: string, cell: RhythmCell, event: MouseEvent) => {
  const total = aggregated.value.totalCommits || 1;
  const h0 = String(cell.hour).padStart(2, "0");
  const h1 = String((cell.hour + 1) % 24).padStart(2, "0");
  hoveredCell.value = {
    dayName,
    hourLabel: `${h0}:00–${h1}:00`,
    count: cell.count,
    pct: ((cell.count / total) * 100).toFixed(2),
  };
  updateRhythmTooltip(event);
};

const onCellMove = (event: MouseEvent) => {
  if (hoveredCell.value) updateRhythmTooltip(event);
};

let themeObserver: MutationObserver | null = null;

watch(repositories, loadRepositories);
onMounted(() => {
  loadRepositories();
  if (typeof MutationObserver !== "undefined") {
    themeObserver = new MutationObserver(() => {
      themeTick.value++;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
});
</script>

<style scoped>
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

.panel-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.35rem;
  box-shadow: var(--shadow-xs);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 650;
  color: var(--ink);
  margin: 0;
}

.section-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.88rem;
  color: var(--muted);
}

.weekly-chart-wrap {
  height: 300px;
}

/* Weekly Rhythm Grid */
.rhythm-container {
  position: relative;
}

.rhythm-scroll {
  overflow-x: auto;
}

.rhythm-grid {
  display: grid;
  grid-template-columns: 2.6rem minmax(440px, 1fr) 6.5rem;
  gap: 0.3rem 0.65rem;
  align-items: center;
}

.rhythm-hours {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 3px;
}

.rhythm-hour-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--muted);
  text-align: center;
}

.rhythm-share-head {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-align: right;
}

.rhythm-day-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-2);
}

.rhythm-day-label.is-weekend {
  color: var(--muted);
}

.rhythm-cells {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 3px;
}

.rhythm-cell {
  aspect-ratio: 1.35 / 1;
  min-height: 18px;
  border-radius: 4px;
  cursor: crosshair;
  transition: box-shadow 0.08s ease;
}

.rhythm-cell:hover {
  box-shadow: inset 0 0 0 1.5px var(--ink);
}

.rhythm-share {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.rhythm-share-bar-track {
  flex: 1;
  height: 7px;
  border-radius: 999px;
  background: var(--surface-sunken);
  overflow: hidden;
}

.rhythm-share-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--heat-high);
  opacity: 0.85;
}

.rhythm-share-bar-fill.is-weekend {
  opacity: 0.45;
}

.rhythm-share-pct {
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 2.6rem;
  text-align: right;
}

.rhythm-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.45rem 0.7rem;
  box-shadow: var(--shadow-lg);
  white-space: nowrap;
}

.tooltip-title {
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--ink);
}

.tooltip-meta {
  margin-top: 0.12rem;
  font-size: 0.77rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
