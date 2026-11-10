import * as filesystem from 'fs';
import JSON5 from 'json5';
import statusLine from '@alt-jero/status-line';
import {mailMap} from './mailmap.mjs';
import {octokit} from './octokit.mjs';
import {IsEmailValid} from './is_email_valid.mjs';
import {ParseReviewers, ParsePhabricatorReviewers} from './parse_reviewers.mjs';

const fs = filesystem.promises;

// The approvers of the pull request merged as this commit, as GitHub noreply
// emails. They are resolved to the reviewers' commit emails when deriving the
// data, using logins.json.
const GitHubReviewers = (commit) => {
  const reviewers = [];
  for (const pr of commit.associatedPullRequests?.nodes || []) {
    if (!pr.merged) {
      continue;
    }
    for (const review of pr.reviews.nodes) {
      if (review.author?.__typename !== 'User') {
        continue;
      }
      const login = review.author.login.toLowerCase();
      if (login === commit.author.user?.login.toLowerCase()) {
        continue;
      }
      const reviewer = mailMap(`${login}@users.noreply.github.com`);
      if (IsEmailValid(reviewer)) {
        reviewers.push(reviewer);
      }
    }
  }
  return reviewers;
};

const ProcessCommit = (data, logins, commit, repository) => {
  const github = repository.reviewers === 'github';
  // Skip merge commits:
  if (commit.parents.totalCount > 1) {
    return "skipped";
  }

  // Commit from the WPT repository in Gecko are authored by the original
  // author, but committed by the wptsync bot.
  //
  // Note that other repositories like Chromium have all of their commit
  // committed by a bot, so we can't just exclude all commits from a bot.
  if (
    (repository.dirname === 'firefox' || repository.dirname === 'spidermonkey') &&
    commit.committer.email.includes('wptsync')
  ) {
    return "wptsync";
  }

  const author = mailMap(commit.author.email);
  if (author === 'deleted' || !IsEmailValid(author)) {
    return "invalid email";
  }
  if (commit.author.user?.login) {
    logins[author] = commit.author.user.login.toLowerCase();
  }
  const date = commit.committedDate;
  // Abbreviated here rather than by GitHub, whose abbreviations may grow
  // with the repository. It identifies the commit together with its date.
  const sha = commit.oid.slice(0, 7);
  // Ignore self-review:
  //
  // This often happen when the author clicked CR: +1 on their own CL instead
  // of CQ: +1. This is a common mistake and we should ignore it.
  //
  // Preferring "authored" commits over "reviewed" commits is a good
  // heuristic, because it provides the following invariant:
  // The sum of everyone's "authored" commits is equal to the sum of commit.
  //
  // https://github.com/ArthurSonzogni/CommitTracker/issues/7
  const reviewers = [...new Set([
    ...ParseReviewers(commit.messageBody),
    ...(github ? GitHubReviewers(commit) : []),
    ...(github ? ParsePhabricatorReviewers(commit.messageBody) : []),
  ])].filter(reviewer => reviewer != author &&
    reviewer != `${logins[author]}@users.noreply.github.com`);

  data[author] ||= [];

  const new_commit = {
    'date': date,
    'kind': 'author',
    'peers': reviewers,
    'additions': commit.additions,
    'deletions': commit.deletions,
    'files': commit.changedFilesIfAvailable,
    'sha': sha,
  };

  // The entry of this commit among the ones of a developer, if any. A commit
  // is identified by its hash: several can share a date, e.g. the commits of
  // a pull request merged by rebasing.
  //
  // The entries imported before the hashes were recorded have none, and a
  // single one was kept per date. The one of the same size is this commit: it
  // takes its hash.
  const FindEntry = (entries, kind) => {
    let legacy = null;
    for (const entry of entries) {
      if (entry.date != date || entry.kind != kind) {
        continue;
      }
      if (entry.sha == sha) {
        return entry;
      }
      if (!entry.sha && !legacy &&
        entry.additions == commit.additions &&
        entry.deletions == commit.deletions &&
        entry.files == commit.changedFilesIfAvailable) {
        legacy = entry;
      }
    }
    if (legacy) {
      legacy.sha = sha;
    }
    return legacy;
  };

  const AddReview = (reviewer) => {
    data[reviewer] ||= [];
    if (FindEntry(data[reviewer], 'review')) {
      return;
    }
    data[reviewer].push({
      'date': date,
      'kind': 'review',
      'peers': [author],
      'additions': commit.additions,
      'deletions': commit.deletions,
      'files': commit.changedFilesIfAvailable,
      'sha': sha,
    });
  };

  // Skip duplicated commits. Their reviewers are still merged in, to backfill
  // the reviews of the commits imported before they were fetched.
  const existing = FindEntry(data[author], 'author');
  if (existing) {
    const missing = reviewers.filter(reviewer => !existing.peers.includes(reviewer));
    if (missing.length > 0) {
      existing.peers = [...existing.peers, ...missing];
    }
    // Also stamp the hash onto existing review entries on an in-place backfill.
    reviewers.forEach(AddReview);
    return "duplicate";
  }

  data[author].push(new_commit);
  reviewers.forEach(AddReview);

  return "success";
};


