<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/individuals">
        2. Individual statistics
        </NuxtLink>
      </h1>

      <div class="columns">
        <div class="column is-5 content">
          <p>
            It shows instantaneously:
            <ul>
              <li>The evolution of commits authored/reviewed over time.</li>
              <li>The evolution during the day/week/month/year.</li>
              <li>The list of peers</li>
            </ul>
            <br/>
            You can dynamically filter by developer, authors, reviewers and
            date.
          </p>

          <TimelineWrappedChart
            :repositories="['chromium']"
            :developers="developers"
            :dates="[new Date('2000-01-01'), new Date('2030-01-01')]"
            :author="true"
            :review="true"
            :stacked="true"
            :hourlyParam="1"
            :buckets="80"
            />
        </div>

        <div class="column is-7">
          <TimelineChart
            :developers="developers"
            :dates="[new Date('2000-01-01'), new Date('2030-01-01')]"
            :author="true"
            :review="true"
            :stacked="false"
            />

          <PeersChart
            :developers="developers"
            :dates="[new Date('2000-01-01'), new Date('2030-01-01')]"
            :author="true"
            :review="true"
            :stacked="false"
            :take_n="15"
            />
        </div>


      </div>
    </div>
  </section>
</template>

<script setup lang="ts">

const developers = ref<string[]>([]);
let developersList = [];
let destroyed = false;
let once = undefined;

const getRandom = async () => {
  if (destroyed) {
    return;
  }

  // Remove randomly, up to 2 developers.
  for(let i = 0; i<2; ++i) {
    const index = Math.floor(Math.random() * 10);
    if (index < developers.value.length) {
      developers.value.splice(index, 1);
      developers.value = [...developers.value];
    }
  }

  const index = Math.floor(Math.random() * developersList.length);
  const developer = developersList[index];
  const response = await fetch(`/data/chromium/usernames/${developer}.json`);
  const data = await response.json();

  // If the data is too small, retry.
  if (data.length < 50) {
    setTimeout(() => {
      getRandom();
    }, once ? 1000: 10);
    return;
  }

  developers.value.push(developer);
  developers.value = [...developers.value];

  if (once == undefined) {
    if (developers.value.length == 0) {
      return getRandom();
    }
    once = true;
  }

  setTimeout(() => {
    getRandom();
  }, 5000);
};

const fetchDevelopersList = async () => {
  const response = await fetch("/data/chromium/usernames.json");
  developersList = await response.json();
  getRandom();
};

onMounted(() => {
  fetchDevelopersList();
});

onBeforeUnmount(() => {
  destroyed = true;
});


</script>
