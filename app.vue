<template>
  <div>
    <NuxtLoadingIndicator></NuxtLoadingIndicator>
    <NuxtLayout>
    <NuxtPage>
    </NuxtPage>
    </NuxtLayout>
    <img
      async
      style="display: none"
      src="https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fchrome-commit-tracker.arthursonzogni.com&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false"/>
  </div>
</template>

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

<style>

html {
  scroll-behavior: smooth;
}

</style>
