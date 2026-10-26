<template>
  <div class="book-container">
    <div
      class="book"
      :class="{ 'is-closed': current == 0, 'is-finished': current == leaves.length }"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp">
      <div
        v-for="(leaf, i) in leaves"
        :key="i"
        class="leaf"
        :class="{ 'is-flipped': i < current }"
        :style="{ zIndex: zIndex(i), transitionDelay: `${delay(i)}ms` }">
        <div
          v-for="(side, face) in leaf"
          :key="face"
          class="face"
          :class="[face == 0 ? 'front' : 'back', `side-${side.kind}`]"
          @click="face == 0 ? next() : previous()">

          <!-- Front cover -->
          <template v-if="side.kind == 'cover'">
            <div class="cover-frame">
              <div class="cover-title">Badge Album</div>
              <img v-if="rarest" class="cover-medallion" :src="rarest.image" :alt="rarest.name" />
              <div class="cover-name">{{ developer }}</div>
              <div class="cover-stats">
                {{ earned }} / {{ badges.length }} badges · score {{ Math.round(score) }}
              </div>
            </div>
          </template>

          <!-- Table of contents -->
          <template v-else-if="side.kind == 'contents'">
            <div class="page-title">Contents</div>
            <ol class="contents">
              <li v-for="entry in contents" :key="entry.category">
                <a href="#" @click.prevent.stop="goToSide(entry.side)">
                  <span>{{ entry.category }}</span>
                  <span class="contents-dots"></span>
                  <span>{{ entry.earned }} / {{ entry.total }}</span>
                </a>
              </li>
            </ol>
          </template>

          <!-- One category of badges -->
          <template v-else-if="side.kind == 'category'">
            <div class="page-title">{{ side.category }}</div>
            <div class="page-subtitle">
              {{ side.badges.filter(badge => badge.enabled).length }} / {{ side.badges.length }}
            </div>
            <div class="slots" :class="{
              'is-large': side.badges.length <= 4,
              'is-dense': side.badges.length > 6,
            }">
              <div v-for="badge in side.badges" :key="badge.name" class="slot">
                <NuxtLink
                  v-if="badge.enabled"
                  class="slot-card"
                  :to="detailsLink(badge)"
                  :title="badge.description"
                  @click.stop>
                  <img :src="badge.image" :alt="badge.name" loading="lazy" />
                </NuxtLink>
                <div v-else class="slot-empty" :title="badge.description">
                  <UiIcon name="lock-outline" />
                  <span>{{ badge.description }}</span>
                </div>
                <div class="slot-name" :class="{ 'is-locked': !badge.enabled }">{{ badge.name }}</div>
              </div>
            </div>
          </template>

          <div v-if="side.number" class="page-number">{{ side.number }}</div>
        </div>
      </div>
    </div>

    <div class="book-controls">
      <button type="button" class="button" :disabled="current == 0" @click="previous" aria-label="Previous page">
        <UiIcon name="chevron-left" />
      </button>
      <span class="book-position">{{ position }}</span>
      <button type="button" class="button" :disabled="current == leaves.length" @click="next" aria-label="Next page">
        <UiIcon name="chevron-right" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// The badges of a developer, displayed as a book whose pages can be turned:
// a cover, a table of contents, then one page per category.

type Badge = {
  name: string;
  category: string;
  description: string;
  image: string;
  recipients: number;
  enabled: boolean;
};

type Side =
  | { kind: "cover" | "contents" | "blank" | "back-cover"; number?: number }
  | { kind: "category"; category: string; badges: Badge[]; number?: number };

const props = defineProps<{
  developer: string;
  badges: Badge[];
  categories: string[];
  score: number;
}>();

const earned = computed(() => props.badges.filter(badge => badge.enabled).length);

// The rarest earned badge is displayed on the cover.
const rarest = computed(() => props.badges
  .filter(badge => badge.enabled)
  .sort((a, b) => a.recipients - b.recipients)[0]);

