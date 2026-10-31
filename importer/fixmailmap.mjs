import * as filesystem from 'fs';
import { mailMap } from './mailmap.mjs';
import JSON5 from 'json5';

const fs = filesystem.promises;

// Function to check if a file exists asynchronously
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

const dedupAndSortCommits = (commits, ownerEmail) => {
  const map = new Map();
  for (const commit of commits) {
    commit.peers = [...new Set(commit.peers.map(mailMap))].filter(
      peer => peer !== ownerEmail,
    );
    // Drop standalone self-review entries whose only peer was the author itself.
    if (commit.kind === 'review' && commit.peers.length === 0) {
      continue;
    }
    const key =
      commit.sha ??
      `${commit.date}\0${commit.additions}\0${commit.deletions}\0${commit.files}`;
    const preexisting = map.get(key);
    if (!preexisting || (preexisting.kind === 'review' && commit.kind === 'author')) {
      map.set(key, commit);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const processRepository = async (repository) => {
  console.log(`-- Processing ${repository.dirname}`);

  // Read all the emails of the repository:
  const emails_filename = `../public/data/${repository.dirname}/emails.json`;
  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));

  // If the email requested to mail their username to a different one, we need to
  // merge the data from the old username to the new one.
  for (const email of emails) {
    const mapped = mailMap(email);
    if (email === mapped) {
      continue;
    }
    console.log(`---- Merging ${email} into ${mapped}`);

    const old_file = `../public/data/${repository.dirname}/emails/${email}.json`;
    const new_file = `../public/data/${repository.dirname}/emails/${mapped}.json`;

    if (!await checkFileExists(old_file)) {
      continue;
    }

    if (!await checkFileExists(new_file)) {
      console.log(`------ ${mapped}.json does not exist, renaming ${email}.json to ${mapped}.json`);
      await fs.rename(old_file, new_file);
      continue;
    }

    console.log(`------ ${mapped}.json exists, merging ${email}.json into ${mapped}.json`);

    const old_data = JSON.parse(await fs.readFile(old_file, "utf8"));
    const new_data = JSON.parse(await fs.readFile(new_file, "utf8"));

    const merged = dedupAndSortCommits(new_data.concat(old_data), mapped);
    await fs.writeFile(new_file, JSON.stringify(merged, null, 1));
    await fs.unlink(old_file);
  }

  // Update the emails.json file:
  const new_users = [...new Set(emails.map(mailMap))].sort();
  await fs.writeFile(emails_filename, JSON.stringify(new_users, null, 1));

  // Update the content of every file:
  for (const email of new_users) {
    const file = `../public/data/${repository.dirname}/emails/${email}.json`;
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    const cleaned = dedupAndSortCommits(data, email);
    await fs.writeFile(file, JSON.stringify(cleaned, null, 1));
  }
};

const main = async () => {
  const repositories_file = '../repositories.json5';
  const repositories = JSON5.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await processRepository(repository);
  }
};

main();
