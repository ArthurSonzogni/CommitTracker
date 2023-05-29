<template>
  <div>
    <Navbar/>
    <div
      class="zoomable">
      <object
        :data="objectSrc"
        type="image/svg+xml"
        ref="svg"
        ></object>
    </div>
    <section class="section zoom">
      <b-field grouped>
        <b-field label="Dataset" label-position="on-border">
          <b-select
            placeholder="Dataset"
            v-model="dataset"
            >
            <option
              v-for="option in data"
              :value="option"
              :key="option">
            {{ option }}
            </option>
          </b-select>
        </b-field>
        <b-field grouped>
          <b-button @click="view" type="is-info"> View</b-button>
          <b-button @click="download" type="is-info is-light"> Download </b-button>
        </b-field>
        <b-field label="Zoom" label-position="on-border" expanded>
          <b-slider
            v-model="zoom"
            :min="0.1"
            :max="6"
            :step="0.05"
            :tooltip="false"
            lazy
            indicator
            ></b-slider>
        </b-field>
      </b-field>
    </section>
  </div>
</template>

<script>
export default {
  data() {
    return {
      zoom: 1,
      dataset: "2022-link-1.svg",
      data: [
        "2021-1.svg",
        "2021-2.svg",
        "2021-3.svg",
        "2022-link-1.svg",
        "2022-link-2.svg",
        "2022-no-link.svg",
        "2022.svg",
        "all.svg",
        "test.svg",
      ],
    }
  },
  computed: {
    objectSrc() {
      return "/ChromeCommitTracker/community-map/" + this.dataset;
    }
  },
  mounted() {
    this.$refs.svg.width = Math.round(100*this.zoom) + "%";
    this.$refs.svg.height = Math.round(100*this.zoom) + "%";
  },
  watch: {
    zoom() {
      this.$refs.svg.width = Math.round(100*this.zoom) + "%";
      this.$refs.svg.height = Math.round(100*this.zoom) + "%";
    }
  },
  methods: {
    view() {
      location.href = this.objectSrc;
    },
    download() {
      const a = document.createElement("a");
      a.href = this.objectSrc;
      a.download = this.dataset;
      a.click();
    },
  }
}

</script>

<style scope>
.zoomable{
  all:unset;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: scroll;
}

object {
  transition: all 0.5s;
}

.zoom {
  backdrop-filter: blur(5px);
  background-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  margin-top:0;
  padding: 10px;
}
</style>
