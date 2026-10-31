export const COMMIT_RATES_BASE_URL = "/commit_rates";
export const CONFIG_START_DATE = "2018-01-01";
export const BUCKET_COUNT = 2048;

export interface CommitRatesManifest {
  lastCommit: string;
  lastCommitDate: string;
  [key: string]: any;
}

export interface DirectoryRateEntry {
  name: string;
  path: string;
  rates: number[];
  isDirectory: boolean;
  isFile: boolean;
  isDeleted: boolean;
  deletedAt: number | null;
}

const MAX_BUCKET_CACHE = 256;
const MAX_DIR_CACHE = 512;

const manifestCache = new Map<string, Promise<CommitRatesManifest | null>>();
const totalRatesCache = new Map<string, Promise<number[]>>();
const bucketCache = new Map<string, Promise<Record<string, Record<string, any>>>>();
const directoryCache = new Map<string, Promise<DirectoryRateEntry[]>>();

export function maxAvailableWeeks(now: Date = new Date()): number {
  const start = new Date(CONFIG_START_DATE);
  const diffTime = Math.max(0, now.getTime() - start.getTime());
  return Math.floor(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) / 7);
}

export function getBucketId(filepath: string): number {
  let hash = 5381;
  for (let i = 0; i < filepath.length; i++) {
    hash = ((hash << 5) + hash) ^ filepath.charCodeAt(i);
    hash = hash | 0;
  }
  return (hash >>> 0) % BUCKET_COUNT;
}

export function getBucketUrl(repo: string, dirPath: string): string {
  const encodedRepo = encodeURIComponent(repo);
  if (dirPath === "." || dirPath === "") {
    return `${COMMIT_RATES_BASE_URL}/${encodedRepo}/main.json`;
  }
  return `${COMMIT_RATES_BASE_URL}/${encodedRepo}/${getBucketId(dirPath)}.json`;
}

export function decompressRates(
  compressed: any[] | undefined | null,
  padToWeeks = 0,
): number[] {
  if (!compressed || compressed.length === 0) {
    return padToWeeks > 0 ? new Array(padToWeeks).fill(0) : [];
  }
  let maxLen = padToWeeks;
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i + 1];
    if (data && data.length) {
      const end = start + data.length;
      if (end > maxLen) maxLen = end;
    }
  }
  const rates = new Array<number>(maxLen).fill(0);
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i + 1];
    if (data) {
      for (let j = 0; j < data.length; j++) {
        rates[start + j] = data[j];
      }
    }
  }
  return rates;
}

export function applyMovingSum(data: number[], windowSize: number): number[] {
  if (windowSize <= 1) return data;
  const smoothed = new Array<number>(data.length);
  let currentSum = 0;
  for (let i = 0; i < data.length; i++) {
    currentSum += data[i];
    if (i >= windowSize) currentSum -= data[i - windowSize];
    smoothed[i] = currentSum;
  }
  return smoothed;
}

export function fetchCommitRatesManifest(repo: string): Promise<CommitRatesManifest | null> {
  const cached = manifestCache.get(repo);
  if (cached) return cached;

  const url = `${COMMIT_RATES_BASE_URL}/${encodeURIComponent(repo)}/buckets.json`;
  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        manifestCache.delete(repo);
        return null;
      }
      return await res.json();
    } catch {
      manifestCache.delete(repo);
      return null;
    }
  })();

  manifestCache.set(repo, promise);
  return promise;
}

export function fetchRepoTotalRates(repo: string): Promise<number[]> {
  const cached = totalRatesCache.get(repo);
  if (cached) return cached;

  const url = `${COMMIT_RATES_BASE_URL}/${encodeURIComponent(repo)}/total.json`;
  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        totalRatesCache.delete(repo);
        return [];
      }
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (data?.r) return decompressRates(data.r);
      if (Array.isArray(data?.total)) return data.total;
      return [];
    } catch {
      totalRatesCache.delete(repo);
      return [];
    }
  })();

  totalRatesCache.set(repo, promise);
  return promise;
}

export function fetchBucket(
  repo: string,
  dirPathOrUrl: string,
): Promise<Record<string, Record<string, any>>> {
  const url = dirPathOrUrl.startsWith("/") ? dirPathOrUrl : getBucketUrl(repo, dirPathOrUrl);
  const cached = bucketCache.get(url);
  if (cached) {
    bucketCache.delete(url);
    bucketCache.set(url, cached);
    return cached;
  }

  while (bucketCache.size >= MAX_BUCKET_CACHE) {
    const oldest = bucketCache.keys().next().value;
    if (oldest === undefined) break;
    bucketCache.delete(oldest);
  }

  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("Path not found in data.");
      }
      throw new Error("Failed to load data.");
    }
    return await res.json();
  })().catch((err) => {
    bucketCache.delete(url);
    throw err;
  });

  bucketCache.set(url, promise);
  return promise;
}

export function prefetchBuckets(repo: string, paths: string[]): void {
  for (const dirPath of paths) {
    const url = getBucketUrl(repo, dirPath);
    if (!bucketCache.has(url)) {
      fetchBucket(repo, url).catch(() => {});
    }
  }
}

export async function fetchDirectoryRates(
  repo: string,
  dirPath = ".",
  options: { includeDeleted?: boolean; padToWeeks?: number } = {},
): Promise<DirectoryRateEntry[]> {
  const normalizedPath = dirPath || ".";
  const cacheKey = `${repo}:${normalizedPath}`;
  let basePromise = directoryCache.get(cacheKey);

  if (!basePromise) {
    while (directoryCache.size >= MAX_DIR_CACHE) {
      const oldest = directoryCache.keys().next().value;
      if (oldest === undefined) break;
      directoryCache.delete(oldest);
    }

    basePromise = (async () => {
      const bucketData = await fetchBucket(repo, normalizedPath);
      const targetDir = bucketData?.[normalizedPath];
      if (!targetDir) {
        return [];
      }
      return Object.entries(targetDir).map(([name, data]: [string, any]) => {
        const deletedAt = typeof data?.d === "number" ? data.d : null;
        const isDeleted = deletedAt !== null;
        const isDirectory = data?.f === undefined || data.f !== 1;
        return {
          name,
          path: normalizedPath === "." ? name : `${normalizedPath}/${name}`,
          rates: decompressRates(data?.r),
          isDirectory,
          isFile: !isDirectory,
          isDeleted,
          deletedAt,
        };
      });
    })().catch((err) => {
      directoryCache.delete(cacheKey);
      throw err;
    });

    directoryCache.set(cacheKey, basePromise);
  } else {
    directoryCache.delete(cacheKey);
    directoryCache.set(cacheKey, basePromise);
  }

  let items = await basePromise;
  if (options.includeDeleted === false) {
    items = items.filter(item => !item.isDeleted);
  }
  const padTo = options.padToWeeks ?? 0;
  if (padTo > 0) {
    items = items.map(item =>
      item.rates.length < padTo
        ? { ...item, rates: item.rates.concat(new Array(padTo - item.rates.length).fill(0)) }
        : item,
    );
  }
  return items;
}
