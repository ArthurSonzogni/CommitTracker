import entries from '../public/treemap/entries.json';

export interface TreemapMetricEntry {
  name: string;
  description: string;
  script?: string;
  file: string;
  tags?: string[];
  aliases?: string[];
  searchText: string;
}

const rawMetrics: any[] = entries.metrics || [];

export const allTreemapMetrics: TreemapMetricEntry[] = rawMetrics.map((m) => ({
  ...m,
  searchText: [
    m.name || '',
    m.description || '',
    m.file || '',
    ...(m.aliases || []),
  ].join('\0').toLowerCase(),
}));

const metricByIdentifier = new Map<string, TreemapMetricEntry>();
const metricNameByFile = new Map<string, string>();

for (const m of allTreemapMetrics) {
  metricNameByFile.set(m.file, m.name);
  if (!metricByIdentifier.has(m.file)) metricByIdentifier.set(m.file, m);
  if (m.name && !metricByIdentifier.has(m.name)) metricByIdentifier.set(m.name, m);
  if (m.aliases) {
    for (const alias of m.aliases) {
      if (!metricByIdentifier.has(alias)) metricByIdentifier.set(alias, m);
    }
  }
}

export const findTreemapMetric = (identifier: string): TreemapMetricEntry | undefined =>
  metricByIdentifier.get(identifier);

export const getTreemapMetricName = (file: string): string =>
  metricNameByFile.get(file) ?? file;

const availablePromiseCache = new Map<string, Promise<Set<string>>>();
const availableResolvedCache = new Map<string, Set<string>>();

export const getCachedAvailableMetrics = (repo: string): Set<string> | undefined =>
  availableResolvedCache.get(repo);

export const fetchRepoAvailableMetrics = (repo: string): Promise<Set<string>> => {
  if (!repo) return Promise.resolve(new Set());
  let pending = availablePromiseCache.get(repo);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(`/treemap/${repo}/available_metrics.json`);
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const list = await response.json();
            const set = new Set<string>(Array.isArray(list) ? list : []);
            availableResolvedCache.set(repo, set);
            return set;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch available metrics for ${repo}`, e);
      }
      const empty = new Set<string>();
      availableResolvedCache.set(repo, empty);
      return empty;
    })();
    availablePromiseCache.set(repo, pending);
  }
  return pending;
};
