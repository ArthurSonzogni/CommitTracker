// Derives the data of the /developer-output page: how the commits per
// person change from a year to the next, in each tracked repository, per
// organization group. The page compares the window of WINDOW months ending at
// any month with the same months a year earlier, so everything that depends on
// a window is given for the window ending at each month.
//
// Run from importer/, after derive_data.mjs.
// Writes ../public/data/developer-output.json:
//   {
//     "months": ["2015-01", ...],          // up to the last complete month
//     "window": 3, "min_window": 6,
//     "quantiles": [...], "size_quantiles": [...], "tiny_commit": 5,
//     "repositories": [{
//       "dirname", "name",
//       "parent": name | null,             // the repository it is a subdirectory of
//       "github_logins": bool,             // whether the usernames are GitHub logins
//       "data_from": "2015-01",            // the first full year of data
//       "reviews_from": "2019-01" | null,  // where the reviews are comparable
//       "groups": [{
//         "id", "label",
//         // By month:
//         "commits": [...], "authors": [...], "reviews": [...],
//         "reviewers": [...],               // the people who reviewed at least one
//         "lines": [...],                   // median lines changed per commit
//         // By the window ending at each month, null without enough data:
//         "cohort": { "n", "p25", "p50", "p75", "mean", "up" }, // arrays
//         "size": {                         // the commits of the window
//           "q": [[...], ...],              // their lines, at "size_quantiles"
//           "tiny", "files", "added" },     // arrays: the share of at most
//                                           // "tiny_commit" lines, the median
//                                           // files, the share of lines added
//         "percentiles": [[...], ...],      // of the commits per active
//                                           // person-month, at "quantiles"
//         "size_by_activity": [[...], ...]  // the median commit of the
//       }],                                 // person-months at "quantiles"
//       "organizations": [{ "label",
//         "commits": [...], "authors": [...], // by month
//         "people": [...], "same": [...],   // by window: the same people, and
//                                           // their median log2 change
//         "lines": [...] }]                 // by window: median lines per commit
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
// organizations: the COMPARED_ORGANIZATIONS largest organizations over the
// last 12 months, with only what their comparison needs.
//
// cohort: the same people, a year apart: the people with at least MIN_WINDOW
// commits in both the window and the same months a year earlier, and the
// summary of log2(commits in the window / commits a year earlier). A person
// belongs to the organization of most of their commits in the window.
//
// size_by_activity: the active person-months, ranked by their commits as for
// "percentiles". At each quantile, the ones ranked between the midpoints with
// the quantiles around it, and the median of their median commit size: the
// size of the commits of the people who land that many.

import fs from "fs/promises";
import JSON5 from "json5";
import { loadOrganizations } from "./organizations.mjs";
import { canonicalEmails, usernameOfEmail } from "./usernames.mjs";

const FIRST_MONTH = "2015-01";
const WINDOW = 3;
const MIN_WINDOW = 6;
const MIN_AUTHORS_PER_MONTH = 15;
// The organizations compared side by side, in a table.
const COMPARED_ORGANIZATIONS = 10;
const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99];
// Of the size of the commits.
const SIZE_QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9];
// A commit of at most this many lines is tiny.
const TINY_COMMIT = 5;
const FIRST_PERCENTILE_YEAR = 2016;
// Repositories shown: enough people in the same-people comparison. Below 20,
// the page warns that a few people move the figures.
const MIN_REPOSITORY_PEOPLE = 10;

const repositories = JSON5.parse(await fs.readFile("../repositories.json5", "utf8"));

const { getOrganization } = await loadOrganizations();

// The months up to the last complete one.
const now = new Date();
const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
const months = [];
for (let y = +FIRST_MONTH.slice(0, 4), m = +FIRST_MONTH.slice(5); ; m++) {
  if (m > 12) { y++; m = 1; }
  const month = `${y}-${String(m).padStart(2, "0")}`;
  if (month >= current) break;
  months.push(month);
}
const monthIndex = new Map(months.map((m, i) => [m, i]));
const M = months.length;

const quantile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
const round = (x, digits = 3) => x === null ? null : +x.toFixed(digits);

