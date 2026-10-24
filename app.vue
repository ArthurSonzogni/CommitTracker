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

/* Let Buefy form rows wrap on narrow screens. */
.field.is-grouped > .field,
.field.has-addons > .field {
  flex-shrink: 1;
  min-width: 0;
}
.select,
.select select {
  max-width: 100%;
}
.field.has-addons {
  flex-wrap: wrap;
}

</style>
