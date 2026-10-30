<template>
  <UiTagInput ref="input" v-model="organizations" @typing="filterOrganizations"
    :suggestions="filtered" :allow-new="false" icon="label" field="this"
    placeholder="organization" open-on-focus />
</template>

<script setup lang="ts">
import allOrganizations from '../public/data/organizations.json'

const props = defineProps<{
  options?: string[];
}>();

const organizations = defineModel<string[]>({ default: () => [] });
const input = ref<any>(null);
const query = ref("");
const { $color } = useNuxtApp();

const source = computed(() => props.options?.length ? props.options : allOrganizations);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return source.value.slice(0, 15);
  return source.value
    .filter(org => org.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.toLowerCase().indexOf(q);
      const bi = b.toLowerCase().indexOf(q);
      return (ai === 0 ? 0 : 1) - (bi === 0 ? 0 : 1) || source.value.indexOf(a) - source.value.indexOf(b);
    })
    .slice(0, 15);
});

const filterOrganizations = (text: string) => {
  query.value = text || "";
};

const colorizeTags = async () => {
  await nextTick();
  const elements = input.value?.$el?.querySelectorAll(".tag") || [];
  elements.forEach((element: HTMLElement, i: number) => {
    if (organizations.value[i]) {
      element.style.backgroundColor = $color(organizations.value[i]);
    }
  });
};

onMounted(() => {
  colorizeTags();
  const field = input.value?.$el?.querySelector("input");
  field?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const hovered = input.value?.$el?.querySelector(".dropdown-item.is-hovered");
      const first = input.value?.$el?.querySelector(".dropdown-item");
      if (!hovered && first) first.click();
    }
  });
});

watch(organizations, colorizeTags, { deep: true });
</script>