const sides = computed<Side[]>(() => {
  const sides: Side[] = [{ kind: "cover" }, { kind: "contents" }];
  for (const category of props.categories) {
    sides.push({
      kind: "category",
      category,
      badges: props.badges.filter(badge => badge.category == category),
    });
  }
  // The back cover must be the back of the last leaf.
  if (sides.length % 2 == 0) {
    sides.push({ kind: "blank" });
  }
  sides.push({ kind: "back-cover" });
  sides.forEach((side, index) => {
    if (index > 0 && index < sides.length - 1) {
      side.number = index;
    }
  });
  return sides;
});

// Each leaf holds two sides: [front, back].
const leaves = computed(() => {
  const leaves: [Side, Side][] = [];
  for (let i = 0; i < sides.value.length; i += 2) {
    leaves.push([sides.value[i], sides.value[i + 1]]);
  }
  return leaves;
});

const contents = computed(() => sides.value
  .map((side, index) => ({ side, index }))
  .filter(({ side }) => side.kind == "category")
  .map(({ side, index }) => ({
    category: (side as any).category,
    side: index,
    earned: (side as any).badges.filter((badge: Badge) => badge.enabled).length,
    total: (side as any).badges.length,
  })));

// The number of leaves turned. 0 means the book is closed.
const current = ref(0);
const from = ref(0);

const turn = (target: number) => {
  target = Math.max(0, Math.min(leaves.value.length, target));
  from.value = current.value;
  current.value = target;
};
const next = () => turn(current.value + 1);
const previous = () => turn(current.value - 1);

// A side is visible when the leaf before it is turned (back), or when its leaf
// is the first unturned one (front).
const goToSide = (side: number) => turn(Math.ceil(side / 2));

// Turned leaves stack on the left, the most recent on top. The others stack on
// the right, the next one on top. A leaf being turned stays above both.
const zIndex = (i: number) => {
  const n = leaves.value.length;
  const moving = Math.min(from.value, current.value) <= i &&
    i < Math.max(from.value, current.value);
  if (moving) {
    return 2 * n + (current.value > from.value ? i : n - i);
  }
  return i < current.value ? i : n - i;
};

// When jumping over several leaves, turn them one after the other.
const delay = (i: number) => {
  const low = Math.min(from.value, current.value);
  const high = Math.max(from.value, current.value);
  if (i < low || i >= high) {
    return 0;
  }
  return (current.value > from.value ? i - low : high - 1 - i) * 80;
};

const position = computed(() => {
  if (current.value == 0) return "Cover";
  if (current.value == leaves.value.length) return "Back cover";
  return `Pages ${2 * current.value - 1}–${2 * current.value}`;
});

const detailsLink = (badge: Badge) => ({
  path: "/badges/details",
  query: { developer: props.developer, badge: badge.name },
});

// Swipe to turn pages.
let pointer_x: number | null = null;
const onPointerDown = (event: PointerEvent) => {
  pointer_x = event.clientX;
};
const onPointerUp = (event: PointerEvent) => {
  if (pointer_x === null) return;
  const dx = event.clientX - pointer_x;
  pointer_x = null;
  if (Math.abs(dx) > 50) {
    dx < 0 ? next() : previous();
  }
};

// Arrow keys turn pages, unless typing.
const onKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable]")) return;
  if (event.key == "ArrowRight") next();
  if (event.key == "ArrowLeft") previous();
};
onMounted(() => window.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));

// Start from the cover when switching developer.
watch(() => props.developer, () => turn(0));
</script>

<style scoped>
.book-container {
  /* As large as possible, while the whole book fits in the window. */
  --page-w: min(560px, calc((100vw - 3rem) / 2), calc((100vh - 200px) / 1.25));
  --page-h: calc(var(--page-w) * 1.25);
  --paper: #f4ecd8;
  --paper-ink: #3b2f22;
  --paper-faint: #8c7a62;
  --leather: #4a2c1d;
  --gold: #d6b56d;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  margin: 2rem 0;
  font-family: Georgia, "Times New Roman", serif;
}

.book {
  position: relative;
  width: calc(2 * var(--page-w));
  height: var(--page-h);
  perspective: 2600px;
  transition: transform 0.9s cubic-bezier(0.645, 0.045, 0.355, 1);
  touch-action: pan-y;
  user-select: none;
}

