<template>
  <div>
    <section class="section">
      <h1 class="title">CVE pivot table</h1>
      <div class="mycolumns">
        <div id="widget-colum">
          <UiField label="Time division">
            <UiSegmented
              v-model="time_division"
              :options="[
              { value: 'all', label: 'All' },
              { value: 'year', label: 'Year' },
              { value: 'quarter', label: 'Quarter' },
              { value: 'month', label: 'Month' },
            ]" />
          </UiField>

          <!--Lines-->
          <UiField label="Lines">
            <UiSegmented
              v-model="line"
              :options="[
              { value: 'components', label: 'components' },
              { value: 'repositories', label: 'repositories' },
            ]" />
          </UiField>

          <UiField label="Components depths" v-if="line == 'components'">
            <UiNumberInput v-model="component_division" :min="0" :max="4" :step="1"></UiNumberInput>
          </UiField>

          <!--Severity ['low', 'medium', 'high', 'critical']-->
          <UiField label="Severity">
            <div class="chips">
              <UiToggle v-model="severity" value="N/A">N/A</UiToggle>
              <UiToggle v-model="severity" value="Low">Low</UiToggle>
              <UiToggle v-model="severity" value="Medium">Medium</UiToggle>
              <UiToggle v-model="severity" value="High">High</UiToggle>
              <UiToggle v-model="severity" value="Critical">Critical</UiToggle>
            </div>
          </UiField>

          <!-- value -->
          <div class="form-row">
            <UiField label="Reward">
              <UiSegmented
                v-model="cell_value"
                :options="[
                { value: 'vrp_reward', label: '$$$', title: 'VRP reward' },
              ]" />
            </UiField>
            <UiField label="CVE">
              <UiSegmented
                v-model="cell_value"
                :options="[
                { value: 'cve_count', label: 'Count', title: 'Number of CVE' },
              ]" />
            </UiField>
            <UiField label="Velocity">
              <UiSegmented
                v-model="cell_value"
                :options="[
                { value: 'time_to_fix_10p', label: '10p', title: 'Delay from bug reported to fix released to stable' },
                { value: 'time_to_fix_median', label: '50p', title: 'Delay from bug reported to fix released to stable' },
                { value: 'time_to_fix_90p', label: '90p', title: 'Delay from bug reported to fix released to stable' },
              ]" />
            </UiField>
          </div>

          <UiField label="Hide non representative data">
            <UiSwitch v-model="hide_low_count"></UiSwitch>
          </UiField>

        </div>
        <UiTable id="table-column" :data="table_data" striped bordered scrollable sticky-header height="85vh">
          <!--The component field-->
          <UiTableColumn field="component" label="Component" sortable sticky>
            <template v-slot="props">
              {{ props.row.line }}
            </template>
          </UiTableColumn>

          <UiTableColumn
            v-for="column in table_columns"
            :key="column.field"
            :field="column.field"
            :label="column.label"
            :td-attrs="tdAttrs"
            sortable
          >
            <template v-slot="props">
              <NuxtLink
                v-if="line == 'components'"
                :to="{
                  path: '/cve/list',
                  query: {
                    group_by: 'component',
                    component: props.row.line,
                    date: column.label,
                  },
                }"
                class="table_link"
              >
                {{ formatter(props.row[column.field]) }}
              </NuxtLink>

              <NuxtLink
                v-else-if="line == 'repositories'"
                :to="{
                  path: '/cve/list',
                  query: {
                    group_by: 'component',
                    repo: props.row.line,
                    date: column.label,
                  },
                }"
                class="table_link"
              >
                {{ formatter(props.row[column.field]) }}
              </NuxtLink>
            </template>
          </UiTableColumn>
        </UiTable>
      </div>
    </section>

    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2010-01-01')"/>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";
import { scalePow, scaleSequential } from "d3-scale";
import { interpolateOranges } from "d3-scale-chromatic";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { fetchCveData, type CveRecord } from "~/utils/cve";

const KNOWN_SEVERITIES = new Set(["Low", "Medium", "High", "Critical"]);
const normalizeSeverity = (sev?: string): string =>
  sev && KNOWN_SEVERITIES.has(sev) ? sev : "N/A";

const defaultEndIso = new Date().toISOString().split("T")[0];

const {
  startDateStr,
  endDateStr,
  component_division,
  time_division,
  cell_value,
  severity,
  line,
} = useUrlState({
  startDateStr: { ...urlCodecs.string("2015-01-01"), key: "start" },
  endDateStr: { ...urlCodecs.string(defaultEndIso), key: "end" },
  component_division: {
    ...urlCodecs.number(3, { min: 0, max: 4, integer: true }),
    key: "cd",
  },
  time_division: {
    ...urlCodecs.enum(["all", "year", "quarter", "month"] as const, "year"),
    key: "td",
  },
  cell_value: {
    ...urlCodecs.enum(
      [
        "vrp_reward",
        "cve_count",
        "time_to_fix_10p",
        "time_to_fix_median",
        "time_to_fix_90p",
      ] as const,
      "vrp_reward",
    ),
    key: "v",
  },
  severity: {
    ...urlCodecs.csv(["N/A", "Low", "Medium", "High", "Critical"]),
    key: "s",
  },
  line: {
    ...urlCodecs.enum(["components", "repositories"] as const, "components"),
    key: "l",
  },
});

