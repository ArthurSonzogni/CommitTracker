import repositories_json from "../public/data/repositories.json";
import site_pages from "../utils/site-pages.json";
import {
  componentPath,
  fetchComponentsDataset,
  teamPath,
} from "../utils/componentsData";

// Search over the site's pages, repositories, Chromium components & teams,
// developers and CVE ids. Shared by the command palette and the home page search bar.

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
  altLower?: string;
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

// Lower is better. Prefix matches rank above segment-boundary matches and substring matches.
const scoreLower = (lowerText: string, q: string): number => {
  const index = lowerText.indexOf(q);
  if (index === -1) return -1;
  if (index === 0) return 0;
  const prev = lowerText[index - 1];
  if (prev === ">" || prev === "/" || prev === "-" || prev === "_" || prev === "@") {
    return 0.4 + index / 200;
  }
  return 1 + index / 100;
};

const matching = (entries: IndexedSearchItem[], q: string, limit: number): SearchItem[] => {
  const hits: { item: SearchItem; s: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    let s = scoreLower(entries[i].lower, q);
    if (entries[i].altLower) {
      const sAlt = scoreLower(entries[i].altLower!, q);
      if (sAlt >= 0 && (s < 0 || sAlt < s)) s = sAlt;
    }
    if (s >= 0) {
      hits.push({ item: entries[i].item, s });
    }
  }
  hits.sort((a, b) => a.s - b.s || a.item.label.length - b.item.label.length);
  return hits.slice(0, limit).map(h => h.item);
};

let usernamesRequest: Promise<string[]> | null = null;

export const useSiteSearch = (options: { onSelect?: () => void; emptyResults?: number } = {}) => {
  const query = ref("");
  const active = ref(0);
  const usernames = useState<string[]>("search-usernames", () => []);
  const indexedComponents = useState<IndexedSearchItem[]>("search-components", () => []);
  const indexedTeams = useState<IndexedSearchItem[]>("search-teams", () => []);

  const results = computed<SearchItem[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      return defaultPages.slice(0, options.emptyResults ?? 9);
    }

    const out = [
      ...matching(indexedPages, q, 5),
      ...matching(indexedRepositories, q, 3),
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
      const qNormComp = q.replace(/\//g, ">");
      if (indexedComponents.value.length > 0) {
        out.push(...matching(indexedComponents.value, qNormComp, 5));
      }
      if (indexedTeams.value.length > 0) {
        out.push(...matching(indexedTeams.value, q, 4));
      }
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
      const topDevs = scoredDevs.slice(0, 5);
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

  const loadComponentsAndTeams = async () => {
    if (indexedComponents.value.length > 0) return;
    try {
      const ds = await fetchComponentsDataset();
      indexedComponents.value = ds.components.map((c) => {
        const leaf = c.name.split(">").pop() || c.name;
        const hintParts: string[] = [];
        if (c.lines > 0) {
          hintParts.push(
            c.lines >= 1e6
              ? `${(c.lines / 1e6).toFixed(1)}M LoC`
              : `${Math.max(1, Math.round(c.lines / 1e3))}k LoC`,
          );
        }
        if (c.cveTotal > 0) hintParts.push(`${c.cveTotal} CVEs`);
        else if (c.primaryTeam) hintParts.push(c.primaryTeam);

        return {
          item: {
            group: "Components",
            key: "comp:" + c.name,
            label: c.name,
            hint: hintParts.join(" · ") || "Component dossier",
            icon: "sitemap",
            path: componentPath(c.name),
          },
          lower: leaf.toLowerCase(),
          altLower: c.name.toLowerCase(),
        };
      });

      indexedTeams.value = ds.teams.map((t) => ({
        item: {
          group: "Teams",
          key: "team:" + t.email,
          label: t.email,
          hint: `${t.componentCount} ${t.componentCount === 1 ? "component" : "components"}`,
          icon: "account-group",
          path: teamPath(t.email),
        },
        lower: t.email.toLowerCase(),
      }));
    } catch {}
  };

  // Lazy-loads developers plus DIR_METADATA components and teams on search focus.
  const loadUsernames = async () => {
    loadComponentsAndTeams();
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

  return { query, active, results, loadUsernames, loadComponentsAndTeams, select, onKeydown };
};
