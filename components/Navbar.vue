<template>
  <div class="site-header">
    <img
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
            <circle cx="18" cy="17" r="2.4" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>
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
            <NuxtLink v-if="entry.to" class="navbar-item" :to="entry.to">
              {{ entry.label }}
            </NuxtLink>
            <div
              v-else
              class="navbar-item has-dropdown is-hoverable"
              :class="{ 'is-active': openDropdown === entry.label }"
              @mouseleave="openDropdown = null">
              <a
                class="navbar-link"
                role="button"
                tabindex="0"
                aria-haspopup="true"
                :aria-expanded="openDropdown === entry.label"
                @click="toggleDropdown(entry.label)"
                @keydown.enter.prevent="toggleDropdown(entry.label)">
                {{ entry.label }}
              </a>
              <div class="navbar-dropdown">
                <NuxtLink
                  v-for="item in entry.items"
                  :key="item.to"
                  class="navbar-item"
                  :to="item.to">
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
            class="navbar-item theme-toggle"
            :aria-label="dark ? 'Use the light theme' : 'Use the dark theme'"
            :title="dark ? 'Light theme' : 'Dark theme'"
            @click="toggleTheme">
            <UiIcon :name="dark ? 'weather-sunny' : 'weather-night'" />
          </a>
          <a
            class="navbar-item github-link"
            href="https://github.com/ArthurSonzogni/CommitTracker">
            <UiIcon name="github" class="mr-1" />
            GitHub
          </a>
        </div>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
const MENU = [
  { label: "Individuals", to: "/individuals" },
  { label: "Community graph", to: "/communities" },
  { label: "Treemap", to: "/treemap" },
  { label: "Repositories", items: [
    { label: "Charts", to: "/repositories", icon: "format-list-bulleted" },
    { label: "Heatmap", to: "/pulse", icon: "pulse" },
  ] },
  { label: "Organizations", items: [
    { label: "Commits", to: "/organizations/commits", icon: "source-branch" },
    { label: "Emails", to: "/organizations/emails", icon: "email" },
  ] },
  { label: "CVE", items: [
    { label: "Overview", to: "/cve/overview", icon: "chart-pie" },
    { label: "List", to: "/cve/list", icon: "format-list-bulleted" },
    { label: "Pivot table", to: "/cve/pivot-table", icon: "table" },
    { label: "Reward per component", to: "/cve/reward_per_components", icon: "chart-sankey" },
    { label: "Money tree", to: "/cve/money-tree", icon: "currency-usd" },
  ] },
  { label: "More", items: [
    { label: "Usernames distribution", to: "/usernames", icon: "email" },
    { label: "Leaderboard", to: "/leaderboard", icon: "trophy" },
    { label: "Badges", to: "/badges/list", icon: "certificate" },
    { label: "Fuzz test", to: "/fuzz-test", icon: "bug" },
    { label: "API", to: "/api", icon: "code-json" },
    { label: "Repositories tracking info", to: "/repo-info", icon: "source-branch" },
    { label: "Page view", to: "/page-view", icon: "eye" },
  ] },
];

// The mobile menu, and the dropdown opened by click (they also open on hover
// on desktop). Both close when navigating, or clicking elsewhere.
const menuOpen = ref(false);
const openDropdown = ref<string | null>(null);
const start = ref<HTMLElement | null>(null);
const toggleDropdown = (label: string) => {
  openDropdown.value = openDropdown.value === label ? null : label;
};
const route = useRoute();
watch(() => route.fullPath, () => {
  menuOpen.value = false;
  openDropdown.value = null;
});
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

// The theme follows the system, unless chosen here. The choice is stored, and
// applied early by app.vue.
const dark = ref(false);
onMounted(() => {
  const theme = document.documentElement.dataset.theme;
  dark.value = theme
    ? theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
});
const toggleTheme = () => {
  dark.value = !dark.value;
  const theme = dark.value ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
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
  color: var(--accent);
  height: 1.4rem;
  width: 1.4rem;
}

/* Some pages inline SVGs with global styles, e.g. the community graph. */
.brand-mark path {
  stroke-opacity: 1;
}

.brand-name {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.brand-name span {
  color: var(--muted);
  font-weight: 500;
}

.theme-toggle {
  color: var(--muted) !important;
}

.theme-toggle:hover {
  color: var(--ink) !important;
}

.github-link {
  color: var(--muted) !important;
}

.search-icon {
  color: var(--ink-2) !important;
  margin-left: auto;
}

.search-pill {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow-xs);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 0.8rem;
  gap: 0.4rem;
  height: 2rem;
  padding: 0 0.4rem 0 0.7rem;
  transition: border-color 0.15s, color 0.15s;
}

.search-pill:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.search-pill span {
  margin-right: 1.5rem;
}

.search-pill kbd {
  background: var(--surface-sunken);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  padding: 0.1rem 0.45rem;
}
</style>
