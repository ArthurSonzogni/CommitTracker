export interface DeveloperCommit {
  date: string;
  timeMs: number;
  kind: "author" | "review" | string;
  peers: string[];
  additions?: number;
  deletions?: number;
  files?: number;
}

export interface DeveloperCommitsEntry {
  developer: string;
  data: DeveloperCommit[];
}

const MAX_CACHE_ENTRIES = 64;
const cache = new Map<string, Promise<DeveloperCommitsEntry>>();

async function loadDeveloperCommits(
  repo: string,
  developer: string,
  cacheKey: string,
): Promise<DeveloperCommitsEntry> {
  try {
    const encodedRepo = encodeURIComponent(repo);
    const encodedDev = encodeURIComponent(developer);
    const kindDir = developer.includes("@") ? "emails" : "usernames";
    const response = await fetch(`/data/${encodedRepo}/${kindDir}/${encodedDev}.json`);
    if (!response.ok) {
      cache.delete(cacheKey);
      return { developer, data: [] };
    }
    const raw = await response.json();
    const data: DeveloperCommit[] = Array.isArray(raw) ? raw : [];

    // Pre-parse timestamps once and remove self-reviews.
    for (const commit of data) {
      commit.timeMs = Date.parse(commit.date);
      if (Array.isArray(commit.peers)) {
        const index = commit.peers.indexOf(developer);
        if (index !== -1) {
          commit.peers.splice(index, 1);
        }
      } else {
        commit.peers = [];
      }
    }

    return { developer, data };
  } catch {
    cache.delete(cacheKey);
    return { developer, data: [] };
  }
}

export const chromiumData = (
  repo: string | string[],
  user: string,
): Promise<DeveloperCommitsEntry> => {
  const repoName = Array.isArray(repo) ? repo[0] : repo;
  if (!repoName || !user) {
    return Promise.resolve({ developer: user || "", data: [] });
  }
  const key = `${repoName}/${user}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  const pending = loadDeveloperCommits(repoName, user, key);
  cache.set(key, pending);
  return pending;
};

export const chromiumDataAll = (
  repo: string | string[],
  users: string[] = [],
): Promise<DeveloperCommitsEntry[]> =>
  Promise.all((users || []).map(user => chromiumData(repo, user)));

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.provide("chromiumData", chromiumData);
  nuxtApp.provide("chromiumDataAll", chromiumDataAll);
});
