<template>
  <b-field grouped>
    <b-field :label="label">
      <b-checkbox-button
        v-if="allowAll"
        :size="size"
        name="all"
        v-model="all"
        @input="updateAll()"
        type="is-warning"
        >
        All
      </b-checkbox-button>
      <b-checkbox-button
        name="repositories"
        v-for="item in items"
        :size="size"
        :value="value"
        @input="update(item.toLowerCase())"
        :native-value="item.toLowerCase()">{{item}}</b-checkbox-button>
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
    const items = [
      "Chrome",
      "V8",
      "Skia",
      "Angle",
      "Dawn",
      "WebRTC",
      "PDFium",
      "Devtool-Frontend",
    ];
    const multiple = this.value.length > 1;
    const all = !(items.length == this.value.length);
    return {
      multiple,
      all,
      items,
    };
  },


  methods: {
    updateAll() {
      if (this.all) {
        this.$emit('input', []);
      } else {
        this.multiple = true;
        this.$emit('input', this.items.map(item => item.toLowerCase()));
      }
    },
    update(item) {
      if (!this.all) {
        this.all = true;
        this.$emit('input', [item]);
        return;
      }

      this.multiple &= this.allowMultiple;

      if (this.multiple) {
        const newValue = [...this.value];
        const index = newValue.indexOf(item);
        if (index === -1) {
          newValue.push(item);
        } else {
          newValue.splice(index, 1);
        }
        this.$emit('input', newValue.sort());
        return;
      }

      this.$emit('input', [item]);
    },
  }
}

</script>
