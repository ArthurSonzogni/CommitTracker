import repositories_json from '../public/data/repositories.json'

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

const pages: SearchItem[] = [
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

const repositories: SearchItem[] = repositories_json.map(repo => ({
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

const matching = (items: SearchItem[], q: string, limit: number) => items
  .map(item => ({ item, s: score(item.label, q) }))
  .filter(({ s }) => s >= 0)
  .sort((a, b) => a.s - b.s)
  .slice(0, limit)
  .map(({ item }) => item);

export const useSiteSearch = (options: { onSelect?: () => void, emptyResults?: number } = {}) => {
  const query = ref("");
  const active = ref(0);
  const usernames = useState<string[]>("search-usernames", () => []);

  const results = computed<SearchItem[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      return pages.slice(0, options.emptyResults ?? 9);
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

  // The developers list is fetched on first use.
  const loadUsernames = async () => {
    if (usernames.value.length === 0) {
      const response = await fetch("/data/chromium/usernames.json");
      usernames.value = await response.json();
    }
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
