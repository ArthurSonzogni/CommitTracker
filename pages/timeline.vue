<template>
  <div>
    <Navbar/>
    <section class="section">
      <b-field grouped>
        <b-field expanded>
          <b-slider
            v-model="dates"
            :min="0"
            :max="1"
            :step="0.001"
            :custom-formatter="formatDate"
            rounded
            tooltip-always
            lazy
            ></b-slider>
        </b-field>

        <b-field>
          <b-checkbox-button v-model="author"
                             type="is-primary">
            Author
          </b-checkbox-button>

          <b-checkbox-button v-model="review"
                             type="is-primary">
            Review
          </b-checkbox-button>
        </b-field>

        <b-field>
          <b-checkbox-button v-model="stacked"
                             type="is-primary">
            Stacked
          </b-checkbox-button>

        </b-field>
      </b-field>

      <b-field>
        <b-taginput
          v-model="developers"
          @typing="computeDevelopersListFiltered"
          :data="developerListFiltered"
          :allow-new=false
          autocomplete
          icon="label"
          field="this"
          placeholder="developer username"
          type="is-primary"
          size="is-medium"
          >
        </b-taginput>
      </b-field>

    </section>

    <section class="section">
      <Timeline
        :data="developersData"
        :developers="developers"
        :startDate="startDate"
        :endDate="endDate"
        /></Timeline>
    </section>
  </div>
</template>

<script>

import { interpolateDate } from "d3-interpolate";
const interpolator = interpolateDate(new Date("2000-01"), new Date());
const getDate = (val) => interpolator(Math.pow(val, 0.4));

export default {
  name: "App",
  data() {
    return {
      developer: "",
      developers: [],
      developerList: [],
      developerListFiltered: [],
      developersData: [],
      dates : [0, 1],
      startDate: getDate(0),
      endDate: getDate(1),
      patchKind: ["author", "review"],
      author: false,
      review: false,
      stacked: false,
    };
  },
  async fetch() {
    const response = await fetch("./data/users.json");
    const list = await response.json();
    this.developerList = list;
  },
  methods: {
    computeDevelopersListFiltered(developer) {
      this.developerListFiltered = this.developerList.filter((option) => {
        return option.indexOf(developer) >= 0;
      })
    },
    removeDeveloper(developer) {
      this.developers.splice(this.developers.indexOf(developer), 1);
    },
    formatDate(val) {
      const date = getDate(val);
      return date.getFullYear() + "-" + (date.getMonth() + 1);
    }
  },
  watch: {
    async developers(newDevelopers) {
      this.developersData = await Promise.all(this.developers.map(async d => {
        const response = await fetch(`./data/users/${d}.json`);
        const data = await response.json();
        return {
          developer: d,
          data: data,
        }
      }));
    },
    dates(newDates) {
      this.startDate = new Date(getDate(newDates[0]));
      this.endDate = new Date(getDate(newDates[1]));
    }
  },
};
</script>
