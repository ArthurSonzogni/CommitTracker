<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">Fuzz test</h1>
        <p class="mb-4">{{ total }} fuzzers in Chromium.</p>

        <div style="height: 50vh;">
          <LineChart :data="graph" />
        </div>

        <div class="container">
          <UiField>
            <UiToggle v-model="type" value="fuzzer_test">Fuzz target</UiToggle>
            <UiToggle v-model="type" value="FUZZ_TEST">FUZZ_TEST</UiToggle>
          </UiField>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Fuzzers</h2>
        <UiTable :data="data" hoverable :paginated="true" :per-page="15" striped detailed>
          <UiTableColumn field="date" label="Date" v-slot="props" sortable>
            {{ props.row.date }}
          </UiTableColumn>

          <UiTableColumn field="author" label="Author" v-slot="props" sortable>
            <NuxtLink :to="{
              path: '/individuals',
              query: {
                developers: props.row.author,
                repositories: 'chromium',
              },
            }">
              {{ props.row.author }}
            </NuxtLink>
          </UiTableColumn>

          <UiTableColumn field="suite_name" label="Name" v-slot="props" sortable>
            <a :href="'https://cs.chromium.org/chromium/src/' + props.row.file
            + '?l=' + props.row.line
            "
              >
              {{ props.row.suite_name }}
            </a>
          </UiTableColumn>

          <UiTableColumn field="sha" label="Patch" v-slot="props">
            <a :href="'https://chromium-review.googlesource.com/q/' + props.row.sha">
              Open
            </a>
          </UiTableColumn>

          <UiTableColumn field="type" label="Type" v-slot="props" sortable>
            <span class="tag is-info" v-if="props.row.type == 'fuzzer_test'">
              fuzz target
            </span>
            <span class="tag is-danger" v-else-if="props.row.type == 'FUZZ_TEST'">
              FUZZ_TEST
            </span>
            <span class="tag is-danger" v-else>{{ props.row.type }}</span>
          </UiTableColumn>

          <template #detail="props">
            <UiField label="Date"> {{ props.row.date }} </UiField>
            <UiField label="Author">
              <NuxtLink :to="{
                path: '/individuals',
                query: {
                  developers: props.row.author,
                  repositories: 'chromium',
                },
              }">
                {{ props.row.author }}
              </NuxtLink>
            </UiField>
            <UiField label="File">
              <a :href="'https://cs.chromium.org/chromium/src/' + props.row.file
              + '?l=' + props.row.line
              "
                >
                {{ props.row.file }}
              </a>
            </UiField>
            <UiField label="Line"> {{ props.row.line }} </UiField>
            <UiField label="Type"> {{ props.row.type }} </UiField>
            <UiField label="Sha">
              <a :href="'https://chromium-review.googlesource.com/q/' + props.row.sha">
                {{ props.row.sha }}
              </a>
            </UiField>
          </template>

        </UiTable>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Hierarchy</h2>
        <FuzzerHierarchy
          :name="hierarchy.name"
          :children="hierarchy.children"
          :authors="hierarchy.authors"
          :collapsed_default="false"
        />
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Leaderboard</h2>
        <UiTable :data="leaderboard" hoverable striped>

          <UiTableColumn field="count" label="Fuzzers" v-slot="props">
            {{ props.row.count }}
          </UiTableColumn>

          <UiTableColumn field="author" label="Authors" v-slot="props">
            <div class="leaderboard-authors">
              <NuxtLink
                v-for="author in props.row.authors"
                :key="author"
                class="leaderboard-author"
                :to="{
                  path: '/individuals',
                  query: {
                    developers: author,
                    repositories: 'chromium',
                  },
                }">
                <span v-if="props.row.icon">{{ props.row.icon }}</span>
                {{ author }}
              </NuxtLink>
              <div class="flex-end"></div>
            </div>
          </UiTableColumn>

        </UiTable>
      </div>
    </section>

    <section class="section sticky bottom">
      <UiField expanded>
        <Timeline v-model="dates" :minDate="new Date('2015-12-01')" />
      </UiField>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUrlState, urlCodecs } from "~/composables/useUrlState";

interface RawFuzzerEntry {
  date: string;
  author: string;
  suite_name: string;
  file: string;
  line: number;
  sha: string;
  type: string;
}

interface NormalizedFuzzer extends RawFuzzerEntry {
  timeMs: number;
  dateObj: Date;
}

interface HierarchyNode {
  name: string;
  authors: string[];
  children: HierarchyNode[];
}

interface LeaderboardRow {
  count: number;
  authors: string[];
  icon?: string;
}

// The first fuzzer was added in December 2015.
const { dates, type } = useUrlState({
  dates: urlCodecs.dateRange("2015-12-01"),
  type: urlCodecs.csv(["fuzzer_test", "FUZZ_TEST"]),
});

