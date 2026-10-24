<template>
  <Transition name="fade">
    <div
      v-if="active"
      class="loading-overlay"
      :class="{ 'is-full-page': isFullPage }"
      role="status"
      aria-label="Loading">
      <div class="loading-background" />
      <div class="loading-icon" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
// A loading overlay, over its parent or the full page.

withDefaults(defineProps<{ isFullPage?: boolean }>(), { isFullPage: true });

const active = defineModel<boolean>({ default: false });
</script>

<style scoped>
.loading-overlay {
  align-items: center;
  display: flex;
  inset: 0;
  justify-content: center;
  position: absolute;
  z-index: 29;
}

.loading-overlay.is-full-page {
  position: fixed;
  z-index: 999;
}

.loading-background {
  backdrop-filter: blur(2px);
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  inset: 0;
  position: absolute;
}

.loading-icon {
  animation: spin 0.6s linear infinite;
  border: 3px solid var(--line);
  border-radius: 50%;
  border-top-color: var(--accent);
  height: 2.5rem;
  position: relative;
  width: 2.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
