import fs from "fs/promises";
import JSON5 from "json5";
import statusLine from "@alt-jero/status-line";
import { loadOrganizations } from "./organizations.mjs";

const CONCURRENCY = 64;
const GROUPINGS = ["monthly", "quarterly", "yearly", "decennial", "forever"];
const KINDS = ["author", "review", "both"];
const NUMERIC_METRICS = ["commit", "lines", "added_lines", "deleted_lines"];
const ORG_METRICS = [...NUMERIC_METRICS, "contributor"];

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

function createEntityAcc(includeContributor) {
  return KINDS.map(() =>
    GROUPINGS.map(() => {
      const cell = {
        commit: {},
        lines: {},
        added_lines: {},
        deleted_lines: {},
      };
      if (includeContributor) {
        cell.contributor = {};
      }
      return cell;
    }),
  );
}

function updateCell(cell, bucket, vLines, vAdded, vDeleted, contributor) {
  cell.commit[bucket] = (cell.commit[bucket] || 0) + 1;
  cell.lines[bucket] = (cell.lines[bucket] || 0) + vLines;
  cell.added_lines[bucket] = (cell.added_lines[bucket] || 0) + vAdded;
  cell.deleted_lines[bucket] = (cell.deleted_lines[bucket] || 0) + vDeleted;
  if (contributor !== undefined) {
    (cell.contributor[bucket] ||= new Set()).add(contributor);
  }
}

function addCommitToAcc(acc, commit, contributor) {
  const buckets = getDateBuckets(commit.date);
  const vLines = commit.additions + commit.deletions;
  const vAdded = Math.max(0, commit.additions - commit.deletions);
  const vDeleted = Math.max(0, commit.deletions - commit.additions);
  const kindIdx = commit.kind === "author" ? 0 : commit.kind === "review" ? 1 : -1;

  for (let g = 0; g < 5; g++) {
    const b = buckets[g];
    updateCell(acc[2][g], b, vLines, vAdded, vDeleted, contributor);
    if (kindIdx !== -1) {
      updateCell(acc[kindIdx][g], b, vLines, vAdded, vDeleted, contributor);
    }
  }
}

function finalizeContributorAcc(acc) {
  for (let k = 0; k < 3; k++) {
    for (let g = 0; g < 5; g++) {
      const converted = {};
      for (const [bucket, set] of Object.entries(acc[k][g].contributor)) {
        converted[bucket] = set.size;
      }
      acc[k][g].contributor = converted;
    }
  }
}

function createSummaryTables(metrics) {
  const tables = {};
  for (const metric of metrics) {
    tables[metric] = {};
    for (let g = 0; g < GROUPINGS.length; g++) {
      tables[metric][GROUPINGS[g]] = {};
      for (let k = 0; k < KINDS.length; k++) {
        tables[metric][GROUPINGS[g]][KINDS[k]] = {};
      }
    }
  }
  return tables;
}

function recordEntityIntoTables(tables, metrics, entityId, acc) {
  for (const metric of metrics) {
    for (let g = 0; g < GROUPINGS.length; g++) {
      const grouping = GROUPINGS[g];
      for (let k = 0; k < KINDS.length; k++) {
        tables[metric][grouping][KINDS[k]][entityId] = acc[k][g][metric];
      }
    }
  }
}

const { organizations_list, getOrganization } = await loadOrganizations();
const repositories = JSON5.parse(await fs.readFile("../repositories.json5", "utf8"));
const targetRepo = process.argv[2];

