import path from "path";
import { fileURLToPath } from "url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Normalize shard filenames: lowercase alphanumeric, else '_'.
// Kept in sync with utils/badges.ts.
export const shardOf = (name) => {
  const c = name?.[0]?.toLowerCase() || "_";
  return /^[a-z0-9]$/.test(c) ? c : "_";
};
