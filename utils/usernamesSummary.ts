export type UsernamesSummary = Record<string, Record<string, number>>;

const MAX_CACHE_ENTRIES = 32;
const summaryCache = new Map<string, Promise<UsernamesSummary>>();

const RAW_GROUPINGS = new Set(["monthly", "yearly"]);
const RAW_KINDS = new Set(["author", "review"]);

function getCached(key: string): Promise<UsernamesSummary> | undefined {
  const cached = summaryCache.get(key);
  if (cached) {
    summaryCache.delete(key);
    summaryCache.set(key, cached);
  }
  return cached;
}

function setCached(key: string, value: Promise<UsernamesSummary>): void {
  if (summaryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = summaryCache.keys().next().value;
    if (oldestKey !== undefined) {
      summaryCache.delete(oldestKey);
    }
  }
  summaryCache.set(key, value);
}

function mergeSummaries(a: UsernamesSummary, b: UsernamesSummary): UsernamesSummary {
  const out: UsernamesSummary = Object.create(null);
  for (const source of [a, b]) {
    for (const [user, buckets] of Object.entries(source)) {
      let dest = out[user];
      if (!dest) {
        dest = Object.create(null);
        out[user] = dest;
      }
      for (const [period, val] of Object.entries(buckets)) {
        dest[period] = (dest[period] || 0) + val;
      }
    }
  }
  return out;
}

function rollupSummary(
  source: UsernamesSummary,
  bucketOf: (period: string) => string,
): UsernamesSummary {
  const out: UsernamesSummary = Object.create(null);
  for (const [user, buckets] of Object.entries(source)) {
    const dest: Record<string, number> = Object.create(null);
    for (const [period, val] of Object.entries(buckets)) {
      const target = bucketOf(period);
      dest[target] = (dest[target] || 0) + val;
    }
    out[user] = dest;
  }
  return out;
}

function monthToQuarter(ym: string): string {
  const year = ym.slice(0, 4);
  const month = Number(ym.slice(5, 7));
  return `${year}Q${Math.floor((month - 1) / 3) + 1}`;
}

async function loadRawSummary(
  repo: string,
  type: string,
  grouping: string,
  kind: string,
  key: string,
): Promise<UsernamesSummary> {
  const url = `/data/${encodeURIComponent(repo)}/usernames_summary_${encodeURIComponent(type)}_${encodeURIComponent(grouping)}_${encodeURIComponent(kind)}.json`;
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
}

export function fetchUsernamesSummary(
  repo: string,
  type = "commit",
  grouping = "yearly",
  kind = "author",
): Promise<UsernamesSummary> {
  const key = `${repo}/${type}/${grouping}/${kind}`;
  const cached = getCached(key);
  if (cached) return cached;

  let promise: Promise<UsernamesSummary>;

  if (kind === "both") {
    promise = Promise.all([
      fetchUsernamesSummary(repo, type, grouping, "author"),
      fetchUsernamesSummary(repo, type, grouping, "review"),
    ]).then(([author, review]) => mergeSummaries(author, review));
  } else if (grouping === "quarterly") {
    promise = fetchUsernamesSummary(repo, type, "monthly", kind).then(data =>
      rollupSummary(data, monthToQuarter),
    );
  } else if (grouping === "decennial") {
    promise = fetchUsernamesSummary(repo, type, "yearly", kind).then(data =>
      rollupSummary(data, year => year.slice(0, 3) + "0"),
    );
  } else if (grouping === "forever") {
    promise = fetchUsernamesSummary(repo, type, "yearly", kind).then(data =>
      rollupSummary(data, () => "forever"),
    );
  } else if (RAW_GROUPINGS.has(grouping) && RAW_KINDS.has(kind)) {
    promise = loadRawSummary(repo, type, grouping, kind, key);
  } else {
    return Promise.resolve({});
  }

  setCached(key, promise);
  return promise;
}
