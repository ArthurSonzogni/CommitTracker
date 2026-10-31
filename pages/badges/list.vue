<template>
  <div>
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
        <p v-else-if="data.length" style="margin-top: 1rem;">
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
          :categories="categories"
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
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import {
  badgeRarityScore,
  fetchBadgesCatalog,
  fetchDeveloperBadges,
  type BadgeDefinition,
} from "~/utils/badges";

interface BadgeItem extends BadgeDefinition {
  enabled: boolean;
  data?: any;
}

const { developers, view } = useUrlState({
  developers: urlCodecs.csv([]),
  view: urlCodecs.enum(["book", "grid"] as const, "book"),
});

const developer = computed(() => developers.value[0] ?? "");
const data = shallowRef<BadgeItem[]>([]);
const rarity = ref(0);

const categories = computed(() => [
  ...new Set(data.value.map(badge => badge.category)),
]);

let requestId = 0;

const refresh = async () => {
  if (developers.value.length > 1) {
    developers.value = developers.value.slice(-1);
    return;
  }

  const id = ++requestId;
  const currentDeveloper = developer.value;
  const catalog = await fetchBadgesCatalog();
  if (id !== requestId) return;

  const allBadges: BadgeItem[] = catalog.map(badge => ({
    ...badge,
    enabled: !currentDeveloper,
  }));

  if (!currentDeveloper) {
    data.value = allBadges;
    rarity.value = 0;
    return;
  }

  const earned = await fetchDeveloperBadges(currentDeveloper);
  if (id !== requestId) return;

  for (const [badgeIdx, badgeData] of earned) {
    if (allBadges[badgeIdx]) {
      allBadges[badgeIdx].enabled = true;
      allBadges[badgeIdx].data = badgeData;
    }
  }

  let totalRarity = 0;
  for (const badge of allBadges) {
    if (badge.enabled) {
      totalRarity += badgeRarityScore(badge.recipients);
    }
  }

  data.value = allBadges;
  rarity.value = totalRarity;
};

watch(developers, refresh, { immediate: true });
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


