<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container content">

        <div class="columns">
          <div class="column is-5">
            <h1 class="title">{{ badge_data.name }}</h1>

            <p> <strong>Rarity</strong>:
              <b-icon
                v-for="i in 5"
                :key="i"
                :icon="
                  rarity >= i
                  ? 'star'
                  : rarity >= i - 0.5
                    ? 'star-half-full'
                    : 'star-outline'
                "
                :style="{
                  color: rarity >= i-0.5 ? 'orange' : 'gray',
                }"
              />

              ({{ Math.round(rarity * 100)/100 }})
            </p>
            <p> <strong>Holder:</strong> {{ badge_data.recipients }} developers</p>
            <p> <strong>Category:</strong> {{ badge_data.category }}</p>
            <p> <strong>Unlocked:</strong>
              <b-icon
                :icon="unlocked ? 'check' : 'close'"
                :style="{ color: unlocked ? 'green' : 'red' }"
                />
            </p>

            <p>{{ badge_data.description }}</p>
            <p v-html="badge_data.details" v-if="unlocked"></p>

            <h1 class="title">Collection</h1>
            <div class="card_list_container">
              <div class="cards">
                <Badge
                  v-for="badge in related_badges"
                  :key="badge.name"
                  :developer="developer"
                  :enabled="true"
                  :img="badge.image"
                  :hover="false"
                  :name="badge.name"
                  />
              </div>
            </div>
          </div>
          <div class="column is-7">
            <img :src="badge_data.image" />
          </div>
        </div>
        <b-button
          @click="List"
          color="is-info"
          >
          <
        </b-button>
      </div>
    </section>

    <section class="section">
      <div class="container content">
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

const route = useRoute();

const developer = ref("");
if (route.query.developer) {
  developer.value = route.query.developer;
}

const badge = ref("");
if (route.query.badge) {
  badge.value = route.query.badge;
}

const badge_data = ref({});

const img = ref("");

const related_badges = ref([]);

const rarity = ref(0);

const unlocked = ref(false);

const main = async () => {
  const fetchJson = async (path) => {
    const data = await fetch(path);
    const json = await data.json()
    return json;
  }
  const allBadges = await fetchJson(`/badges.json`);

  badge_data.value = allBadges.find((data) => data.name === badge.value);

  related_badges.value = allBadges.filter((data) => data.category ===
    badge_data.value.category);

  rarity.value = Math.log2(8200/badge_data.value.recipients) * 0.8

  // Fetch the developers's data.
  const developer_data = (
    await fetchJson(`/badges/${developer.value[0]}.json`))[developer.value];

  let unlocked_ = false;
  let data_ = null;
  for(const [index, d] of developer_data) {
    if (allBadges[index].name === badge.value) {
      unlocked_ = true;
      data_ = d
    }
  }
  unlocked.value = unlocked_;

  // Replace the description with the developer's data. The strings to replace
  // are $0, $1, $2, etc.
  badge_data.value.details = badge_data.value.details.replace(
    /\$[0-9]/g, (match) => {
      const index = parseInt(match[1]);
      return data_[index];
    }
  );
}


main();

watch(() => route.query, () => {
  developer.value = route.query.developer;
  badge.value = route.query.badge;
  main();
});

const List = () => {
  navigateTo({
    path: '/badges/list',
    query: {
      developers: developer.value,
    },
  });
}

</script>

<style scoped>

.card_list_container {
  display: flex;
  flex-wrap: wrap;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  margin: 1rem;
}

</style>
