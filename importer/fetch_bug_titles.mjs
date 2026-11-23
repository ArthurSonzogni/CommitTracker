// Incrementally fetches public bug titles for the top bugs shown on
// /leaderboard?view=bugs and stores them in ../public/data/bug-titles.json.
//
// Uses only public endpoints (Google Issue Tracker, Monorail redirects,
// Mozilla/WebKit Bugzilla REST API, GitHub Issues API). Restricted/403/404
// issues are cached as null so they are not re-queried every day.
//
// Usage (from importer/):
//   node fetch_bug_titles.mjs [--refresh=50|all] [--concurrency=12]

import fs from "fs/promises";
import path from "path";
import { resolveBugTracker } from "../scripts/bug-trackers.mjs";
import { computeTopBugs } from "../scripts/derive/top-bugs.mjs";

const DATA_DIR = "../public/data";
const CACHE_PATH = path.join(DATA_DIR, "bug-titles.json");
const TOP_BUGS_PATH = path.join(DATA_DIR, "top-bugs.json");
const REFRESH_DAYS = 30;
const FETCH_TIMEOUT_MS = 15000;
const BUGZILLA_BATCH = 50;
const GITHUB_GRAPHQL_BATCH = 40;
const CHECKPOINT_EVERY = 250;

let maxRefresh = 50;
let concurrency = 12;
for (const arg of process.argv.slice(2)) {
  if (arg === "--refresh=all") maxRefresh = Infinity;
  else if (arg.startsWith("--refresh=")) maxRefresh = Math.max(0, Number(arg.slice(10)) || 0);
  else if (arg.startsWith("--concurrency=")) concurrency = Math.max(1, Number(arg.slice(14)) || 12);
}

const today = new Date().toISOString().slice(0, 10);
const todayMs = Date.parse(today);

const readGithubToken = async () => {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.TOKEN) return process.env.TOKEN.trim();
  try {
    return (await fs.readFile(".token", "utf8")).trim();
  } catch {
    return "";
  }
};

const fetchWithTimeout = async (url, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const saveCache = async (cache) => {
  const sorted = {};
  for (const key of Object.keys(cache).sort()) {
    sorted[key] = cache[key];
  }
  await fs.writeFile(CACHE_PATH, JSON.stringify(sorted));
};

const extractIssueTrackerTitle = (text) => {
  // The title follows the issue id and five numeric fields, e.g.:
  // [null,352263194,[1456769,15,2,4,3,"[Canvas] Streamline..."
  const match = text.match(/\[null,\d+,\[\d+,\d+,\d+,\d+,\d+,("(?:[^"\\]|\\.)*")/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]).trim();
  } catch {
    return null;
  }
};

const fetchIssueTrackerTitle = async (host, id) => {
  const res = await fetchWithTimeout(`https://${host}/action/issues/${id}/getIssue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: `[${id}]`,
  });
  if (res.status === 403 || res.status === 404 || res.status === 400) {
    return { status: "missing", title: null };
  }
  if (!res.ok) {
    return { status: "transient", code: res.status };
  }
  const text = await res.text();
  const title = extractIssueTrackerTitle(text);
  if (title === null) {
    return { status: "missing", title: null };
  }
  return { status: "ok", title };
};

const fetchMonorailItem = async (item) => {
  const res = await fetchWithTimeout(
    `https://bugs.chromium.org/p/${item.project}/issues/detail?id=${item.id}`,
  );
  if (res.status === 404 || res.status === 403 || res.status === 410) {
    return { status: "missing", title: null };
  }
  if (!res.ok) {
    return { status: "transient", code: res.status };
  }
  const html = await res.text();
  const match = html.match(/const url = "(https:\/\/([^/"']+)\/(\d+))"/);
  if (!match) {
    return { status: "missing", title: null };
  }
  const [, resolvedUrl, resolvedHost, resolvedIdStr] = match;
  const issue = await fetchIssueTrackerTitle(resolvedHost, Number(resolvedIdStr));
  if (issue.status === "transient") return issue;
  return { status: issue.status, title: issue.title, url: resolvedUrl };
};

const fetchBugzillaBatch = async (baseUrl, items, cache, stats) => {
  const ids = items.map((i) => i.id).join(",");
  const url = `${baseUrl}/rest/bug?id=${ids}&include_fields=id,summary`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json", "User-Agent": "CommitTracker" },
    });
    if (res.ok) {
      const json = await res.json();
      const found = new Map();
      for (const b of json.bugs || []) {
        if (b?.id != null && typeof b.summary === "string") {
          found.set(Number(b.id), b.summary.trim());
        }
      }
      for (const item of items) {
        const title = found.has(item.id) ? found.get(item.id) : null;
        cache[item.key] = { t: title, ts: today };
        if (title) stats.found++;
        else stats.missing++;
      }
      return;
    }
    if (res.status >= 500 || res.status === 429) {
      stats.transient += items.length;
      return;
    }
  } catch {
    stats.transient += items.length;
    return;
  }

  // Fallback to individual lookups if a batch returned 4xx (e.g. mixed restricted bug).
  for (const item of items) {
    try {
      const res = await fetchWithTimeout(
        `${baseUrl}/rest/bug/${item.id}?include_fields=id,summary`,
        { headers: { Accept: "application/json", "User-Agent": "CommitTracker" } },
      );
      if (res.ok) {
        const json = await res.json();
        const title = json.bugs?.[0]?.summary?.trim() || null;
        cache[item.key] = { t: title, ts: today };
        if (title) stats.found++;
        else stats.missing++;
      } else if (res.status === 401 || res.status === 403 || res.status === 404) {
        cache[item.key] = { t: null, ts: today };
        stats.missing++;
      } else {
        stats.transient++;
      }
    } catch {
      stats.transient++;
    }
  }
};

