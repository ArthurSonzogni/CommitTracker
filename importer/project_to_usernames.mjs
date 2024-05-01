// Purpose:
// -------
//
// Project the files:
// - /emails/<email>.json
// - /emails.json
//
// Toward the files:
// - /usernames/<user>.json
// - /usernames.json
import JSON5 from "json5";
import * as filesystem from "fs";
const fs = filesystem.promises;

const repositories_file = "../repositories.json5";
const repositories = JSON5.parse(await fs.readFile(repositories_file, "utf8"));

for(const repository of repositories) {
  const usernames = {};

  const repository_dir = `../public/data/${repository.dirname}`;
  const emails_filename = `${repository_dir}/emails.json`;
  const usernames_filename = `${repository_dir}/usernames.json`;

  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));
  for(const email of emails) {
    const username = email.split("@")[0];

    const email_filename = `${repository_dir}/emails/${email}.json`;
    const username_filename = `${repository_dir}/usernames/${username}.json`;

    usernames[username] ||= []

    const email_data = JSON.parse(await fs.readFile(email_filename, "utf8"));
    for(const commit of email_data) {
      commit.peers = commit.peers.map(email => email.split("@")[0]);
      commit.peers = [...new Set(commit.peers)].sort();
      usernames[username].push(commit);
    }
  }

  await fs.writeFile(usernames_filename,
    JSON.stringify(Object.keys(usernames).sort(), null, 1));

  await fs.mkdir(`${repository_dir}/usernames`, { recursive: true });
  await fs.mkdir(`${repository_dir}/usernames`, { recursive: true });
  await fs.mkdir(`${repository_dir}/usernames`, { recursive: true });
  for(const [username, data] of Object.entries(usernames)) {
    await fs.writeFile(`${repository_dir}/usernames/${username}.json`,
      JSON.stringify(data, null, 1));
  }
}
