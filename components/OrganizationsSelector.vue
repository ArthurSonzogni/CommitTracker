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
        name="organizations"
        v-for="(item, index) in items"
        :size="size"
        :value="value"
        @input="update(item)"
        :native-value="item"
        >
        {{item}}
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

import organizations from 'static/data/organizations.json'

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
    const items = organizations;
    const multiple = (this.value.length > 1) && this.allowMultiple;
    const all = this.value.length == items.length;
    return {
      organizations,
      multiple,
      items,
      all,
    };
  },


  methods: {
    updateAll() {
      this.all = !this.all;
      if (this.all) {
        this.multiple = this.allowMultiple
        this.$emit('input', this.items)
      } else {
        this.multiple = false;
        this.$emit('input', []);
      }
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
      this.$emit('input', newValue.sort());
    },
  },

  computed: {
    all() {
      return this.value.length == this.items.length;
    },
  },
}

</script>
