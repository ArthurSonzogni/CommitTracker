import repositories_json from "~/utils/repositories";
import site_pages from "../utils/site-pages.json";
import { useRecentVisits } from "~/composables/useRecentVisits";
import { useShareLink } from "~/composables/useShareLink";
import { useTheme } from "~/composables/useTheme";

// Search over the site's pages, repositories, organizations, badges,
// developers (Chromium + sharded all-repo index), CVE ids, recent visits,
// and quick actions. Shared by the command palette and the home page search bar.

export type SearchItem = {
  group: string;
  key: string;
  label: string;
  hint?: string;
  icon: string;
  path: string;
  action?: () => void;
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
  return { item, lower: page.label.toLowerCase(), altLower: page.hint?.toLowerCase() };
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
  if (prev === ">" || prev === "/" || prev === "-" || prev === "_" || prev === "@" || prev === " ") {
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

const shardOf = (ch: string) => (/^[a-z0-9]$/.test(ch) ? ch : "_");

let usernamesRequest: Promise<string[]> | null = null;
let orgsRequest: Promise<string[]> | null = null;
let badgesRequest: Promise<Array<{ name: string; description?: string }>> | null = null;
const shardRequests = new Map<string, Promise<string[]>>();

export const useSiteSearch = (options: {
  onSelect?: () => void;
  emptyResults?: number;
  includeRecent?: boolean;
  includeActions?: boolean;
} = {}) => {
  const route = useRoute();
  const query = ref("");
  const active = ref(0);
  const usernames = useState<string[]>("search-usernames", () => []);
  const shardDevelopers = useState<Record<string, string[]>>("search-dev-shards", () => ({}));
  const indexedOrgs = useState<IndexedSearchItem[]>("search-orgs", () => []);
  const indexedBadges = useState<IndexedSearchItem[]>("search-badges", () => []);

  const { recent, loadRecent } = useRecentVisits();
  const { dark, toggleTheme } = useTheme();
  const { share } = useShareLink();

  const quickActions = computed<IndexedSearchItem[]>(() => {
    if (!options.includeActions) return [];
    const actions: IndexedSearchItem[] = [
      {
        item: {
          group: "Actions",
          key: "action:theme",
          label: dark.value ? "Switch to light theme" : "Switch to dark theme",
          hint: "Appearance",
          icon: dark.value ? "weather-sunny" : "weather-night",
          path: "",
          action: () => toggleTheme(true),
        },
        lower: dark.value ? "switch to light theme" : "switch to dark theme",
        altLower: "theme dark light mode toggle",
      },
      {
        item: {
          group: "Actions",
          key: "action:share",
          label: "Copy link to this page",
          hint: "Share URL",
          icon: "share-variant",
          path: "",
          action: () => { share(); },
        },
        lower: "copy link to this page",
        altLower: "share url clipboard",
      },
    ];

    const devMatch = route.path.match(/^\/developers\/([^/]+)$/);
    if (devMatch) {
      const dev = decodeURIComponent(devMatch[1]);
      const year = new Date().getFullYear();
      actions.unshift({
        item: {
          group: "Actions",
          key: "action:year-in-review",
          label: `${dev} in ${year}`,
          hint: "Year in review",
          icon: "calendar",
          path: `/developers/${encodeURIComponent(dev)}/${year}`,
        },
        lower: `${dev.toLowerCase()} year in review ${year}`,
        altLower: "year in review wrapped summary",
      });
    }
    return actions;
  });

  // Lazily fetch the developer shard matching the first character of the query
  // so developers from Firefox, WebKit, LLVM, Servo, Ladybird, etc. are searchable too.
  const ensureShard = async (shard: string) => {
    if (shardDevelopers.value[shard]) return;
    let req = shardRequests.get(shard);
    if (!req) {
      req = fetch(`/data/developers/${shard}.json`)
        .then((res) => (res.ok ? res.json() : {}))
        .then((obj) => (obj && typeof obj === "object" ? Object.keys(obj) : []))
        .catch(() => []);
      shardRequests.set(shard, req);
    }
    const keys = await req;
    if (keys.length && !shardDevelopers.value[shard]) {
      shardDevelopers.value = { ...shardDevelopers.value, [shard]: keys };
    }
  };

  watch(query, (val) => {
    const q = val.trim().toLowerCase();
    if (q.length >= 2) {
      ensureShard(shardOf(q[0]));
    }
  });

  const results = computed<SearchItem[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      const out: SearchItem[] = [];
      if (options.includeRecent && recent.value.length > 0) {
        const recentItems = recent.value
          .filter((r) => r.path !== route.path)
          .slice(0, 4)
          .map((r) => ({ ...r, group: "Recent" }));
        out.push(...recentItems);
      }
      out.push(...defaultPages.slice(0, options.emptyResults ?? 9));
      if (options.includeActions) {
        out.push(...quickActions.value.map((a) => a.item));
      }
      return out;
    }

    const out = [
      ...matching(indexedPages, q, 5),
      ...matching(indexedRepositories, q, 3),
    ];

    if (options.includeActions) {
      out.push(...matching(quickActions.value, q, 3));
    }

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

    if (q.length >= 2 && indexedOrgs.value.length > 0) {
      out.push(...matching(indexedOrgs.value, q, 4));
    }

    if (q.length >= 2) {
      const shard = shardOf(q[0]);
      const shardList = shardDevelopers.value[shard] ?? [];
      const seen = new Set<string>();
      const scoredDevs: { name: string; s: number }[] = [];

      const scanList = (list: string[]) => {
        for (let i = 0; i < list.length; i++) {
          const name = list[i];
          if (seen.has(name)) continue;
          const s = scoreLower(name.toLowerCase(), q);
          if (s >= 0) {
            seen.add(name);
            scoredDevs.push({ name, s });
          }
        }
      };

      scanList(usernames.value);
      scanList(shardList);

      scoredDevs.sort((a, b) => a.s - b.s || a.name.length - b.name.length);
      for (const { name } of scoredDevs.slice(0, 5)) {
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

    if (q.length >= 2 && indexedBadges.value.length > 0) {
      out.push(...matching(indexedBadges.value, q, 3));
    }

    return out;
  });

  watch(results, () => {
    active.value = 0;
  });

  // Lazy-loads Chromium developers, organizations, badges, and recent visits on focus.
  const loadUsernames = async () => {
    if (options.includeRecent) loadRecent();

    if (usernames.value.length === 0) {
      if (!usernamesRequest) {
        usernamesRequest = fetch("/data/chromium/usernames.json")
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => {
            usernamesRequest = null;
            return [];
          });
      }
      usernamesRequest.then((loaded) => {
        if (Array.isArray(loaded) && loaded.length) usernames.value = loaded;
      });
    }

    if (indexedOrgs.value.length === 0) {
      if (!orgsRequest) {
        orgsRequest = fetch("/data/organizations.json")
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => {
            orgsRequest = null;
            return [];
          });
      }
      orgsRequest.then((orgs) => {
        if (Array.isArray(orgs) && orgs.length) {
          indexedOrgs.value = orgs.map((org) => ({
            item: {
              group: "Organizations",
              key: "org:" + org,
              label: org,
              hint: "Commits",
              icon: "domain",
              path: `/organizations/commits?organizations=${encodeURIComponent(org)}`,
            },
            lower: org.toLowerCase(),
          }));
        }
      });
    }

    if (indexedBadges.value.length === 0) {
      if (!badgesRequest) {
        badgesRequest = fetch("/badges.json")
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => {
            badgesRequest = null;
            return [];
          });
      }
      badgesRequest.then((badges) => {
        if (Array.isArray(badges) && badges.length) {
          indexedBadges.value = badges.map((b) => ({
            item: {
              group: "Badges",
              key: "badge:" + b.name,
              label: b.name,
              hint: "Badge",
              icon: "certificate",
              path: `/badges/details?badge=${encodeURIComponent(b.name)}`,
            },
            lower: b.name.toLowerCase(),
            altLower: b.description?.toLowerCase(),
          }));
        }
      });
    }
  };

  const select = (item: SearchItem) => {
    options.onSelect?.();
    if (item.action) {
      item.action();
      return;
    }
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
