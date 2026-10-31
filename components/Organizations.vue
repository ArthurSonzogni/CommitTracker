<template>
  <div class="main">
    <div v-if="chart == 'line'" style="aspect-ratio: 16/9;">
      <LineChart
        class="line-chart"
        :data="line_chart_data"
        :formatter="formatter"
      />
    </div>

    <BarChart
      v-if="chart == 'bar'"
      :timeLabel="timeLabel"
      :valueLabel="metric == 'commit' ? 'Commits' : 'Contributors'"
      :formatter="formatter"
      :data="bar_chart_data"
    />

    <UiField>
      <slot></slot>

      <p class="m-2"></p>

      <UiField>
        <button type="button" class="button" @click="download = true"> Download </button>

        <UiModal v-model="download" :width="640">
          <div class="card">
            <div class="card-content">
              <div class="media">
                <div class="media-content">
                  <p class="title is-4">Download as:</p>
                </div>
              </div>

              <div class="content">
                <button type="button" class="button is-light download-button" @click="DownloadJSON()"> JSON </button>
                <button type="button" class="button is-light download-button" @click="DownloadJSON2()"> JSON (variant) </button>
                <button type="button" class="button is-light download-button" @click="DownloadCSV()"> CSV (rows)</button>
                <button type="button" class="button is-light download-button" @click="DownloadCSV2()"> CSV (table) </button>
              </div>
            </div>
          </div>
        </UiModal>
      </UiField>
    </UiField>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import { format } from "d3-format";
import repositories from "../public/data/repositories.json";
import organizations from "../public/data/organizations.json";

type ConsolidatedData = Record<string, Record<string, number>>;

type BarBucket = {
  label: string;
  values: { label: string; value: number; color: string | undefined }[];
};

type LineSeries = {
  label: string;
  values: { x: Date; y: number }[];
};

const props = defineProps({
  repositories: { type: Array as PropType<string[]>, default: () => ["chromium"] },
  organizations: { type: Array as PropType<string[]>, default: () => ["Google"] },
  colors: { type: String, default: "repositories" },
  grouping: { type: String, default: "yearly" },
  kind: { type: String, default: "author" },
  metric: { type: String, default: "commit" },
  chart: { type: String, default: "bar" },
  dates: {
    type: Array as PropType<Date[]>,
    default: () => [new Date("2000-01-01"), new Date()],
  },
  others: { type: Boolean, default: false },
  display: { type: String, default: "absolute" },
});

const repositoriesColor = new Map<string, string>();
for (const repo of repositories) {
  repositoriesColor.set(repo.dirname, repo.color);
}

const organizationsColor = new Map<string, string>();
for (let i = 0; i < organizations.length; ++i) {
  const hue = (i * 360) / organizations.length + (i % 4) * 90;
  const luminance = 40 + 5 * (i % 3);
  organizationsColor.set(organizations[i], `hsl(${hue}, 99%, ${luminance}%)`);
}
organizationsColor.set("Others", "hsl(0, 0%, 50%)");

const bar_chart_data = shallowRef<BarBucket[]>([]);
const line_chart_data = shallowRef<LineSeries[]>([]);
const download = ref(false);
const formatter = ref<(n: number) => string>(format(",d"));

const merge = (a: Record<string, number>, b: Record<string, number>) => {
  for (const key in b) {
    a[key] = (a[key] || 0) + b[key];
  }
};

const groupingFunctionReverse = (date: string): Date => {
  switch (props.grouping) {
    case "forever":
      return props.dates[0];
    case "decennial":
      return new Date(date.slice(0, 3) + "0-01-01");
    case "yearly":
      return new Date(date.slice(0, 4) + "-01-01");
    case "quarterly": {
      const month = String(1 + (parseInt(date.slice(5, 6), 10) - 1) * 3).padStart(2, "0");
      return new Date(`${date.slice(0, 4)}-${month}-01`);
    }
    case "monthly":
      return new Date(date + "-01");
  }
  return new Date(date);
};

const dataForRepository = async (repository: string) => {
  const response = await fetch(
    `/data/${encodeURIComponent(repository)}/organizations_summary_${encodeURIComponent(props.metric)}_${encodeURIComponent(props.grouping)}_${encodeURIComponent(props.kind)}.json`,
  );
  if (!response.ok) {
    return {};
  }
  const data_all: Record<string, Record<string, number>> = await response.json();

  const data: Record<string, Record<string, number>> = {
    Others: {},
  };

  for (const organization in data_all) {
    if (props.organizations.includes(organization)) {
      data[organization] = { ...data_all[organization] };
      continue;
    }

    if (props.colors == "organizations" || props.others) {
      merge(data.Others, data_all[organization]);
    }
  }

  // Filter out the dates that are not in the range.
  for (const organization in data) {
    for (const key in data[organization]) {
      const date = groupingFunctionReverse(key);
      if (date < props.dates[0] || date > props.dates[1]) {
        delete data[organization][key];
      }
    }
  }

  return data;
};

