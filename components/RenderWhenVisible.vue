<template>
  <div ref="root" :style="visible ? undefined : { minHeight }">
    <slot v-if="visible" />
  </div>
</template>

<script setup lang="ts">
// Renders its content only once it gets close to the viewport. Used to avoid
// loading heavy data for sections the user may never scroll to.

const props = defineProps({
  // Space reserved before rendering, to keep the scrollbar stable.
  minHeight: { type: String, default: "60vh" },
});

const root = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      visible.value = true;
      observer?.disconnect();
    }
  }, { rootMargin: "300px" });
  observer.observe(root.value!);
});

onBeforeUnmount(() => observer?.disconnect());
</script>
