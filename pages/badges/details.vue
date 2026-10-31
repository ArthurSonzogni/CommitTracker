<template>
  <div>
    <section class="section">
      <div class="container content">

        <div class="columns">
          <div class="column is-5">
            <h1 class="title">{{ badge_data.name }}</h1>

            <p> <strong>Rarity</strong>:
              <UiIcon v-for="i in 5" :key="i" :name="
                  rarity >= i
                  ? 'star'
                  : rarity >= i - 0.5
                    ? 'star-half-full'
                    : 'star-outline'
                " :style="{
                  color: rarity >= i-0.5 ? 'orange' : 'gray',
                }" />

              ({{ Math.round(rarity * 100)/100 }})
            </p>
            <p> <strong>Holder:</strong> {{ badge_data.recipients }} developers</p>
            <p> <strong>Category:</strong> {{ badge_data.category }}</p>
            <p v-if="developer"> <strong>Unlocked:</strong>
              <UiIcon :name="unlocked ? 'check' : 'close'" :style="{ color: unlocked ? 'green' : 'red' }" />
            </p>

            <p>{{ badge_data.description }}</p>
            <p v-html="badge_data.details" v-if="unlocked"></p>

            <h1 class="title">Collection</h1>
            <div class="card_list_container">
              <div class="cards">
                <Badge
                  v-for="item in related_badges"
                  :key="item.name"
                  :developer="developer"
                  :enabled="true"
                  :img="item.image"
                  :hover="false"
                  :name="item.name"
                  />
              </div>
            </div>
          </div>
          <div class="column is-7">
            <img v-if="badge_data.image" :src="badge_data.image" :alt="badge_data.name" />
          </div>
        </div>
        <button type="button" class="button" aria-label="Back to badges" @click="List">
          <UiIcon name="arrow-left" size="small" />
        </button>
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
  formatBadgeDetails,
  type BadgeDefinition,
} from "~/utils/badges";
import { SITE_NAME } from "~/utils/pageMeta";

const { developer, badge } = useUrlState({
  developer: urlCodecs.string(""),
  badge: urlCodecs.string(""),
});

const badge_data = ref<Partial<BadgeDefinition>>({});
const related_badges = ref<BadgeDefinition[]>([]);
const rarity = ref(0);
const unlocked = ref(false);

const List = () => {
  navigateTo({
    path: "/badges/list",
    query: developer.value ? { developers: developer.value } : undefined,
  });
};

let requestId = 0;

const load = async () => {
  const id = ++requestId;
  const currentBadge = badge.value;
  const currentDeveloper = developer.value;

  const allBadges = await fetchBadgesCatalog();
  if (id !== requestId) return;

  const found = allBadges.find(item => item.name === currentBadge);
  if (!found) {
    List();
    return;
  }

  const resolvedBadge: BadgeDefinition = { ...found };
  related_badges.value = allBadges.filter(
    item => item.category === resolvedBadge.category,
  );
  rarity.value = badgeRarityScore(resolvedBadge.recipients);

  const developerTuples = currentDeveloper
    ? await fetchDeveloperBadges(currentDeveloper)
    : [];
  if (id !== requestId) return;

  let isUnlocked = false;
  let unlockedData: any = null;
  for (const [index, d] of developerTuples) {
    if (allBadges[index]?.name === currentBadge) {
      isUnlocked = true;
      unlockedData = d;
      break;
    }
  }

  unlocked.value = isUnlocked;
  if (isUnlocked) {
    resolvedBadge.details = formatBadgeDetails(resolvedBadge.details, unlockedData);
  }
  badge_data.value = resolvedBadge;
};

watch([developer, badge], load, { immediate: true });

const pageTitle = () =>
  badge_data.value.name
    ? `${badge_data.value.name} · ${SITE_NAME}`
    : `Badge · ${SITE_NAME}`;

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
});
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
