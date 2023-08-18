<template>
  <b-field>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="chrome"> Chrome </b-radio-button>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="v8"> V8 </b-radio-button>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="skia"> Skia </b-radio-button>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="angle"> Angle </b-radio-button>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="dawn"> Dawn </b-radio-button>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="webrtc"> WebRTC </b-radio-button>
    <b-radio-button :size="size" name="repositories" v-model="value" native-value="pdfium"> PDFium</b-radio-button>
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
  watch: {
    value() {
      this.$emit('input', this.value);
    }
  }
}

</script>
