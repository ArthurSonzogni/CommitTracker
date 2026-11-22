import fs from "fs/promises";
import path from "path";
import { loadOrganizations } from "../../importer/organizations.mjs";
import { loadRepositories, statusLine } from "../../importer/repositories.mjs";
import { canonicalEmails, usernameOfEmail } from "../../importer/usernames.mjs";
import { REPO_ROOT } from "./shard.mjs";

const CONCURRENCY = 64;
const DATA_DIR = path.join(REPO_ROOT, "public", "data");

// Usernames summaries only persist monthly + yearly for author + review;
// quarterly/decennial/forever/both are derived client-side in utils/usernamesSummary.ts.
const USER_GROUPINGS = ["monthly", "yearly"];
const USER_KINDS = ["author", "review"];
const USER_METRICS = ["commit", "lines", "added_lines", "deleted_lines"];

// Organization summaries keep all groupings and kinds because contributor counts
// are distinct set unions (non-additive), and drop unused line metrics.
const ORG_GROUPINGS = ["monthly", "quarterly", "yearly", "decennial", "forever"];
const ORG_KINDS = ["author", "review", "both"];
const ORG_METRICS = ["commit", "contributor"];

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

function getDateBuckets(date) {
  const monthly = date.slice(0, 7);
  const yearly = date.slice(0, 4);
  const decennial = date.slice(0, 3) + "0";
  let quarterly;
  if (date.length >= 7 && date[4] === "-") {
    const month = Number(date.slice(5, 7));
    quarterly = `${yearly}Q${Math.floor((month - 1) / 3) + 1}`;
  } else {
    const d = new Date(date);
    quarterly = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  }
  return [monthly, quarterly, yearly, decennial, "forever"];
}

function createUserAcc() {
  return USER_KINDS.map(() =>
    USER_GROUPINGS.map(() => ({
      commit: {},
      lines: {},
      added_lines: {},
      deleted_lines: {},
    })),
  );
}

function addCommitToUserAcc(acc, commit) {
  const kindIdx = commit.kind === "author" ? 0 : commit.kind === "review" ? 1 : -1;
  if (kindIdx === -1) return;

  const monthly = commit.date.slice(0, 7);
  const yearly = commit.date.slice(0, 4);
  const vLines = commit.additions + commit.deletions;
  const vAdded = Math.max(0, commit.additions - commit.deletions);
  const vDeleted = Math.max(0, commit.deletions - commit.additions);

  const buckets = [monthly, yearly];
  for (let g = 0; g < 2; g++) {
    const cell = acc[kindIdx][g];
    const b = buckets[g];
    cell.commit[b] = (cell.commit[b] || 0) + 1;
    cell.lines[b] = (cell.lines[b] || 0) + vLines;
    cell.added_lines[b] = (cell.added_lines[b] || 0) + vAdded;
    cell.deleted_lines[b] = (cell.deleted_lines[b] || 0) + vDeleted;
  }
}

function createOrgAcc() {
  return ORG_KINDS.map(() =>
    ORG_GROUPINGS.map(() => ({
      commit: {},
      contributor: {},
    })),
  );
}

function updateOrgCell(cell, bucket, contributor) {
  cell.commit[bucket] = (cell.commit[bucket] || 0) + 1;
  (cell.contributor[bucket] ||= new Set()).add(contributor);
}

function addCommitToOrgAcc(acc, commit, contributor) {
  const buckets = getDateBuckets(commit.date);
  const kindIdx = commit.kind === "author" ? 0 : commit.kind === "review" ? 1 : -1;

  for (let g = 0; g < 5; g++) {
    const b = buckets[g];
    updateOrgCell(acc[2][g], b, contributor);
    if (kindIdx !== -1) {
      updateOrgCell(acc[kindIdx][g], b, contributor);
    }
  }
}

function finalizeOrgAcc(acc) {
  for (let k = 0; k < ORG_KINDS.length; k++) {
    for (let g = 0; g < ORG_GROUPINGS.length; g++) {
      const converted = {};
      for (const [bucket, set] of Object.entries(acc[k][g].contributor)) {
        converted[bucket] = set.size;
      }
      acc[k][g].contributor = converted;
    }
  }
}

function createSummaryTables(metrics, groupings, kinds) {
  const tables = {};
  for (const metric of metrics) {
    tables[metric] = {};
    for (const grouping of groupings) {
      tables[metric][grouping] = {};
      for (const kind of kinds) {
        tables[metric][grouping][kind] = {};
      }
    }
  }
  return tables;
}

function recordEntityIntoTables(tables, metrics, groupings, kinds, entityId, acc) {
  for (const metric of metrics) {
    for (let g = 0; g < groupings.length; g++) {
      const grouping = groupings[g];
      for (let k = 0; k < kinds.length; k++) {
        tables[metric][grouping][kinds[k]][entityId] = acc[k][g][metric];
      }
    }
  }
}

const { organizations_list, getOrganization } = await loadOrganizations();
const repositories = await loadRepositories();
const targetRepo = process.argv[2];

