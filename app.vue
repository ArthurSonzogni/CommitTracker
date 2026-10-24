<template>
  <div>
    <NuxtLoadingIndicator></NuxtLoadingIndicator>
    <NuxtLayout>
    <NuxtPage>
    </NuxtPage>
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">

useHead({
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ],
  link: [
    { rel: "icon", href: "/favicon.ico" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap",
    },
  ],
  htmlAttrs: {
    lang: "en"
  },
})
const title = "ChromiumCommitTracker"
const description =
  "A web application to show statistics about the Chromium repository, and more.";

useSeoMeta({
  title: title,
  ogTitle: title,

  description: description,
  ogDescription: description,

  ogImage: "https://chrome-commit-tracker.arthursonzogni.com/logo.png",

  ogUrl: "https://chrome-commit-tracker.arthursonzogni.com",
  ogType: "website",
  ogSiteName: title,

  twitterSite: "@arthursonzogni",
  twitterCreator: "@arthursonzogni",
  twitterTitle: title,
  twitterDescription: description,
})

</script>