/* Center the book when only one of its halves is visible. */
.book.is-closed {
  transform: translateX(-25%);
}
.book.is-finished {
  transform: translateX(25%);
}

.leaf {
  position: absolute;
  top: 0;
  left: 50%;
  width: var(--page-w);
  height: 100%;
  transform-origin: left center;
  transform-style: preserve-3d;
  transition: transform 0.9s cubic-bezier(0.645, 0.045, 0.355, 1);
}

.leaf.is-flipped {
  transform: rotateY(-180deg);
}

.face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  backface-visibility: hidden;
  background: var(--paper);
  color: var(--paper-ink);
  padding: calc(var(--page-w) * 0.08);
  cursor: pointer;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.45);
}

.face.front {
  border-radius: 2px 8px 8px 2px;
  background-image: linear-gradient(to right, rgba(0, 0, 0, 0.12), transparent 8%);
}

.face.back {
  transform: rotateY(180deg);
  border-radius: 8px 2px 2px 8px;
  background-image: linear-gradient(to left, rgba(0, 0, 0, 0.12), transparent 8%);
}

/* Covers. More specific than .face.front and .face.back. */
.face.side-cover,
.face.side-back-cover {
  background: radial-gradient(circle at 30% 20%, #6b4330, var(--leather) 70%);
  color: var(--gold);
}

.cover-frame {
  height: 100%;
  border: 2px solid var(--gold);
  outline: 1px solid var(--gold);
  outline-offset: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
  padding: 1rem;
}

.cover-title {
  font-size: calc(var(--page-w) * 0.09);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cover-medallion {
  width: 45%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid var(--gold);
  box-shadow: 0 0 0 6px rgba(214, 181, 109, 0.25);
}

.cover-name {
  font-size: calc(var(--page-w) * 0.065);
  font-style: italic;
  overflow-wrap: anywhere;
}

.cover-stats {
  font-size: calc(var(--page-w) * 0.04);
  opacity: 0.85;
}

/* Pages */
.page-title {
  font-size: calc(var(--page-w) * 0.065);
  text-align: center;
  text-transform: capitalize;
  border-bottom: 1px solid var(--paper-faint);
  padding-bottom: 0.3em;
}

.page-subtitle {
  text-align: center;
  color: var(--paper-faint);
  font-size: calc(var(--page-w) * 0.035);
  margin: 0.4em 0 0.8em;
}

.contents {
  list-style: none;
  padding: 0;
  margin: 1em 0 0;
  font-size: calc(var(--page-w) * 0.037);
}

.contents a {
  display: flex;
  gap: 0.4em;
  color: inherit;
  text-decoration: none;
  text-transform: capitalize;
  padding: 0.12em 0;
}

.contents a:hover {
  color: #8a3b12;
}

.contents-dots {
  flex: 1;
  border-bottom: 1px dotted var(--paper-faint);
  margin-bottom: 0.3em;
}

.slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--page-w) * 0.03);
}

.slots.is-large {
  grid-template-columns: repeat(2, 1fr);
  padding: 0 8%;
}

/* 7+ badges need 3 rows: shrink them to fit the page height. */
.slots.is-dense .slot-card,
.slots.is-dense .slot-empty {
  width: 82%;
}

.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.slot-card,
.slot-empty {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
}

.slot-card img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
  transition: transform 0.2s;
}

.slot-card:hover img {
  transform: scale(1.06) rotate(-1deg);
}

.slot-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3em;
  padding: 0.4em;
  border: 1px dashed var(--paper-faint);
  color: var(--paper-faint);
  font-size: calc(var(--page-w) * 0.024);
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
}

.slot-name {
  margin-top: 0.3em;
  font-size: calc(var(--page-w) * 0.03);
  text-align: center;
  line-height: 1.15;
}

.slot-name.is-locked {
  color: var(--paper-faint);
}

.page-number {
  position: absolute;
  bottom: calc(var(--page-w) * 0.03);
  left: 0;
  right: 0;
  text-align: center;
  font-size: calc(var(--page-w) * 0.03);
  color: var(--paper-faint);
}

.book-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-family: var(--font-sans);
}

.book-position {
  min-width: 8em;
  text-align: center;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .book,
  .leaf {
    transition: none;
  }
}
</style>
