<template>
  <div>
    <CommandPalette />
    <Navbar />
    <main class="section error-page">
      <div class="container error-card">
        <p class="error-code">{{ statusCode }}</p>
        <h1 class="title mb-2">{{ heading }}</h1>
        <p class="error-message">{{ description }}</p>

        <div class="error-search">
          <HomeSearch />
        </div>

        <div class="error-actions">
          <button type="button" class="button is-primary" @click="goHome">
            <UiIcon name="home" size="small" class="mr-1" />
            Back to home
          </button>
          <NuxtLink class="button" to="/individuals" @click="clear">
            Individuals
          </NuxtLink>
          <NuxtLink class="button" to="/repositories" @click="clear">
            Repositories
          </NuxtLink>
          <NuxtLink class="button" to="/security" @click="clear">
            Security
          </NuxtLink>
        </div>
      </div>
    </main>
    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{
  error: NuxtError;
}>();

const statusCode = computed(() => props.error?.statusCode || 404);
const is404 = computed(() => statusCode.value === 404);

const heading = computed(() =>
  is404.value ? "Page not found" : props.error?.statusMessage || "Something went wrong",
);

const description = computed(() =>
  is404.value
    ? "This page does not exist or may have moved. Search for a page, repository, developer, or CVE below."
    : props.error?.message || "An unexpected error occurred while rendering this page.",
);

useHead({
  title: computed(() => `${statusCode.value} · ${heading.value} · CommitTracker`),
});

const goHome = () => clearError({ redirect: "/" });
const clear = () => clearError();
</script>

<style scoped>
.error-page {
  min-height: 62vh;
  display: flex;
  align-items: center;
}

.error-card {
  max-width: 40rem;
}

.error-code {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  margin-bottom: 0.4rem;
}

.error-message {
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.55;
  margin-bottom: 1.5rem;
}

.error-search {
  margin-bottom: 1.5rem;
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
