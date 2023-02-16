<template>
  <div class="column">
    <TimelineChart
      :developers="developers"
      :startDate="new Date('2018-01-01')"
      :endDate="new Date('2030-01-01')"
      :author="true"
      :review="true"
      :stacked="false"
      /></TimelineChart>
  </div>
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
          Object.keys(data.review).length < 150) {
        console.log("coucou");
        setTimeout(() => {
          this.getRandom();
        }, this.once ? 500: 10);
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
      }, 3000);
    },
  },
};
</script>
