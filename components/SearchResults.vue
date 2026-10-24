<template>
  <ul :id="id" class="search-results" role="listbox" ref="list">
    <template v-for="(item, index) in results" :key="item.key">
      <li
        v-if="index === 0 || results[index - 1].group !== item.group"
        class="search-group"
        role="presentation">
        {{ item.group }}
      </li>
      <li
        :id="`${id}-${index}`"
        role="option"
        :aria-selected="index === active"
        :class="['search-item', { 'is-active': index === active }]"
        @mousemove="emit('hover', index)"
        @mousedown.prevent
        @click="emit('select', item)">
        <UiIcon :name="item.icon" class="search-item-icon" size="small"></UiIcon>
        <span class="search-item-label">{{ item.label }}</span>
        <span v-if="item.hint" class="search-item-hint">{{ item.hint }}</span>
      </li>
    </template>
    <li v-if="results.length === 0" class="search-empty">No results</li>
  </ul>
</template>

<script setup lang="ts">
import type { SearchItem } from '~/composables/useSiteSearch'

const props = defineProps<{
  id: string;
  results: SearchItem[];
  active: number;
}>();

const emit = defineEmits<{
  select: [item: SearchItem];
  hover: [index: number];
}>();

const list = ref<HTMLElement | null>(null);

watch(() => props.active, async () => {
  await nextTick();
  list.value?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
});
</script>

<style scoped>
.search-results {
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 0.4rem;
}

.search-group {
  color: var(--faint);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0.6rem 0.6rem 0.3rem;
  text-transform: uppercase;
}

.search-item {
  align-items: center;
  border-radius: var(--radius);
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  font-size: 0.9rem;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
}

.search-item.is-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.search-item-icon {
  color: var(--faint);
}

.search-item.is-active .search-item-icon {
  color: var(--accent);
}

.search-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-item-hint {
  color: var(--faint);
  font-size: 0.78rem;
}

.search-empty {
  color: var(--muted);
  padding: 1.5rem;
  text-align: center;
}
</style>
