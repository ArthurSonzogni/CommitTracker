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
    >
    <div class="card_inner"
         :style="{ transform }"
         :class="{ 'is-hovered': mouse_hover }"
         >

         <div class="img_wrapper">
           <img :src="img" :alt="name" />
         </div>

         <div class="badge-name">{{ name }}</div>
         <p class="badge-description">{{ description }}</p>
    </div>
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
  console.log("params: ", params);

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

const handleMouseMove = (event) => {
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
  // Use reference to the parent.
  const { width, height, left, top } =
    event.target.getBoundingClientRect();
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
  width: 100px;
  height: 100px;
  margin: 4px;
  z-index: 0;
  perspective: 2100px;

  transition:
  filter 0.1s,
}

.card_wrapper.is-hovered {
  z-index: 10;
  transition:
  filter 2.0s;

}

.card_inner {
  transform-origin: 50%  51%;
  overflow: hidden;
  perspective: 10000px;
  backface-visibility: hidden;
  background-color: white;
  cursor: pointer;
  border-radius: 10px;
  width: 100px;
  height: 100px;
  filter: drop-shadow(0 8px 8px rgba(0, 0, 0, 0.5));

  transition:
  transform 0.2s,
  height 0.1s,
  filter 0.2s,
  ;

}

.card_inner.is-hovered {
  filter:
  drop-shadow(0 0 3px rgba(255,255,0,1))
  drop-shadow(0 20px 30px rgba(0, 0, 0, 0.3))
  ;

  transition:
  transform 0.2s,
  height 0.6s ease-in-out 0.5s,
  filter 0.2s,
  ;
}


.disabled:not(.is-hovered) {
  filter:
  contrast(0.5)
  brightness(1.5)
  blur(10px)
  grayscale(100%)
  ;
}

.badge-name {
  font-size: 1em;
  padding: 10px;
}

.badge-description {
  font-size: 0.5em;
  padding: 10px;
}

@keyframes glow {
  0% {
    filter: drop-shadow(0 0 10px rgba(255,255,0,1));
  }
  50% {
    filter: drop-shadow(0 0 20px rgba(255,255,0,1));
  }
  100% {
    filter: drop-shadow(0 0 10px rgba(255,255,0,1));
  }
}

</style>