if (!targetRepo) {
  await Promise.all([
    fs.writeFile(
      path.join(DATA_DIR, "repositories.json"),
      JSON.stringify(repositories, null, 2),
    ),
    fs.writeFile(
      path.join(DATA_DIR, "organizations.json"),
      JSON.stringify(organizations_list, null, 1),
    ),
  ]);
}

const organizations_emails_global = {};
const organizations_summary = {};
const repository_stats = {};
const min_year = new Date().getFullYear() - 5;

for (const repository of repositories) {
  if (targetRepo && repository.dirname !== targetRepo) continue;

  statusLine(`Deriving data for ${repository.dirname}...`);
  const repository_dir = path.join(DATA_DIR, repository.dirname);
  const usernames_dir = path.join(repository_dir, "usernames");

  // Clean stale usernames/, organizations/, and any old summary files.
  await fs.rm(usernames_dir, { recursive: true, force: true });
  await fs.mkdir(usernames_dir, { recursive: true });
  await fs.rm(path.join(repository_dir, "organizations"), { recursive: true, force: true });
  const existingEntries = await fs.readdir(repository_dir);
  await Promise.all(
    existingEntries
      .filter(name => name.includes("_summary_") && name.endsWith(".json"))
      .map(name => fs.rm(path.join(repository_dir, name), { force: true })),
  );

  const emails = JSON.parse(await fs.readFile(path.join(repository_dir, "emails.json"), "utf8"));
  const { canonical, loginOf } = await canonicalEmails(repository, repository_dir, emails);
  const github = repository.reviewers === "github";
  const usernameOf = email => usernameOfEmail(repository, canonical(email));
  const emailsByUser = new Map();
  const githubLogins = {};
  for (const email of emails) {
    const username = usernameOf(email);
    let list = emailsByUser.get(username);
    if (!list) {
      list = [];
      emailsByUser.set(username, list);
    }
    list.push(email);
    githubLogins[username] ??= loginOf(email);
  }
  const sortedUsernames = [...emailsByUser.keys()].sort();

  const usernameTables = createSummaryTables(USER_METRICS, USER_GROUPINGS, USER_KINDS);
  const orgAccMap = new Map();
  const organizations_emails = {};

  let min_date = null;
  let max_date = null;
  let total_commits = 0;
  const valid_author_dates = [];

  for (let start = 0; start < sortedUsernames.length; start += CONCURRENCY) {
    const batchUsernames = sortedUsernames.slice(start, start + CONCURRENCY);
    const batchLoaded = await Promise.all(
      batchUsernames.map(async username => {
        const userEmails = emailsByUser.get(username);
        const perEmail = await Promise.all(
          userEmails.map(async email => {
            const raw = await fs.readFile(path.join(repository_dir, "emails", `${email}.json`), "utf8");
            return [email, JSON.parse(raw)];
          }),
        );
        return [username, perEmail];
      }),
    );

    const userWrites = [];
    for (const [username, perEmail] of batchLoaded) {
      const userCommits = perEmail.length === 1 ? perEmail[0][1] : [];

      for (const [email, commits] of perEmail) {
        for (const commit of commits) {
          if (commit.kind === "author") {
            total_commits++;
            if (commit.date >= "2000-01-01") {
              valid_author_dates.push(commit.date);
              if (min_date === null || commit.date < min_date) min_date = commit.date;
              if (max_date === null || commit.date > max_date) max_date = commit.date;
            }
          }

          const org = getOrganization(email, commit.date);
          (organizations_emails[org] ||= new Set()).add(email);
          (organizations_emails_global[org] ||= new Set()).add(email);

          let orgAcc = orgAccMap.get(org);
          if (!orgAcc) {
            orgAcc = createOrgAcc();
            orgAccMap.set(org, orgAcc);
          }
          addCommitToOrgAcc(orgAcc, commit, username);

          if (commit.peers.length === 1) {
            commit.peers[0] = usernameOf(commit.peers[0]);
          } else if (commit.peers.length > 1) {
            commit.peers = [...new Set(commit.peers.map(usernameOf))].sort();
          }
          // The hash only identifies the commit for the importer: strip it so
          // usernames/*.json stays lean. Keep msg/flags/bug for badges and
          // developer year-in-review pages.
          delete commit.sha;
          if (perEmail.length > 1) {
            userCommits.push(commit);
          }
        }
      }

      userCommits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const userAcc = createUserAcc();
      for (const commit of userCommits) {
        addCommitToUserAcc(userAcc, commit);
      }
      recordEntityIntoTables(usernameTables, USER_METRICS, USER_GROUPINGS, USER_KINDS, username, userAcc);
      userWrites.push(
        fs.writeFile(path.join(usernames_dir, `${username}.json`), JSON.stringify(userCommits)),
      );
    }

    await Promise.all(userWrites);
  }

  // Organizations: finalize contributor counts and sort by forever_both commits.
  for (const orgAcc of orgAccMap.values()) {
    finalizeOrgAcc(orgAcc);
  }
  const orgForeverBothCount = org => orgAccMap.get(org)?.[2][4].commit.forever || 0;
  const sortedOrganizations = [...orgAccMap.keys()].sort(
    (a, b) => (orgForeverBothCount(b) - orgForeverBothCount(a)) || a.localeCompare(b),
  );

  const orgTables = createSummaryTables(ORG_METRICS, ORG_GROUPINGS, ORG_KINDS);
  organizations_summary[repository.dirname] = {};
  for (const org of sortedOrganizations) {
    const orgAcc = orgAccMap.get(org);
    recordEntityIntoTables(orgTables, ORG_METRICS, ORG_GROUPINGS, ORG_KINDS, org, orgAcc);
    organizations_summary[repository.dirname][org] = orgForeverBothCount(org);
  }

  // Commits per hour (from valid author commits only).
  let commits_per_hour_out;
  if (min_date === null) {
    commits_per_hour_out = { startDate: null, commits: [] };
  } else {
    const startDate = new Date(min_date).toISOString().split("T")[0];
    const start_ms = Date.parse(`${startDate}T00:00:00Z`);
    const max_ms = new Date(max_date).getTime();
    const array_size = Math.floor((max_ms - start_ms) / 3600000);
    const hourly = new Array(array_size + 1).fill(0);
    for (const date of valid_author_dates) {
      const index = Math.floor((new Date(date).getTime() - start_ms) / 3600000);
      if (index >= 0) {
        hourly[index] += 1;
      }
    }
    commits_per_hour_out = {
      startDate,
      commits: hourly,
    };
  }

  // Top organizations (last 5 years, excluding Unknown).
  const org_totals = [];
  for (const [org, years] of Object.entries(orgTables.commit.yearly.both)) {
    if (org === "Unknown") continue;
    let total = 0;
    for (const [year_str, count] of Object.entries(years)) {
      if (parseInt(year_str, 10) >= min_year) {
        total += count;
      }
    }
    if (total > 0) {
      org_totals.push([org, total]);
    }
  }
  org_totals.sort((a, b) => b[1] - a[1]);

  repository_stats[repository.dirname] = {
    last_commit: max_date,
    total_commits,
    total_contributors: sortedUsernames.length,
    top_organizations: org_totals.slice(0, 3).map(e => e[0]),
  };

  // Serialize organizations_emails for this repository.
  const organizations_emails_out = {};
  for (const [org, set] of Object.entries(organizations_emails)) {
    organizations_emails_out[org] = [...set];
  }

  // Collect all summary file writes for this repository and execute with bounded concurrency.
  const writeTasks = [
    [path.join(repository_dir, "usernames.json"), () => JSON.stringify(sortedUsernames)],
    // Username -> emails, when the usernames are not the email local parts.
    ...(github ? [[path.join(repository_dir, "usernames_emails.json"), () => JSON.stringify(
      Object.fromEntries([...emailsByUser].sort()))]] : []),
    // Username -> GitHub login, when known.
    [path.join(repository_dir, "usernames_github.json"), () => JSON.stringify(
      Object.fromEntries(Object.entries(githubLogins).filter(([, login]) => login).sort()))],
    [path.join(repository_dir, "organizations.json"), () => JSON.stringify(sortedOrganizations)],
    [path.join(repository_dir, "organizations_emails.json"), () => JSON.stringify(organizations_emails_out)],
    [path.join(repository_dir, "commits_per_hour.json"), () => JSON.stringify(commits_per_hour_out)],
  ];

  for (const [type, metrics, groupings, kinds, tables] of [
    ["usernames", USER_METRICS, USER_GROUPINGS, USER_KINDS, usernameTables],
    ["organizations", ORG_METRICS, ORG_GROUPINGS, ORG_KINDS, orgTables],
  ]) {
    for (const metric of metrics) {
      for (const grouping of groupings) {
        for (const kind of kinds) {
          writeTasks.push([
            path.join(repository_dir, `${type}_summary_${metric}_${grouping}_${kind}.json`),
            () => JSON.stringify(tables[metric][grouping][kind]),
          ]);
        }
      }
    }
  }

  await mapWithConcurrency(writeTasks, CONCURRENCY, ([filepath, getContent]) =>
    fs.writeFile(filepath, getContent()),
  );
}

if (!targetRepo) {
  const organizations_emails_global_out = {};
  for (const [org, set] of Object.entries(organizations_emails_global)) {
    organizations_emails_global_out[org] = [...set];
  }

  await Promise.all([
    fs.writeFile(
      path.join(DATA_DIR, "organizations_emails.json"),
      JSON.stringify(organizations_emails_global_out),
    ),
    fs.writeFile(
      path.join(DATA_DIR, "organizations_summary.json"),
      JSON.stringify(organizations_summary),
    ),
    fs.writeFile(
      path.join(DATA_DIR, "repositories_stats.json"),
      JSON.stringify(repository_stats, null, 2),
    ),
  ]);
}
statusLine("");
