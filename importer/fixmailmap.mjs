import { mailMap } from './mailmap.mjs';
import * as filesystem from 'fs';

const fs = filesystem.promises;

// Function to check if a file exists asynchronously
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true; // File exists
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // File does not exist
    }
    throw err; // Other error occurred
  }
}


const processRepository = async (repository) => {
  console.log(`-- Processing ${repository.dirname}`);

  // Read all the users of the repository:
  const users_filename = `../static/data/${repository.dirname}/users.json`;
  const users = JSON.parse(await fs.readFile(users_filename, "utf8"));

  // If the user requested to mail their username to a different one, we need to
  // merge the data from the old username to the new one.
  for(const user of users) {
    if (user === mailMap(user)) {
      continue;
    }
    console.log(`---- Merging ${user} into ${mailMap(user)}`);

    const old_file = `../static/data/${repository.dirname}/users/${user}.json`;
    const new_file = `../static/data/${repository.dirname}/users/${mailMap(user)}.json`;

    if (!await checkFileExists(new_file)) {
      console.log(`------ ${user}.json does not exist, renaming ${user}.json to ${mailMap(user)}.json`);
      await fs.rename(old_file, new_file);
      continue;
    }

    console.log(`------ ${user}.json exists, merging it into ${mailMap(user)}.json`);

    const old_data = JSON.parse(await fs.readFile(old_file, "utf8"));
    const new_data = JSON.parse(await fs.readFile(new_file, "utf8"));

    // Merge author data:
    for (const [key, value] of Object.entries(old_data.author)) {
      new_data.author[key] = value;
    }
    for (const [key, value] of Object.entries(old_data.review)) {
      new_data.review[key] = value;
    }

    // Write the new data:
    await fs.writeFile(new_file, JSON.stringify(new_data));
  }

  // Update the users.json file:
  const new_users = users.map(mailMap);
  await fs.writeFile(users_filename, JSON.stringify(new_users));

  // Update the content of every files:
  for(const user of new_users) {
    const user_file = `../static/data/${repository.dirname}/users/${user}.json`;
    const user_data = JSON.parse(await fs.readFile(user_file, "utf8"));

    // Update author data:
    for (const [time, reviewer] of Object.entries(user_data.author)) {
      user_data.author[time] = reviewer.map(mailMap);
    }

    // Update review data:
    for (const [time, author] of Object.entries(user_data.review)) {
      user_data.review[time] = mailMap(author);
    }

    // Write the new data:
    await fs.writeFile(user_file, JSON.stringify(user_data));
  }
}


const main = async () => {
  const repositories_file = '../static/data/repositories.json';
  const repositories = JSON.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await processRepository(repository);
  }
}

main();
