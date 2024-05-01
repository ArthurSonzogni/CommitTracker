<template>
  <div>
    <div class="columns">
      <div class="fields column">
        <button class="sort-button"
                @click="sortOrganizationsAlphabetically"
                >
                <b-icon icon="sort-alphabetical-descending-variant" size="is-medium"> sort alphabetically</b-icon>
        </button>
        <button class="sort-button"
                @click="sortOrganizationsByCommits"
                >
                <b-icon icon="sort" size="is-medium"> sort by commits</b-icon>
        </button>
        <b-checkbox-button
          style="margin-right: -0.02rem; margin-left: 0"
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

        <div class="spacer"></div>
      </div>

      <div class="column is-narrow">
        <div>
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
        </div>
        <div>
          <b-checkbox
            v-if="allowMultiple"
            :size="size"
            name="multiple"
            v-model="multiple"
            >
            Multiple
          </b-checkbox>
        </div>
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import organizations_data from 'public/data/organizations.json'

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

.columns {
  padding-top: 1rem;
  margin-bottom: 2rem;
}

.fields {
  background-color: #f5f5f5;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin:0;
  padding:0.2rem;
  max-height: 20vh;
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

.sort-button {
  flex: 0;
  border: none;
  background-color: transparent;
  margin:0;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0.5;
}

.sort-button:hover {
  cursor: pointer;
  background-color: #e5e5e5;
  opacity: 1.0;
}

.sort-button:active{
  background-color: #d5d5d5;
}

</style>
