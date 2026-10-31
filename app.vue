<template>
  <div>
    <NuxtLoadingIndicator></NuxtLoadingIndicator>
    <CommandPalette/>
    <Navbar/>
    <NuxtLayout>
      <NuxtPage/>
    </NuxtLayout>
    <SiteFooter/>
  </div>
</template>

<script setup lang="ts">
import {
  findSitePage,
  formatPageDescription,
  formatPageTitle,
  formatPageUrl,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_TWITTER,
} from "~/utils/pageMeta";

useHead({
  link: [
    { rel: "icon", href: "/favicon.ico" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap",
    },
  ],
});

// Title and description of the current page (pages may override them, e.g.
// the developer profiles). scripts/static-meta.mjs writes the same ones into
// the generated HTML, for link previews.
const route = useRoute();
const page = computed(() => findSitePage(route.path));
const title = () => formatPageTitle(page.value);
const description = () => formatPageDescription(page.value);
const url = () => formatPageUrl(route.path);

useSeoMeta({
  title,
  ogTitle: title,

  description,
  ogDescription: description,

  ogImage: SITE_OG_IMAGE,

  ogUrl: url,
  ogType: "website",
  ogSiteName: SITE_NAME,

  twitterCard: "summary_large_image",
  twitterSite: SITE_TWITTER,
  twitterCreator: SITE_TWITTER,
  twitterTitle: title,
  twitterDescription: description,
});
</script>
