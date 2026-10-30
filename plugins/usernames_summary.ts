const MAX_CACHE_ENTRIES = 2;
const cache = new Map<string, Promise<any>>();

const fetchData = async (repo: string, type: string, grouping: string, kind: string) => {
  const response = await fetch(`/data/${repo}/usernames_summary_${type}_${grouping}_${kind}.json`);
  if (response.status != 200) {
    return {};
  }
  return await response.json();
};

const usersInfo = async (repo: string, type: string, grouping: string, kind: string) => {
  const key = `${repo}/${type}/${grouping}/${kind}`;
  if (cache.has(key)) {
    const promise = cache.get(key)!;
    // Refresh LRU order
    cache.delete(key);
    cache.set(key, promise);
    return await promise;
  }
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  const promise = fetchData(repo, type, grouping, kind);
  cache.set(key, promise);
  return await promise;
};

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.provide('usersInfo', usersInfo)
})

