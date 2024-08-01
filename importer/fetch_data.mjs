import * as filesystem from 'fs';
import JSON5 from 'json5';
import core from '@actions/core';
import statusLine from '@alt-jero/status-line';
import {Octokit} from 'octokit';
import {mailMap} from './mailmap.mjs';
import {throttling} from '@octokit/plugin-throttling';

const fs = filesystem.promises;

const AuthToken = async () => {
  try {
    return await fs.readFile('.token', 'utf8');
  } catch (e) {
  }

  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  if (process.env.TOKEN) {
    return process.env.TOKEN;
  }
};

const MyOctokit = Octokit.plugin(throttling);
const octokit = new MyOctokit({
  auth: await AuthToken(),
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      statusLine.error(
        `Request quota exhausted for request ${options.method} ${options.url}`,
      );

      if (retryCount < 10) {
        statusLine.error(
          `Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      statusLine.error(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
      );
    },
  },
});

// Skip sbots and automated commit:
const g_bot_patterns = [
  '+robot',
  '-bot',
  'autoroll',
  'buildbot',
  'chrome-',
  'commit-queue',
  'github-actions',
  'gserviceaccount',
  'mdb.',
  'rebaseline',
  'release',
  'roller',
  'wptsync',
  'none@none',
  'css21testsuite',
];

const IsEmailValid = email => {
  if (g_bot_patterns.some(pattern => email.includes(pattern))) {
    return false;
  }

  // Skip authors with no emails.
  if (email.indexOf('@') == -1) {
    return false
  }

  return true;
};

const ProcessCommit = (data, commit) => {
  // Skip merge commits:
  if (commit.parents.totalCount > 1) {
    return "skipped";
  }

  const email = commit.author.email;
  if (!IsEmailValid(email)) {
    return "invalid email";
  }

  const author = mailMap(email);
  const date = commit.committedDate;
  const reviewers = [];

  // Parse reviewers:
  for (const line of commit.messageBody.split('\n')) {
    if (!line.startsWith('Reviewed-by:')) {
      continue;
    }
    const a = line.indexOf('<');
    const b = line.indexOf('>');
    if (a == -1 || b == -1) {
      continue;
    }
    const reviewer = mailMap(line.substring(a + 1, b));
    if (!IsEmailValid(reviewer)) {
      continue;
    }

    // Ignore self-review:
    //
    // This often happen when the author clicked CR: +1 on their own CL instead
    // of CQ: +1. This is a common mistake and we should ignore it.
    //
    // Preferring "authored" commits over "reviewed" commits is a good
    // heuristic, because it provides the following invariant:
    // The sum of everyone's "authored" commits is equal to the sum of commit.
    //
    // https://github.com/ArthurSonzogni/ChromeCommitTracker/issues/7
    if (author == reviewer) {
      continue;
    }

    reviewers.push(reviewer);
  }

  data[author] ||= [];


  if (data[author].some(commit => commit.date === date)) {
    return "duplicate";
  }

  data[author].push({
    'date': date,
    'kind': 'author',
    'peers': reviewers,
    'additions': commit.additions,
    'deletions': commit.deletions,
    'files': commit.changedFilesIfAvailable,
  });

  reviewers.forEach(reviewer => {
    data[reviewer] ||= [];
    data[reviewer].push({
      'date': date,
      'kind': 'review',
      'peers': [author],
      'additions': commit.additions,
      'deletions': commit.deletions,
      'files': commit.changedFilesIfAvailable,
    });
  });

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

  const SaveDataForRepository = async() => {
    // Write emails:
    await fs.writeFile(
      `${repository_dir}/emails.json`,
      JSON.stringify(Object.keys(data).sort(), null, 1));

    // Write email data:
    for (const email in data) {
      const email_file = `${emails_dir}/${email}.json`;

      // Remove duplicated commits.
      const map = new Map();
      for(const commit of data[email]) {
        // See https://github.com/ArthurSonzogni/ChromeCommitTracker/issues/7
        // The database is currently polluted with duplicate commits where
        // "reviewed" commits were preferred over "authored" commits. This
        // allows the next full import to fix the database.
        const preexisting = map.get(commit.date);
        if (!preexisting || preexisting.kind == 'review') {
          map.set(commit.date, commit);
        }
      }
      data[email] = Array.from(map.values()).sort((a,b) => a.date > b.date);

      await fs.writeFile(email_file, JSON.stringify(data[email], null, 1));
    }
  }

  let cursor = null;
  let hasNextPage = true;
  let index = 0;
  let duplicate = 0;
  let retry_total = 0;

  while(hasNextPage && duplicate<10) {
    if (index % 10000 == 0) {
      statusLine.logString(`Repo: ${repository.dirname} ${index}`);
    }
    for(let retry = 0; retry < 5; ++retry) {
      try {
        const startTime = Date.now();
        const response = await octokit.graphql(`
          query GetCommit($cursor: String,
                          $owner: String!,
                          $name: String!,
                          $path: String)
          {
            repository(owner: $owner, name: $name) {
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(
                      path: $path
                      first: 100,
                      after: $cursor
                    ) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      edges {
                        node {
                          ... on Commit {
                            abbreviatedOid
                            messageBody
                            committedDate
                            author {
                              email
                            }
                            additions
                            deletions
                            changedFilesIfAvailable
                            parents {
                              totalCount
                            }
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
          }
        );
        const endTime = Date.now();
        const delay = endTime - startTime;

        const history = response.repository.defaultBranchRef.target.history;

        for (const edge of history.edges) {
          await new Promise(r => setTimeout(r, 3));
          index++;
          let commit = edge.node
          const result = ProcessCommit(data, commit);
          statusLine(`${index} ${commit.committedDate} ${commit.abbreviatedOid} ${delay} ${result}`);

          if (result == "duplicate") {
            duplicate++;
          }
        }
        const pageInfo = history.pageInfo;
        hasNextPage = history.pageInfo.hasNextPage;
        cursor = history.pageInfo.endCursor;

        break;
      } catch (error) {
        console.log(JSON.stringify(error, null, 2));
        await SaveDataForRepository();
        statusLine.logString(`Error`)
        const waitTime = 2 ** retry; // Exponential backoff
        statusLine.error(`Waiting for ${waitTime} seconds`);
        await new Promise(r => setTimeout(r, waitTime * 1000));

        retry_total++;
      }

      if (repository.name == 'SwiftShader') {
        statusLine.error(`SwiftShader is known to have weird issues. Skipping.`);
        hasNextPage = false;
        break;
      }

      if (retry_total > 100) {
        statusLine.error(`Too many retries. Skipping.`);
        hasNextPage = false;
        break;
      }
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

for (const repository of file_json) {
  await ProcessRepository(repository);
}
