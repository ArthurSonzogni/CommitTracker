import JSON5 from "json5";
import fs from "fs/promises";
import statusLine from '@alt-jero/status-line';

const chromium_repo =
  "https://raw.githubusercontent.com/chromium/chromium/main";
const commit_stats = `${chromium_repo}/third_party/blink/tools/commit_stats/`;

// -----------------------------------------------------------------------------

// `org_list` is a comma separated list of organizations and their respective
// emails. The file is expected to be in the following format:
// ```
// # Comments are ignored
// org1,host1
// org2,host2
// [...]
// ```
const org_list_response = await fetch(`${commit_stats}/org-list.txt`);
const org_list = await org_list_response.text();

// Import the `org-list.txt` file from the local file system, which might
// supplement some additional organizations. They should eventually be
// moved to the chromium repository.
const org_list_patch = await fs.readFile("../org-list.txt", "utf-8");

const org_mapping = {};

[
  org_list,
  org_list_patch,
]
.join("\n")
.split("\n")
.forEach((line) => {
  line = line.trim();
  if (line.startsWith("#") || line.length == 0) {
    return;
  }
  const [org_name, org_email] = line.split(",");
  if (!org_name || !org_email) {
    return;
  }
  if (org_email.toLowerCase() == undefined) {
    console.error(`Invalid line: ${line}`);
    return;
  }
  org_mapping[org_email.toLowerCase()] = org_name;
});
const organizations_list = [...new Set(Object.values(org_mapping))].sort();
await fs.writeFile(
  "../public/data/organizations.json",
  JSON.stringify(organizations_list, null, 1)
);

// -----------------------------------------------------------------------------

// Affiliation is a JSON5 file with the following structure:
// {
//  "yoavweiss@chromium.org": {
//    affiliations: [
//      { start: "2024-01-07", domain: "shopify.com"},
//      { start: "2018-10-01", domain: "google.com"},
//      [...]
//    ]
//  },
//
//  [...]
// }
const affiliation_response = await fetch(`${commit_stats}/affiliations.json5`);
const affiliation_response_text = await affiliation_response.text();
console.log(affiliation_response_text);
const affiliation = JSON5.parse(affiliation_response_text);

// -----------------------------------------------------------------------------

function getHostname(email, date) {
  if (affiliation[email]) {
    for (const aff of affiliation[email].affiliations) {
      if (aff.start <= date) {
        return aff.domain;
      }
    }
  }

  return email.split("@")[1];
}

function getOrganization(email, date) {
  const hostname = getHostname(email, date);
  return org_mapping[hostname] || "Unknown";
}

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