const fetchGithubRepoItems = async (owner, repo, items, token, cache, stats) => {
  if (token) {
    for (let i = 0; i < items.length; i += GITHUB_GRAPHQL_BATCH) {
      const batch = items.slice(i, i + GITHUB_GRAPHQL_BATCH);
      const fields = batch
        .map(
          (item, idx) =>
            `i${idx}: issueOrPullRequest(number: ${item.id}) { ... on Issue { title } ... on PullRequest { title } }`,
        )
        .join("\n");
      const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { ${fields} } }`;
      try {
        const res = await fetchWithTimeout("https://api.github.com/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "CommitTracker",
          },
          body: JSON.stringify({ query }),
        });
        if (!res.ok) {
          stats.transient += batch.length;
          continue;
        }
        const json = await res.json();
        const repoData = json.data?.repository;
        if (!repoData) {
          stats.transient += batch.length;
          continue;
        }
        batch.forEach((item, idx) => {
          const node = repoData[`i${idx}`];
          const title = typeof node?.title === "string" ? node.title.trim() : null;
          cache[item.key] = { t: title, ts: today };
          if (title) stats.found++;
          else stats.missing++;
        });
      } catch {
        stats.transient += batch.length;
      }
    }
    return;
  }

  // Unauthenticated REST fallback (subject to GitHub's 60 req/hr limit).
  for (const item of items) {
    try {
      const res = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/issues/${item.id}`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "CommitTracker" } },
      );
      if (res.ok) {
        const json = await res.json();
        const title = typeof json.title === "string" ? json.title.trim() : null;
        cache[item.key] = { t: title, ts: today };
        if (title) stats.found++;
        else stats.missing++;
      } else if (res.status === 404 || res.status === 410) {
        cache[item.key] = { t: null, ts: today };
        stats.missing++;
      } else {
        // 403 rate limit or 5xx: stop hitting GitHub without a token.
        stats.transient += items.length;
        break;
      }
    } catch {
      stats.transient++;
    }
  }
};

// Load existing cache and top bugs list.
const cache = await fs.readFile(CACHE_PATH, "utf8").then(JSON.parse, () => ({}));
const topBugs = await fs
  .readFile(TOP_BUGS_PATH, "utf8")
  .then(JSON.parse, () => computeTopBugs(DATA_DIR, { fallbackToEmails: true }));

