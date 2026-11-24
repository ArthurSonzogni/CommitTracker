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
                " :class="rarity >= i - 0.5 ? 'badge-star-filled' : 'badge-star-empty'" />

              ({{ Math.round(rarity * 100)/100 }})
            </p>
            <p> <strong>Holder:</strong> {{ badge_data.recipients }} developers</p>
            <p> <strong>Category:</strong> {{ badge_data.category }}</p>
            <p v-if="developer"> <strong>Unlocked:</strong>
              <UiIcon :name="unlocked ? 'check' : 'close'" :class="unlocked ? 'badge-unlocked-yes' : 'badge-unlocked-no'" />
            </p>

            <p>{{ badge_data.description }}</p>
            <ul v-if="unlocked && detailListItems.length > 0">
              <li v-for="(item, index) in detailListItems" :key="index">{{ item }}</li>
            </ul>
            <p v-else-if="unlocked && badge_data.details">{{ badge_data.details }}</p>

            <h2 class="title is-4">Collection</h2>
            <div class="card_list_container">
              <div class="cards">
                <Badge
                  v-for="item in related_badges"
                  :key="item.name"
                  :developer="developer"
                  :enabled="true"
                  :img="item.image"
                  :hover="false"
                  :transitionSlot="collectionTransitionSlot(item.name)"
                  :name="item.name"
                  @select="swapCollectionBadge"
                  />
              </div>
            </div>
          </div>
          <div class="column is-7">
            <img
              v-if="badge_data.image"
              class="badge-hero-img"
              :style="{ viewTransitionName: heroTransitionName }"
              :src="badge_data.image"
              :alt="badge_data.name" />
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
import { useViewTransitionTarget } from "~/composables/useViewTransitionTarget";
import { runInPageTransition } from "~/utils/viewTransition";

const { activeBadge } = useViewTransitionTarget();

const { developer, badge } = useUrlState({
  developer: urlCodecs.string(""),
  badge: urlCodecs.string(""),
});

watch(badge, (name) => {
  if (name) activeBadge.value = name;
}, { immediate: true });

const badge_data = ref<Partial<BadgeDefinition>>({});
const related_badges = ref<BadgeDefinition[]>([]);
const rarity = ref(0);
const unlocked = ref(false);

const detailListItems = computed(() => {
  const raw = badge_data.value.details;
  if (!raw || !raw.includes("<li>")) return [];
  return [...raw.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
});
const swapIncoming = ref<string | null>(null);
const swapOutgoing = ref<string | null>(null);
const heroTransitionName = ref<"badge-hero" | "badge-swap" | "badge-return">("badge-hero");

const collectionTransitionSlot = (name: string) => {
  if (swapIncoming.value === name) return "badge-swap";
  if (swapOutgoing.value === name) return "badge-return";
  return "";
};

const swapCollectionBadge = async (targetName: string) => {
  const previousName = badge.value;
  if (!targetName || targetName === previousName) return;

  // Old snapshot: clicked thumbnail -> `badge-swap`, current hero -> `badge-return`.
  swapIncoming.value = targetName;
  swapOutgoing.value = null;
  heroTransitionName.value = "badge-return";
  await nextTick();

  runInPageTransition(
    async () => {
      // New snapshot: new hero -> `badge-swap`, previous badge's thumbnail -> `badge-return`.
      swapIncoming.value = null;
      swapOutgoing.value = previousName;
      heroTransitionName.value = "badge-swap";
      badge.value = targetName;
      await load();
      await nextTick();
    },
    () => {
      swapIncoming.value = null;
      swapOutgoing.value = null;
      heroTransitionName.value = "badge-hero";
    },
  );
};

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

.badge-star-filled {
  color: var(--series-4, #e59934);
}

.badge-star-empty {
  color: var(--muted-soft);
}

.badge-unlocked-yes {
  color: var(--positive);
}

.badge-unlocked-no {
  color: var(--negative);
}

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
