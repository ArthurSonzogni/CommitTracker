<template>
  <b-field grouped>
    <b-field :label="label">
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
    return {
      multiple: false,
      items: [
        "Chrome",
        "V8",
        "Skia",
        "Angle",
        "Dawn",
        "WebRTC",
        "PDFium",
      ],
    };
  },


  methods: {
    update(item) {
      if (this.multiple) {
        const newValue = [...this.value];
        const index = newValue.indexOf(item);
        if (index === -1) {
          newValue.push(item);
        } else {
          newValue.splice(index, 1);
        }
        console.log(newValue);
        this.$emit('input', newValue.sort());
      } else {
        this.$emit('input', [item]);
      }
    },
  }
}

</script>
