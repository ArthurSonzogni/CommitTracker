import repositories_json from "../public/data/repositories.json";
import site_pages from "../utils/site-pages.json";

// Search over the site's pages, repositories, Chromium developers and CVE ids.
// Shared by the command palette and the home page search bar.

export type SearchItem = {
  group: string;
  key: string;
  label: string;
  hint?: string;
  icon: string;
  path: string;
};

type IndexedSearchItem = {
  item: SearchItem;
  lower: string;
};

const indexedPages: IndexedSearchItem[] = site_pages.map(page => {
  const item: SearchItem = {
    group: "Pages",
    key: "page:" + page.path,
    label: page.label,
    hint: page.hint,
    icon: page.icon,
    path: page.path,
  };
  return { item, lower: page.label.toLowerCase() };
});

const indexedRepositories: IndexedSearchItem[] = repositories_json.map(repo => {
  const item: SearchItem = {
    group: "Repositories",
    key: "repo:" + repo.dirname,
    label: repo.name,
    hint: "Contributions",
    icon: "source-repository",
    path: `/repositories?repositories=${repo.dirname}`,
  };
  return { item, lower: repo.name.toLowerCase() };
});

const defaultPages: SearchItem[] = indexedPages.map(({ item }) => item);

// Lower is better. Prefix matches rank above substring matches.
const scoreLower = (lowerText: string, q: string): number => {
  const index = lowerText.indexOf(q);
  if (index === -1) return -1;
  return index === 0 ? 0 : 1 + index / 100;
};

const matching = (entries: IndexedSearchItem[], q: string, limit: number): SearchItem[] => {
  const hits: { item: SearchItem; s: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const s = scoreLower(entries[i].lower, q);
    if (s >= 0) {
      hits.push({ item: entries[i].item, s });
    }
  }
  hits.sort((a, b) => a.s - b.s);
  return hits.slice(0, limit).map(h => h.item);
};

let usernamesRequest: Promise<string[]> | null = null;

export const useSiteSearch = (options: { onSelect?: () => void; emptyResults?: number } = {}) => {
  const query = ref("");
  const active = ref(0);
  const usernames = useState<string[]>("search-usernames", () => []);

  const results = computed<SearchItem[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      return defaultPages.slice(0, options.emptyResults ?? 9);
    }

    const out = [
      ...matching(indexedPages, q, 6),
      ...matching(indexedRepositories, q, 4),
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

    if (q.length >= 2 && usernames.value.length > 0) {
      const scoredDevs: { name: string; s: number }[] = [];
      const list = usernames.value;
      for (let i = 0; i < list.length; i++) {
        const name = list[i];
        const s = scoreLower(name.toLowerCase(), q);
        if (s >= 0) {
          scoredDevs.push({ name, s });
        }
      }
      scoredDevs.sort((a, b) => a.s - b.s || a.name.length - b.name.length);
      const topDevs = scoredDevs.slice(0, 6);
      for (const { name } of topDevs) {
        out.push({
          group: "Developers",
          key: "dev:" + name,
          label: name,
          hint: "Profile",
          icon: "account",
          path: `/developers/${encodeURIComponent(name)}`,
        });
      }
    }
    return out;
  });

  watch(results, () => {
    active.value = 0;
  });

  // The developers list is fetched once and deduplicated across concurrent callers.
  const loadUsernames = async () => {
    if (usernames.value.length > 0) return;
    if (!usernamesRequest) {
      usernamesRequest = (async () => {
        const response = await fetch("/data/chromium/usernames.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch usernames: ${response.status}`);
        }
        return await response.json();
      })().catch((err) => {
        usernamesRequest = null;
        throw err;
      });
    }
    try {
      const loaded = await usernamesRequest;
      if (Array.isArray(loaded)) {
        usernames.value = loaded;
      }
    } catch {}
  };

  const select = (item: SearchItem) => {
    options.onSelect?.();
    navigateTo(item.path);
  };

  // Arrow keys and Enter. Returns whether the event was handled.
  const onKeydown = (event: KeyboardEvent) => {
    const count = results.value.length;
    if (event.key === "ArrowDown") {
      active.value = (active.value + 1) % Math.max(count, 1);
    } else if (event.key === "ArrowUp") {
      active.value = (active.value - 1 + count) % Math.max(count, 1);
    } else if (event.key === "Enter" && count) {
      select(results.value[active.value]);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  };

  return { query, active, results, loadUsernames, select, onKeydown };
};
