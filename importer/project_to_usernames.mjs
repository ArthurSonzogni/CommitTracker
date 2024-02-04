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

  const repository_dir = `../static/data/${repository.dirname}`;
  const emails_filename = `${repository_dir}/emails.json`;
  const usernames_filename = `${repository_dir}/usernames.json`;

  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));
  for(const email of emails) {
    const username = email.split("@")[0];

    const email_filename = `${repository_dir}/emails/${email}.json`;
    const username_filename = `${repository_dir}/usernames/${username}.json`;

    usernames[username] ||= {
      emails: [],
      author: {},
      review: {},
    };

    if (!usernames[username].emails.includes(email)) {
      usernames[username].emails.push(email);
    }

    const email_data = JSON.parse(await fs.readFile(email_filename, "utf8"));
    for(const [date, reviewer_emails] of Object.entries(email_data.author)) {
      const reviewer_usernames = reviewer_emails
        .map(email => email.split("@")[0]);
      usernames[username].author[date] ||= []
      for(const reviewer_username of reviewer_usernames) {
        if (!usernames[username].author[date].includes(reviewer_username)) {
          usernames[username].author[date].push(reviewer_username);
        }
      }
    }

    for(const [date, author_email] of Object.entries(email_data.review)) {
      const author_username = author_email.split("@")[0];
      usernames[username].review[date] = author_username;
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

