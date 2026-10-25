<template>
  <div class="treemap-presets">
    <p class="intro">
      Pick a view, or choose your own metrics above.
    </p>

    <div class="bento">
      <section v-for="category in categories" :key="category.name" class="bento-tile">
        <h2>{{ category.name }}</h2>
        <p class="description">{{ category.description }}</p>
        <ul>
          <li v-for="preset in category.presets" :key="preset.name">
            <a :href="url(preset)" :title="formula(preset)" @click.prevent="emit('select', preset)">{{ preset.name }}</a>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
// Predefined views of the treemap, shown when no metric is selected.

import entries from '../public/treemap/entries.json'

type Preset = {
  name: string; color: string[]; size: string[];
  // The first date of the history, when the metric became relevant.
  start?: string;
  // Also plot the denominator in the history chart.
  history_size?: boolean;
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
      { name: "Polymer → Lit", color: ["lit_element"], size: ["polymer_element", "lit_element"] },
      { name: "Legacy IPC → Mojo", color: ["legacy_ipc"], size: ["line"] },
      { name: "absl::optional → std::optional", color: ["std_optional"], size: ["absl_optional", "std_optional"] },
      { name: "StringPiece → string_view", color: ["string_view"], size: ["string_piece", "string_view"] },
    ],
  },
  {
    name: "Languages",
    description: "Which languages the code is written in.",
    presets: [
      { name: "JavaScript → TypeScript", color: ["javascript_file"], size: ["javascript_file", "typescript_file"] },
      { name: "Java → Kotlin", color: ["java_file"], size: ["java_file", "kotlin_file"] },
      { name: "Rust", color: ["rust_file"], size: ["rust_file", "file"] },
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

// The link to the view, for opening it elsewhere.
const url = (preset: Preset) => `/treemap?${new URLSearchParams({
  field_color: preset.color.join(","),
  field_size: preset.size.join(","),
  repositories: props.repository,
  ...(preset.start && {
    dates: `${preset.start},${new Date().toISOString().split("T")[0]}`,
  }),
  ...(preset.history_size && { history_size: "1" }),
})}`;

const metricName = (file: string) =>
  entries.metrics.find((metric: any) => metric.file === file)?.name ?? file;

const formula = (preset: Preset) =>
  `${preset.color.map(metricName).join(" + ")} ÷ ${preset.size.map(metricName).join(" + ")}`;

// The metrics of the repository. Presets using other metrics are hidden.
const available = ref<Set<string> | null>(null);
watch(() => props.repository, async (repository) => {
  available.value = null;
  try {
    const response = await fetch(`/treemap/${repository}/available_metrics.json`);
    available.value = new Set(await response.json());
  } catch (e) {}
}, { immediate: true });

const categories = computed(() => CATEGORIES
  .map(category => ({
    ...category,
    presets: category.presets.filter(preset =>
      [...preset.color, ...preset.size].every(file =>
        available.value?.has(file) ?? true)),
  }))
  .filter(category => category.presets.length > 0));
</script>

<style scoped>
/* Aligned with the controls above. Tiles like the home page bento. */
.treemap-presets {
  padding: 0 1.5rem 2rem;
}

.intro {
  color: var(--muted);
  margin-bottom: 1rem;
}

.bento {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
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
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-xs);
  padding: 1.2rem 1.4rem;
}

h2 {
  color: var(--ink);
  font-size: 1.1rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.description {
  color: var(--muted);
  font-size: 0.875rem;
  margin: 0.2rem 0 0.6rem;
}

ul {
  list-style: disc;
  margin-left: 1.25rem;
}
</style>
