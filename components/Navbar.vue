<template>
  <div class="site-header">
    <img
      v-if="countVisit"
      :key="route.path"
      async
      style="position: absolute; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none;"
      alt=""
      src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fchrome-commit-tracker.arthursonzogni.com%2F&label=commit-tracker&icon=heart-fill&color=%23fd86aa"
    />
    <nav class="navbar site-navbar" aria-label="Main navigation">
      <div class="navbar-brand">
        <NuxtLink to="/" class="navbar-item brand">
          <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3v18M6 8c0 4 12 2 12 7v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="6" cy="6" r="2.4" fill="currentColor"/>
            <circle cx="6" cy="18" r="2.4" fill="currentColor"/>
            <circle cx="18" cy="17" r="2.4" fill="var(--nav-bg)" stroke="currentColor" stroke-width="2"/>
          </svg>
          <span class="brand-name">Commit<span>Tracker</span></span>
        </NuxtLink>
        <a
          role="button"
          tabindex="0"
          class="navbar-item search-icon is-hidden-desktop"
          aria-label="Search"
          @click="paletteOpen = true">
          <UiIcon name="magnify" />
        </a>
        <a
          role="button"
          tabindex="0"
          class="navbar-item share-button is-hidden-desktop"
          aria-label="Share this page"
          @click="share()">
          <UiIcon :key="String(copied)" :name="copied ? 'check' : 'share-variant'" :class="{ 'share-icon': copied }" />
        </a>
        <a
          role="button"
          tabindex="0"
          class="navbar-burger"
          :class="{ 'is-active': menuOpen }"
          aria-label="Menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
          @keydown.enter.prevent="menuOpen = !menuOpen">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </a>
      </div>

      <div class="navbar-menu" :class="{ 'is-active': menuOpen }">
        <div ref="start" class="navbar-start">
          <template v-for="entry in MENU" :key="entry.label">
            <NuxtLink
              v-if="'to' in entry"
              class="navbar-item"
              :to="entry.to"
              @pointerenter="prefetchRouteData(entry.to)">
              <UiIcon :name="entry.icon" size="small" class="mr-2 menu-icon" />
              {{ entry.label }}
            </NuxtLink>
            <div
              v-else
              class="navbar-item has-dropdown is-hoverable"
              :class="{ 'is-active': openDropdown === entry.label, 'is-active-group': isGroupActive(entry) }"
              @mouseleave="openDropdown = null">
              <a
                class="navbar-link"
                role="button"
                tabindex="0"
                aria-haspopup="true"
                :aria-expanded="openDropdown === entry.label"
                @click="toggleDropdown(entry.label)"
                @keydown.enter.prevent="toggleDropdown(entry.label)">
                <UiIcon :name="activeChild(entry)?.icon ?? entry.icon" size="small" class="mr-2 menu-icon" />
                {{ activeChild(entry)?.navLabel ?? entry.label }}
              </a>
              <div class="navbar-dropdown">
                <NuxtLink
                  v-for="item in entry.items"
                  :key="item.to"
                  class="navbar-item"
                  :to="item.to"
                  @pointerenter="prefetchRouteData(item.to)">
                  <UiIcon :name="item.icon" class="mr-2" />
                  {{ item.label }}
                </NuxtLink>
              </div>
            </div>
          </template>
        </div>

        <div class="navbar-end">
          <div class="navbar-item is-hidden-touch">
            <button class="search-pill" @click="paletteOpen = true">
              <UiIcon name="magnify" size="small" />
              <span>Search</span>
              <kbd>{{ shortcut }}</kbd>
            </button>
          </div>
          <a
            role="button"
            tabindex="0"
            class="navbar-item share-button is-hidden-touch"
            aria-label="Copy the link to this page"
            title="Copy the link"
            @click="share()">
            <UiIcon :key="String(copied)" :name="copied ? 'check' : 'share-variant'" :class="{ 'share-icon': copied }" />
          </a>
          <a
            role="button"
            tabindex="0"
            class="navbar-item theme-toggle"
            :aria-label="dark ? 'Use the light theme' : 'Use the dark theme'"
            :title="dark ? 'Light theme' : 'Dark theme'"
            @click="onToggleTheme($event)">
            <UiIcon :name="dark ? 'weather-sunny' : 'weather-night'" />
          </a>
          <a
            class="navbar-item github-link"
            href="https://github.com/ArthurSonzogni/CommitTracker"
            aria-label="Source on GitHub"
            title="Source on GitHub">
            <UiIcon name="github" />
          </a>
        </div>
      </div>
    </nav>
    <span class="live-status" role="status">{{ copied ? "Link copied" : "" }}</span>
  </div>
