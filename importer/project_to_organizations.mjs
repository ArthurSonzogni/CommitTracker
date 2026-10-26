import JSON5 from "json5";
import fs from "fs/promises";
import statusLine from '@alt-jero/status-line';

// Both sources throttle the CI (429 from GitHub, 503 from Gitiles): try them
// in turn, a few times. GitHub allows more to authenticated requests.
const commit_stats = "third_party/blink/tools/commit_stats";
const token = process.env.GITHUB_TOKEN || process.env.TOKEN;
const sources = [
  {
    url: file => `https://raw.githubusercontent.com/chromium/chromium/main/${commit_stats}/${file}`,
    headers: token ? { Authorization: `token ${token}` } : {},
    decode: text => text,
  },
  {
    // Gitiles serves the files base64-encoded with `?format=TEXT`.
    url: file => `https://chromium.googlesource.com/chromium/src/+/main/${commit_stats}/${file}?format=TEXT`,
    headers: {},
    decode: text => Buffer.from(text, "base64").toString(),
  },
];
const fetchCommitStats = async file => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const source = sources[attempt % sources.length];
    const response = await fetch(source.url(file), { headers: source.headers });
    if (response.ok) {
      return source.decode(await response.text());
    }
    console.log(`Fetching ${file}: ${response.status}, retrying`);
    await new Promise(resolve => setTimeout(resolve, 2000 * 2 ** attempt / 2));
  }
  throw new Error(`Fetching ${file} failed`);
};

// -----------------------------------------------------------------------------

// `org_list` is a comma separated list of organizations and their respective
// emails. The file is expected to be in the following format:
// ```
// # Comments are ignored
// org1,host1
// org2,host2
// [...]
// ```
const org_list = await fetchCommitStats("org-list.txt");

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
const affiliation_response_text = await fetchCommitStats("affiliations.json5");
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
