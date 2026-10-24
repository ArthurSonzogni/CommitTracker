<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="active" class="modal is-active" role="dialog" aria-modal="true">
        <div class="modal-background" @click="active = false" />
        <div class="modal-content" :style="{ width: typeof width === 'number' ? `${width}px` : width }">
          <slot />
        </div>
        <button type="button" class="modal-close is-large" aria-label="Close" @click="active = false" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// A modal dialog, closed with Escape or by clicking outside.

defineProps<{ width?: number | string }>();

const active = defineModel<boolean>({ default: false });

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    active.value = false;
  }
};
onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.modal-content {
  max-width: calc(100vw - 2rem);
}

.modal-background {
  backdrop-filter: blur(3px);
  background: rgba(18, 18, 22, 0.35);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
