<template>
  <div
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousemove="handleMouseMove"
    @click="handleClick"
    :class="{
    'card_wrapper': true,
    'disabled': !enabled,
    'is-hovered': mouse_hover,
    }"
    :title="description"
    >
    <div class="card_inner"
         :style="{ transform }"
         :class="{ 'is-hovered': mouse_hover }"
         >

         <img :src="img" :alt="name" />
    </div>
    <div class="badge-name">{{ name }}</div>
  </div>
</template>

<script setup lang="ts">

const router = useRouter();

const props = defineProps({
  developer: {},
  name: {},
  img: {},
  enabled: {},
  description: {},
  hover: {
    default: true,
  },
});

const mouse_hover = ref(false);
const mouse_position = ref({ x: 0, y: 0 });

const default_transform = ``;
const transform = ref(default_transform);

const handleClick = () => {
  const params = {
    path: '/badges/details',
    query: {
      developer: props.developer,
      badge: props.name,
    },
  };

  if (props.hover) {
    navigateTo(params);
  } else {
    router.replace(params);
  }
};

const handleMouseEnter = () => {
  mouse_hover.value = true;
  transform.value = default_transform;
};

const handleMouseLeave = () => {
  mouse_hover.value = false;
  transform.value = default_transform;
};

const handleMouseMove = (event: MouseEvent) => {
  mouse_position.value = {
    x: event.clientX,
    y: event.clientY,
  };

  if (!props.hover) {
    return;
  }

  // 3D effect:
  // - calculate the distance from the center of the image
  // - use it to scale the image
  const { x, y } = mouse_position.value;
  const target = event.currentTarget as HTMLElement | null;
  if (!target) {
    return;
  }
  const { width, height, left, top } = target.getBoundingClientRect();
  const center_x = left + width / 2;
  const center_y = top + height / 2;
  const dx = x - center_x;
  const dy = y - center_y;
  const tilt_x = -dx * 0.002;
  const tilt_y = +dy * 0.002;
  transform.value = `
    translate3d(0, 0, 1500px)
    rotate3d(1, 0, 0, ${tilt_y}rad)
    rotate3d(0, 1, 0, ${tilt_x}rad)
  `;
};

</script>

<style scoped>

.card_wrapper {
  width: 140px;
  margin: 6px;
  z-index: 0;
  perspective: 2100px;
  transition: filter 0.1s;
}

.card_wrapper.is-hovered {
  z-index: 10;
  transition: filter 2.0s;
}

.card_inner {
  transform-origin: 50% 51%;
  overflow: hidden;
  perspective: 10000px;
  backface-visibility: hidden;
  background-color: var(--surface);
  cursor: pointer;
  border-radius: 10px;
  width: 140px;
  height: 140px;
  filter: drop-shadow(0 8px 8px rgba(0, 0, 0, 0.5));
  transition:
    transform 0.2s,
    height 0.1s,
    filter 0.2s;
}

.card_inner.is-hovered {
  filter:
    drop-shadow(0 0 3px rgba(255, 255, 0, 1))
    drop-shadow(0 20px 30px rgba(0, 0, 0, 0.3));
  transition:
    transform 0.2s,
    height 0.6s ease-in-out 0.5s,
    filter 0.2s;
}


/* Crop the engraved frame shared by every image, so the subject stands out.
   The details page shows the full image. In every image, the frame ends 12.4%
   from each side (127px out of 1024px), so: 1024 / (1024 - 2 * 127) = 1.33. */
.card_inner img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.33);
}

.disabled:not(.is-hovered) .card_inner {
  filter:
    contrast(0.5)
    brightness(1.5)
    blur(10px)
    grayscale(100%);
}

.disabled:not(.is-hovered) .badge-name {
  opacity: 0.5;
}

.badge-name {
  font-size: 0.8em;
  line-height: 1.2;
  text-align: center;
  padding-top: 6px;
}

</style>
