<template>
  <b-field grouped>
    <b-field
      v-for="(list, i) in possibleValues"
      :key="i"
    >
      <b-checkbox-button
        :native-value="item"
        :size="size"
        :value="value"
        @input="update(item)"
        name="list"
        v-for="item in list"
        :key="item"
      >
        {{item}}
      </b-checkbox-button>
    </b-field>

  </b-field>
</template>

<script>

export default {
  props: {
    value: {
      type: Array[String],
      required: true
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
    this.possibleValues =  [
      [
        'forever',
      ],
      [
        '1y+4y',
        '1y+3y',
        '1y+2y',
        '1y+1y',
        '1y',
      ],
      [
        '6m',
        '3m',
        '1m',
        '1w',
      ]
    ];

    return {
      items: this.possibleValues.flat(),
    };
  },


  methods: {
    update(item) {
      this.$emit('input', [item]);
    },
  }
}

</script>
