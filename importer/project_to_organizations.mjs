import JSON5 from "json5";
import fs from "fs/promises";
import statusLine from '@alt-jero/status-line';
import { loadOrganizations } from "./organizations.mjs";

const { org_mapping, organizations_list, getOrganization } = await loadOrganizations();
await fs.writeFile(
  "../public/data/organizations.json",
  JSON.stringify(organizations_list, null, 1)
);

// -----------------------------------------------------------------------------

const addOrganizationEmail = (container, org, email) => {
  if (container[org] == undefined) {
    container[org] = new Set();
  }
  container[org].add(email);
}

const organizations_emails_global = {}

const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {
  statusLine(`Processing ${repository.dirname} for organizations.`);
  // Write the `organizations.json` file.
  await fs.writeFile(
    `../public/data/${repository.dirname}/organizations.json`,
    JSON.stringify(Object.keys(org_mapping), null, 1)
  );

  // Write the `organizations/<org>.json` files:
  const organizations = {};
  const organizations_emails = {};

  const repository_dir = `../public/data/${repository.dirname}`;
  const emails_filename = `${repository_dir}/emails.json`;
  const organizations_filename = `${repository_dir}/organizations.json`;

  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));
  for (const email of emails) {
    const email_filename = `${repository_dir}/emails/${email}.json`;
    const email_data = JSON.parse(await fs.readFile(email_filename, "utf8"));
    for (const commit of email_data) {

      const organization = getOrganization(email, commit.date);
      addOrganizationEmail(organizations_emails, organization, email);
      addOrganizationEmail(organizations_emails_global, organization, email);
      organizations[organization] ||= [];

      commit.peers = commit.peers.map(email => {
        return getOrganization(email, commit.date);
      });
      commit.peers = [...new Set(commit.peers)].sort()
      commit.contributor = email.split("@")[0];
      organizations[organization].push(commit);
    }
  }

  await fs.writeFile(
    organizations_filename,
    JSON.stringify(Object.keys(organizations), null, 1)
  );

  await fs.mkdir(`${repository_dir}/organizations`, { recursive: true });
  await fs.rm(`${repository_dir}/organizations`, { recursive: true });
  await fs.mkdir(`${repository_dir}/organizations`, { recursive: true });
  for (const [organization, data] of Object.entries(organizations)) {
    await fs.writeFile(
      `${repository_dir}/organizations/${organization}.json`,
      JSON.stringify(data, null, 1)
    );
  }

  for(const org in organizations_emails) {
    organizations_emails[org] = [...organizations_emails[org]];
  }

  await fs.writeFile(`${repository_dir}/organizations_emails.json`,
    JSON.stringify(organizations_emails, null, 1))
}

for(const org in organizations_emails_global) {
  organizations_emails_global[org] = [...organizations_emails_global[org]];
}

await fs.writeFile(`../public/data/organizations_emails.json`,
  JSON.stringify(organizations_emails_global, null, 1))
