<template>
  <div>
    <NuxtLoadingIndicator></NuxtLoadingIndicator>
    <CommandPalette/>
    <Navbar/>
    <NuxtLayout>
      <NuxtPage/>
    </NuxtLayout>
    <SiteFooter/>
    <Transition name="back-to-top-fade">
      <button
        v-if="showBackToTop"
        type="button"
        class="back-to-top"
        aria-label="Back to top"
        title="Back to top"
        @click="scrollToTop">
        <UiIcon name="arrow-up" size="small" />
      </button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import {
  findSitePage,
  formatPageImage,
  formatPageDescription,
  formatPageTitle,
  formatPageUrl,
  SITE_NAME,
  SITE_TWITTER,
} from "~/utils/pageMeta";
import { useRecentVisits } from "~/composables/useRecentVisits";

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

  ogImage: () => formatPageImage(page.value),

  ogUrl: url,
  ogType: "website",
  ogSiteName: SITE_NAME,

  twitterCard: "summary_large_image",
  twitterSite: SITE_TWITTER,
  twitterCreator: SITE_TWITTER,
  twitterTitle: title,
  twitterDescription: description,
});

// Track recent pages & developer profiles for the command palette.
const { recordRecent } = useRecentVisits();
watch(
  () => route.path,
  (path) => {
    if (!path || path === "/") return;
    const devMatch = path.match(/^\/developers\/([^/]+)(?:\/(\d{4}))?$/);
    if (devMatch) {
      const dev = decodeURIComponent(devMatch[1]);
      const yr = devMatch[2];
      recordRecent({
        key: `recent:${path}`,
        label: yr ? `${dev} (${yr})` : dev,
        hint: yr ? "Year in review" : "Developer",
        icon: "account",
        path,
      });
      return;
    }
    const found = findSitePage(path);
    if (found) {
      recordRecent({
        key: `recent:${found.path}`,
        label: found.label,
        hint: "Page",
        icon: found.icon,
        path: found.path,
      });
    }
  },
  { immediate: true },
);

// Global keyboard shortcut: `/` opens search.
const paletteOpen = useState("command-palette-open", () => false);
const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const onGlobalShortcut = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (paletteOpen.value || isTypingTarget(event.target)) return;
  if (event.key === "/") {
    event.preventDefault();
    paletteOpen.value = true;
  }
};

// Back-to-top button after scrolling past the first viewport.
const showBackToTop = ref(false);
const onWindowScroll = () => {
  showBackToTop.value = window.scrollY > 600;
};
const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

onMounted(() => {
  window.addEventListener("keydown", onGlobalShortcut);
  window.addEventListener("scroll", onWindowScroll, { passive: true });
  onWindowScroll();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalShortcut);
  window.removeEventListener("scroll", onWindowScroll);
});
</script>

<style scoped>
.back-to-top {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  bottom: 1.25rem;
  box-shadow: var(--shadow-sm);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  height: 2.35rem;
  justify-content: center;
  position: fixed;
  right: 1.25rem;
  transition: color 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  width: 2.35rem;
  z-index: 35;
}

.back-to-top:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-lg);
  color: var(--accent);
  transform: translateY(-2px);
}

.back-to-top-fade-enter-active,
.back-to-top-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.back-to-top-fade-enter-from,
.back-to-top-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