const dates = computed<[Date, Date]>({
  get: () => {
    const d0 = new Date(startDateStr.value);
    const d1 = new Date(endDateStr.value);
    return [
      Number.isNaN(d0.getTime()) ? new Date("2015-01-01") : d0,
      Number.isNaN(d1.getTime()) ? new Date() : d1,
    ];
  },
  set: ([d0, d1]) => {
    if (d0 instanceof Date && !Number.isNaN(d0.getTime())) {
      startDateStr.value = d0.toISOString().split("T")[0];
    }
    if (d1 instanceof Date && !Number.isNaN(d1.getTime())) {
      endDateStr.value = d1.toISOString().split("T")[0];
    }
  },
});

const hide_low_count = ref(true);

let raw_data: CveRecord[] = [];
const table_data = shallowRef<Record<string, any>[]>([]);
const table_columns = shallowRef<{ field: string; label: string }[]>([]);

// Format the cells with d3.format.
const dollarFormatter = format("$,.0f");
const dollarFormatter2 = format("$,.2f");

let value_projector: (cell: any) => number = (x) => x;
let formatter: (cell: any) => string | number = (x) => x;

// Exponential scale for the color.
let color_scale = scalePow()
  .exponent(0.2)
  .domain([0, 7000])
  .range([0, 1]);
const color_scale2 = scaleSequential(interpolateOranges);

const tdAttrs = (row: Record<string, any>, column: { field: string }) => {
  const t = color_scale(value_projector(row[column.field]));
  if (isNaN(t)) {
    return {};
  }

  // The orange ramp is the same in both themes: pick a readable text color.
  return {
    style: {
      backgroundColor: color_scale2(t),
      color: t > 0.6 ? "#ffffff" : "#121216",
    },
  };
};

// Generator of component and subcomponent.
const component_generator = function* (component: string) {
  yield "All";
  if (component_division.value === 0) {
    return;
  }

  const current: string[] = [];
  for (const part of component.split(">")) {
    current.push(part);
    yield current.join(">");
    if (current.length === component_division.value) {
      break;
    }
  }
};

const components_generator = function* (components?: string[]) {
  if (!components) {
    return;
  }
  const seen = new Set<string>();
  for (const component of components) {
    for (const part of component_generator(component)) {
      if (seen.has(part)) continue;
      seen.add(part);
      yield part;
    }
  }
};

const time_get_bucket = (date: Date): string => {
  switch (time_division.value) {
    case "all":
      return "All";
    case "year":
      return `${date.getFullYear()}`;
    case "quarter":
      return `${date.getFullYear()}Q${Math.floor(date.getMonth() / 3) + 1}`;
    case "month": {
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      return `${date.getFullYear()}M${month}`;
    }
  }
};

const extractRepos = (cve: CveRecord): Set<string> => {
  const repos = new Set<string>();
  for (const sha in cve.commits) {
    const commit = cve.commits[sha];
    if (commit?.repo) {
      repos.add(commit.repo);
    }
  }
  return repos;
};

const timeToFixDays = (cve: CveRecord): number => {
  if (!cve.bug_date || !cve.version_dates?.stable) return NaN;
  const begin = new Date(cve.bug_date).getTime();
  const end = new Date(cve.version_dates.stable).getTime();
  return (end - begin) / (1000 * 60 * 60 * 24);
};

