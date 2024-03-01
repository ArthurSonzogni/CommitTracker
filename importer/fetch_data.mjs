import * as filesystem from "fs";
import core from "@actions/core";
import statusLine from "@alt-jero/status-line";
import { Octokit } from "octokit";
import { mailMap } from "./mailmap.mjs";
import { throttling } from "@octokit/plugin-throttling";
import JSON5 from "json5";

const fs = filesystem.promises;

const AuthToken = () => {
  try {
    return fs.readFile(".token", "utf8");
  } catch(e) {}

  return process.env.TOKEN;
};

const OctokitWithThrottling = Octokit.plugin(throttling);
const octokit = new OctokitWithThrottling({
  auth: AuthToken(),
  onRateLimit: (retryAfter, options) => {
    console.warn("Request quota exhausted");
    console.warn("retryAfter:", retryAfter);
    console.warn("options:", JSON.stringify(options, null, 2));
    if (options.request.retryCount === 0) {
      console.warn(`Retrying after ${retryAfter} seconds!`);
      return true;
    }

  },
  onAbuseLimit: (retryAfter, options) => {
    console.warn(`Abuse detected for request ${options.method} ${options.url}`);
  },
});

const isEmailValid = (() => {
  // Skip sbots and automated commit:
  const bot_patterns = [
    "gserviceaccount",
    "+robot",
    "-bot",
    "autoroll",
    "buildbot",
    "chrome-",
    "commit-queue",
    "mdb.",
    "rebaseline",
    "roller",
  ];

  return (email) => {
    if (bot_patterns.some(pattern => email.includes(pattern))) {
      return false;
    }

    // Skip authors with no emails.
    if (email.indexOf("@") == -1) {
      return false
    }

    return true;
  }
})();


const processRepository = async (repository) => {
  statusLine.logString(`Processing ${repository.dirname}`);

  const repository_dir = `../static/data/${repository.dirname}`;

  // Setup the directory structures, in case this is the first time we are
  // running this.
  await fs.mkdir(repository_dir, { recursive: true });

  const last_file = `${repository_dir}/last.json`;
  const emails_file = `${repository_dir}/emails.json`;
  const emails_dir = `${repository_dir}/emails`;

  // Write emails to database. This is a list of all emails that have ever
  // contributed to the repository.
  const writeEmails = async (emails) => {
    await fs.writeFile(emails_file, JSON.stringify(emails, null, 1));
  };

  // Read emails from database. This is a list of all emails that have ever
  // contributed to the repository.
  const readEmails = async () => {
    try {
      const emails = await fs.readFile(emails_file, "utf8");
      return JSON.parse(emails);
    } catch (error) {
      writeEmails([]);
      return [];
    }
  };

  // Read email data from database. This is all the informations we can gather
  // about one particular email.
  const readEmail = async email => {
    try {
      const data = await fs.readFile(`${emails_dir}/${email}.json`, "utf8");
      return JSON.parse(data);
    } catch (error) {
      return {
        author: {},
        review: {},
      }
    }
  }

  // Read last sha from database. This is the last commit that was processed.
  const readLastSha = async () => {
    try {
      const file = await fs.readFile(last_file, "utf8");
      const json = JSON.parse(file);
      return json;
    } catch (error) {
      return {};
    }
  }

  // Setup the directory structures:
  await fs.mkdir(emails_dir, { recursive: true });

  const data = {};

  const emails = new Set();
  const addEmail = (email) => {
    if (emails.has(email)) {
      return;
    }
    emails.add(email);
    data[email] = {
      author: {},
      review: {},
    };
  };

  // Read all the emails from database.
  for(const email of await readEmails()) {
    addEmail(email);
    data[email] = await readEmail(email);
  }

  const last_sha = await readLastSha();
  let new_last_sha = structuredClone(last_sha);

  const save = async () => {
    // Write emails.
    Object.keys(data).forEach((email) => emails.add(email));
    writeEmails(Array.from(emails).sort());

    // Write email data:
    for (const email of emails) {
      await fs.writeFile(`${emails_dir}/${email}.json`,
        JSON.stringify(data[email], null, 1));
    }
  };

  for(const start of repository.branches) {
    let sha = start;

    if (last_sha[start] == start) {
      continue
    }

    try {
      let first = true;

      const params = {
        owner: repository.owner,
        repo: repository.repository,
        sha,
        per_page : 100,
      }

      if (repository.cone) {
        params.path = repository.cone;
      }

      const iterator = octokit.paginate.iterator(
        "GET /repos/{owner}/{repo}/commits", params);

      let index  = 0;
      process:
      for await (const response of iterator) {
        for (const commit of response.data) {
          // Rate limit to 1,000 requests per hour to avoid getting quota
          // exhausted.
          await new Promise(r => setTimeout(r, 37));

          if (first) {
            first = false;
            new_last_sha[start] = commit.sha;
            await fs.writeFile(last_file, JSON.stringify(new_last_sha, null, 2));
          }

          index += 1;
          statusLine(`${index} ${commit.commit.author.date} ${commit.sha}`);
          if (commit.sha === last_sha[start]) {
            console.log("Break after finding last sha");
            break process;
          }

          sha = commit.sha;

          // Skip merge commits:
          if (commit.parents.length > 1) {
            continue;
          }

          const email = commit.commit.author.email;
          if (!isEmailValid(email)) {
            continue;
          }

          const author = mailMap(email);
          addEmail(author)

          const date = commit.commit.author.date;
          const reviewers = [];

          // Parse reviewers:
          for (const line of commit.commit.message.split("\n")) {
            if (!line.startsWith("Reviewed-by:")) {
              continue;
            }
            const a = line.indexOf("<");
            const b = line.indexOf(">");
            if (a == -1 || b == -1) {
              continue;
            }
            const reviewer = mailMap(line.substring(a + 1, b));
            if (!isEmailValid(reviewer)) {
              continue;
            }
            addEmail(reviewer);

            data[reviewer].review[date] = author;
            reviewers.push(reviewer);
          }
          data[author].author[date] = reviewers;
        }
      }
    } catch (error) {
      statusLine.error(error);
    }
  }

  await save();
};

await fs.mkdir("../static/data", { recursive: true });
const file_content = await fs.readFile("../repositories.json5", "utf8");
const file_json = JSON5.parse(file_content);
await fs.writeFile("../static/data/repositories.json",
  JSON.stringify(file_json, null, 2));

for (const repository of file_json) {
  await processRepository(repository);
}
