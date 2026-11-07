// Derives the data of the /reports/2026-ai-impact page: how the commits per
// person changed in 2026, in each tracked repository, per organization group.
// The report is frozen at the end of 2026.
//
// Run from importer/, after derive_data.mjs.
// Writes ../public/data/ai-impact.json:
//   {
//     "months": ["2015-01", ...],          // up to the last complete month
//     "window": ["2026-08", "2026-09", "2026-10"], // the last 3 complete months
//     "repositories": [{
//       "dirname", "name",
//       "parent": name | null,             // the repository it is a subdirectory of
//       "n", "p25", "p50", "p75", "up",     // the last cohort row of "all"
//       "usual": [min, max] | null,         // the medians of 2021-2025
//       "per_author": [previous, current],
//       "github_logins": bool,             // whether the usernames are GitHub logins
//       "data_from": "2015-01",            // the first full year of data
//       "reviews_from": "2019-01" | null,  // where the reviews are comparable
//       "groups": [{
//         "id", "label",
//         "commits": [...], "authors": [...], "reviews": [...],
//         "lines": [...],                   // median lines changed per commit
//         "lines_per_author": [...],        // median lines changed per author
//         "commit_size": { "<year>": {      // the commits of the window
//           "q": [...],                     // their lines, at "size_quantiles"
//           "tiny", "files", "added" } },   // share of at most "tiny_commit"
//                                           // lines, median files, share of
//                                           // the lines that are added
//         "cohort": [{ "year", "n", "p25", "p50", "p75", "up" }, ...],
//         "percentiles": { "<year>": [...] }, // of commits per active person-month
//                                             // in the window, at "quantiles"
//         "kpi": { "commits", "person_months", "authors", "lines" } // [previous, current]
//       }]
//     }]
//   }
//
// The repositories: the ones whose data is up to date, with at least
// MIN_REPOSITORY_PEOPLE people in the last same-people comparison. Some are a
// subdirectory of another one ("parent"): their commits count in both.
//
// A person is a username, as derive_data.mjs makes them. Each commit gets the
// organization of its author at its date. A person-month goes to the
// organization of most of its commits.
//
// The groups: everyone, the largest organization, everyone else, and the other
// organizations with enough authors.
//
// cohort: the same people, a year apart. For each year Y, the people with at
// least MIN_WINDOW commits in the window of both Y-1 and Y (the window shifted
// by whole years), and the quartiles of log2(commits in Y / commits in Y-1).
// A person belongs to the organization of most of their commits in Y.
//
// percentiles: for each year, the quantiles of the commits of each active
// person-month in the window of that year.

import fs from "fs/promises";
import JSON5 from "json5";
import { loadOrganizations } from "./organizations.mjs";
import { canonicalEmails, usernameOfEmail } from "./usernames.mjs";

const FIRST_MONTH = "2015-01";
const WINDOW = 3;
const MIN_WINDOW = 6;
// Organizations shown on their own: enough people to say something.
const MIN_AUTHORS_PER_MONTH = 15;
const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99];
// Of the size of the commits.
const SIZE_QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9];
// A commit of at most this many lines is tiny.
const TINY_COMMIT = 5;
const FIRST_PERCENTILE_YEAR = 2016;
// The report is about 2026: the months stop there, even later.
const LAST_MONTH = "2026-12";
const USUAL_YEARS = [2021, 2025];
// Repositories shown: enough people in the same-people comparison. Below 20,
// the page warns that a few people move the figures.
const MIN_REPOSITORY_PEOPLE = 10;

const repositories = JSON5.parse(await fs.readFile("../repositories.json5", "utf8"));

const { getOrganization } = await loadOrganizations();

// The months up to the last complete one, and at most LAST_MONTH.
const now = new Date();
const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
const months = [];
for (let y = +FIRST_MONTH.slice(0, 4), m = +FIRST_MONTH.slice(5); ; m++) {
  if (m > 12) { y++; m = 1; }
  const month = `${y}-${String(m).padStart(2, "0")}`;
  if (month >= current || month > LAST_MONTH) break;
  months.push(month);
}
const monthIndex = new Map(months.map((m, i) => [m, i]));
const M = months.length;

const quantile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
const round = (x, digits = 3) => x === null ? null : +x.toFixed(digits);

