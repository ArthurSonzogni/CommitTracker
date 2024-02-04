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
    return {
      repositories,
      multiple,
      items,
    };
  },


  methods: {
    updateAll() {
      if (this.all) {
        this.$emit('input', []);
      } else {
        this.multiple = this.allowMultiple
        this.$emit('input', this.items.map(item => item.toLowerCase()));
      }
    },
    update(item) {
      this.multiple &= this.allowMultiple;

      if (this.multiple) {
        const newValue = [...this.value];
        const index = newValue.indexOf(item);
        if (index === -1) {
          console.log("not found")
          newValue.push(item);
        } else {
          console.log("found")
          newValue.splice(index, 1);
        }
        this.$emit('input', newValue.sort());
        return;
      }

      this.$emit('input', [item]);
    },
  },

  computed: {
    all() {
      return this.value.length == this.items.length;
    },
  },
}

</script>