const ProcessRepository = async (repository) => {
  statusLine.logString(`-----`)
  statusLine.logString(`Processing ${repository.dirname}`);

  const repository_dir = `../public/data/${repository.dirname}`;
  const last_file = `${repository_dir}/last.json`;
  const emails_dir = `${repository_dir}/emails`;
  const emails_file = `${repository_dir}/emails.json`;

  // Setup the directory structures, in case this is the first time we are
  // running this.
  await fs.mkdir(repository_dir, {recursive: true});
  await fs.mkdir(emails_dir, {recursive: true});

  // Check if the emails.json file exists. If it doesn't, we won't try to abort
  // after a certain number of duplicates.
  const prexisting = await fs.stat(emails_file)
    .then(() => true)
    .catch(() => false);

  // Populate data from the current database -----------------------------------
  const emails = async () => {
    try {
      const data = await fs.readFile(emails_file, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.log(e);
      return [];
    }
  };

  const email_data = async (email) => {
    try {
      const data = await fs.readFile(`${emails_dir}/${email}.json`, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  };

  const data = {};
  for (const email of await emails()) {
    data[email] = await email_data(email);
  }

  // Email -> GitHub login of the commit authors.
  const logins_file = `${repository_dir}/logins.json`;
  const logins = await fs.readFile(logins_file, 'utf8')
    .then(JSON.parse)
    .catch(() => ({}));

  const SaveDataForRepository = async() => {
    // Write emails:
    await fs.writeFile(
      `${repository_dir}/emails.json`,
      JSON.stringify(Object.keys(data).sort(), null, 1));

    // Write logins:
    await fs.writeFile(logins_file, JSON.stringify(
      Object.fromEntries(Object.entries(logins).sort()), null, 1));

    // Write email data:
    for (const email in data) {
      const email_file = `${emails_dir}/${email}.json`;

      // Remove duplicated commits. A commit is identified by its hash, and
      // the entries imported before the hashes were recorded by their date.
      const authored = new Set(data[email]
        .filter(commit => commit.kind == 'author')
        .map(commit => commit.date));
      const map = new Map();
      for(const commit of data[email]) {
        // See https://github.com/ArthurSonzogni/CommitTracker/issues/7
        // The database is currently polluted with duplicate commits where
        // "reviewed" commits were preferred over "authored" commits. This
        // allows the next full import to fix the database.
        if (!commit.sha && commit.kind == 'review' &&
          authored.has(commit.date)) {
          continue;
        }
        const key = commit.sha ? `${commit.date} ${commit.sha}` : commit.date;
        const preexisting = map.get(key);
        if (!preexisting || preexisting.kind == 'review') {
          map.set(key, commit);
        }
      }
      data[email] = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

      await fs.writeFile(email_file, JSON.stringify(data[email], null, 1));
    }
  }

  let cursor = null;
  let hasNextPage = true;
  let index = 0;
  let duplicate = 0;
  let retry_total = 0;

  let max_duplicate = prexisting ? 30 : 1000000000;
  // --since=<date> refetches every commit since the date, e.g. to backfill
  // the GitHub reviews or logins of the commits already imported.
  // --logins-only refetches the whole history quickly, without the pull
  // requests, to backfill the GitHub logins of the older commits.
  if (since || logins_only) {
    max_duplicate = 1000000000;
  }

  // The GitHub pull request reviews are slow to resolve: smaller pages avoid
  // the timeouts.
  const github_reviews = repository.reviewers === 'github' && !logins_only;
  const page_size = github_reviews ? 25 : 100;
  const pull_requests = github_reviews ? `
                            associatedPullRequests(first: 1) {
                              nodes {
                                merged
                                reviews(first: 50,
                                        states: [APPROVED, CHANGES_REQUESTED]) {
                                  nodes {
                                    author {
                                      __typename
                                      login
                                    }
                                  }
                                }
                              }
                            }` : '';
  let pages = 0;

  while(hasNextPage && duplicate<max_duplicate) {
    if (index % 10000 == 0) {
      statusLine.logString(`Repo: ${repository.dirname} ${index}`);
    }
    // Checkpoint the long imports.
    if (++pages % 200 == 0) {
      await SaveDataForRepository();
    }
    let succeeded = false;
    for(let retry = 0; retry < 5; ++retry) {
      try {
        const startTime = Date.now();
        const response = await octokit.graphql(`
          query GetCommit($cursor: String,
                          $owner: String!,
                          $name: String!,
                          $path: String,
                          $since: GitTimestamp)
          {
            repository(owner: $owner, name: $name) {
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(
                      path: $path
                      first: ${page_size},
                      after: $cursor
                      since: $since
                    ) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      edges {
                        node {
                          ... on Commit {
                            oid
                            messageBody
                            committedDate
                            committer {
                              email
                            }
                            author {
                              email
                              user {
                                login
                              }
                            }
                            additions
                            deletions
                            changedFilesIfAvailable
                            parents {
                              totalCount
                            }${pull_requests}
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          `,
          {
            cursor: cursor,
            owner: repository.owner,
            name: repository.repository,
            path: repository.cone,
            since: since,
          }
        );
        const endTime = Date.now();
        const delay = endTime - startTime;

        const history = response.repository.defaultBranchRef.target.history;

        for (const edge of history.edges) {
          index++;
          let commit = edge.node
          const result = ProcessCommit(data, logins, commit, repository);
          statusLine(`${index} ${commit.committedDate} ${commit.oid.slice(0, 7)} ${delay} ${result}`);

          if (result == "duplicate") {
            duplicate++;
          }
        }
        const pageInfo = history.pageInfo;
        hasNextPage = history.pageInfo.hasNextPage;
        cursor = history.pageInfo.endCursor;

        succeeded = true;
        break;
      } catch (error) {
        console.log(error);
        console.log(JSON.stringify(error, null, 2));
        await SaveDataForRepository();
        statusLine.logString(`Error`)
        const waitTime = 2 ** retry; // Exponential backoff
        statusLine.error(`Waiting for ${waitTime} seconds`);
        await new Promise(r => setTimeout(r, waitTime * 1000));

        retry_total++;
      }

      if (retry_total > 100) {
        statusLine.error(`Too many retries. Skipping.`);
        hasNextPage = false;
        break;
      }
    }

    if (!succeeded && repository.name == 'SwiftShader') {
      statusLine.error(`SwiftShader is known to have weird issues. Skipping.`);
      hasNextPage = false;
    }
  }

  statusLine.logString(`Repo: ${repository.dirname} ${index}`);
  await SaveDataForRepository();
};

await fs.mkdir('../public/data', {recursive: true});
const file_content = await fs.readFile('../repositories.json5', 'utf8');
const file_json = JSON5.parse(file_content);
await fs.writeFile(
    '../public/data/repositories.json', JSON.stringify(file_json, null, 2));

// Usage: node fetch_data.mjs [repository] [--since=<ISO date>] [--logins-only]
const args = process.argv.slice(2);
const logins_only = args.includes('--logins-only');
const targetRepo = args.find(arg => !arg.startsWith('--'));
const since_arg = args.find(arg => arg.startsWith('--since='));
const since = since_arg &&
  new Date(since_arg.slice('--since='.length)).toISOString();
if ((since || logins_only) && !targetRepo) {
  throw new Error('--since and --logins-only require a repository');
}
for (const repository of file_json) {
  if (targetRepo && repository.dirname !== targetRepo) continue;
  await ProcessRepository(repository);
}
