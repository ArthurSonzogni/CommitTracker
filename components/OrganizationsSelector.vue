<template>
  <ChipSelector
    v-model="value"
    class="organization-selector"
    :items="chipItems"
    :allow-multiple="allowMultiple"
    :allow-all="allowAll">
    <template #leading>
      <div class="sort-buttons">
        <button
          type="button"
          class="sort-button"
          title="Sort alphabetically"
          aria-label="Sort alphabetically"
          @click="sortOrganizationsAlphabetically">
          <UiIcon name="sort-alphabetical-descending-variant" />
        </button>
        <button
          type="button"
          class="sort-button"
          title="Sort by commits"
          aria-label="Sort by commits"
          @click="sortOrganizationsByCommits">
          <UiIcon name="sort" />
        </button>
      </div>
    </template>
    <slot />
  </ChipSelector>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import organizationsData from "../public/data/organizations.json";

const AVAILABLE_ICONS = new Set([
  "adobe",
  "amazon",
  "apple",
  "facebook",
  "google",
  "microsoft",
  "netflix",
  "opera",
  "redhat",
  "slack",
]);

let summaryPromise: Promise<Record<string, Record<string, number>>> | null = null;
const fetchOrganizationsSummary = () =>
  (summaryPromise ??= fetch("/data/organizations_summary.json").then((res) =>
    res.ok ? res.json() : {},
  ));

const props = defineProps({
  allowMultiple: {
    type: Boolean,
    default: false,
  },
  allowAll: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: "is-small",
  },
  label: {
    type: String,
    default: "",
  },
  repositories: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
});

const value = defineModel<string[]>({ default: () => [] });
const items = ref<string[]>([...organizationsData]);
const sortMode = ref<"commits" | "alphabetical">("commits");

const chipItems = computed(() =>
  items.value.map((org) => {
    const lower = org.toLowerCase();
    return {
      id: org,
      label: org,
      icon: AVAILABLE_ICONS.has(lower) ? lower : undefined,
    };
  }),
);

let sortRequestId = 0;

const applyCommitsSort = async () => {
  const reqId = ++sortRequestId;
  const repos = [...(props.repositories ?? [])];
  const summary = await fetchOrganizationsSummary();
  if (reqId !== sortRequestId || sortMode.value !== "commits") return;

  const sums: Record<string, number> = {};
  for (const org of organizationsData) {
    let total = 0;
    for (const repo of repos) {
      total += summary[repo]?.[org] || 0;
    }
    sums[org] = total;
  }

  items.value = [...organizationsData].sort((a, b) => {
    const diff = (sums[b] ?? 0) - (sums[a] ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
};

const sortOrganizationsByCommits = () => {
  sortMode.value = "commits";
  applyCommitsSort();
};

const sortOrganizationsAlphabetically = () => {
  sortMode.value = "alphabetical";
  ++sortRequestId;
  items.value = [...organizationsData].sort((a, b) => a.localeCompare(b));
};

watch(
  () => (props.repositories ?? []).join("\0"),
  () => {
    if (sortMode.value === "commits") {
      applyCommitsSort();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.organization-selector {
  margin-bottom: 1.5rem;
  padding-top: 0.5rem;
}

/* Keep the sort buttons on the same row, even on narrow screens. */
.organization-selector :deep(.chip-track) {
  flex-basis: 12rem;
}

.sort-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}

.sort-button {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  height: 2.1rem;
  justify-content: center;
  width: 2.1rem;
}

.sort-button:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}
</style>
