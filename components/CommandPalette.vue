<template>
  <Teleport to="body">
    <div v-if="open" class="palette-backdrop" @mousedown.self="close">
      <div
        class="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search pages, repositories and developers">
        <div class="palette-input">
          <b-icon icon="magnify" size="is-small" class="palette-input-icon"></b-icon>
          <input
            ref="input"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            :aria-activedescendant="results.length ? `palette-item-${active}` : undefined"
            placeholder="Search pages, repositories, developers, CVE ids…"
            autocomplete="off"
            spellcheck="false"
            @keydown="onKeydown"
          />
          <kbd>Esc</kbd>
        </div>

        <ul id="palette-results" class="palette-results" role="listbox" ref="list">
          <template v-for="(item, index) in results" :key="item.key">
            <li
              v-if="index === 0 || results[index - 1].group !== item.group"
              class="palette-group"
              role="presentation">
              {{ item.group }}
            </li>
            <li
              :id="`palette-item-${index}`"
              role="option"
              :aria-selected="index === active"
              :class="['palette-item', { 'is-active': index === active }]"
              @mousemove="active = index"
              @click="select(item)">
              <b-icon :icon="item.icon" size="is-small" class="palette-item-icon"></b-icon>
              <span class="palette-item-label">{{ item.label }}</span>
              <span v-if="item.hint" class="palette-item-hint">{{ item.hint }}</span>
            </li>
          </template>
          <li v-if="results.length === 0" class="palette-empty">No results</li>
        </ul>

        <div class="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import repositories_json from '../public/data/repositories.json'

// Shared with the navbar's search button.
const open = useState("command-palette-open", () => false);

const query = ref("");
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
const usernames = shallowRef<string[]>([]);

const pages = [
  { label: "Home", path: "/", icon: "home" },
  { label: "Individuals", path: "/individuals", icon: "account", hint: "Commits and reviews of developers" },
  { label: "Community graph", path: "/communities", icon: "account-group" },
  { label: "Treemap", path: "/treemap", icon: "chart-tree", hint: "Codebase metrics over time" },
  { label: "Repositories charts", path: "/repositories", icon: "chart-bar" },
  { label: "Repositories heatmap", path: "/pulse", icon: "pulse" },
  { label: "Organizations commits", path: "/organizations/commits", icon: "domain" },
  { label: "Organizations emails", path: "/organizations/emails", icon: "email" },
  { label: "CVE overview", path: "/cve/overview", icon: "chart-pie" },
  { label: "CVE list", path: "/cve/list", icon: "format-list-bulleted" },
  { label: "CVE pivot table", path: "/cve/pivot-table", icon: "table" },
  { label: "CVE reward per component", path: "/cve/reward_per_components", icon: "chart-sankey" },
  { label: "CVE money tree", path: "/cve/money-tree", icon: "currency-usd" },
  { label: "Leaderboard", path: "/leaderboard", icon: "trophy" },
  { label: "Badges", path: "/badges/list", icon: "certificate" },
  { label: "Usernames distribution", path: "/usernames", icon: "account-multiple" },
  { label: "Fuzz test", path: "/fuzz-test", icon: "bug" },
  { label: "Commit rates", path: "/commit-rates", icon: "chart-line" },
  { label: "API", path: "/api", icon: "code-json" },
  { label: "Repositories tracking info", path: "/repo-info", icon: "source-branch" },
].map(page => ({ ...page, group: "Pages", key: "page:" + page.path }));

const repositories = repositories_json.map(repo => ({
  group: "Repositories",
  key: "repo:" + repo.dirname,
  label: repo.name,
  hint: "Contributions",
  icon: "source-repository",
  path: `/repositories?repositories=${repo.dirname}`,
}));

// Lower is better. Prefix matches rank above substring matches.
const score = (text: string, q: string) => {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 0;
  const index = t.indexOf(q);
  return index === -1 ? -1 : 1 + index / 100;
};

