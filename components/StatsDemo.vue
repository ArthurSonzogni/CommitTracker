<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/stats">
        Stats
        </NuxtLink>
      </h1>

      <div class="columns">
        <div class="column is-5 content">
          <p>
            You can filter by developer, authors, reviewers and date.
            It shows instantaneously:
            <ul>
              <li>The evolution of commits authored/reviewed over time.</li>
              <li>The evolution during the day/week/month/year.</li>
              <li>The list of peers</li>
            </ul>
          </p>

          <TimelineWrappedChart
            :developers="developers"
            :startDate="new Date('2000-01-01')"
            :endDate="new Date('2030-01-01')"
            :author="true"
            :review="true"
            :stacked="true"
            :hourlyParam="1"
            :buckets="80"
            /></TimelineWrappedChart>
        </div>

        <div class="column is-7">
          <TimelineChart
            :developers="developers"
            :startDate="new Date('2000-01-01')"
            :endDate="new Date('2030-01-01')"
            :author="true"
            :review="true"
            :stacked="false"
            /></TimelineChart>

          <PeersChart
            :developers="developers"
            :startDate="new Date('2000-01-01')"
            :endDate="new Date('2030-01-01')"
            :author="true"
            :review="true"
            :stacked="false"
            :take_n="15"
            /></PeersChart>
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
