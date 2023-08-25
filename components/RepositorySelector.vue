<template>
  <b-field>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="chrome"> Chrome </b-radio-button>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="v8"> V8 </b-radio-button>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="skia"> Skia </b-radio-button>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="angle"> Angle </b-radio-button>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="dawn"> Dawn </b-radio-button>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="webrtc"> WebRTC </b-radio-button>
    <b-radio-button :size="size" name="repositories" :value="value" @input="update" native-value="pdfium"> PDFium</b-radio-button>
  </b-field>
</template>

<script>

export default {
  props: {
    value: {
      type: String,
      required: true
    },

    size: {
      default: "is-small",
      type: String,
      required: true
    }
  },

  methods: {
    update(value) {
      this.$emit('input', value);
    },
  }
}

</script>
