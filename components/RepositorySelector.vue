<template>
  <div class="columns">
    <div class="fields column">
      <b-checkbox-button
        style="margin-right: -0.02rem; margin-left: 0"
        name="repositories"
        v-for="(item, index) in items"
        v-if="filter(repositories[index])"
        :key="index"
        :size="size"
        :value="value"
        :native-value="repositories[index].dirname"
        @input="update(repositories[index].dirname)"
        >
        {{repositories[index].name}}
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
    </div>
  </div>
</template>

<script>

import repositories from 'static/data/repositories.json'

export default {
  props: {
    filter: {
      type: Function,
      required: false,
      default: () => true,
    },

    value: {
      type: Array[String],
      required: true
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
      default: "is-small",
      type: String,
      required: true
    },

    label: {
      default: "",
      type: String,
      required: false
    },

    has_reviewers: {
      default: false,
      type: Boolean,
      required: false
    }
  },

  data() {
    const items = repositories.map(item => item.dirname);
    const multiple = this.value.length > 1;
    const all = this.value.length == items.filter(item => {
      for(const repo of repositories) {
        if (repo.dirname.toLowerCase() === item) {
          return repo.parent == undefined;
        }
      }
      return false;
    }).length;
    return {
      repositories,
      multiple,
      items,
      all,
    };
  },


  methods: {
    updateAll() {
      this.all = !this.all;
      if (!this.all) {
        this.$emit('input', []);
        return;
      }

      this.multiple = this.allowMultiple
      const all = this.items
        .map(item => item.toLowerCase())
        .filter(item => {
          for(const repo of this.repositories) {
            if (repo.dirname.toLowerCase() === item) {
              return repo.parent == undefined;
            }
          }
          return false;
        })
      this.$emit('input', all);
    },
    update(item) {
      if (!this.multiple) {
        this.$emit('input', [item]);
        return;
      }

      const newValue = [...this.value];
      const index = newValue.indexOf(item);
      if (index === -1) {
        newValue.push(item);
      } else {
        newValue.splice(index, 1);
      }

      // Tweak to avoid including twice the same repository.

      this.$emit('input', newValue.sort());
      return;
    },
  },
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
