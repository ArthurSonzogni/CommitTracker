// For every repository, we will compute the number of commit per hours.
//
// The output are JSON using the file format:
// {
//   "startDate": "2025-01-20",
//   "commits": [
//     12, // Absolute count for the first hour.
//     5,  // Absolute count for the second hour.
//     0,  // Absolute count for the third hour.
//     1,  // Absolute count for the fourth hour.
//     // ... more entries
//   ]
// }

import fs from "fs/promises";
import JSON5 from "json5";
import statusLine from '@alt-jero/status-line';

const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
const last_commits = {};
const repository_stats = {};

for (const repository of repositories) {
  statusLine(`Processing ${repository.dirname} for commits per hour.`);
  const repository_dir = `../public/data/${repository.dirname}`;
  const emails_filename = `${repository_dir}/emails.json`;
  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));
  const usernames_filename = `${repository_dir}/usernames.json`;
  const usernames = JSON.parse(await fs.readFile(usernames_filename, "utf8"));

  const dates = new Set();
  let total_commits = 0;

  for (const email of emails) {
    const email_filename = `${repository_dir}/emails/${email}.json`;
    const email_data = JSON.parse(await fs.readFile(email_filename, "utf8"));
    for (const commit of email_data) {
      dates.add(commit.date);
      if (commit.kind === 'author') {
        total_commits++;
      }
    }
  }

  // Find the min and max date. Using a loop.
  let min_date = dates.values().next().value;
  let max_date = dates.values().next().value;
  for (const date of dates) {
    // Ignore invalid date.
    if (date < "2000-01-01") {
      continue;
    }

    if (date < min_date) {
      min_date = date;
    }
    if (date > max_date) {
      max_date = date;
    }
  }

  last_commits[repository.dirname] = max_date;
  repository_stats[repository.dirname] = {
    last_commit: max_date,
    total_commits: total_commits,
    total_contributors: usernames.length,
  };

  // Initialize the commits array, in hours.
  const array_size = Math.floor(
    (new Date(max_date) - new Date(min_date)) / 1000 / 60 / 60
  );

  const commits = new Array(array_size).fill(0);
  for (const date of Array.from(dates).sort()) {
    const index = Math.floor((new Date(date) - new Date(min_date)) / 1000 / 60 / 60);
    if (index < 0) {
      continue;
    }
    commits[index] += 1;
  }

  const out = {
    startDate: new Date(min_date).toISOString().split("T")[0],
    commits: commits,
  };

  await fs.writeFile(
    `${repository_dir}/commits_per_hour.json`,
    JSON.stringify(out)
  );
}

// Add top organizations to stats (last 5 years).
const current_year = new Date().getFullYear();
const min_year = current_year - 5; // e.g., 2026 - 5 = 2021 (inclusive)

for (const repository of repositories) {
  if (!repository_stats[repository.dirname]) continue;
  
  try {
    const summary_file = `../public/data/${repository.dirname}/organizations_summary_commit_yearly_both.json`;
    const org_data = JSON.parse(await fs.readFile(summary_file, "utf8"));
    const org_totals = {};

    for (const [org, years] of Object.entries(org_data)) {
      if (org === "Unknown") continue;
      let total = 0;
      for (const [year_str, count] of Object.entries(years)) {
        if (parseInt(year_str) >= min_year) {
          total += count;
        }
      }
      if (total > 0) {
        org_totals[org] = total;
      }
    }

    const org_entries = Object.entries(org_totals);
    org_entries.sort((a, b) => b[1] - a[1]);
    repository_stats[repository.dirname].top_organizations = org_entries.slice(0, 3).map(e => e[0]);
  } catch (e) {
    console.log(`Could not process top organizations for ${repository.dirname}`);
  }
}

await fs.writeFile(
  `../public/data/repositories_stats.json`,
  JSON.stringify(repository_stats, null, 2)
);
