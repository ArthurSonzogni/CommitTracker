<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container content">
        <h1 class="title">Badges</h1>
        <p>
          This is a collection of badges that are awarded to the contributors
          of the web platform. The badges are awarded based on the commit
          history of the contributors.
        </p>
        <DevelopersInput v-model="developers"/>
        <p v-if="!developer" style="margin-top: 1rem;">
          Pick a developer to see which of them they earned.
        </p>
        <p v-else style="margin-top: 1rem;">
          <strong>Badges:</strong>
          {{
            data.filter(badge => badge.enabled).length
          }} / {{
            data.length
          }}
          <br>
          <strong>Score</strong>
          : {{ Math.round(rarity) }}
        </p>
        <UiSegmented
          v-if="developer"
          v-model="view"
          aria-label="View"
          :options="[
          { value: 'book', label: 'Book', icon: 'book-open-variant' },
          { value: 'grid', label: 'Grid', icon: 'view-grid' },
        ]" />
      </div>

      <div v-if="developer && view == 'book'" class="container">
        <BadgeBook
          :developer="developer"
          :badges="data"
          :categories="[...categories]"
          :score="rarity"
          />
      </div>

      <div v-else class="container content">
        <div class="card_list_container">
          <div class="card_list"
               v-for="category in categories"
               :key="category"
               >

               {{ category }}

               <span v-if="developer" class="tag">
               {{
                  data.filter(badge => badge.category === category && badge.enabled).length
               }} / {{
                  data.filter(badge => badge.category === category).length
               }}
               </span>

               <div class="cards">
                 <Badge
                   v-for="badge in data.filter(badge => badge.category === category)"
                   :key="badge.name"
                   :developer="developer"
                   :name="badge.name"
                   :enabled="badge.enabled"
                   :img="badge.image"
                   :description="badge.description"
                   :data="badge.data"
                   />
               </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

const route = useRoute();
const router = useRouter();

const developers = ref([]);
const developer = ref("");
if (route.query.developers) {
  developers.value = route.query.developers.split(',');
}

const categories = ref(new Set());

const data = shallowRef([]);

const rarity = ref(0);

const view = ref("book");

const refresh = async () => {
  router.push({
    query: {
      developers: developers.value.join(',')
    }
  })

  if (developers.value.length > 1) {
    // Take the last one.
      developers.value = developers.value.slice(-1);
    return;
  }
  developer.value = developers.value[0] ?? "";

  const fetchJson = async (path) => {
    const data = await fetch(path);
    const json = await data.json()
    return json;
  }

  const allBadges = await fetchJson(`/badges.json`);
  for(const badge of allBadges) {
    badge.enabled = false;
    categories.value.add(badge.category);
  }

  // Without developer, the whole collection is shown.
  if (!developer.value) {
    for (const badge of allBadges) {
      badge.enabled = true;
    }
    data.value = allBadges;
    rarity.value = 0;
    return;
  }

  // The JSON file are grouping the badges of every users sharing the first
  // letter of their username.
  const badges = (await
    fetchJson(`/badges/${developer.value[0]}.json`))[developer.value];

  for (const badge of badges) {
    allBadges[badge[0]].enabled = true;
    allBadges[badge[0]].data = badge[1];
  }

  data.value = allBadges;

  // Compute the rarity of the badges.
  let rarity_ = 0;
  for(const badge of data.value) {
    if (badge.enabled) {
      rarity_ += Math.log2(8200/badge.recipients) * 0.8
    }
  }
  rarity.value = rarity_;
}

watch([ developers ], refresh, { immediate: true })

</script>

<!--Global-->
<style scoped>

.card_list_container {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: 1rem;
}

h3 {
  font-size: 1rem;
}

</style>


