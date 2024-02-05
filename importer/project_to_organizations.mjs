import JSON5 from "json5";
import fs from "fs/promises";

const chromium_repo = "https://raw.githubusercontent.com/chromium/chromium/main";
const commit_stats = `${chromium_repo}/third_party/blink/tools/commit_stats/`

// `org_list` is a comma separated list of organizations and their respective
// emails. The file is expected to be in the following format:
// ```
// org1,host1
// org2,host2
// [...]
// ```
const org_list_response = await fetch(`${commit_stats}/org-list.txt`);
const org_list = await org_list_response.text();
const org = {};
org_list.split("\n").forEach(line => {
  const [org_name, org_email] = line.split(",");
  if (!org_name || !org_email) {
    return;
  }
  org[org_email.toLowerCase()] = org_name;
});
const organizations_list = [...new Set(Object.values(org))].sort();
await fs.writeFile("../static/data/organizations.json", JSON.stringify(organizations_list, null, 1));

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
const affiliation_response = await fetch(`${commit_stats}/affiliations.json5`)
const affiliation = JSON5.parse(await affiliation_response.text());

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
  return org[hostname] || "Unknown";
}

// -----------------------------------------------------------------------------

const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {

  // Write the `organizations.json` file.
  await fs.writeFile(`../static/data/${repository.dirname}/organizations.json`,
    JSON.stringify(Object.keys(org), null, 1));

  // Write the `organizations/<org>.json` files:
  const organizations = {};

  const repository_dir = `../static/data/${repository.dirname}`;
  const emails_filename = `${repository_dir}/emails.json`;
  const organizations_filename = `${repository_dir}/organizations.json`;

  const emails = JSON.parse(await fs.readFile(emails_filename, "utf8"));
  for(const email of emails) {
    const organization = getOrganization(email, repository.date);

    const email_filename = `${repository_dir}/emails/${email}.json`;
    const organization_filename = `${repository_dir}/organizations/${organization}.json`;

    organizations[organization] ||= {
      emails: [],
      author: {},
      review: {},
    };

    if (!organizations[organization].emails.includes(email)) {
      organizations[organization].emails.push(email);
    }

    const email_data = JSON.parse(await fs.readFile(email_filename, "utf8"));

    for(const [date, reviewer_emails] of Object.entries(email_data.author)) {
      organizations[organization].author[date] ||= [];
      const reviewer_organization =
        reviewer_emails.map(email => getOrganization(email, date));
      for(const reviewer_org of reviewer_organization) {
        if (!organizations[organization].author[date].includes(reviewer_org)) {
          organizations[organization].author[date].push(reviewer_org);
        }
      }
    }


    for(const [date, author_email] of Object.entries(email_data.review)) {
      const author_org = getOrganization(author_email, date);
      organizations[organization].review[date] = author_org;
    }
  }

  await fs.writeFile(organizations_filename,
    JSON.stringify(Object.keys(organizations), null, 1));

  await fs.mkdir(`${repository_dir}/organizations`, { recursive: true });
  await fs.rm(`${repository_dir}/organizations`, { recursive: true });
  await fs.mkdir(`${repository_dir}/organizations`, { recursive: true });
  for (const [organization, data] of Object.entries(organizations)) {
    await fs.writeFile(`${repository_dir}/organizations/${organization}.json`,
      JSON.stringify(data, null, 1));
  }
}