</template>

<script setup lang="ts">
import { useShareLink } from "~/composables/useShareLink";
import { useTheme } from "~/composables/useTheme";
import { findSitePage } from "~/utils/pageMeta";

const route = useRoute();

// Count the visits of the deployed website only, not the dev server's or the
// interaction tests'.
const countVisit =
  typeof location !== "undefined" &&
  location.hostname === "chrome-commit-tracker.arthursonzogni.com";

const pageItem = (to: string, labelOverride?: string, navLabelOverride?: string) => {
  const page = findSitePage(to);
  const label = labelOverride ?? page?.label ?? to;
  return {
    to,
    label,
    navLabel: navLabelOverride ?? label,
    icon: page?.icon ?? "circle-small",
  };
};

interface NavLeaf {
  to: string;
  label: string;
  navLabel: string;
  icon: string;
}

interface NavGroup {
  label: string;
  icon: string;
  to?: undefined;
  items: NavLeaf[];
}

const MENU: Array<NavLeaf | NavGroup> = [
  pageItem("/individuals"),
  pageItem("/communities"),
  pageItem("/treemap"),
  {
    label: "Repositories",
    icon: "chart-bar",
    items: [
      pageItem("/repositories", "Charts", "Repo charts"),
      pageItem("/pulse", "Heatmap", "Repo heatmap"),
      pageItem("/accretion", "Code accretion", "Accretion"),
    ],
  },
  {
    label: "Organizations",
    icon: "domain",
    items: [
      pageItem("/organizations/commits", "Commits", "Org commits"),
      pageItem("/organizations/emails", "Emails", "Org emails"),
    ],
  },
  {
    label: "CVE",
    icon: "shield-bug",
    items: [
      pageItem("/cve/overview", "Overview", "CVE overview"),
      pageItem("/cve/list", "List", "CVE list"),
      pageItem("/cve/pivot-table", "Pivot table", "CVE pivot"),
      pageItem("/cve/reward_per_components", "Reward per component", "CVE rewards"),
      pageItem("/cve/money-tree", "Money tree", "CVE tree"),
    ],
  },
  {
    label: "More",
    icon: "dots-horizontal",
    items: [
      pageItem("/developer-output", "Developer output", "Dev output"),
      pageItem("/security"),
      pageItem("/leaderboard"),
      pageItem("/badges/list"),
      pageItem("/fuzz-test"),
      pageItem("/usernames", "Usernames distribution", "Usernames"),
    ],
  },
];

const activeChild = (entry: NavGroup): NavLeaf | undefined =>
  entry.items.find((item) => route.path === item.to || (item.to !== "/" && route.path.startsWith(item.to + "/")));

const isGroupActive = (entry: NavGroup) => Boolean(activeChild(entry));

// Warm the browser HTTP cache for lightweight page datasets on link hover.
const PREFETCH_URLS: Record<string, string[]> = {
  "/security": ["/data/security.json"],
  "/developer-output": ["/data/developer-output.json"],
  "/leaderboard": ["/data/top-bugs.json"],
  "/badges/list": ["/badges.json"],
  "/cve/overview": ["/cve/summary.json"],
  "/organizations/commits": ["/data/organizations.json"],
  "/repositories": ["/data/repositories_stats.json"],
};
const prefetchedUrls = new Set<string>();
const prefetchRouteData = (to: string) => {
  if (typeof window === "undefined") return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  for (const url of PREFETCH_URLS[to] ?? []) {
    if (prefetchedUrls.has(url)) continue;
    prefetchedUrls.add(url);
    fetch(url, { priority: "low" } as RequestInit).catch(() => {});
  }
};

