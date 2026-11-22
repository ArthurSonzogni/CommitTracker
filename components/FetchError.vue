<template>
  <div class="fetch-error" role="alert">
    <UiIcon name="alert-circle-outline" class="fetch-error-icon" />
    <div class="fetch-error-body">
      <p class="fetch-error-title">{{ title }}</p>
      <p v-if="message" class="fetch-error-message">{{ message }}</p>
    </div>
    <button
      v-if="showRetry"
      type="button"
      class="button is-small fetch-error-retry"
      @click="$emit('retry')">
      <UiIcon name="refresh" size="small" class="mr-1" />
      Retry
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string;
    message?: string | null;
    showRetry?: boolean;
  }>(),
  {
    title: "Could not load data",
    message: null,
    showRetry: true,
  },
);

defineEmits<{
  retry: [];
}>();
</script>

<style scoped>
.fetch-error {
  align-items: flex-start;
  background: var(--tag-danger-bg);
  border: 1px solid color-mix(in srgb, var(--tag-danger-ink) 28%, transparent);
  border-radius: var(--radius);
  color: var(--tag-danger-ink);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  padding: 0.9rem 1.1rem;
}

.fetch-error-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.fetch-error-body {
  flex: 1 1 14rem;
  min-width: 0;
}

.fetch-error-title {
  font-weight: 600;
  margin: 0;
}

.fetch-error-message {
  font-size: 0.85rem;
  margin: 0.2rem 0 0;
  opacity: 0.9;
}

.fetch-error-retry {
  align-self: center;
  flex-shrink: 0;
}
</style>
