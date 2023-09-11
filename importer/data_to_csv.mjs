import * as filesystem from "fs";
const fs = filesystem.promises;

const repositories_file = "../static/data/repositories.json";

const date_min = new Date("2000-01-01");
const date_max = new Date("2024-01-01");

async function Main() {
  const repositories = JSON.parse(await fs.readFile(repositories_file, "utf8"));
  const output = {};
  for (const repository of repositories) {
    await ProcessRepository(repository, output);
  }

  // Delete users with no reviewers
  for(const user in output) {
    if (Object.keys(output[user]).length === 0) {
      delete output[user];
    }
  }

  // Print it out for gephi:
  console.log("Source,Target,Weight")
  for(const user in output) {
    for(const reviewer in output[user]) {
      console.log(`${user},${reviewer},${output[user][reviewer]}`);
    }
  }
}

async function ProcessRepository(repository, output) {
  const user_file = `../static/data/${repository.dirname}/users.json`;
  const user_dir = `../static/data/${repository.dirname}/users`;
  const users = JSON.parse(await fs.readFile(user_file, "utf8"));

  for(const user of users) {
    output[user] ||= {};

    const json = await fs.readFile(`${user_dir}/${user}.json`, "utf8")
    const data = JSON.parse(json)
    for(const time in data.author) {

      if (new Date(time) < date_min) continue;
      if (new Date(time) > date_max) continue;

      for(const reviewer of data.author[time]) {
        output[user][reviewer] ||= 0;
        output[user][reviewer] ++;
      }
    }
  }
}

// Call the Main function to run the action
Main();
