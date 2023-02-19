<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/timeline">
        The timeline
        </NuxtLink>
      </h1>

      <div class="columns">
        <div class="column is-two-fifths">
          <p>
            The timeline page shows instantaneously the evolution of the
            number of commits over time. You can filter by developer, authors,
            reviewers and date.
          </p>

          <TimelineWrappedChart
            :developers="developers"
            :startDate="new Date('2018-01-01')"
            :endDate="new Date('2030-01-01')"
            :author="true"
            :review="true"
            :stacked="true"
            :hourlyParam="1"
            :buckets="80"
            /></TimelineWrappedChart>
        </div>

        <div class="column is-three-fifths">
          <TimelineChart
            :developers="developers"
            :startDate="new Date('2018-01-01')"
            :endDate="new Date('2030-01-01')"
            :author="true"
            :review="true"
            :stacked="false"
            /></TimelineChart>
        </div>


      </div>
    </div>
  </section>
</template>

<script>
export default {
  data() {
    return {
      developers: [],
    };
  },

  async fetch() {
    const response = await fetch("./data/users.json");
    this.developerList = await response.json();
    this.getRandom();
  },

  methods: {
    async getRandom() {
      if (this.destroyed) {
        return;
      }

      const index = Math.floor(Math.random() * this.developerList.length);
      const developer = this.developerList[index];
      const response = await fetch(`./data/users/${developer}.json`);
      const data = await response.json();

      for(let i = 0; i<2; ++i) {
        const index = Math.floor(Math.random() * 10);
        if (index < this.developers.length) {
          this.developers = this.developers.splice(index, 1);
        }
      }

      if (Object.keys(data.author).length +
        Object.keys(data.review).length < 50) {
        setTimeout(() => {
          this.getRandom();
        }, this.once ? 1000: 10);
        return;
      }

      this.developers.push(developer);

      if (this.once == undefined) {
        if (this.developers.length == 0) {
          return this.getRandom();
        }
        this.once = true;
      }

      setTimeout(() => {
        this.getRandom();
      }, 5000);
    },
  },

  beforeDestroy() {
    this.destroyed = true;
  }
};
</script>
