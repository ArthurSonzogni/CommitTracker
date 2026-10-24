<template>
  <div class="organization-selector">
    <div class="sort-buttons">
      <button class="sort-button"
              title="Sort alphabetically"
              aria-label="Sort alphabetically"
              @click="sortOrganizationsAlphabetically"
              >
              <b-icon icon="sort-alphabetical-descending-variant"></b-icon>
      </button>
      <button class="sort-button"
              title="Sort by commits"
              aria-label="Sort by commits"
              @click="sortOrganizationsByCommits"
              >
              <b-icon icon="sort"></b-icon>
      </button>
    </div>

    <!-- A single row, scrolling horizontally. -->
    <div class="fields chip-track">
      <b-checkbox-button
        name="organizations"
        v-for="(item, index) in items"
        :key="index"
        :size="size"
        v-model="value"
        @input="update(item)"
        :native-value="item"
        >
        <b-icon
          :icon="item.toLowerCase()"
          size="is-small"
          v-if="availableIcon.includes(item.toLowerCase())"
          ></b-icon>
        {{item}}
      </b-checkbox-button>
    </div>

    <div class="options">
      <b-checkbox
        v-if="allowAll"
        :size="size"
        name="all"
        :value="all"
        @input="updateAll()"
        type="is-warning"
        >
        All
      </b-checkbox>
      <b-checkbox
        v-if="allowMultiple"
        :size="size"
        name="multiple"
        v-model="multiple"
        >
        Multiple
      </b-checkbox>
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">

import organizations_data from '../public/data/organizations.json'

const props = defineProps({
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
    default: "is-small",
    type: String,
    required: true
  },

  label: {
    default: "",
    type: String,
    required: false
  },

  repositories: {
    type: Array[String],
    required: false,
    default: () => [],
  },
});

const value = defineModel();
const items = ref(structuredClone(organizations_data));
const multiple = ref(value.value.length > 1 && props.allowMultiple);
const all = ref(value.value.length == items.value.length);
const availableIcon = ref([
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

const sortOrganizationsByCommits = async () => {
  const summary_response  = await fetch('/data/organizations_summary.json')
  const summary = await summary_response.json()
  const sum = {}
  for(const org of items.value) {
    sum[org] = 0;
    for(const repo of props.repositories) {
      if (summary[repo]) {
        sum[org] += summary[repo][org] || 0;
      }
    }
  }

  items.value.sort((a, b) => {
    const diff = sum[b] - sum[a];
    if (diff == 0) {
      return a.localeCompare(b);
    }
    return diff;
  });
};

const sortOrganizationsAlphabetically = () => {
  items.value.sort();
};


const updateAll = () => {
  all.value = !all.value;
  if (all.value) {
    multiple.value = props.allowMultiple
    value.value = organizations_data;
  } else {
    multiple.value = false;
    value.value = [];
  }
};

const update = (item) => {
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
};

onMounted(() => {
  sortOrganizationsByCommits();
});

</script>

<style scoped>

.organization-selector {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 1.5rem;
  padding-top: 0.5rem;
}

/* Keep the sort buttons on the same row, even on narrow screens. */
.organization-selector .chip-track {
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
