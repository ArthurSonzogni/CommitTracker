import fs from "fs/promises";
import os from "os";
import path from "path";
import JSON5 from "json5";

const commit_stats = "third_party/blink/tools/commit_stats";
const CACHE_DIR = path.join(os.tmpdir(), "commit-tracker-commit-stats");
const CACHE_TTL_MS = 3600 * 1000;

const readToken = async () => {
  if (process.env.GITHUB_TOKEN || process.env.TOKEN) {
    return (process.env.GITHUB_TOKEN || process.env.TOKEN).trim();
  }
  try {
    return (await fs.readFile(".token", "utf8")).trim();
  } catch {
    return "";
  }
};

// Both sources throttle the CI (429 from GitHub, 503 from Gitiles): try them
// in turn, a few times. GitHub allows more to authenticated requests.
const fetchCommitStats = async file => {
  const cached = path.join(CACHE_DIR, file);
  try {
    const stat = await fs.stat(cached);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      return await fs.readFile(cached, "utf8");
    }
  } catch {}

  const token = await readToken();
  const sources = [
    {
      url: `https://raw.githubusercontent.com/chromium/chromium/main/${commit_stats}/${file}`,
      headers: token ? { Authorization: `token ${token}` } : {},
      decode: text => text,
    },
    {
      // Gitiles serves the files base64-encoded with `?format=TEXT`.
      url: `https://chromium.googlesource.com/chromium/src/+/main/${commit_stats}/${file}?format=TEXT`,
      headers: {},
      decode: text => Buffer.from(text, "base64").toString(),
    },
  ];

  for (let attempt = 0; attempt < 8; attempt++) {
    const source = sources[attempt % sources.length];
    const response = await fetch(source.url, { headers: source.headers });
    if (response.ok) {
      const content = source.decode(await response.text());
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(cached, content);
      return content;
    }
    console.log(`Fetching ${file}: ${response.status}, retrying`);
    await new Promise(resolve => setTimeout(resolve, 2000 * 2 ** attempt / 2));
  }
  throw new Error(`Fetching ${file} failed`);
};

export const loadOrganizations = async () => {
  const [org_list, org_list_patch, affiliation_text] = await Promise.all([
    fetchCommitStats("org-list.txt"),
    fs.readFile("../org-list.txt", "utf8"),
    fetchCommitStats("affiliations.json5"),
  ]);

  const org_mapping = {};
  for (let line of `${org_list}\n${org_list_patch}`.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const [org_name, org_email] = line.split(",");
    if (!org_name || !org_email) continue;
    org_mapping[org_email.toLowerCase()] = org_name;
  }

  const raw_affiliation = JSON5.parse(affiliation_text);
  const affiliation = new Map();
  for (const [email, entry] of Object.entries(raw_affiliation)) {
    if (!entry?.affiliations?.length) continue;
    const sorted = [...entry.affiliations].sort((a, b) => b.start.localeCompare(a.start));
    affiliation.set(email.toLowerCase(), sorted);
  }

  const getHostname = (email, date) => {
    const list = affiliation.get(email.toLowerCase());
    if (list) {
      for (const aff of list) {
        if (aff.start <= date) return aff.domain?.toLowerCase();
      }
    }
    return email.split("@")[1]?.toLowerCase();
  };

  const getOrganization = (email, date) => {
    const hostname = getHostname(email, date);
    return (hostname && org_mapping[hostname]) || "Unknown";
  };

  const hasDynamicAffiliation = email => affiliation.has(email.toLowerCase());
  const organizations_list = [...new Set(Object.values(org_mapping))].sort();

  return { org_mapping, organizations_list, getOrganization, hasDynamicAffiliation };
};
