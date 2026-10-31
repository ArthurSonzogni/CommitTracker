export type UsernamesSummary = Record<string, Record<string, number>>;

const MAX_CACHE_ENTRIES = 32;
const summaryCache = new Map<string, Promise<UsernamesSummary>>();

export function fetchUsernamesSummary(
  repo: string,
  type = "commit",
  grouping = "yearly",
  kind = "author",
): Promise<UsernamesSummary> {
  const key = `${repo}/${type}/${grouping}/${kind}`;
  const cached = summaryCache.get(key);
  if (cached) {
    summaryCache.delete(key);
    summaryCache.set(key, cached);
    return cached;
  }

  if (summaryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = summaryCache.keys().next().value;
    if (oldestKey !== undefined) {
      summaryCache.delete(oldestKey);
    }
  }

  const url = `/data/${encodeURIComponent(repo)}/usernames_summary_${encodeURIComponent(type)}_${encodeURIComponent(grouping)}_${encodeURIComponent(kind)}.json`;
  const promise = (async (): Promise<UsernamesSummary> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        summaryCache.delete(key);
        return {};
      }
      return await response.json();
    } catch {
      summaryCache.delete(key);
      return {};
    }
  })();

  summaryCache.set(key, promise);
  return promise;
}
