<template>
  <div class="repository-selector">

    <!-- The list of repositories. A single row, scrolling horizontally. -->
    <div class="fields" ref="fields">
      <template
        v-for="(item, index) in items"
        :key="index"
        >
        <b-checkbox-button
          name="repositories"
          v-if="filter(repositories[index])"
          :size="size"
          v-model="value"
          :native-value="repositories[index].dirname"
          @input="update(repositories[index].dirname)"
          >
          {{repositories[index].name}}
        </b-checkbox-button>
      </template>
    </div>

    <!-- The options -->
    <div class="options" v-if="allowAll || allowMultiple">
      <!-- The "All" checkbox -->
      <b-checkbox
        v-if="allowAll"
        :size="size"
        name="all"
        type="is-warning"
        v-model="all"
        @input="updateAll()"
        >
        All
      </b-checkbox>
      <!-- The "Multiple" checkbox -->
      <b-checkbox
        v-if="allowMultiple"
        :size="size"
        name="multiple"
        v-model="multiple"
        >
        Multiple
      </b-checkbox>
    </div>
  </div>
</template>

<script setup lang="ts">

import repositories_json from '../public/data/repositories.json'

const value = defineModel();

const props = defineProps({
  filter: {
    type: Function,
    required: false,
    default: () => true,
  },

  allowMultiple: {
    type: Boolean,
    required: false,
    default: false,
  },

  allowAll: {
    type: Boolean,
    required: false,
    default: false,
  },

  size: {
    type: String,
    default: "is-small",
    required: false,
  },
})

const repositories = ref(repositories_json);
const items = ref(repositories_json.map(item => item.dirname));
const multiple = ref(value.value.length > 1);

const all = ref(value.value.length == items.value.filter(item => {
  for(const repo of repositories_json) {
    if (repo.dirname.toLowerCase() === item) {
      return repo.parent == undefined;
    }
  }
  return false;
}).length);

const updateAll = async () => {
  all.value = !all.value;
  if (!all.value) {
    value.value = [];
    return;
  }

  multiple.value = props.allowMultiple.value;

  const all_repositories = items.value
    .map(item => item.toLowerCase())
    .filter(item => {
      for(const repo of repositories.value) {
        if (repo.dirname.toLowerCase() === item) {
          return repo.parent == undefined;
        }
      }
      return false;
    })
  value.value = all_repositories;
}

// Scroll the first selected repository into view, without scrolling the page.
const fields = ref<HTMLElement | null>(null);
onMounted(() => {
  const selected = fields.value?.querySelector(".is-primary")?.closest(".control");
  if (selected) {
    fields.value.scrollLeft = (selected as HTMLElement).offsetLeft - 24;
  }
});

function update(item: string) {
  all.value = false;
  if (!multiple.value) {
    value.value = [item];
    return;
  }

  const newValue = [...value.value];
  const index = newValue.indexOf(item);
  if (index === -1) {
    newValue.push(item);
  } else {
    newValue.splice(index, 1);
  }
  value.value = newValue.sort();
  return;
}

</script>
<style scoped>

.repository-selector {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 1rem 0 0.75rem;
}

/* Segmented control track, like the radio button groups. */
.fields {
  background: var(--surface-sunken);
  border-radius: calc(var(--radius) + 3px);
  box-shadow: inset 0 0 0 1px rgba(18, 18, 22, 0.04);
  display: flex;
  flex: 1 1 20rem;
  flex-wrap: nowrap;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  padding: 3px;
  position: relative;
  scrollbar-width: none;

  /* Fade the edges that have more content to scroll to. */
  mask-image: linear-gradient(to right,
    transparent, #000 var(--fade-start),
    #000 calc(100% - var(--fade-end)), transparent);
  animation: scroll-fade linear both;
  animation-timeline: scroll(self inline);
}

.fields::-webkit-scrollbar {
  display: none;
}

@property --fade-start {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@property --fade-end {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@keyframes scroll-fade {
  from { --fade-start: 0px; --fade-end: 2rem; }
  8% { --fade-start: 2rem; }
  92% { --fade-end: 2rem; }
  to { --fade-start: 2rem; --fade-end: 0px; }
}

.fields > :deep(.control) {
  flex: 0 0 auto;
}

.fields :deep(.b-checkbox.checkbox.button) {
  background: transparent;
  border: none;
  border-radius: var(--radius) !important;
  box-shadow: none;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 540;
  height: 1.75rem;
  padding: 0 0.65rem;
}

.fields :deep(.b-checkbox.checkbox.button:hover) {
  background: rgba(255, 255, 255, 0.6);
  color: var(--ink);
}

.fields :deep(.b-checkbox.checkbox.button.is-primary) {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--ink);
}

.options {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 1rem;
}

.options :deep(.b-checkbox.checkbox) {
  font-size: 0.85rem;
  margin-right: 0;
}

</style>