const render = () => {
  const time_bucket_set = new Set<string>();
  const line_bucket_set = new Set<string>();
  const [startBound, endBound] = dates.value;
  const allowedSeverities = new Set(severity.value);

  const entries: { date: Date; cve: CveRecord; repos?: Set<string> }[] = [];

  for (const cve of raw_data) {
    if (!allowedSeverities.has(normalizeSeverity(cve.severity))) {
      continue;
    }

    const publishedDate = new Date(cve.published);
    const stableDate = cve.version_dates?.stable
      ? new Date(cve.version_dates.stable)
      : null;
    const bugDate = cve.bug_date ? new Date(cve.bug_date) : null;
    const date = !Number.isNaN(publishedDate.getTime())
      ? publishedDate
      : stableDate && !Number.isNaN(stableDate.getTime())
        ? stableDate
        : bugDate;

    if (!date || Number.isNaN(date.getTime()) || date < startBound || date > endBound) {
      continue;
    }

    let repos: Set<string> | undefined;
    if (line.value === "components") {
      for (const part of components_generator(cve.components)) {
        line_bucket_set.add(part);
      }
    } else {
      repos = extractRepos(cve);
      if (repos.size === 0) {
        continue;
      }
      for (const repo of repos) {
        line_bucket_set.add(repo);
      }
    }

    time_bucket_set.add(time_get_bucket(date));
    entries.push({ date, cve, repos });
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  const time_buckets = Array.from(time_bucket_set).sort((a, b) => a.localeCompare(b));
  const line_buckets = Array.from(line_bucket_set).sort();

  table_columns.value = time_buckets.map(time => ({
    field: time,
    label: time,
  }));

  const line_array_indexes = new Map<string, number>();
  for (let i = 0; i < line_buckets.length; ++i) {
    line_array_indexes.set(line_buckets[i], i);
  }

  const table_data_value: Record<string, any>[] = line_buckets.map(rowKey => ({
    line: rowKey,
  }));

  for (const entry of entries) {
    const dateKey = time_get_bucket(entry.date);

    if (line.value === "components") {
      for (const component of components_generator(entry.cve.components)) {
        const idx = line_array_indexes.get(component);
        if (idx === undefined) continue;
        (table_data_value[idx][dateKey] ||= []).push(entry.cve);
      }
    } else if (entry.repos) {
      for (const repo of entry.repos) {
        const idx = line_array_indexes.get(repo);
        if (idx === undefined) continue;
        (table_data_value[idx][dateKey] ||= []).push(entry.cve);
      }
    }
  }

  switch (cell_value.value) {
    case "vrp_reward":
      value_projector = (cves: CveRecord[] | number) => {
        if (!Array.isArray(cves)) return 0;
        let reward = 0;
        for (const cve of cves) {
          reward += parseInt(String(cve.vrp_reward ?? "")) || 0;
        }
        return reward;
      };
      break;

    case "cve_count":
      value_projector = (cves: CveRecord[] | number) =>
        Array.isArray(cves) ? cves.length : 0;
      break;

    case "time_to_fix_10p":
      value_projector = (cves: CveRecord[] | number) => {
        if (!Array.isArray(cves) || cves.length === 0) return 0;
        const values = cves
          .map(timeToFixDays)
          .filter(x => Number.isFinite(x) && x !== 0)
          .sort((a, b) => a - b);
        if (hide_low_count.value && values.length < 12) return 0;
        return values[Math.floor(values.length * 0.1)] || 0;
      };
      break;

    case "time_to_fix_median":
      value_projector = (cves: CveRecord[] | number) => {
        if (!Array.isArray(cves) || cves.length === 0) return 0;
        const values = cves
          .map(timeToFixDays)
          .filter(x => Number.isFinite(x) && x !== 0)
          .sort((a, b) => a - b);
        if (hide_low_count.value && values.length < 6) return 0;
        return values[Math.floor(values.length / 2)] || 0;
      };
      break;

    case "time_to_fix_90p":
      value_projector = (cves: CveRecord[] | number) => {
        if (!Array.isArray(cves) || cves.length === 0) return 0;
        const values = cves
          .map(timeToFixDays)
          .filter(x => Number.isFinite(x) && x !== 0)
          .sort((a, b) => a - b);
        if (hide_low_count.value && values.length < 12) return 0;
        return values[Math.floor(values.length * 0.9)] || 0;
      };
      break;
  }

  switch (cell_value.value) {
    case "vrp_reward":
      formatter = (cves) => {
        const reward = value_projector(cves);
        if (reward === 0) return "";
        if (reward >= 1000000) return dollarFormatter2(reward / 1000000) + "M";
        if (reward >= 1000) return dollarFormatter(reward / 1000) + "k";
        return dollarFormatter(reward);
      };
      break;

    case "cve_count":
      formatter = (value) => {
        const count = value_projector(value);
        return count === 0 ? "" : count;
      };
      break;

    case "time_to_fix_10p":
    case "time_to_fix_median":
    case "time_to_fix_90p":
      formatter = (x) => {
        const value = value_projector(x);
        return !value ? "" : `${Math.floor(value)}d`;
      };
      break;
  }

  let max_value = 0;
  for (const row of table_data_value) {
    for (const field of time_buckets) {
      if (row[field] === undefined) {
        row[field] = 0;
        continue;
      }
      const value = value_projector(row[field]);
      if (value > max_value) {
        max_value = value;
      }
    }
  }

  color_scale = scalePow()
    .exponent(0.3)
    .domain([0, max_value || 1])
    .range([0, 0.5]);
  table_data.value = table_data_value;
};

onMounted(async () => {
  raw_data = await fetchCveData();
  render();
});

watch(
  [
    cell_value,
    line,
    component_division,
    dates,
    hide_low_count,
    severity,
    time_division,
  ],
  render,
);
</script>

<style scoped>
.timeline {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background-color: var(--surface);
  width: 100%;
}

.tooltip {
  background-color: var(--surface);
}

.mycolumns {
  display: flex;
  flex-direction: column;
}

@media (min-width: 1104px) {
  .mycolumns {
    display: flex;
    flex-direction: row;
    max-width: 100%;
    gap: 1em;
  }
}

.mycolumns {
  display: flex;
  gap: 1em;
}

#table-column {
  flex: 1;
  overflow: auto;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.table_link {
  color: var(--ink);
}

.table_link:hover {
  color: blue;
}

</style>
