export interface BadgeDefinition {
  category: string;
  name: string;
  description: string;
  details: string;
  image: string;
  recipients: number;
}

export type DeveloperBadgeTuple = [badgeIndex: number, data: any];

export interface ResolvedDeveloperBadge extends BadgeDefinition {
  index: number;
  data: any;
  formattedDetails: string;
}

const MAX_SHARD_CACHE = 16;

let catalogPromise: Promise<BadgeDefinition[]> | null = null;
const badgeShardCache = new Map<string, Promise<Record<string, DeveloperBadgeTuple[]> | null>>();

// Shard of a username in /data/developers/<shard>.json (kept in sync with scripts/derive-developers.mjs).
export function shardOf(username: string): string {
  const c = username?.[0]?.toLowerCase() ?? "";
  return /[a-z0-9]/.test(c) ? c : "_";
}

export function badgeRarityScore(recipients: number): number {
  if (!recipients || recipients <= 0) return 0;
  return Math.log2(8200 / recipients) * 0.8;
}

export function formatBadgeDetails(detailsTemplate: string, data: any): string {
  if (!detailsTemplate) return "";
  return detailsTemplate.replace(/\$(\d+)/g, (_match, rawIdx) => {
    const idx = Number(rawIdx);
    const val = Array.isArray(data) ? data[idx] : undefined;
    return val !== undefined && val !== null ? String(val) : "";
  });
}

export async function fetchBadgesCatalog(): Promise<BadgeDefinition[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const res = await fetch("/badges.json");
      if (!res.ok) {
        throw new Error(`Failed to fetch /badges.json: ${res.status}`);
      }
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    })().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  const catalog = await catalogPromise;
  // Return shallow copies of the ~60 badge items so callers that attach UI state
  // (like `.enabled` or `.details`) never mutate the shared catalog.
  return catalog.map(badge => ({ ...badge }));
}

function fetchBadgeShardFile(shardKey: string): Promise<Record<string, DeveloperBadgeTuple[]> | null> {
  const cached = badgeShardCache.get(shardKey);
  if (cached) {
    badgeShardCache.delete(shardKey);
    badgeShardCache.set(shardKey, cached);
    return cached;
  }

  while (badgeShardCache.size >= MAX_SHARD_CACHE) {
    const oldest = badgeShardCache.keys().next().value;
    if (oldest === undefined) break;
    badgeShardCache.delete(oldest);
  }

  const pending = (async () => {
    try {
      const res = await fetch(`/badges/${encodeURIComponent(shardKey)}.json`);
      if (!res.ok) {
        if (res.status >= 500) badgeShardCache.delete(shardKey);
        return null;
      }
      return await res.json();
    } catch {
      badgeShardCache.delete(shardKey);
      return null;
    }
  })();

  badgeShardCache.set(shardKey, pending);
  return pending;
}

export async function fetchDeveloperBadges(username: string): Promise<DeveloperBadgeTuple[]> {
  if (!username) return [];
  const firstChar = username[0].toLowerCase();
  let shardData = await fetchBadgeShardFile(firstChar);
  if (!shardData) {
    const fallbackShard = shardOf(username);
    if (fallbackShard !== firstChar) {
      shardData = await fetchBadgeShardFile(fallbackShard);
    }
  }
  const list = shardData?.[username];
  return Array.isArray(list) ? list : [];
}

export async function fetchResolvedDeveloperBadges(username: string): Promise<ResolvedDeveloperBadge[]> {
  if (!username) return [];
  const [catalog, tuples] = await Promise.all([
    fetchBadgesCatalog(),
    fetchDeveloperBadges(username),
  ]);
  const out: ResolvedDeveloperBadge[] = [];
  for (const [index, data] of tuples) {
    const def = catalog[index];
    if (!def) continue;
    out.push({
      ...def,
      index,
      data,
      formattedDetails: formatBadgeDetails(def.details, data),
    });
  }
  return out;
}
