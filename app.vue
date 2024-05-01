<script setup lang="ts">

useHead({
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ],
  link: [
    { rel: "icon", href: "/favicon.ico" }
  ],
  htmlAttrs: {
    lang: "en"
  }
})
const title = "ChromeCommitTracker"
const description =
  "An web application to show statistics about the Chrome repository.";

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: "https://dashboard-template.nuxt.dev/social-card.png",
  twitterImage: "https://dashboard-template.nuxt.dev/social-card.png",
  twitterCard: "summary_large_image"
})
</script>

<template>
  <div>
    <NuxtLoadingIndicator />

    <NuxtLayout>
    <NuxtPage />
    </NuxtLayout>
  </div>
</template>
