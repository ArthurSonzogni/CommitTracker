<template>
  <div class="columns">

    <!-- The list of repositories -->
    <div class="fields column">
      <template
        v-for="(item, index) in items"
        :key="index"
        >
        <b-checkbox-button
          style="margin-right: -0.02rem; margin-left: 0"
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
      <div class="spacer"></div>
    </div>

    <!-- The options -->
    <div class="column is-narrow">
      <div>
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
      </div>
      <div>
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

.columns {
  padding-top: 1rem;
}

.fields {
  background-color: #f5f5f5;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin:0;
  padding:0.2rem;
  max-height: 25vh;
  overflow-y: auto;
}

.fields > * {
  flex: 1;
  padding-top:0.1rem;
  padding-bottom:0.1rem;
  padding-left: 0.1rem;
  padding-right: 0.1rem;
}

.spacer {
  flex: 10;
}

</style>
