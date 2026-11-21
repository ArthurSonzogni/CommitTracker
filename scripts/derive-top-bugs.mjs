// Derives the biggest / longest-running bugs per repository from the derived
// usernames/*.json files (or emails/*.json as a fallback before derive_data),
// for the "Biggest bugs" view on /leaderboard.
//
// Usage: node scripts/derive-top-bugs.mjs [data_dir=public/data]
// Writes <data_dir>/top-bugs.json.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { resolveBugTracker } from "./bug-trackers.mjs";

const CONCURRENCY = 64;
const TOP_PER_METRIC = 100;
const MIN_COMMITS = 5;
// Split a bug's commit timeline when consecutive commits are more than 4 years
// apart so cross-tracker numeric ID collisions (e.g. Bugzilla vs GitHub Issues,
// or WebKit SVN vs Monorail) do not create bogus 15-20 year spans.
const MAX_GAP_MS = 4 * 365.25 * 86400000;
// Chromium's public bug tracker (crbug.com) launched on 2008-09-02; earlier
// commits in chromium/blink carry WebKit Bugzilla or pre-launch internal IDs.
const CRBUG_EPOCH = "2008-09-02";

export async function computeTopBugs(dataDir, { fallbackToEmails = false } = {}) {
  const repositories = JSON.parse(
    await fs.readFile(path.join(dataDir, "repositories.json"), "utf8"),
  );
  const titleCache = await fs
    .readFile(path.join(dataDir, "bug-titles.json"), "utf8")
    .then(JSON.parse, () => ({}));

  const output = {};

  for (const repo of repositories) {
    const repoDir = path.join(dataDir, repo.dirname);
    let sourceDir = "usernames";
    let ids = await fs
      .readFile(path.join(repoDir, "usernames.json"), "utf8")
      .then(JSON.parse, () => null);
    if (!ids && fallbackToEmails) {
      sourceDir = "emails";
      ids = await fs
        .readFile(path.join(repoDir, "emails.json"), "utf8")
        .then(JSON.parse, () => null);
    }
    if (!ids) continue;

    const minDay =
      repo.dirname === "chromium" || repo.dirname === "blink" ? CRBUG_EPOCH : "";

    // bugId -> Array<[day, lines, author]>
    const bugs = new Map();

    for (let start = 0; start < ids.length; start += CONCURRENCY) {
      const batch = ids.slice(start, start + CONCURRENCY);
      const loaded = await Promise.all(
        batch.map(async (authorId) => {
          const raw = await fs
            .readFile(path.join(repoDir, sourceDir, `${authorId}.json`), "utf8")
            .catch(() => null);
          return raw ? [authorId, JSON.parse(raw)] : null;
        }),
      );

      for (const item of loaded) {
        if (!item) continue;
        const [authorId, commits] = item;
        for (const c of commits) {
          if (c.kind !== "author" || c.bug == null) continue;
          const day = c.date.slice(0, 10);
          if (minDay && day < minDay) continue;
          let list = bugs.get(c.bug);
          if (!list) {
            list = [];
            bugs.set(c.bug, list);
          }
          list.push([day, (c.additions || 0) + (c.deletions || 0), authorId]);
        }
      }
    }

    const ranked = [];
    for (const [id, list] of bugs) {
      if (list.length < MIN_COMMITS) continue;
      list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

      // Keep the largest contiguous activity cluster (gaps <= MAX_GAP_MS).
      let bestS = 0;
      let bestE = 0;
      let curS = 0;
      let prevMs = Date.parse(list[0][0]);
      const ms = new Array(list.length);
      ms[0] = prevMs;
      const isBetter = (s, e) => {
        const c1 = e - s;
        const c2 = bestE - bestS;
        if (c1 !== c2) return c1 > c2;
        return ms[e] - ms[s] > ms[bestE] - ms[bestS];
      };
      for (let j = 1; j < list.length; j++) {
        const curMs = Date.parse(list[j][0]);
        ms[j] = curMs;
        if (curMs - prevMs > MAX_GAP_MS) {
          if (isBetter(curS, j - 1)) {
            bestS = curS;
            bestE = j - 1;
          }
          curS = j;
        }
        prevMs = curMs;
      }
      if (isBetter(curS, list.length - 1)) {
        bestS = curS;
        bestE = list.length - 1;
      }

      const commits = bestE - bestS + 1;
      if (commits < MIN_COMMITS) continue;

      let lines = 0;
      const byAuthor = new Map();
      for (let j = bestS; j <= bestE; j++) {
        lines += list[j][1];
        const author = list[j][2];
        byAuthor.set(author, (byAuthor.get(author) || 0) + 1);
      }

      let top = "";
      let topN = 0;
      for (const [author, count] of byAuthor) {
        if (count > topN) {
          top = author;
          topN = count;
        }
      }

      ranked.push({
        id,
        commits,
        authors: byAuthor.size,
        lines,
        first: list[bestS][0],
        last: list[bestE][0],
        span: Math.round((ms[bestE] - ms[bestS]) / 86400000),
        top,
        top_n: topN,
      });
    }

    if (!ranked.length) continue;

    // Store the union of the top N per sort metric so every sort tab (and any
    // multi-repo selection) has the exact top N bugs.
    const kept = new Set();
    const collect = (cmp) => {
      ranked.sort(cmp);
      for (const row of ranked.slice(0, TOP_PER_METRIC)) kept.add(row);
    };
    collect((a, b) => b.commits - a.commits || b.authors - a.authors);
    collect((a, b) => b.authors - a.authors || b.commits - a.commits);
    collect((a, b) => b.lines - a.lines || b.commits - a.commits);
    collect((a, b) => b.span - a.span || b.commits - a.commits);

    output[repo.dirname] = [...kept]
      .sort((a, b) => b.commits - a.commits || b.authors - a.authors)
      .map(({ span: _span, ...rest }) => {
        const tracker = resolveBugTracker(repo.dirname, rest.id);
        const cached = tracker ? titleCache[tracker.key] : null;
        if (cached?.t) rest.title = cached.t;
        const url = cached?.u || tracker?.fallbackUrl || null;
        if (url) rest.url = url;
        return rest;
      });
  }

  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.argv[2] || "public/data";
  const output = await computeTopBugs(dataDir);
  const outPath = path.join(dataDir, "top-bugs.json");
  await fs.writeFile(outPath, JSON.stringify(output));
  const totalBugs = Object.values(output).reduce((a, b) => a + b.length, 0);
  const titled = Object.values(output)
    .flat()
    .filter((b) => b.title).length;
  console.log(
    `top-bugs.json: ${Object.keys(output).length} repositories, ${totalBugs} bugs (${titled} with titles)`,
  );
}
