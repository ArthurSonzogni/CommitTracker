import core from "@actions/core";
import github from "@actions/github";
import * as filesystem from "fs";

const fs = filesystem.promises;
const token = "none"
const octokit = new github.getOctokit(token);

// const first_commit_hash = "a5068f5fa11005232bc4383c54f6af230f9392fb";
const first_commit_hash = "c14d891d44f0afff64e56ed7c9702df1d807b1ee";

const last_file = "../static/data/last.json";
const user_file = "../static/data/users.json";
const user_dir = "../static/data/users";

const writeUsers = async (users) => {
  await fs.writeFile(user_file, JSON.stringify(users));
};

const readUsers = async () => {
  try {
    const users = await fs.readFile(user_file, "utf8");
    return JSON.parse(users);
  } catch (error) {
    writeUsers([]);
    return [];
  }
};

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

const writeLastSha = async (last_sha) => {
  console.log("writeLastSha", last_sha);
  await fs.writeFile(last_file, JSON.stringify({sha:last_sha}));
};

const readLastSha = async () => {
  try {
    const last_sha = await fs.readFile(last_file, "utf8");
    console.log(last_sha);
    return JSON.parse(last_sha).sha;
  } catch (error) {
    const last_sha = first_commit_hash;
    writeLastSha(last_sha);
    return last_sha;
  }
}

const main = async () => {
  const last_sha = await readLastSha();
  let sha = "main"
  let new_last_sha = last_sha;

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

  try {
    let max_page = 1000;
    process:
    while (true) {
      max_page--;
      if (max_page <= 0) {
        break process;
      }
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/commits",
        {
          owner: "chromium",
          repo: "chromium",
          sha: sha,
          per_page: 100,
        }
      );

      for (const commit of response.data) {
        if (sha === "main") {
          new_last_sha = commit.sha;
        }

        console.log(commit.sha, last_sha, (commit.sha === last_sha));
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

        // Skip authors with no emails.
        const email = commit.commit.author.email;
        if (email.indexOf("@") == -1) {
          continue;
        }

        const author = email.substring(0, email.indexOf("@"));
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
            const reviewer = line.substring(a + 1, b);
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

  await save();
};

// Call the main function to run the action
main();
