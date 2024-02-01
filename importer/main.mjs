import core from "@actions/core";
import github from "@actions/github";
import { mailMap } from "./mailmap.mjs";
import * as filesystem from "fs";

const fs = filesystem.promises;
const token = process.env.github_token;
const octokit = new github.getOctokit(token);

const processRepository = async (repository) => {

  const repository_dir = `../static/data/${repository.dirname}`;

  // Setup the directory structures, in case this is the first time we are
  // running this.
  await fs.mkdir(repository_dir, { recursive: true });

  const last_file = `${repository_dir}/last.json`;
  const user_file = `${repository_dir}/users.json`;
  const user_dir = `${repository_dir}/users`;

  // Write users to database. This is a list of all users that have ever
  // contributed to the repository.
  const writeUsers = async (users) => {
    await fs.writeFile(user_file, JSON.stringify(users));
  };

  // Read users from database. This is a list of all users that have ever
  // contributed to the repository.
  const readUsers = async () => {
    try {
      const users = await fs.readFile(user_file, "utf8");
      return JSON.parse(users);
    } catch (error) {
      writeUsers([]);
      return [];
    }
  };

  // Read user data from database. This is all the informations we can gather
  // about one particular user.
  const readUser = async user => {
    try {
      const data = await fs.readFile(`${user_dir}/${user}.json`, "utf8");
      return JSON.parse(data);
    } catch (error) {
      return {
        author: {},
        review: {},
      }
    }
  }

  // Write last sha to database. This is the last commit that was processed.
  // This is used to resume the process.
  const writeLastSha = async (last_sha) => {
    console.log("writeLastSha", last_sha);
    await fs.writeFile(last_file, JSON.stringify({sha:last_sha}));
  };

  // Read last sha from database. This is the last commit that was processed.
  const readLastSha = async () => {
    try {
      const last_sha = await fs.readFile(last_file, "utf8");
      console.log(last_sha);
      return JSON.parse(last_sha).sha;
    } catch (error) {
      const last_sha = repository.first_commit_hash;
      writeLastSha(last_sha);
      return last_sha;
    }
  }

  // Setup the directory structures:
  await fs.mkdir(user_dir, { recursive: true });

  const data = {};

  const users = new Set();
  const addUser = (developer) => {
    if (users.has(developer)) {
      return;
    }
    users.add(developer);
    data[developer] = {
      author: {},
      review: {},
    };
  };

  // Read users from database.
  for(const user of await readUsers()) {
    addUser(user);
    data[user] = await readUser(user);
  }

  const last_sha = await readLastSha();
  let new_last_sha = last_sha;

  const save = async () => {
    // Write users.
    Object.keys(data).forEach((user) => users.add(user));
    writeUsers(Array.from(users).sort());

    // Write user data:
    for (const user of users) {
      await fs.writeFile(
        `${user_dir}/${user}.json`,
        JSON.stringify(data[user])
      );
    }

    writeLastSha(new_last_sha);
  };

  for(const head of [
    repository.head,
  ]) {
    let sha = head;

    try {
      let max_page = 5000;
      let index = 0;
      process:
      while (true) {
        max_page--;
        if (max_page <= 0) {
          break process;
        }
        const params = {
          owner: repository.owner,
          repo: repository.repository,
          sha: sha,
          per_page: 100,
        }
        if (repository.cone) {
          params.path = repository.cone;
        }
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/commits", params);

        for (const commit of response.data) {
          if (sha === repository.head) {
            new_last_sha = commit.sha;
          }

          index += 1;
          console.log(index, commit.sha, last_sha, (commit.sha === last_sha));
          if (commit.sha === last_sha) {
            break process;
          }

          if (commit.parents.length == 0) {
            break process;
          }
          sha = commit.parents[0].sha;

          // Skip automated commits.
          if (commit.commit.author.email.includes("gserviceaccount")) {
            continue;
          }

          // Skip some bots:
          if (commit.commit.author.email.includes("roller") ||
            commit.commit.author.email.includes("autoroll") ||
            commit.commit.author.email.includes("mdb.") ||
            commit.commit.author.email.includes("chrome-") ||
            commit.commit.author.email.includes("rebaseline") ||
            commit.commit.author.email.includes("-bot") ||
            commit.commit.author.email.includes("+robot") ||
            commit.commit.author.email.includes("buildbot") ||
            commit.commit.author.email.includes("commit-queue")) {
            continue;
          }

          // Skip authors with no emails.
          const email = commit.commit.author.email;
          if (email.indexOf("@") == -1) {
            continue;
          }

          const author = mailMap(email.substring(0, email.indexOf("@")));
          addUser(author);

          const date = commit.commit.author.date;
          const reviewers = [];

          // Parse reviewers:
          for (const line of commit.commit.message.split("\n")) {
            if (line.startsWith("Reviewed-by:")) {
              const a = line.indexOf("<");
              const b = line.indexOf("@");
              if (a == -1 || b == -1) {
                continue;
              }
              const reviewer = mailMap(line.substring(a + 1, b));
              addUser(reviewer);
              data[reviewer].review[date] = author;
              reviewers.push(reviewer);
            }
          }
          data[author].author[date] = reviewers;
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  await save();
};

const main = async () => {
  const file_content = await fs.readFile("../static/repositories.json", "utf8");
  await fs.writeFile("../static/data/repositories.json", file_content);

  for (const repository of JSON.parse(file_content)) {
    await processRepository(repository);
  }
}

// Call the main function to run the action
main();