// The mobile menu, and the dropdown opened by click (they also open on hover
// on desktop). Both close when navigating, or clicking elsewhere.
const menuOpen = ref(false);
const openDropdown = ref<string | null>(null);
const start = ref<HTMLElement | null>(null);
const toggleDropdown = (label: string) => {
  openDropdown.value = openDropdown.value === label ? null : label;
};

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
    openDropdown.value = null;
  },
);

const onDocumentClick = (event: MouseEvent) => {
  if (!start.value?.contains(event.target as Node)) {
    openDropdown.value = null;
  }
};
onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));

const paletteOpen = useState("command-palette-open", () => false);
const shortcut = ref("Ctrl K");
onMounted(() => {
  if (/Mac|iPhone|iPad/.test(navigator.platform)) {
    shortcut.value = "⌘K";
  }
});

// The URL holds the state of every page, so sharing it shares the view.
const { copied, share } = useShareLink();

// The theme follows the system, unless chosen here. Shared across Navbar
// and CommandPalette.
const { dark, syncFromDom, toggleTheme } = useTheme();
onMounted(() => {
  syncFromDom();
});
const onToggleTheme = (event: MouseEvent) => {
  const el = event.currentTarget as HTMLElement | null;
  const rect = el?.getBoundingClientRect();
  const origin = event.clientX || event.clientY
    ? { x: event.clientX, y: event.clientY }
    : rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined;
  toggleTheme(false, origin);
};
</script>

<style scoped>
.site-header {
  position: relative;
  z-index: 40;
}

.brand {
  gap: 0.55rem;
}

.brand-mark {
  color: var(--nav-ink);
  height: 1.4rem;
  width: 1.4rem;
}

.brand-name {
  color: var(--nav-ink);
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.brand-name span {
  color: var(--nav-ink-muted);
  font-weight: 500;
}

.theme-toggle,
.share-button {
  color: var(--muted) !important;
}

.share-icon {
  animation: pop-in 0.25s cubic-bezier(0.2, 0, 0, 1.4);
}

@keyframes pop-in {
  from { transform: scale(0.6); }
}

/* Announced to screen readers, not shown. */
.live-status {
  height: 1px;
  overflow: hidden;
  position: absolute;
  width: 1px;
}

.theme-toggle:hover,
.share-button:hover {
  color: var(--ink) !important;
}

.github-link {
  color: var(--muted) !important;
}

/* On desktop, the buttons sit on the colored bar. */
@media (min-width: 1024px) {
  .theme-toggle,
  .share-button,
  .github-link {
    color: var(--nav-ink-muted) !important;
  }

  .theme-toggle:hover,
  .share-button:hover,
  .github-link:hover {
    background: var(--nav-hover) !important;
    color: var(--nav-ink) !important;
  }
}

.search-icon {
  color: var(--nav-ink) !important;
  margin-left: auto;
}

.share-button.is-hidden-desktop {
  color: var(--nav-ink) !important;
}

.search-pill {
  align-items: center;
  background: var(--nav-hover);
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--nav-ink-muted);
  cursor: pointer;
  display: flex;
  font-size: 0.8rem;
  gap: 0.4rem;
  height: 2rem;
  padding: 0 0.4rem 0 0.7rem;
  transition: border-color 0.15s, color 0.15s;
}

.search-pill:hover {
  border-color: var(--nav-ink-muted);
  color: var(--nav-ink);
}

.search-pill span {
  margin-right: 0.75rem;
}

.search-pill kbd {
  background: var(--nav-hover);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  padding: 0.1rem 0.45rem;
}

/* On narrow desktops, the menu drops its icons, so that it fits on one line. */
@media (min-width: 1024px) and (max-width: 1479px) {
  .menu-icon {
    display: none;
  }
}

/* On narrower desktops, the search pill also keeps only its icon. */
@media (min-width: 1024px) and (max-width: 1279px) {
  .navbar-item:not(.has-dropdown),
  .navbar-link {
    padding-left: 0.5rem;
  }

  .navbar-link:not(.is-arrowless) {
    padding-right: 1.9em;
  }

  .navbar-item:not(.has-dropdown) {
    padding-right: 0.5rem;
  }

  .search-pill {
    justify-content: center;
    padding: 0;
    width: 2rem;
  }

  .search-pill span:not(.icon),
  .search-pill kbd {
    display: none;
  }
}
</style>