const windowEnd = M - 1;

// The summary of the log2 ratios of the same people, in the window of `year`.
const cohortRow = (year, ratios) => {
  ratios.sort((a, b) => a - b);
  return {
    year,
    n: ratios.length,
    p25: round(quantile(ratios, 0.25)),
    p50: round(quantile(ratios, 0.5)),
    p75: round(quantile(ratios, 0.75)),
    up: round(ratios.filter(r => r > 0).length / (ratios.length || 1)),
  };
};
const sumWindow = (byMonth, end) => {
  let total = 0;
  const byOrg = new Map();
  for (let i = end - WINDOW + 1; i <= end; i++) {
    const entry = byMonth.get(i);
    if (!entry) continue;
    total += entry[0];
    byOrg.set(entry[1], (byOrg.get(entry[1]) || 0) + entry[0]);
  }
  let best = null, bestCount = -1;
  for (const [org, count] of byOrg) if (count > bestCount) { best = org; bestCount = count; }
  return [total, best];
};

const deriveRepository = async repository => {
  // username -> month index -> Map(org -> commits), for authors and reviewers.
  const authored = new Map();
  const reviewed = new Map();
  // org -> month index -> [lines changed, files, lines added] of each commit.
  const lines = new Map();
  // username -> month index -> lines changed.
  const authoredLines = new Map();

  const add = (table, user, i, org) => {
    let byMonth = table.get(user);
    if (!byMonth) table.set(user, byMonth = new Map());
    let byOrg = byMonth.get(i);
    if (!byOrg) byMonth.set(i, byOrg = new Map());
    byOrg.set(org, (byOrg.get(org) || 0) + 1);
  };

  const repositoryDir = `../public/data/${repository.dirname}`;
  const emails = await fs.readFile(`${repositoryDir}/emails.json`, "utf8").then(JSON.parse, () => null);
  if (!emails) return null;
  const { canonical } = await canonicalEmails(repository, repositoryDir, emails);
  let last = "";
  for (const email of emails) {
    const user = usernameOfEmail(repository, canonical(email));
    const commits = JSON.parse(await fs.readFile(`${repositoryDir}/emails/${email}.json`, "utf8"));
    for (const commit of commits) {
      if (commit.date > last) last = commit.date;
      const i = monthIndex.get(commit.date.slice(0, 7));
      if (i === undefined) continue;
      const org = getOrganization(email, commit.date);
      if (commit.kind === "author") {
        add(authored, user, i, org);
        const changed = (commit.additions || 0) + (commit.deletions || 0);
        let byMonth = lines.get(org);
        if (!byMonth) lines.set(org, byMonth = new Map());
        let list = byMonth.get(i);
        if (!list) byMonth.set(i, list = []);
        list.push([changed, commit.files || 0, commit.additions || 0]);
        let linesByMonth = authoredLines.get(user);
        if (!linesByMonth) authoredLines.set(user, linesByMonth = new Map());
        linesByMonth.set(i, (linesByMonth.get(i) || 0) + changed);
      } else if (commit.kind === "review") {
        add(reviewed, user, i, org);
      }
    }
  }
  // Skip the repositories whose data stops before the end of the window.
  if (last.slice(0, 7) < months[windowEnd]) return null;

  // username -> month index -> [commits, org of most of them].
  const resolve = table => {
    const out = new Map();
    for (const [user, byMonth] of table) {
      const resolved = new Map();
      for (const [i, byOrg] of byMonth) {
        let total = 0, best = null, bestCount = -1;
        for (const [org, count] of byOrg) {
          total += count;
          if (count > bestCount) { best = org; bestCount = count; }
        }
        resolved.set(i, [total, best]);
      }
      out.set(user, resolved);
    }
    return out;
  };
  const authors = resolve(authored);
  const reviewers = resolve(reviewed);

  // The groups: everyone, the largest organization, everyone else, and the other
  // organizations with enough authors over the last 12 months. The individuals
  // are too few people to compare with themselves: they stay in "Everyone else".
  const recent = new Map();
  for (const byMonth of authors.values()) {
    for (const [i, [, org]] of byMonth) {
      if (i >= M - 12) recent.set(org, (recent.get(org) || 0) + 1 / 12);
    }
  }
  const large = [...recent]
    .filter(([org, perMonth]) =>
      !["Unknown", "Individuals"].includes(org) && perMonth >= MIN_AUTHORS_PER_MONTH)
    .sort((a, b) => b[1] - a[1])
    .map(([org]) => org);
  const groupOf = org => ({
    id: org.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label: org,
    test: o => o === org,
  });
  const groups = [
    { id: "all", label: "All contributors", test: () => true },
    ...large.slice(0, 1).map(groupOf),
    ...large.slice(0, 1).map(top => ({ id: "others", label: "Everyone else", test: org => org !== top })),
    ...large.slice(1).map(groupOf),
  ];

  const output = [];
  for (const group of groups) {
    const commits = new Array(M).fill(0);
    const authorCount = new Array(M).fill(0);
    const reviews = new Array(M).fill(0);
    for (const byMonth of authors.values()) {
      for (const [i, [n, org]] of byMonth) {
        if (!group.test(org)) continue;
        commits[i] += n;
        authorCount[i]++;
      }
    }
    for (const byMonth of reviewers.values()) {
      for (const [i, [n, org]] of byMonth) {
        if (group.test(org)) reviews[i] += n;
      }
    }
    // The commits of the group in the months [first, last].
    const commitsIn = (first, last) => {
      const all = [];
      for (const [org, byMonth] of lines) {
        if (!group.test(org)) continue;
        for (let i = Math.max(0, first); i <= last; i++) all.push(...(byMonth.get(i) || []));
      }
      return all;
    };
    const medianLines = months.map((_, i) =>
      quantile(commitsIn(i, i).map(c => c[0]).sort((a, b) => a - b), 0.5));
    // The median of the lines changed by each active author in the month.
    const linesPerAuthor = new Array(M).fill(null).map(() => []);
    for (const [user, byMonth] of authors) {
      for (const [i, [, org]] of byMonth) {
        if (group.test(org)) linesPerAuthor[i].push(authoredLines.get(user).get(i));
      }
    }
    const medianLinesPerAuthor = linesPerAuthor.map(list => quantile(list.sort((a, b) => a - b), 0.5));

    // The size of the commits in the window of each year.
    const commitSize = {};
    for (let end = windowEnd; end - WINDOW + 1 >= 0; end -= 12) {
      const year = +months[end].slice(0, 4);
      if (year < FIRST_PERCENTILE_YEAR) break;
      const all = commitsIn(end - WINDOW + 1, end);
      if (!all.length) continue;
      const sizes = all.map(c => c[0]).sort((a, b) => a - b);
      const changed = sizes.reduce((a, b) => a + b, 0);
      commitSize[year] = {
        q: SIZE_QUANTILES.map(q => quantile(sizes, q)),
        tiny: round(sizes.filter(n => n <= TINY_COMMIT).length / sizes.length),
        files: quantile(all.map(c => c[1]).sort((a, b) => a - b), 0.5),
        added: round(all.reduce((a, c) => a + c[2], 0) / (changed || 1)),
      };
    }

    const cohort = [];
    for (let end = windowEnd; end - 12 - WINDOW + 1 >= 0; end -= 12) {
      const ratios = [];
      for (const byMonth of authors.values()) {
        const [after, org] = sumWindow(byMonth, end);
        if (after < MIN_WINDOW || !group.test(org)) continue;
        const [before] = sumWindow(byMonth, end - 12);
        if (before < MIN_WINDOW) continue;
        ratios.push(Math.log2(after / before));
      }
      cohort.unshift(cohortRow(+months[end].slice(0, 4), ratios));
    }

    const percentiles = {};
    for (let end = windowEnd; end - WINDOW + 1 >= 0; end -= 12) {
      const year = +months[end].slice(0, 4);
      if (year < FIRST_PERCENTILE_YEAR) break;
      const counts = [];
      for (const byMonth of authors.values()) {
        for (let i = end - WINDOW + 1; i <= end; i++) {
          const entry = byMonth.get(i);
          if (entry && group.test(entry[1])) counts.push(entry[0]);
        }
      }
      counts.sort((a, b) => a - b);
      if (counts.length) percentiles[year] = QUANTILES.map(q => quantile(counts, q));
    }

    // KPIs: the window against the same months a year earlier.
    const windowStats = end => {
      let c = 0, personMonths = 0;
      for (let i = end - WINDOW + 1; i <= end; i++) {
        c += commits[i];
        personMonths += authorCount[i];
      }
      const sizes = commitsIn(end - WINDOW + 1, end).map(c => c[0]).sort((a, b) => a - b);
      return { commits: c, personMonths, lines: quantile(sizes, 0.5) };
    };
    const before = windowStats(windowEnd - 12);
    const after = windowStats(windowEnd);

    output.push({
      id: group.id,
      label: group.label,
      commits,
      authors: authorCount,
      reviews,
      lines: medianLines,
      lines_per_author: medianLinesPerAuthor,
      cohort,
      percentiles,
      commit_size: commitSize,
      kpi: {
        commits: [before.commits, after.commits],
        person_months: [before.personMonths, after.personMonths],
        authors: [round(before.personMonths / WINDOW, 1), round(after.personMonths / WINDOW, 1)],
        lines: [before.lines, after.lines],
      },
    });
  }

  const all = output[0], latest = all.cohort.at(-1);
  if (latest.n < MIN_REPOSITORY_PEOPLE) return null;

  // The first full year of data: the first one with at least a quarter of the
  // commits of USUAL_YEARS[1]. A young repository, or a directory created
  // later, compares nothing before it.
  const yearly = year => all.commits.reduce((a, c, i) => a + (months[i].startsWith(year) ? c : 0), 0);
  const reference = yearly(USUAL_YEARS[1]);
  let firstYear = +months[0].slice(0, 4);
  while (yearly(firstYear) < reference / 4) firstYear++;
  for (const group of output) {
    group.cohort = group.cohort.filter(row => row.year - 1 >= firstYear);
    for (const year of Object.keys(group.percentiles)) {
      if (+year < firstYear) delete group.percentiles[year];
    }
    for (const year of Object.keys(group.commit_size)) {
      if (+year < firstYear) delete group.commit_size[year];
    }
  }
  const usual = all.cohort
    .filter(row => row.year >= USUAL_YEARS[0] && row.year <= USUAL_YEARS[1] && row.n >= 10)
    .map(row => 2 ** row.p50 - 1);
  const k = all.kpi;
  // The reviews, only from the Gerrit trailers, which are consistent over
  // time: from a year after they are steady (20% of the last 12 months'
  // median), on a January.
  let reviewsFrom = null;
  if (repository.reviewers === true) {
    const median = [...all.reviews.slice(-12)].sort((a, b) => a - b)[6];
    let s = M - 1;
    while (s > 0 && all.reviews[s - 1] >= 0.2 * median) s--;
    const year = Math.max(2017, +months[s].slice(0, 4) + 1 + (months[s].endsWith("-01") ? 0 : 1));
    reviewsFrom = `${year}-01`;
  }
  return {
    dirname: repository.dirname,
    name: repository.name,
    parent: repositories.find(r => r.dirname === repository.parent)?.name ?? null,
    ...latest,
    usual: usual.length ? [round(Math.min(...usual)), round(Math.max(...usual))] : null,
    per_author: [round(k.commits[0] / (k.person_months[0] || 1), 2), round(k.commits[1] / (k.person_months[1] || 1), 2)],
    github_logins: repository.reviewers === "github",
    data_from: `${firstYear}-01`,
    reviews_from: reviewsFrom,
    groups: output,
  };
};

const output = [];
for (const repository of repositories) {
  const result = await deriveRepository(repository);
  if (result) output.push(result);
}
output.sort((a, b) => b.n - a.n);

await fs.writeFile("../public/data/ai-impact.json", JSON.stringify({
  months,
  window: months.slice(windowEnd - WINDOW + 1),
  min_window: MIN_WINDOW,
  quantiles: QUANTILES,
  size_quantiles: SIZE_QUANTILES,
  tiny_commit: TINY_COMMIT,
  usual_years: USUAL_YEARS,
  repositories: output,
}));
console.log(`ai-impact.json: window ${months[windowEnd - WINDOW + 1]}..${months[windowEnd]}`);
for (const r of output) {
  console.log(`  ${r.name}: ${r.n} people, ${r.groups.map(g => g.label).join(", ")}`);
}
