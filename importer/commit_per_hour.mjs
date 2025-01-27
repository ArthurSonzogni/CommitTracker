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
for (const repository of repositories) {
  statusLine(`Processing ${repository.dirname} for commits per hour.`);
  const repository_dir = `../public/data/${repository.dirname}`;
  const emails_filename = `${repository_dir}/emails.json`;
  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));

  const dates = new Set();

  for (const email of emails) {
    const email_filename = `${repository_dir}/emails/${email}.json`;
    const email_data = JSON.parse(await fs.readFile(email_filename, "utf8"));
    for (const commit of email_data) {
      dates.add(commit.date);
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
