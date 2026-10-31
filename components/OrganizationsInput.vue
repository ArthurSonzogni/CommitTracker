<template>
  <UiTagInput
    v-model="organizations"
    :suggestions="filtered"
    :allow-new="false"
    :tag-style="tagChipStyle"
    icon="label"
    field="this"
    placeholder="organization"
    open-on-focus
    @typing="filterOrganizations" />
</template>

<script setup lang="ts">
import allOrganizations from "../public/data/organizations.json";
import { tagChipStyle } from "~/utils/palette";

const props = defineProps<{
  options?: string[];
}>();

const organizations = defineModel<string[]>({ default: () => [] });
const query = ref("");

const source = computed(() =>
  props.options?.length ? props.options : allOrganizations,
);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return source.value.slice(0, 15);
  return source.value
    .filter((org) => org.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.toLowerCase().indexOf(q);
      const bi = b.toLowerCase().indexOf(q);
      return (
        (ai === 0 ? 0 : 1) - (bi === 0 ? 0 : 1) ||
        source.value.indexOf(a) - source.value.indexOf(b)
      );
    })
    .slice(0, 15);
});

const filterOrganizations = (text: string) => {
  query.value = text || "";
};
</script>