const matching = (items, q: string, limit: number) => items
  .map(item => ({ item, s: score(item.label, q) }))
  .filter(({ s }) => s >= 0)
  .sort((a, b) => a.s - b.s)
  .slice(0, limit)
  .map(({ item }) => item);

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) {
    return pages.slice(0, 9);
  }

  const out = [
    ...matching(pages, q, 6),
    ...matching(repositories, q, 4),
  ];

  const cve = q.replace(/^cve-/, "").match(/^\d{4}-\d+$/);
  if (cve) {
    out.unshift({
      group: "CVE",
      key: "cve:" + cve[0],
      label: `CVE-${cve[0]}`,
      icon: "security",
      path: `/cve?id=${cve[0]}`,
    });
  }

  if (q.length >= 2) {
    const developers = usernames.value
      .filter(name => name.toLowerCase().includes(q))
      .sort((a, b) => score(a, q) - score(b, q) || a.length - b.length)
      .slice(0, 6);
    for (const name of developers) {
      out.push({
        group: "Developers",
        key: "dev:" + name,
        label: name,
        hint: "Chromium",
        icon: "account",
        path: `/individuals?developers=${encodeURIComponent(name)}`,
      });
    }
  }
  return out;
});

watch(results, () => {
  active.value = 0;
});

watch(active, async () => {
  await nextTick();
  list.value?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
});

let previousFocus: Element | null = null;

watch(open, async (value) => {
  if (!value) {
    (previousFocus as HTMLElement | null)?.focus?.();
    return;
  }
  previousFocus = document.activeElement;
  query.value = "";
  active.value = 0;
  await nextTick();
  input.value?.focus();
  if (usernames.value.length === 0) {
    const response = await fetch("/data/chromium/usernames.json");
    usernames.value = await response.json();
  }
});

const close = () => {
  open.value = false;
};

const select = (item) => {
  close();
  navigateTo(item.path);
};

const onKeydown = (event: KeyboardEvent) => {
  const count = results.value.length;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    active.value = (active.value + 1) % Math.max(count, 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    active.value = (active.value - 1 + count) % Math.max(count, 1);
  } else if (event.key === "Enter" && count) {
    event.preventDefault();
    select(results.value[active.value]);
  } else if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "Tab") {
    // Keep the focus inside the dialog.
    event.preventDefault();
  }
};

const onGlobalKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    open.value = !open.value;
  }
};

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));
</script>

<style scoped>
.palette-backdrop {
  align-items: flex-start;
  animation: fade-in 120ms ease-out;
  backdrop-filter: blur(3px);
  background: rgba(18, 18, 22, 0.28);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 12vh 1rem 1rem;
  position: fixed;
  z-index: 100;
}

.palette {
  animation: pop-in 160ms cubic-bezier(0.2, 0, 0, 1);
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 64px -16px rgba(18, 18, 22, 0.35), 0 0 0 1px rgba(18, 18, 22, 0.08);
  display: flex;
  flex-direction: column;
  max-height: min(32rem, 76vh);
  overflow: hidden;
  width: min(38rem, 100%);
}

.palette-input {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 0.6rem;
  padding: 0 1rem;
}

.palette-input-icon {
  color: var(--faint);
}

.palette-input input {
  background: transparent;
  border: none;
  color: var(--ink);
  flex: 1;
  font-size: 1rem;
  height: 3.25rem;
  min-width: 0;
  outline: none;
}

.palette-input input::placeholder {
  color: var(--faint);
}

kbd {
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 5px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  margin-right: 0.2rem;
  padding: 0.05rem 0.35rem;
}

.palette-results {
  list-style: none;
  margin: 0;
  overflow-y: auto;
  padding: 0.4rem;
}

.palette-group {
  color: var(--faint);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0.6rem 0.6rem 0.3rem;
  text-transform: uppercase;
}

.palette-item {
  align-items: center;
  border-radius: var(--radius);
  color: var(--ink-2);
  cursor: pointer;
  display: flex;
  font-size: 0.9rem;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
}

.palette-item.is-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.palette-item-icon {
  color: var(--faint);
}

.palette-item.is-active .palette-item-icon {
  color: var(--accent);
}

.palette-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-hint {
  color: var(--faint);
  font-size: 0.78rem;
}

.palette-empty {
  color: var(--muted);
  padding: 1.5rem;
  text-align: center;
}

.palette-footer {
  border-top: 1px solid var(--line);
  color: var(--faint);
  display: flex;
  font-size: 0.75rem;
  gap: 1rem;
  padding: 0.55rem 1rem;
}

@keyframes fade-in {
  from { opacity: 0; }
}

@keyframes pop-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
}
</style>