const consolidateData = async (): Promise<ConsolidatedData> => {
  const entries = await Promise.all(
    props.repositories.map(async (repo) => [repo, await dataForRepository(repo)] as const),
  );
  const repo_data = Object.fromEntries(entries);

  const data: ConsolidatedData = {};
  if (props.colors == "repositories") {
    for (const repo of props.repositories) {
      for (const organization in repo_data[repo]) {
        for (const date in repo_data[repo][organization]) {
          data[date] = data[date] || {};
          data[date][repo] = (data[date][repo] || 0) + repo_data[repo][organization][date];
        }
      }
    }

    if (props.display == "percent") {
      for (const date in data) {
        let total = 0;
        for (const repo in data[date]) {
          total += data[date][repo];
        }
        if (total > 0) {
          for (const repo in data[date]) {
            data[date][repo] /= total;
          }
        }
      }
    }
  } else {
    for (const repo of props.repositories) {
      for (const organization in repo_data[repo]) {
        for (const date in repo_data[repo][organization]) {
          data[date] = data[date] || {};
          data[date][organization] =
            (data[date][organization] || 0) + repo_data[repo][organization][date];
        }
      }
    }

    if (props.display == "percent") {
      for (const date in data) {
        let total = 0;
        for (const organization in data[date]) {
          total += data[date][organization];
        }
        if (total > 0) {
          for (const organization in data[date]) {
            data[date][organization] /= total;
          }
        }
      }
    }

    if (!props.others) {
      for (const date in data) {
        delete data[date].Others;
      }
    }
  }

  if (props.display == "accumulative") {
    const allLabels = new Set<string>();
    for (const date in data) {
      for (const label in data[date]) {
        allLabels.add(label);
      }
    }

    const cumulativeValues: Record<string, number> = {};
    for (const label of allLabels) {
      cumulativeValues[label] = 0;
    }

    for (const date of Object.keys(data).sort()) {
      for (const label of allLabels) {
        cumulativeValues[label] += data[date][label] || 0;
        data[date][label] = cumulativeValues[label];
      }
    }
  }

  // Cleanup empty data:
  for (const date in data) {
    for (const label in data[date]) {
      if (data[date][label] == 0) {
        delete data[date][label];
      }
    }
  }

  // Cleanup empty dates:
  for (const date in data) {
    if (Object.keys(data[date]).length == 0) {
      delete data[date];
    }
  }

  return data;
};

let requestId = 0;
let consolidatedCache: ConsolidatedData | null = null;
let consolidatePromise: Promise<ConsolidatedData> | null = null;

const getConsolidatedData = async (): Promise<ConsolidatedData> => {
  if (consolidatedCache) {
    return consolidatedCache;
  }
  if (consolidatePromise) {
    return consolidatePromise;
  }
  const promise = consolidateData();
  consolidatePromise = promise;
  try {
    const result = await promise;
    if (consolidatePromise === promise) {
      consolidatedCache = result;
    }
    return result;
  } finally {
    if (consolidatePromise === promise) {
      consolidatePromise = null;
    }
  }
};

const refresh = async () => {
  const id = ++requestId;
  consolidatedCache = null;
  consolidatePromise = null;
  const data = await getConsolidatedData();
  if (id !== requestId) {
    return;
  }

  formatter.value = props.display == "percent" ? format(".2%") : format(",d");

  if (props.chart == "bar") {
    bar_chart_data.value = Object.keys(data)
      .sort()
      .map((date) => ({
        label: date,
        values: Object.keys(data[date])
          .sort()
          .map((label) => ({
            label,
            value: data[date][label],
            color:
              props.colors == "repositories"
                ? repositoriesColor.get(label)
                : organizationsColor.get(label),
          })),
      }));
  }

  if (props.chart == "line") {
    const label_size: Record<string, number> = {};
    for (const date in data) {
      for (const label in data[date]) {
        label_size[label] = (label_size[label] || 0) + data[date][label];
      }
    }

    const top_label = Object.keys(label_size)
      .sort((a, b) => label_size[b] - label_size[a])
      .slice(0, 10);

    const sortedDates = Object.keys(data).sort().slice(0, -1);
    line_chart_data.value = top_label.map((label) => ({
      label,
      values: sortedDates.map((date) => ({
        x: new Date(groupingFunctionReverse(date)),
        y: data[date][label] || 0,
      })),
    }));
  }
};

const Download = (data_string: string, filename: string, type?: string) => {
  const blob = new Blob([data_string], { type: type || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const DownloadJSON2 = async () => {
  const data = await getConsolidatedData();
  Download(JSON.stringify(data, null, 2), "data.json", "application/json");
};

const DownloadJSON = async () => {
  const data = await getConsolidatedData();

  const inverted_data: ConsolidatedData = {};
  for (const date in data) {
    for (const label in data[date]) {
      inverted_data[label] = inverted_data[label] || {};
      inverted_data[label][date] = data[date][label];
    }
  }

  Download(JSON.stringify(inverted_data, null, 2), "data.json", "application/json");
};

const DownloadCSV = async () => {
  const data = await getConsolidatedData();
  const csv = Object.keys(data)
    .sort()
    .map((date) =>
      Object.keys(data[date])
        .sort()
        .map((label) => `${date},${label},${data[date][label]}`)
        .join("\n"),
    )
    .join("\n");

  Download(csv, "data.csv", "text/csv");
};

const DownloadCSV2 = async () => {
  const data = await getConsolidatedData();

  const labels = new Set<string>();
  for (const date in data) {
    for (const label in data[date]) {
      labels.add(label);
    }
  }

  let csv = "Date";
  for (const label of labels) {
    csv += `,${label}`;
  }

  for (const date of Object.keys(data).sort()) {
    csv += `\n${date}`;
    for (const label of labels) {
      csv += `,${data[date][label] || 0}`;
    }
  }

  Download(csv, "data.csv", "text/csv");
};

const timeLabel = computed(() => {
  switch (props.grouping) {
    case "forever":
      return "Forever";
    case "decennial":
      return "Decade";
    case "yearly":
      return "Year";
    case "quarterly":
      return "Quarter";
    case "monthly":
      return "Month";
  }
  return "";
});

watch(props, refresh);

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.line-chart {
  margin-top: 2rem;
}
</style>
