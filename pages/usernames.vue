<template>
  <div>
    <Navbar/>
    <section class="section">
      <p>
        <strong>{{sum}}</strong> developers contributed to chromium.
      </p>

      <li v-for="(item, index) in distribution">
        {{index}} => {{item}}
      </li>


    </section>
  </div>
</template>

<script>

export default {
  data() {
    return {
      sum: 0,
      distribution: [],
    }
  },

  mounted: async function() {
    const response = await fetch("./data/users.json");
    const data = await response.json();
    this.sum = data.length;
    for(const developer of data) {
      const size = developer.length;
      if (size == 1) {
        console.log(developer);
      }
      this.distribution[size] ||= 0;
      this.distribution[size]++;
    }
  },
}

</script>