// Collect unique tracker entries, keeping the most recent commit date for priority.
const unique = new Map();
for (const [dirname, list] of Object.entries(topBugs)) {
  for (const bug of list) {
    const tracker = resolveBugTracker(dirname, bug.id);
    if (!tracker) continue;
    const prev = unique.get(tracker.key);
    if (!prev || bug.last > prev.last) {
      unique.set(tracker.key, { ...tracker, last: bug.last });
    }
  }
}

const missingItems = [];
const staleItems = [];
for (const item of unique.values()) {
  const existing = cache[item.key];
  if (!existing) {
    missingItems.push(item);
    continue;
  }
  const ageDays = existing.ts ? (todayMs - Date.parse(existing.ts)) / 86400000 : Infinity;
  if (ageDays >= REFRESH_DAYS) {
    staleItems.push({ ...item, prevTs: existing.ts || "" });
  }
}

staleItems.sort((a, b) => b.last.localeCompare(a.last) || a.prevTs.localeCompare(b.prevTs));
const toFetch = [...missingItems, ...staleItems.slice(0, maxRefresh)];

console.log(
  `bug-titles: ${unique.size} unique bugs, ${missingItems.length} new, ${Math.min(staleItems.length, maxRefresh)}/${staleItems.length} stale to refresh`,
);

if (!toFetch.length) {
  process.exit(0);
}

const stats = { found: 0, missing: 0, transient: 0 };

// 1. Bugzilla batches (Mozilla + WebKit)
const bugzillaGroups = new Map();
// 2. GitHub repos
const githubGroups = new Map();
// 3. Google Issue Tracker / Monorail
const googleItems = [];

for (const item of toFetch) {
  if (item.kind === "bugzilla") {
    if (!bugzillaGroups.has(item.baseUrl)) bugzillaGroups.set(item.baseUrl, []);
    bugzillaGroups.get(item.baseUrl).push(item);
  } else if (item.kind === "github") {
    const gKey = `${item.owner}/${item.repo}`;
    if (!githubGroups.has(gKey)) githubGroups.set(gKey, { owner: item.owner, repo: item.repo, items: [] });
    githubGroups.get(gKey).items.push(item);
  } else {
    googleItems.push(item);
  }
}

for (const [baseUrl, items] of bugzillaGroups) {
  for (let i = 0; i < items.length; i += BUGZILLA_BATCH) {
    await fetchBugzillaBatch(baseUrl, items.slice(i, i + BUGZILLA_BATCH), cache, stats);
  }
  await saveCache(cache);
}

const token = await readGithubToken();
for (const { owner, repo, items } of githubGroups.values()) {
  await fetchGithubRepoItems(owner, repo, items, token, cache, stats);
  await saveCache(cache);
}

// Worker pool for Google Issue Tracker / Monorail.
let nextIdx = 0;
let processed = 0;
const worker = async () => {
  while (true) {
    const idx = nextIdx++;
    if (idx >= googleItems.length) return;
    const item = googleItems[idx];
    try {
      const res =
        item.kind === "monorail"
          ? await fetchMonorailItem(item)
          : await fetchIssueTrackerTitle(item.host, item.id);
      if (res.status === "transient") {
        stats.transient++;
      } else {
        const entry = { t: res.title, ts: today };
        if (res.url) entry.u = res.url;
        cache[item.key] = entry;
        if (res.title) stats.found++;
        else stats.missing++;
      }
    } catch {
      stats.transient++;
    }
    processed++;
    if (processed % CHECKPOINT_EVERY === 0) {
      console.log(
        `  progress: ${processed}/${googleItems.length} Google issues (${stats.found} found, ${stats.missing} unavailable, ${stats.transient} transient)`,
      );
      await saveCache(cache);
    }
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, googleItems.length) }, worker));
await saveCache(cache);

console.log(
  `bug-titles done: ${stats.found} titled, ${stats.missing} unavailable/restricted, ${stats.transient} transient errors (cache size: ${Object.keys(cache).length})`,
);
