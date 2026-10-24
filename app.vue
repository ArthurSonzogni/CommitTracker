<template>
  <div>
    <NuxtLoadingIndicator></NuxtLoadingIndicator>
    <CommandPalette/>
    <NuxtLayout>
    <NuxtPage>
    </NuxtPage>
    </NuxtLayout>
    <SiteFooter/>
  </div>
</template>

<script setup lang="ts">
import site_pages from './utils/site-pages.json'

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
// Title and description of the current page (pages may override them, e.g.
// the developer profiles). scripts/static-meta.mjs writes the same ones into
// the generated HTML, for link previews.
const route = useRoute();
const page = computed(() =>
  site_pages.find(page => page.path === (route.path.replace(/\/$/, "") || "/")));
const title = () => page.value?.title ??
  (page.value ? `${page.value.label} · CommitTracker` : "CommitTracker");
const description = () => page.value?.description ?? site_pages[0].description;
const url = () => "https://chrome-commit-tracker.arthursonzogni.com" + route.path;

useSeoMeta({
  title,
  ogTitle: title,

  description,
  ogDescription: description,

  ogImage: "https://chrome-commit-tracker.arthursonzogni.com/og-image.png",

  ogUrl: url,
  ogType: "website",
  ogSiteName: "CommitTracker",

  twitterCard: "summary_large_image",
  twitterSite: "@arthursonzogni",
  twitterCreator: "@arthursonzogni",
  twitterTitle: title,
  twitterDescription: description,
})

</script>
