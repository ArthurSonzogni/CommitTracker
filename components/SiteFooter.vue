<template>
  <footer class="site-footer">
    <span v-if="updated" :title="updated.toISOString()">
      Data updated {{ ago }} ({{ updated.toISOString().slice(0, 10) }})
    </span>
    <a href="https://github.com/ArthurSonzogni/CommitTracker">Source on GitHub</a>
  </footer>
</template>

<script setup lang="ts">
// The date of the data shown by the page: the last update of the data branch
// it comes from, written by pull-data.sh.

const BRANCHES: [RegExp, string][] = [
  [/^\/treemap/, "treemap"],
  [/^\/cve/, "cve"],
  [/^\/communities/, "community-map"],
  [/^\/fuzz-test/, "fuzz-test"],
  [/^\/commit-rates/, "commit_rates"],
];

const route = useRoute();
const dates = ref<Record<string, string>>({});
onMounted(async () => {
  try {
    const response = await fetch("/data_updated.json");
    if (response.ok) {
      dates.value = await response.json();
    }
  } catch (e) {}
});

const updated = computed(() => {
  const branch = BRANCHES.find(([path]) => path.test(route.path))?.[1] ?? "data";
  const date = dates.value[branch];
  return date ? new Date(date) : null;
});

const ago = computed(() => {
  const days = Math.floor((Date.now() - updated.value!.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days == 1) return "yesterday";
  return `${days} days ago`;
});
</script>

<style scoped>
.site-footer {
  border-top: 1px solid var(--line);
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.5rem 1.5rem;
  justify-content: space-between;
  margin-top: 2rem;
  padding: 1.25rem 1.5rem;
}

.site-footer a {
  color: var(--muted);
}

.site-footer a:hover {
  color: var(--ink);
}
</style>