// The summary of the log2 ratios of the same people.
const cohortRow = ratios => {
  ratios.sort((a, b) => a - b);
  return {
    n: ratios.length,
    p25: round(quantile(ratios, 0.25)),
    p50: round(quantile(ratios, 0.5)),
    mean: round(ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null),
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
  // username -> month index -> [lines changed of each commit].
  const authoredSizes = new Map();

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
        let sizesByMonth = authoredSizes.get(user);
        if (!sizesByMonth) authoredSizes.set(user, sizesByMonth = new Map());
        let sizes = sizesByMonth.get(i);
        if (!sizes) sizesByMonth.set(i, sizes = []);
        sizes.push(changed);
      } else if (commit.kind === "review") {
        add(reviewed, user, i, org);
      }
    }
  }
  // Skip the repositories whose data stops before the last month.
  if (last.slice(0, 7) < months[M - 1]) return null;

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
  // organizations with enough authors. The individuals are too few people to
  // compare with themselves: they stay in "Everyone else".
  const recent = new Map();
  for (const byMonth of authors.values()) {
    for (const [i, [, org]] of byMonth) {
      if (i >= M - 12) recent.set(org, (recent.get(org) || 0) + 1 / 12);
    }
  }
  const largest = [...recent]
    .filter(([org]) => !["Unknown", "Individuals"].includes(org))
    .sort((a, b) => b[1] - a[1]);
  const large = largest
    .filter(([, perMonth]) => perMonth >= MIN_AUTHORS_PER_MONTH)
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
    const reviewerCount = new Array(M).fill(0);
    for (const byMonth of authors.values()) {
      for (const [i, [n, org]] of byMonth) {
        if (!group.test(org)) continue;
        commits[i] += n;
        authorCount[i]++;
      }
    }
    for (const byMonth of reviewers.values()) {
      for (const [i, [n, org]] of byMonth) {
        if (!group.test(org)) continue;
        reviews[i] += n;
        reviewerCount[i]++;
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

    // The windows ending at each month, from `from`: their value, or null.
    const byWindow = (from, f) => months.map((_, end) => end >= from ? f(end) : null);

    // The size of the commits.
    const sizeAt = byWindow(WINDOW - 1, end => {
      const all = commitsIn(end - WINDOW + 1, end);
      if (!all.length) return null;
      const sizes = all.map(c => c[0]).sort((a, b) => a - b);
      const changed = sizes.reduce((a, b) => a + b, 0);
      return {
        q: SIZE_QUANTILES.map(q => quantile(sizes, q)),
        tiny: round(sizes.filter(n => n <= TINY_COMMIT).length / sizes.length),
        files: quantile(all.map(c => c[1]).sort((a, b) => a - b), 0.5),
        added: round(all.reduce((a, c) => a + c[2], 0) / (changed || 1)),
      };
    });

    // The same people in the window and a year earlier.
    const cohortAt = byWindow(12 + WINDOW - 1, end => {
      const ratios = [];
      for (const byMonth of authors.values()) {
        const [after, org] = sumWindow(byMonth, end);
        if (after < MIN_WINDOW || !group.test(org)) continue;
        const [before] = sumWindow(byMonth, end - 12);
        if (before < MIN_WINDOW) continue;
        ratios.push(Math.log2(after / before));
      }
      return cohortRow(ratios);
    });

    // The commits of each active person-month.
    const percentiles = byWindow(WINDOW - 1, end => {
      const counts = [];
      for (const byMonth of authors.values()) {
        for (let i = end - WINDOW + 1; i <= end; i++) {
          const entry = byMonth.get(i);
          if (entry && group.test(entry[1])) counts.push(entry[0]);
        }
      }
      counts.sort((a, b) => a - b);
      return counts.length ? QUANTILES.map(q => quantile(counts, q)) : null;
    });

    // The size of the commits of the person-months at each quantile.
    const edges = [0, ...QUANTILES.slice(1).map((q, k) => (QUANTILES[k] + q) / 2), 1];
    const sizeByActivity = byWindow(WINDOW - 1, end => {
      const rows = [];
      for (const [user, byMonth] of authors) {
        for (let i = end - WINDOW + 1; i <= end; i++) {
          const entry = byMonth.get(i);
          if (!entry || !group.test(entry[1])) continue;
          const sizes = authoredSizes.get(user).get(i).sort((a, b) => a - b);
          rows.push([entry[0], quantile(sizes, 0.5)]);
        }
      }
      if (!rows.length) return null;
      rows.sort((a, b) => a[0] - b[0]);
      return QUANTILES.map((_, k) => {
        const band = rows
          .slice(Math.floor(edges[k] * rows.length), Math.max(Math.floor(edges[k] * rows.length) + 1, Math.floor(edges[k + 1] * rows.length)))
          .map(row => row[1])
          .sort((a, b) => a - b);
        return quantile(band, 0.5);
      });
    });

    output.push({
      id: group.id,
      label: group.label,
      commits,
      authors: authorCount,
      reviews,
      reviewers: reviewerCount,
      lines: medianLines,
      cohortAt,
      sizeAt,
      percentiles,
      size_by_activity: sizeByActivity,
    });
  }

  const all = output[0];
  if ((all.cohortAt[M - 1]?.n ?? 0) < MIN_REPOSITORY_PEOPLE) return null;

  // The first full year of data: the first one with at least a quarter of the
  // commits of the last 12 months. A young repository, or a directory created
  // later, compares nothing before it.
  const yearly = year => all.commits.reduce((a, c, i) => a + (months[i].startsWith(year) ? c : 0), 0);
  const reference = all.commits.slice(-12).reduce((a, b) => a + b, 0);
  let firstYear = +months[0].slice(0, 4);
  while (yearly(firstYear) < reference / 4) firstYear++;
  const first = monthIndex.get(`${firstYear}-01`);
  // The windows that start within the first full year of data, and from
  // FIRST_PERCENTILE_YEAR for the distributions.
  const windowFrom = Math.max(first, monthIndex.get(`${FIRST_PERCENTILE_YEAR}-01`)) + WINDOW - 1;
  // The windows whose year earlier starts within it.
  const cohortFrom = first + 12 + WINDOW - 1;
  const columns = (rows, keys, from) => Object.fromEntries(keys.map(key =>
    [key, rows.map((row, i) => i >= from ? row?.[key] ?? null : null)]));
  for (const group of output) {
    group.cohort = columns(group.cohortAt, ["n", "p25", "p50", "p75", "mean", "up"], cohortFrom);
    group.size = columns(group.sizeAt, ["q", "tiny", "files", "added"], windowFrom);
    group.percentiles = group.percentiles.map((row, i) => i >= windowFrom ? row : null);
    group.size_by_activity = group.size_by_activity.map((row, i) => i >= windowFrom ? row : null);
    delete group.cohortAt;
    delete group.sizeAt;
  }

  // The organizations compared: their commits and authors by month, and by
  // window, the same people and the median lines per commit.
  const organizations = largest.slice(0, COMPARED_ORGANIZATIONS).map(([org]) => {
    const commits = new Array(M).fill(0);
    const authorCount = new Array(M).fill(0);
    for (const byMonth of authors.values()) {
      for (const [i, [n, o]] of byMonth) {
        if (o !== org) continue;
        commits[i] += n;
        authorCount[i]++;
      }
    }
    const cohort = months.map((_, end) => {
      if (end < cohortFrom) return null;
      const ratios = [];
      for (const byMonth of authors.values()) {
        const [after, o] = sumWindow(byMonth, end);
        if (after < MIN_WINDOW || o !== org) continue;
        const [before] = sumWindow(byMonth, end - 12);
        if (before >= MIN_WINDOW) ratios.push(Math.log2(after / before));
      }
      return cohortRow(ratios);
    });
    const byMonth = lines.get(org) || new Map();
    return {
      label: org,
      commits,
      authors: authorCount,
      people: cohort.map(row => row?.n ?? null),
      same: cohort.map(row => row?.p50 ?? null),
      lines: months.map((_, end) => {
        if (end < windowFrom) return null;
        const sizes = [];
        for (let i = end - WINDOW + 1; i <= end; i++) {
          for (const c of byMonth.get(i) || []) sizes.push(c[0]);
        }
        return sizes.length ? quantile(sizes.sort((a, b) => a - b), 0.5) : null;
      }),
    };
  });
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
    github_logins: repository.reviewers === "github",
    data_from: `${firstYear}-01`,
    reviews_from: reviewsFrom,
    groups: output,
    organizations,
  };
};

const output = [];
for (const repository of repositories) {
  const result = await deriveRepository(repository);
  if (result) output.push(result);
}
const people = r => r.groups[0].cohort.n[M - 1];
output.sort((a, b) => people(b) - people(a));

await fs.writeFile("../public/data/developer-output.json", JSON.stringify({
  months,
  window: WINDOW,
  min_window: MIN_WINDOW,
  quantiles: QUANTILES,
  size_quantiles: SIZE_QUANTILES,
  tiny_commit: TINY_COMMIT,
  repositories: output,
}));
console.log(`developer-output.json: up to ${months[M - 1]}`);
for (const r of output) {
  console.log(`  ${r.name}: ${people(r)} people, ${r.groups.map(g => g.label).join(", ")}`);
}
