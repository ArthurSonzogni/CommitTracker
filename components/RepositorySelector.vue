<template>
  <div class="repository-selector">

    <!-- The list of repositories. A single row, scrolling horizontally. -->
    <div class="fields chip-track" :class="{ 'is-multiple': multiple }" ref="fields">
      <template
        v-for="(item, index) in items"
        :key="index"
        >
        <UiToggle v-if="filter(repositories[index])" v-model="value" :value="repositories[index].dirname" @input="update(repositories[index].dirname)">
          {{repositories[index].name}}
        </UiToggle>
      </template>
    </div>

    <!-- The options -->
    <div class="options" v-if="allowAll || allowMultiple">
      <!-- The "All" checkbox -->
      <UiCheckbox v-if="allowAll" name="all" v-model="all" @input="updateAll()">
        All
      </UiCheckbox>
      <!-- The "Multiple" checkbox -->
      <UiCheckbox v-if="allowMultiple" name="multiple" v-model="multiple">
        Multiple
      </UiCheckbox>
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
  const container = fields.value;
  const selected = container?.querySelector(".is-selected") as HTMLElement | null;
  if (container && selected && selected !== container.firstElementChild) {
    requestAnimationFrame(() => {
      if (fields.value && selected.isConnected) {
        fields.value.scrollLeft = selected.offsetLeft - 24;
      }
    });
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

.options {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 1rem;
}

</style>
