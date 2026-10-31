<template>
  <UiTagInput
    v-model="value"
    :suggestions="entryListFiltered"
    :allow-new="false"
    :max-height="'330px'"
    icon="label"
    field="name"
    :placeholder="placeholder"
    open-on-focus
    @input="updateInput"
    @typing="computeFilteredList">
    <template #default="{ option }">
      <strong class="mr-2 is-size-6">{{ option.name }}</strong>
      <template v-if="option.tags">
        <span
          v-for="tag in option.tags"
          :key="tag"
          class="tag option-tag"
          :style="tagChipStyle(tag)">
          {{ tag }}
        </span>
      </template>
      <p class="option-description">{{ option.description }}</p>
    </template>
    <template #header>
      <div class="content">
        <strong class="is-size-4">Metrics</strong>
      </div>
    </template>
  </UiTagInput>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import repositoriesJson from "../public/data/repositories.json";
import { tagChipStyle } from "~/utils/palette";
import {
  allTreemapMetrics,
  fetchRepoAvailableMetrics,
  getCachedAvailableMetrics,
} from "~/utils/treemapMetrics";

const value = defineModel<any[]>("value", { default: () => [] });

const props = defineProps({
  placeholder: {
    type: String,
    default: "Type to filter",
  },
  repositories: {
    type: Array as PropType<string[]>,
    default: () => [repositoriesJson[0]?.dirname || "chromium"],
  },
});

const emit = defineEmits(["input"]);

const availableMetrics = shallowRef(new Set<string>());
const entryListFiltered = shallowRef<any[]>([]);

const computeFilteredList = (name: string) => {
  const query = name?.toLowerCase() || "";
  const avail = availableMetrics.value;
  entryListFiltered.value = allTreemapMetrics.filter((option) => {
    if (!avail.has(option.file)) return false;
    if (!query) return true;
    return option.searchText.includes(query);
  });
};

const applyAvailableSet = (set: Set<string>) => {
  availableMetrics.value = set;
  computeFilteredList("");

  if (value.value && Array.isArray(value.value)) {
    const newValue = value.value.filter((item: any) => set.has(item.file));
    if (newValue.length !== value.value.length) {
      value.value = newValue;
    }
  }
};

const fetchAvailableMetrics = async () => {
  const repos = props.repositories || [];
  if (repos.length === 0) {
    applyAvailableSet(new Set());
    return;
  }

  if (repos.length === 1) {
    const sync = getCachedAvailableMetrics(repos[0]);
    if (sync) {
      applyAvailableSet(sync);
      return;
    }
  }

  const sets = await Promise.all(repos.map((repo) => fetchRepoAvailableMetrics(repo)));
  let intersection = sets[0] || new Set<string>();
  for (let i = 1; i < sets.length; i++) {
    const next = new Set<string>();
    for (const elem of intersection) {
      if (sets[i].has(elem)) next.add(elem);
    }
    intersection = next;
  }
  applyAvailableSet(intersection);
};

watch(() => props.repositories, fetchAvailableMetrics, { immediate: true });

const updateInput = (name: unknown) => {
  emit("input", name);
};
</script>

<style scoped>
.option-tag {
  margin-right: 0.25rem;
}

.option-description {
  font-style: italic;
}
</style>
