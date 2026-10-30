<template>
  <div class="treemap-presets">
    <p class="intro">
      Pick a view, or choose your own metrics above.
    </p>

    <div class="bento">
      <section v-for="category in categories" :key="category.name" class="bento-tile">
        <h2>{{ category.name }}</h2>
        <p class="description">{{ category.description }}</p>
        <ul class="preset-list">
          <li v-for="preset in category.presets" :key="preset.name" class="preset-item">
            <a :href="url(preset)" :title="preset.formula" @click.prevent="emit('select', preset)">{{ preset.name }}</a>
            <span class="preset-formula" aria-hidden="true">{{ preset.shortFormula }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
// Predefined views of the treemap, shown when no metric is selected.

import {
  fetchRepoAvailableMetrics,
  getCachedAvailableMetrics,
  getTreemapMetricName,
} from '~/utils/treemapMetrics';

type Preset = {
  name: string; color: string[]; size: string[];
  // The first date of the history, when the metric became relevant.
  start?: string;
  // Also plot the denominator in the history chart.
  history_size?: boolean;
};

type EnrichedPreset = Preset & {
  formula: string;
  shortFormula: string;
  allFiles: string[];
};

const props = defineProps<{ repository: string }>();
const emit = defineEmits<{ select: [preset: Preset] }>();

const CATEGORIES: {
  name: string; description: string; presets: Preset[];
}[] = [
  {
    name: "Memory safety",
    description: "Patterns behind most security bugs, and their safer replacements.",
    presets: [
      { name: "MiraclePtr", color: ["raw_ptr", "raw_ref"], size: ["file"], start: "2021-01-01" },
      { name: "Dangling pointers", color: ["dangling_untriaged"], size: ["file"], start: "2022-01-01" },
      { name: "reinterpret_cast", color: ["reinterpret_cast"], size: ["line"] },
    ],
  },
  {
    name: "Spanification",
    description: "Buffer accesses being rewritten with bounds-checked spans.",
    presets: [
      { name: "Unsafe buffer usage", color: ["lines_unsafe_buffer_usage"], size: ["line"], history_size: true },
      { name: "Unsafe libc calls", color: ["unsafe_libc"], size: ["line"] },
      { name: "base::span adoption", color: ["base_span"], size: ["line"] },
    ],
  },
  {
    name: "Tests",
    description: "Where the tests are, and how many are turned off.",
    presets: [
      { name: "Test density", color: ["tests"], size: ["file"] },
      { name: "Disabled tests", color: ["disabled_tests"], size: ["tests", "disabled_tests"] },
    ],
  },
  {
    name: "Migrations",
    description: "Old APIs on their way out. Play the timeline to watch them shrink.",
    presets: [
      { name: "Polymer → Lit", color: ["lit_element"], size: ["polymer_element", "lit_element"], history_size: true },
      { name: "Legacy IPC → Mojo", color: ["legacy_ipc"], size: ["line"] },
      { name: "absl::optional → std::optional", color: ["std_optional"], size: ["absl_optional", "std_optional"], history_size: true },
      { name: "StringPiece → string_view", color: ["string_view"], size: ["string_piece", "string_view"], history_size: true },
    ],
  },
  {
    name: "Languages",
    description: "Which languages the code is written in.",
    presets: [
      { name: "JavaScript → TypeScript", color: ["javascript_file"], size: ["javascript_file", "typescript_file"], history_size: true },
      { name: "Java → Kotlin", color: ["java_file"], size: ["java_file", "kotlin_file"] },
      { name: "Rust", color: ["rust_file"], size: ["rust_file", "file"], history_size: true },
    ],
  },
  {
    name: "Code health",
    description: "Assertions, feature flags, and work left to do.",
    presets: [
      { name: "DCHECK vs CHECK", color: ["dcheck"], size: ["check", "dcheck"], history_size: true },
      { name: "Feature flags", color: ["base_feature"], size: ["line"] },
      { name: "TODOs", color: ["todo"], size: ["line"] },
    ],
  },
];

const todayIso = new Date().toISOString().split("T")[0];

const ENRICHED_CATEGORIES = CATEGORIES.map(category => ({
  ...category,
  presets: category.presets.map<EnrichedPreset>(preset => ({
    ...preset,
    formula: `${preset.color.map(getTreemapMetricName).join(" + ")} ÷ ${preset.size.map(getTreemapMetricName).join(" + ")}`,
    shortFormula: `per ${preset.size.length > 1 ? preset.size.join("+") : getTreemapMetricName(preset.size[0]).toLowerCase()}`,
    allFiles: [...preset.color, ...preset.size],
  })),
}));

// The link to the view, for opening it elsewhere.
const url = (preset: Preset) => `/treemap?${new URLSearchParams({
  field_color: preset.color.join(","),
  field_size: preset.size.join(","),
  repositories: props.repository,
  ...(preset.start && {
    dates: `${preset.start},${todayIso}`,
  }),
  ...(preset.history_size && { history_size: "1" }),
})}`;

const buildCategories = (avail: Set<string> | null) => ENRICHED_CATEGORIES
  .map(category => ({
    ...category,
    presets: avail
      ? category.presets.filter(preset => preset.allFiles.every(file => avail.has(file)))
      : category.presets,
  }))
  .filter(category => category.presets.length > 0);

const categorySignature = (cats: typeof ENRICHED_CATEGORIES) =>
  cats.map(c => `${c.name}:${c.presets.map(p => p.name).join(",")}`).join("|");

// The metrics of the repository. Presets using other metrics are hidden.
const categories = shallowRef(buildCategories(getCachedAvailableMetrics(props.repository) ?? null));
let lastSig = categorySignature(categories.value);

const applyCategories = (avail: Set<string> | null) => {
  const next = buildCategories(avail);
  const sig = categorySignature(next);
  if (sig !== lastSig) {
    lastSig = sig;
    categories.value = next;
  }
};

watch(() => props.repository, async (repository) => {
  const cached = getCachedAvailableMetrics(repository);
  if (cached) {
    applyCategories(cached);
    return;
  }
  const fetched = await fetchRepoAvailableMetrics(repository);
  if (props.repository === repository) {
    applyCategories(fetched);
  }
}, { immediate: true });
</script>

<style scoped>
/* Aligned with the controls above. Shared-hairline grid like the home page. */
.treemap-presets {
  padding: 0 1.5rem 2rem;
}

.intro {
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 0.85rem;
}

.bento {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
}

@media (min-width: 769px) {
  .bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .bento {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.bento-tile {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  margin: 0 -1px -1px 0;
  padding: 1.25rem 1.4rem;
}

h2 {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 640;
  letter-spacing: -0.02em;
}

.description {
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.45;
  margin: 0.2rem 0 0.75rem;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  list-style: none;
  margin: 0 -0.5rem;
  padding: 0;
}

.preset-item {
  align-items: baseline;
  border-radius: var(--radius-sm);
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.3rem 0.5rem;
  position: relative;
  transition: background 0.12s;
}

.preset-item:hover {
  background: var(--surface-sunken);
}

.preset-item a {
  font-size: 0.9rem;
  font-weight: 520;
}

.preset-item a::after {
  content: "";
  inset: 0;
  position: absolute;
}

.preset-formula {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
