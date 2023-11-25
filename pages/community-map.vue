<template>
  <div class="fullscreenFlexbox">
    <Navbar/>
    <section class="section zoom">

      <RepositorySelector
        v-model="repositories"
        size="small"
        :allowMultiple="false"
        :allowAll="true"
        />

      <TimeRangeSelector
        v-model="time"
        size="small"
        />

      <b-field grouped>
        <b-field grouped>
          <b-button
            label="Readme"
            @click="displayReadme = !displayReadme"
            type="is-warning"
            />
          </b-button>
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

    <section class="section" v-if="displayReadme">
      <div class="container">
        <b-message
          title="Readme"
          v-model="displayReadme"
          aria-close-label="Close message"
          >
          <div class="content">
            <ul>
              <li>
                Data is refreshed <strong>weekly</strong>, and
                <strong>automatically</strong>. See <a
                  href="https://github.com/ArthurSonzogni/ChromeCommitTracker/actions/workflows/importer-graph.yaml">Job</a>
              </li>
              <li>
                <strong>Label height</strong> is proportional to the number
                contributions square root (author + review). The goal is to make
                the surface used to draw one characters proportional to the
                number of commits.
              </li>
              <li>
                <strong>Edge thickness</strong> is proportional to the number
                of commit flowing from one author to a reviewer. We ignore long
                distance edges with a low number of commit. To be precise, there
                is a "commit" / "length" threshold. The "real" graph is extremly
                dense and difficult to interpret.
              </li>
              <li>
                <strong>Edge orientation</strong> helps understanding who is the
                author and who is the reviewer. The edge turn left when going
                from the author to the reviewer.
              </li>
              <li>
                <strong>Colors</strong> represent different communities who
                strongly interact together, and do not outside Often, the number
                of communities is high when considering small range of time
                (small project), and low when considering large range of time
                (large product). We are using the
                <a href="https://en.wikipedia.org/wiki/Louvain_method">
                  Louvain algorithm
                </a>.
                <li>
                  <strong>Code reviews before 2017 are not included.</strong>,
                  the data wasn't part of the commit description before.
                </li>
            </ul>
          </div>
        </b-message>
      </div>
    </section>

    <div class="zoomable">
      <svg></svg>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    let repositories = ["v8"];
    if (this.$route.query.repositories) {
      repositories = this.$route.query.repositories.split(",");
    }
    let time = ["forever"];
    if (this.$route.query.time) {
      time = this.$route.query.time.split(",");
    }
    let zoom = 1;
    if (this.$route.query.zoom) {
      zoom = parseFloat(this.$route.query.zoom);
    }
    return {
      repositories,
      time,
      zoom,
      displayReadme: false,
    }
  },

  computed: {
    dataset() {
      const repo = this.repositories.length == 1
        ? this.repositories[0]
        : "all";
      const time = this.time[0];
      return `${repo}_${time}.svg`;
    },
    objectSrc() {
      return "/community-map/" + this.dataset;
    }
  },

  mounted() {
    this.updateUrl();
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
    async updateUrl() {
      this.$router.push({
        query: {
          time: this.time.join(","),
          zoom: this.zoom,
          repositories: this.repositories.join(","),
        }
      });

      const response = await fetch(this.objectSrc)
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (!svg) {
        return;
      }
      document.querySelector("svg").replaceWith(svg);
      svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
      svg.setAttribute("margin", "auto")
      this.updateZoom();
    },

    updateZoom() {
      const svg = document.querySelector("svg");
      svg.setAttribute("width", this.zoom * 95 + "vw");
      svg.setAttribute("height", this.zoom * 95 * 0.5 + "vw");
    }
  },

  watch: {
    time: "updateUrl",
    zoom: "updateUrl",
    repositories: "updateUrl",
  },

}

</script>

<style scope>

svg {
  transition: width 0.5s, height 0.5s;
}

.fullscreenFlexbox {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.zoomable{
  overflow: scroll;
  width: 100%;
  height: 100%;
}

.zoomable::-webkit-scrollbar {
  width: 3px;
  height:3px;
}

.zoomable:hover::-webkit-scrollbar {
  width: 10px;
  height:10px;
}

.zoomable::-webkit-scrollbar-track {
  background: transparent;
}

.zoomable::-webkit-scrollbar-thumb {
  background-color: rgba(128,128,128,0.5);
  border-radius: 8px;
}

.zoomable::-webkit-scrollbar-thumb:hover {
  background-color: rgba(128,128,128,1.0);
}

html {
  scroll-behavior: smooth;
}

.zoom {
  backdrop-filter: blur(5px);
  background-color: rgba(255, 255, 255, 0.5);
  margin-top:0;
  padding: 10px;
  padding-left:24px;
  padding-right:24px;
}
</style>