if (!targetRepo) {
  await Promise.all([
    fs.writeFile(
      "../public/data/repositories.json",
      JSON.stringify(repositories, null, 2),
    ),
    fs.writeFile(
      "../public/data/organizations.json",
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
  const repository_dir = `../public/data/${repository.dirname}`;
  const usernames_dir = `${repository_dir}/usernames`;

  // Clean stale usernames/ and any leftover organizations/ directory.
  await fs.rm(usernames_dir, { recursive: true, force: true });
  await fs.mkdir(usernames_dir, { recursive: true });
  await fs.rm(`${repository_dir}/organizations`, { recursive: true, force: true });

  const emails = JSON.parse(await fs.readFile(`${repository_dir}/emails.json`, "utf8"));
  const emailsByUser = new Map();
  for (const email of emails) {
    const username = email.split("@")[0];
    let list = emailsByUser.get(username);
    if (!list) {
      list = [];
      emailsByUser.set(username, list);
    }
    list.push(email);
  }
  const sortedUsernames = [...emailsByUser.keys()].sort();

  const emailTables = createSummaryTables(NUMERIC_METRICS);
  for (const metric of NUMERIC_METRICS) {
    for (const grouping of GROUPINGS) {
      for (const kind of KINDS) {
        const obj = emailTables[metric][grouping][kind];
        for (const email of emails) {
          obj[email] = null;
        }
      }
    }
  }

  const usernameTables = createSummaryTables(NUMERIC_METRICS);
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
            const raw = await fs.readFile(`${repository_dir}/emails/${email}.json`, "utf8");
            return [email, JSON.parse(raw)];
          }),
        );
        return [username, perEmail];
      }),
    );

    const userWrites = [];
    for (const [username, perEmail] of batchLoaded) {
      let userCommits;
      if (perEmail.length === 1) {
        userCommits = perEmail[0][1];
      } else {
        userCommits = [];
      }

      for (const [email, commits] of perEmail) {
        const emailAcc = createEntityAcc(false);

        for (const commit of commits) {
          addCommitToAcc(emailAcc, commit, undefined);

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
            orgAcc = createEntityAcc(true);
            orgAccMap.set(org, orgAcc);
          }
          addCommitToAcc(orgAcc, commit, username);

          if (commit.peers.length === 1) {
            commit.peers[0] = commit.peers[0].split("@")[0];
          } else if (commit.peers.length > 1) {
            commit.peers = [...new Set(commit.peers.map(p => p.split("@")[0]))].sort();
          }
          if (perEmail.length > 1) {
            userCommits.push(commit);
          }
        }

        recordEntityIntoTables(emailTables, NUMERIC_METRICS, email, emailAcc);
      }

      userCommits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const userAcc = createEntityAcc(false);
      for (const commit of userCommits) {
        addCommitToAcc(userAcc, commit, undefined);
      }
      recordEntityIntoTables(usernameTables, NUMERIC_METRICS, username, userAcc);
      userWrites.push(
        fs.writeFile(`${usernames_dir}/${username}.json`, JSON.stringify(userCommits, null, 1)),
      );
    }

    await Promise.all(userWrites);
  }

  // Organizations: finalize contributor counts and sort by forever_both commits.
  for (const orgAcc of orgAccMap.values()) {
    finalizeContributorAcc(orgAcc);
  }
  const orgForeverBothCount = org => orgAccMap.get(org)?.[2][4].commit.forever || 0;
  const sortedOrganizations = [...orgAccMap.keys()].sort(
    (a, b) => (orgForeverBothCount(b) - orgForeverBothCount(a)) || a.localeCompare(b),
  );

  const orgTables = createSummaryTables(ORG_METRICS);
  organizations_summary[repository.dirname] = {};
  for (const org of sortedOrganizations) {
    const orgAcc = orgAccMap.get(org);
    recordEntityIntoTables(orgTables, ORG_METRICS, org, orgAcc);
    organizations_summary[repository.dirname][org] = orgForeverBothCount(org);
  }

  // Commits per hour (from valid author commits only).
  let commits_per_hour_out;
  if (min_date === null) {
    commits_per_hour_out = { startDate: null, commits: [] };
  } else {
    const min_ms = new Date(min_date).getTime();
    const max_ms = new Date(max_date).getTime();
    const array_size = Math.floor((max_ms - min_ms) / 3600000);
    const hourly = new Array(array_size + 1).fill(0);
    for (const date of valid_author_dates) {
      const index = Math.floor((new Date(date).getTime() - min_ms) / 3600000);
      if (index >= 0) {
        hourly[index] += 1;
      }
    }
    commits_per_hour_out = {
      startDate: new Date(min_date).toISOString().split("T")[0],
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
    [`${repository_dir}/usernames.json`, () => JSON.stringify(sortedUsernames, null, 1)],
    [`${repository_dir}/organizations.json`, () => JSON.stringify(sortedOrganizations, null, 1)],
    [`${repository_dir}/organizations_emails.json`, () => JSON.stringify(organizations_emails_out, null, 1)],
    [`${repository_dir}/commits_per_hour.json`, () => JSON.stringify(commits_per_hour_out)],
  ];

  for (const [type, metrics, tables] of [
    ["emails", NUMERIC_METRICS, emailTables],
    ["usernames", NUMERIC_METRICS, usernameTables],
    ["organizations", ORG_METRICS, orgTables],
  ]) {
    for (const metric of metrics) {
      for (const grouping of GROUPINGS) {
        for (const kind of KINDS) {
          writeTasks.push([
            `${repository_dir}/${type}_summary_${metric}_${grouping}_${kind}.json`,
            () => JSON.stringify(tables[metric][grouping][kind], null, 1),
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
      "../public/data/organizations_emails.json",
      JSON.stringify(organizations_emails_global_out, null, 1),
    ),
    fs.writeFile(
      "../public/data/organizations_summary.json",
      JSON.stringify(organizations_summary, null, 1),
    ),
    fs.writeFile(
      "../public/data/repositories_stats.json",
      JSON.stringify(repository_stats, null, 2),
    ),
  ]);
}
statusLine("");
