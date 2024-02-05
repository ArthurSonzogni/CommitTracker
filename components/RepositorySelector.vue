<template>
  <b-field>
    <b-field :label="label" grouped group-multiline id="arthur">
      <b-checkbox-button
        v-if="allowAll"
        :size="size"
        name="all"
        :value="!all"
        @input="updateAll()"
        type="is-warning"
        >
        All
      </b-checkbox-button>
      <b-checkbox-button
        style="margin-right: -0.02rem; margin-left: 0"
        name="repositories"
        v-for="(item, index) in items"
        :size="size"
        :value="value"
        @input="update(repositories[index].dirname)"
        :native-value="repositories[index].dirname"
        >
        {{repositories[index].name}}
      </b-checkbox-button>
    </b-field>

    <b-checkbox
      v-if="allowMultiple"
      :size="size"
      name="multiple"
      v-model="multiple"
      >
      Multiple
    </b-checkbox>

  </b-field>
</template>

<script>

import repositories from 'static/data/repositories.json'

export default {
  props: {
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
  },

  data() {
    const items = repositories.map(item => item.dirname);
    const multiple = this.value.length > 1;
    const all = this.value.length == items.length;
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

  computed: {
    all() {
      return this.value.length == this.items.length;
    },
  },
}

</script>
