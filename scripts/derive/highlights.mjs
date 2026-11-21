// Derives the highlights of the home page from the Chromium summaries: a few
// facts about the last complete month and quarter.
//
// Usage: node scripts/derive-highlights.mjs [dir=public/data]
//
// Writes <dir>/highlights.json:
//   {
//     "month": "2026-09",
//     "commits": <commits in month>,
//     "previous_commits": <commits in the month before>,
//     "contributors": <authors in month>,
//     "newcomers": <authors whose first commit is in month>,
//     "top_authors": [[<username>, <commits>], ...],
//     "top_reviewers": [[<username>, <reviews>], ...],
//     "quarter": "2026Q3",
//     "top_organizations": [[<organization>, <commits>], ...]
//   }

import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || 'public/data';
const repository = 'chromium';
const TOP = 5;

const read = file =>
  JSON.parse(fs.readFileSync(path.join(dir, repository, file), 'utf8'));

// The last period of `periods` that is over: the current one is skipped.
const lastComplete = (periods, current) =>
  [...periods].sort().filter(period => period < current).at(-1);

const now = new Date();
const current_month = now.toISOString().slice(0, 7);
const current_quarter = `${now.getUTCFullYear()}Q${Math.floor(now.getUTCMonth() / 3) + 1}`;

// {username: {month: count}}
const authors = read('usernames_summary_commit_monthly_author.json');
const reviewers = read('usernames_summary_commit_monthly_review.json');

const months = new Set();
for (const by_month of Object.values(authors)) {
  for (const month in by_month) {
    months.add(month);
  }
}
const month = lastComplete(months, current_month);
const previous_month = lastComplete(months, month);

const top = (by_user, period) => Object.entries(by_user)
  .map(([user, by_period]) => [user, by_period[period] || 0])
  .filter(([user, count]) => user && count > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP);

let commits = 0;
let previous_commits = 0;
let contributors = 0;
let newcomers = 0;
for (const by_month of Object.values(authors)) {
  commits += by_month[month] || 0;
  previous_commits += by_month[previous_month] || 0;
  if (by_month[month]) {
    contributors++;
    if (Object.keys(by_month).sort()[0] === month) {
      newcomers++;
    }
  }
}

// {organization: {quarter: count}}
const organizations = read('organizations_summary_commit_quarterly_author.json');
const quarters = new Set();
for (const by_quarter of Object.values(organizations)) {
  for (const quarter in by_quarter) {
    quarters.add(quarter);
  }
}
const quarter = lastComplete(quarters, current_quarter);
delete organizations.Unknown;

const highlights = {
  month,
  commits,
  previous_commits,
  contributors,
  newcomers,
  top_authors: top(authors, month),
  top_reviewers: top(reviewers, month),
  quarter,
  top_organizations: top(organizations, quarter),
};

fs.writeFileSync(path.join(dir, 'highlights.json'), JSON.stringify(highlights));
console.log('highlights:', JSON.stringify(highlights));