const allFuzzers = shallowRef<NormalizedFuzzer[]>([]);

onMounted(async () => {
  try {
    const response = await fetch("/fuzz-test/data.json");
    if (!response.ok) return;
    const raw: RawFuzzerEntry[] = await response.json();
    const normalized: NormalizedFuzzer[] = raw.map(d => {
      const parsed = new Date(d.date);
      const timeMs = parsed.getTime();
      const isoDate = parsed.toISOString().split("T")[0];
      return {
        ...d,
        date: isoDate,
        author: String(d.author ?? "").split("@")[0],
        timeMs,
        dateObj: new Date(isoDate),
      };
    });
    normalized.sort((a, b) => a.timeMs - b.timeMs);
    allFuzzers.value = normalized;
  } catch (error) {
    console.error("Failed to fetch fuzz-test data:", error);
  }
});

const filteredAsc = computed(() => {
  const startMs = dates.value[0].getTime();
  const endMs = dates.value[1].getTime();
  const allowedTypes = new Set(type.value);
  return allFuzzers.value.filter(
    d => d.timeMs >= startMs && d.timeMs <= endMs && allowedTypes.has(d.type),
  );
});

const data = computed(() => [...filteredAsc.value].reverse());

const total = computed(() => filteredAsc.value.length);

const graph = computed(() => {
  const newValues: Record<string, { x: Date; y: number }[]> = {};
  const accu: Record<string, number> = {};
  for (const d of filteredAsc.value) {
    accu[d.type] = (accu[d.type] || 0) + 1;
    (newValues[d.type] ||= []).push({
      x: d.dateObj,
      y: accu[d.type],
    });
  }
  return Object.entries(newValues).map(([label, values]) => ({
    label,
    extra_label: " = " + accu[label],
    values,
  }));
});

const leaderboard = computed<LeaderboardRow[]>(() => {
  const authorCount: Record<string, number> = {};
  for (const d of filteredAsc.value) {
    authorCount[d.author] = (authorCount[d.author] || 0) + 1;
  }

  const countAuthors: Record<number, string[]> = {};
  for (const [author, count] of Object.entries(authorCount)) {
    (countAuthors[count] ||= []).push(author);
  }

  const rows: LeaderboardRow[] = Object.entries(countAuthors)
    .map(([count, authors]) => ({ count: Number(count), authors }))
    .sort((a, b) => b.count - a.count);

  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < medals.length; i++) {
    if (rows[i]) rows[i].icon = medals[i];
  }
  return rows;
});

const hierarchy = computed<HierarchyNode>(() => {
  const root: HierarchyNode = {
    name: "root",
    authors: [],
    children: [],
  };

  for (const d of filteredAsc.value) {
    let current = root;
    const parts = d.file.split("/");
    parts.push("   " + d.suite_name);
    current.authors.push(d.author);
    for (const part of parts) {
      let next = current.children.find(c => c.name === part);
      if (!next) {
        next = {
          name: part,
          children: [],
          authors: [],
        };
        current.children.push(next);
      }
      current = next;
      current.authors.push(d.author);
    }
  }

  const collapse = (node: HierarchyNode) => {
    for (const child of node.children) {
      collapse(child);
    }
    if (node.children.length === 1 && node.children[0].children.length > 0) {
      const child = node.children[0];
      node.name += "/" + child.name;
      node.children = child.children;
      node.authors = child.authors;
    }
  };
  collapse(root);

  const sortTree = (node: HierarchyNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) {
      sortTree(child);
    }
  };
  sortTree(root);

  return root;
});
</script>

<style scoped>
.sticky {
  position: sticky;
  width: 100%;
  z-index: 2;
}

.sticky::before {
  display: block;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  z-index: 1;

  backdrop-filter: blur(4px);
  background-color: color-mix(in srgb, var(--surface) 50%, transparent);
  content: '';
  position:absolute;
  transition: all 0.1s ease-in-out;
  transition: background-color 0.2s ease-in-out;
}

.sticky > * {
  z-index: 2;
  position: relative;
}


.sticky.bottom {
  bottom: 0;
  margin-bottom:0px;
  padding-bottom:15px;
}

.leaderboard-authors {
  display:flex;
  flex-direction:row;
  flex-wrap:wrap;
}

.leaderboard-author {
  margin:2px;
  padding:10px;
  flex-grow:1;
  background-color: rgba(0,0,0,0.1);
  color: var(--ink);
  border-radius: 15px;

  a {
    color: var(--ink);
    padding:auto;
  }
}

.leaderboard-author:hover {
  background-color: rgba(0,0,0,0.2);
}

.leaderboard-author:active{
  background-color: rgba(0,0,0,0.3);
}

.flex-end {
  flex-grow:1000;
}

</style>
