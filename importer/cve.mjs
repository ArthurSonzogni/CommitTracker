// Fetch issues from chromium bugganizer.
// We use puppeter to fetch the page.
import fs from 'fs'
import puppeteer from 'puppeteer'
import spawn from 'child_process'
import {IsEmailValid} from './is_email_valid.mjs';
import {ParseReviewers} from './parse_reviewers.mjs';

// The GitHub API requires a token. Without one, we only use Gitiles.
const hasGithubToken = fs.existsSync('.token') ||
  !!process.env.GITHUB_TOKEN || !!process.env.TOKEN;
const octokit = hasGithubToken ?
  (await import('./octokit.mjs')).octokit : null;

// The issue tracker returns component names HTML-escaped, e.g.
// "Blink&gt;JavaScript".
const decodeHtmlEntities = (text) => text
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&');

const loadDatabase = () => {
  try {
    const data = JSON.parse(fs.readFileSync('../public/cve/data.json', 'utf8'))
    const values = Object.values(data);
    for (const cve of values) {
      cve.components = cve.components?.map(decodeHtmlEntities);
    }
    return values;
  } catch (e) {
    return []
  }
}

const saveDatabase = (database) => {
  console.log("Saving database")
  fs.mkdirSync('../public/cve', { recursive: true });
  fs.writeFileSync('../public/cve/data.json', JSON.stringify(database, null, 1))
}

// Execute a command, and log its output.
const exec = async (command, args, options) => {
  console.log(`Running: ${command} ${args.join(' ')}`)
  const child = spawn.spawn(command, args, options)
  child.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`)
  });
  child.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`)
  });
  await new Promise((resolve, error) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        error(new Error(`git process exited with code ${code}`))
      }
    })
  })
  console.log(`Finished: ${command} ${args.join(' ')}`)
}

// Fetch the CVE github repository.
const fetchCveRepository = async () => {
  // If the repository already exists, fetch the latest changes.
  if (fs.existsSync('/tmp/cvelist')) {
    await exec('git', ['pull'], { cwd: '/tmp/cvelist' })

    return
  }

  // Otherwise, clone the repository.
  await exec('git', [
    'clone',
    '--depth=1',
    'https://github.com/CVEProject/cvelistV5',
    '/tmp/cvelist'
  ])
}

// Iterate over the CVEs in the repository.
const iterateCVE = function* () {
  for (const year of fs.readdirSync('/tmp/cvelist/cves')) {
    if (!fs.statSync(`/tmp/cvelist/cves/${year}`).isDirectory()) {
      continue;
    }

    for (const subsection of fs.readdirSync(`/tmp/cvelist/cves/${year}`)) {
      if (!fs.statSync(`/tmp/cvelist/cves/${year}/${subsection}`).isDirectory()) {
        continue;
      }

      for (const file of fs.readdirSync(`/tmp/cvelist/cves/${year}/${subsection}`)) {
        const cve = JSON.parse(fs.readFileSync(`/tmp/cvelist/cves/${year}/${subsection}/${file}`, 'utf8'))
        yield cve;
      }
    }
  }
}

// Check if the CVE is related to Chromium.
const cveIsChromium = (cve) => {
  if (cve.cveMetadata.assignerShortName != "Chrome") {
    return false;
  }

  if (!cve.containers?.cna?.affected) {
    return false;
  }

  for (const affected of cve.containers.cna.affected) {
    const product = affected.product?.toLowerCase() || ''
    const vendor = affected.vendor?.toLowerCase() || ''
    // CVEs from ~2017 use vendor="n/a" and product="Google Chrome prior to X".
    if ((product.includes('chrome') || product.includes('chromium')) &&
      (vendor.includes('google') || vendor == 'n/a')) {
      return true;
    }

    // Old CVE from 2018- are not properly tagged. They are using product="n/a"
    // and "vendor"="n/a"
    if (affected.product == "n/a" && affected.vendor == "n/a") {
      return true;
    }
  }

  return false;
}

const cveIsPublished = (cve) => {
  return cve.cveMetadata.state === "PUBLISHED";
}

const urlIsChromiumBugTracker = (url) => {
  return url.includes("issues.chromium.org") ||
    url.includes('crbug.com') ||
    url.includes('bugs.chromium.org') ||
    ( url.includes("code.google.com") && url.includes("chromium") && url.includes("issues") );
}

const urlIsChromiumCodeReview = (url) => {
  return url.includes("chromium.googlesource.com") ||
    url.includes("review.googlesource.com") ||
    url.includes("codereview.chromium.org") ||
    url.includes("src.chromium.org") ||
    url.includes("crrev.com");
}

const normalizeCve = (cve) => {
  // Fill in the fields if they are missing.
  cve.containers.cna ||= {};
  cve.containers.cna.problemTypes ||= [];
  cve.containers.cna.problemTypes[0] ||= {};
  cve.containers.cna.problemTypes[0].descriptions ||= [];
  cve.containers.cna.problemTypes[0].descriptions[0] ||= {};
  cve.containers.cna.problemTypes[0].descriptions[0].description ||= '';
  cve.containers.cna.problemTypes[0].descriptions[0].cweId ||= '';
  cve.containers.cna.references ||= [];
  cve.containers.cna.affected ||= [];
  cve.containers.cna.descriptions ||= [];
  cve.containers.adp ||= [];
  cve.containers.adp[0] ||= {};
  cve.containers.adp[0].problemTypes ||= [];
  cve.containers.adp[0].problemTypes[0] ||= {};
  cve.containers.adp[0].problemTypes[0].descriptions ||= [];
  cve.containers.adp[0].problemTypes[0].descriptions[0] ||= {};
  cve.containers.adp[0].problemTypes[0].descriptions[0].cweId ||= '';
  cve.containers.adp[0].problemTypes[0].descriptions[0].description ||= '';
}

let version_history = null;
const fetchVersionHistory = async () => {
  console.log("Fetching version history")

  // For local dev, load the file from disk, if any.
  if (fs.existsSync('version_history.json')) {
    version_history = JSON.parse(fs.readFileSync('version_history.json', 'utf8'))
    return;
  }

  version_history = {}
  for(const channel of ['extended', 'stable', 'beta', 'dev', 'canary']) {
    console.log(`Fetching version history for ${channel}`)
    const url = `https://versionhistory.googleapis.com/v1/chrome/platforms/all/channels/${channel}/versions/all/releases`;
    const response = await fetch(url);
    const json = await response.json();
    version_history[channel] = json;
  }

  // Write json to file.
  fs.writeFileSync('version_history.json', JSON.stringify(version_history, null, 1))
}

const getChromiumReleaseDate = (version) => {
  const out = {};
  for (const channel in version_history) {
    for (const release of version_history[channel].releases) {
      if (release.version == version) {
        out[channel] = release.serving.startTime;
        break;
      }
    }
  }
  return out;
}

const chromiumSeverity = (description) => {
  const match = description.match(/security severity: (\w+)\)/);
  if (match) {
    return match[1];
  } else {
    return "";
  }
}

// Extract the relevant fields from the CVE.
const transformCve = (cve) => {
  normalizeCve(cve)

  // Extract the Chromium bug URLs.
  let bug = "n/a"
  for(const reference of cve.containers.cna.references) {
    if (urlIsChromiumBugTracker(reference.url)) {
      bug = reference.url;
    }
  }

  let description = "n/a";
  for(const d of cve.containers.cna.descriptions) {
    description = d.value;
  }

  let version_fixed = "n/a";
  for (const affected of cve.containers.cna.affected) {
    if (affected.product?.toLowerCase().includes('chrome')) {
      for (const version of affected.versions || []) {
        version_fixed = version.version;
      }
    }
  }

  // If the version is not a version number, extract it from the "lessThan"
  // field, the version string itself (e.g. "Google Chrome prior to X"), or
  // the description (e.g. "Google Chrome before X").
  const versionRegex = /\b\d+\.\d+\.\d+\.\d+\b/;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version_fixed)) {
    const candidates = [];
    for (const affected of cve.containers.cna.affected) {
      for (const version of affected.versions || []) {
        candidates.push(version.lessThan || '', version.version || '');
      }
    }
    const match =
      description.match(/(?:prior to|before) (\d+\.\d+\.\d+\.\d+)/) ||
      candidates.map(c => c.match(versionRegex)).find(m => m) ||
      description.match(versionRegex);
    if (match) {
      version_fixed = match[1] || match[0];
    }
  }

  //const proposedCweId = cve.containers.adp[0].prolemTypes[0].descriptions[0].cweId;
  const cweId =
    cve.containers.adp[0].problemTypes[0].descriptions[0].cweId.replace('CWE-', '') ||
    cve.containers.cna.problemTypes[0].descriptions[0].cweId.replace('CWE-', '');

  const problem =
    cve.containers.adp[0].problemTypes[0].descriptions[0].description ||
    cve.containers.cna.problemTypes[0].descriptions[0].description;

  const version_dates = getChromiumReleaseDate(version_fixed);

  return {
    id: cve.cveMetadata.cveId.replace('CVE-', ''),
    cweId,
    problem,
    bug,
    description,
    title: "n/a",
    published: cve.cveMetadata.datePublished,
    version_fixed,
    version_dates,
    severity: chromiumSeverity(description),
  };
}

const retrieveCveList = async (database) => {
  await fetchCveRepository()

  const cves = {}
  for (const cve of iterateCVE()) {
    if (!cveIsPublished(cve)) {
      continue;
    }

    if (!cveIsChromium(cve)) {
      continue;
    }

    const transformed = transformCve(cve)

    // Previous versions of the importer overwrote cve.id with null when the bug
    // had no CVE field. Match those entries back by bug URL and publish date so
    // their scraped bug and commit data is preserved.
    const existing = database.find(entry => entry.id == transformed.id) ||
      database.find(entry => !entry.id &&
        entry.bug == transformed.bug &&
        entry.published == transformed.published);
    if (existing) {
      existing.id = transformed.id;
      // Update metadata fields from the CVE repository.
      existing.cweId = transformed.cweId;
      existing.problem = transformed.problem;
      existing.description = transformed.description;
      existing.version_fixed = transformed.version_fixed;
      existing.version_dates = transformed.version_dates;
      existing.severity = transformed.severity || existing.severity;
      continue;
    }

    console.log("Adding CVE", transformed.id)
    database.push(transformed)
  }

  for (let i = database.length - 1; i >= 0; i--) {
    if (!database[i].id) {
      database.splice(i, 1);
    }
  }
}

// Fetch a Gerrit-style JSON API response, stripping the )]}' XSSI prefix.
const fetchGerritJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  return JSON.parse(text.substring(text.indexOf('\n') + 1));
}

// Resolve a Gerrit change into the hash of the commit it was submitted as,
// and its submission date. Returns null if the change was not merged.
//   GET https://chromium-review.googlesource.com/changes/chromium%2Fsrc~5673403
const gerritChangeCache = new Map();
const resolveGerritChangeInfo = async (origin, project, number) => {
  const id = project ? `${encodeURIComponent(project)}~${number}` : number;
  const gerrit_url =
    `https://${origin}/changes/${id}?o=MESSAGES&o=CURRENT_REVISION`;
  if (gerritChangeCache.has(gerrit_url)) {
    return gerritChangeCache.get(gerrit_url);
  }

  let info = null;
  try {
    console.log("Fetching", gerrit_url);
    const json = await fetchGerritJson(gerrit_url);
    if (json.status == "MERGED") {
      let sha = null;
      for (const message of json.messages || []) {
        const match = message.message.match(/submitted as ([0-9a-f]{40})/);
        if (match) {
          sha = match[1];
        }
      }
      sha ||= json.current_revision || null;
      // Gerrit dates look like "2024-06-10 22:43:35.000000000", in UTC.
      const submitted = json.submitted ?
        new Date(json.submitted.replace(' ', 'T').substring(0, 19) + 'Z') :
        null;
      if (sha) {
        info = { sha, submitted };
      }
    }
    console.log(info?.sha);
  } catch (e) {
    console.log("Error fetching", gerrit_url, e.message);
  }
  gerritChangeCache.set(gerrit_url, info);
  return info;
}

const resolveGerritChange = async (origin, project, number) => {
  return (await resolveGerritChangeInfo(origin, project, number))?.sha || null;
}

// Resolve a Chromium SVN revision into a git commit hash, using cr-rev.
const svnRevisionCache = new Map();
const resolveSvnRevision = async (revision) => {
  if (svnRevisionCache.has(revision)) {
    return svnRevisionCache.get(revision);
  }
  let sha = null;
  try {
    const url = `https://cr-rev.appspot.com/_ah/api/crrev/v1/redirect/${revision}`;
    console.log("Fetching", url);
    const json = await (await fetch(url)).json();
    if (json.repo == "chromium/src" && /^[0-9a-f]{40}$/.test(json.git_sha)) {
      sha = json.git_sha;
    }
  } catch (e) {
    console.log("Error resolving SVN revision", revision, e.message);
  }
  svnRevisionCache.set(revision, sha);
  return sha;
}

// Parse a URL referring to a code change. Returns one of:
//  { sha }                     for a commit URL.
//  { origin, project, number } for a Gerrit change URL.
//  { svn }                     for a Chromium SVN revision URL.
//  null                        otherwise.
//
// Supported formats:
//   https://chromium-review.googlesource.com/c/chromium/src/+/5973403
//   https://chromium-review.googlesource.com/c/chromium/src/+/5973403/3
//   https://chromium-review.googlesource.com/5973403
//   https://chromium-review.googlesource.com/#/c/5973403/
//   https://skia-review.googlesource.com/c/skia/+/874976
//   https://crrev.com/c/5378419
//   https://crrev.com/e598fc599bd920392256d05c61826466c73c8e89
//   https://chromium.googlesource.com/chromium/src/+/e598fc5...
//   https://chromium.googlesource.com/chromium/src/+/e598fc5...%5E%21/
//   http://src.chromium.org/viewvc/chrome?view=rev&revision=169949
const parseCodeChangeUrl = (url) => {
  let match;

  match = url.match(/^https?:\/\/crrev\.com\/c\/(\d+)(?:[\/?#]|$)/);
  if (match) {
    return {
      origin: "chromium-review.googlesource.com",
      project: null,
      number: match[1],
    };
  }

  match = url.match(/^https?:\/\/crrev\.com\/([0-9a-f]{40})(?:[\/?#]|$)/);
  if (match) {
    return { sha: match[1] };
  }

  match = url.match(
    /^https?:\/\/([a-z0-9-]*review\.googlesource\.com)\/(?:#\/)?(?:c\/)?(?:(.+?)\/\+\/)?(\d+)(?:[\/?#]|$)/);
  if (match) {
    return { origin: match[1], project: match[2] || null, number: match[3] };
  }

  match = url.match(
    /^https?:\/\/[a-z0-9-]+\.googlesource\.com\/.+?\/\+\/([0-9a-f]{40})(?:\^!|%5E%21)?\/?(?:[?#]|$)/i);
  if (match) {
    return { sha: match[1] };
  }

  match = url.match(
    /^https?:\/\/src\.chromium\.org\/(?:viewvc\/)?chrome\?[^\s]*?revision=(\d+)/);
  if (match) {
    return { svn: match[1] };
  }

  return null;
}

// Resolve a code change URL into a commit hash, or null.
const codeChangeUrlToCommitHash = async (url) => {
  const parsed = parseCodeChangeUrl(url);
  if (!parsed) {
    return null;
  }
  if (parsed.sha) {
    return parsed.sha;
  }
  if (parsed.svn) {
    return resolveSvnRevision(parsed.svn);
  }
  return resolveGerritChange(parsed.origin, parsed.project, parsed.number);
}

// Collect every string contained in a JSON value.
const collectStrings = (value, out = []) => {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectStrings(item, out);
    }
  }
  return out;
}

// Parse the responses of the issue tracker internal API, captured while the
// page loads:
// - `getIssue` contains the structured "Code Changes" fields, encoded as
//   tuples like ["chromium","chromium/src",5605695,1].
// - `updates` contains every comment, including the ones collapsed in the UI.
//   Comments posted by Gitwatcher ("The following revision refers to this
//   bug") are trusted. Links in other comments often refer to unrelated or
//   older changes, given as context.
const parseIssueApiResponses = (responses) => {
  const out = {
    title: null,
    gerrit_changes: [],
    gitwatcher_urls: new Set(),
    gitwatcher_hashes: new Set(),
    comment_urls: new Set(),
  };

  for (const { kind, text } of responses) {
    if (kind == 'getIssue') {
      // The title follows the issue id and five numeric fields, e.g.
      // [null,40063014,[1456950,6,4,3,4,"Title"
      const title = text.match(
        /\[null,\d+,\[\d+,\d+,\d+,\d+,\d+,("(?:[^"\\]|\\.)*")/);
      if (title) {
        try {
          out.title = JSON.parse(title[1]);
        } catch (e) {}
      }

      const regex = /\["([a-z0-9-]+)","([^"]+)",(\d+),\d+\]/g;
      for (const match of text.matchAll(regex)) {
        out.gerrit_changes.push({
          origin: `${match[1]}-review.googlesource.com`,
          project: match[2],
          number: match[3],
        });
      }
    }

    if (kind == 'updates') {
      let strings = [];
      try {
        strings = collectStrings(JSON.parse(text.substring(text.indexOf('\n') + 1)));
      } catch (e) {
        console.log("Error parsing issue updates", e.message);
      }
      for (const string of strings) {
        const isGitwatcher = string.includes('revision refers to this bug');
        for (const match of string.matchAll(/https?:\/\/[^\s"'<>\\)\]]+/g)) {
          const url = match[0].replace(/&amp;/g, '&');
          (isGitwatcher ? out.gitwatcher_urls : out.comment_urls).add(url);
        }
        if (!isGitwatcher) {
          continue;
        }
        // Match "commit e598fc599bd920392256d05c61826466c73c8e89"
        // Match "Hash: 0df9105b154dc5627d81595b9aa379208d119fc2"
        // The first is used in chromium, the other in v8/skia.
        for (const match of string.matchAll(/(?:commit|Hash:) ([0-9a-f]{40})\b/g)) {
          out.gitwatcher_hashes.add(match[1]);
        }
      }
    }
  }

  return out;
}

const fetchBugganizer = async (cve, page) => {
  const url = cve.bug
  console.log("Fetching", url)

  // Capture the issue tracker's internal API responses. They are more
  // reliable than the rendered page, which loads asynchronously and collapses
  // comments.
  const responses = [];
  const pending = [];
  const onResponse = (response) => {
    const match = response.url().match(/\/action\/issues\/\d+\/(getIssue|updates)\b/);
    if (!match || !response.ok()) {
      return;
    }
    pending.push(response.text()
      .then(text => responses.push({ kind: match[1], text }))
      .catch(() => {}));
  };

  page.on('response', onResponse);
  try {
    const issueResponse = page.waitForResponse(
      response => /\/action\/issues\/\d+\/getIssue\b/.test(response.url()),
      { timeout: 30000 }).catch(() => null);
    const updatesResponse = page.waitForResponse(
      response => /\/action\/issues\/\d+\/updates\b/.test(response.url()),
      { timeout: 30000 }).catch(() => null);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Old URLs from code.google.com and bugs.chromium.org redirect to
    // issues.chromium.org, unless the issue was not migrated.
    if (!page.url().includes('issues.chromium.org')) {
      console.log("Issue not available:", page.url());
      return;
    }

    // Restricted issues are rejected with 403.
    const response = await issueResponse;
    if (!response || !response.ok()) {
      console.log("Issue not accessible:", response?.status());
      return;
    }

    // Wait for the page to render the issue fields. Issues moved to
    // issuetracker.google.com only display a redirection notice, but the API
    // responses are still available.
    await page.waitForFunction(() => {
      const rendered = document.querySelector('issue-title') &&
        Array.from(document.querySelectorAll('label'))
          .some(el => el.textContent.trim() == 'Component Tags');
      const moved = document.body.innerText
        .includes('Redirecting to Issue Tracker');
      return rendered || moved;
    }, { timeout: 20000 });
    await updatesResponse;
    await Promise.all(pending);
  } finally {
    page.off('response', onResponse);
  }

  const api = parseIssueApiResponses(responses);
  console.log("Issue API:", responses.map(r => r.kind),
    "gerrit changes:", api.gerrit_changes.length,
    "gitwatcher urls:", api.gitwatcher_urls.size,
    "gitwatcher hashes:", api.gitwatcher_hashes.size,
    "comment urls:", api.comment_urls.size);

  // Search for the cve value to confirm.
  const extracted = await page.evaluate(() => {
    const out = {
      cve: null,
      vrp_reward: null,
      components: [],
      found_in: null,
      security_release: null,
      oses: [],
      errors: [],
      chromium_labels: [],
      bug_date: null,
      severity: null,
      code_changes: [],
      fixed_by: [],
    }

    for(const el of document.querySelectorAll('label')) {
      if (!el.textContent) {
        continue
      }

      try {
        // CVE
        if (el.textContent == ' CVE ') {
          out.cve = el.parentElement.parentElement.querySelector('span').textContent;
        }

        // vrp-reward
        if (el.textContent == ' vrp-reward ') {
          out.vrp_reward = el.parentElement.parentElement.querySelector('span').textContent;
        }

        // Component Tags
        if (el.textContent == ' Component Tags ') {
          out.components = Array.from(el.parentElement.parentElement.querySelectorAll('a')).map(el => el.textContent.trim());
        }

        // Found In
        if (el.textContent == ' Found In ') {
          out.found_in = el.parentElement.parentElement.querySelector('span').textContent;
        }

        // Security Release
        if (el.textContent == ' Security_Release ') {
          out.security_release = el.parentElement.parentElement.querySelector('span').textContent;
        }

        // OS
        if (el.textContent == ' OS ') {
          //out.os = el.parentElement.parentElement.querySelector('span').textContent;
          out.oses = Array.from(el.parentElement.parentElement.querySelectorAll('span'))
            .map(el => el.textContent)
            .filter(el => el.length > 0)
            .filter(el => !el.startsWith('Add'))
            .filter(el => !el.startsWith('Remove'))
            .filter(el => !el.startsWith('Edit'))
            .filter(el => !el.includes('('));
        }

        // Chromium Labels
        if (el.textContent == ' Chromium Labels ') {
          out.chromium_labels = Array
            .from(el.parentElement.parentElement.querySelectorAll('span'))
            .map(el => el.textContent)
            .filter(el => el.length > 0)
            .filter(el => !el.startsWith('Add'))
            .filter(el => !el.startsWith('Remove'))
            .filter(el => !el.startsWith('Edit'))
            .filter(el => !el.includes('('));
        }

        // Severity
        if (el.textContent == ' Severity ') {
          const severity = el.parentElement.parentElement.querySelector('span').textContent;
          switch(severity) {
            case 'S0': out.severity = "Critical"; break;
            case 'S1': out.severity = "High"; break;
            case 'S2': out.severity = "Medium"; break;
            case 'S3': out.severity = "Low"; break;
            case 'S4': out.severity = "None"; break;
          }
        }

        // Code Changes
        if (el.textContent == ' Code Changes ') {
          out.code_changes = Array.from(el.parentElement.parentElement.querySelectorAll('a')).map(el => el.href.trim());
        }

        // Fixed By Code Changes
        if (el.textContent == ' Fixed By Code Changes ') {
          out.fixed_by = Array.from(el.parentElement.parentElement.querySelectorAll('a')).map(el => el.href.trim());
        }

      } catch (e) {
        out.errors.push("Error reading " + el.textContent);
      }
    }

    // Extract the bug title.
    const issueTitle = document.querySelector('issue-title');
    if (issueTitle) {
      const h3 = issueTitle.querySelector('h3');
      out.title = h3 ? h3.innerText.trim() : issueTitle.innerText.trim();
    }

    // Extract the bug open date.
    const bug_date = document.querySelector('time')?.getAttribute('datetime');
    out.bug_date = bug_date;


    return out;
  })

  console.log("Extracted:")
  console.log(extracted)
  if (extracted.cve && !extracted.cve.includes(cve.id)) {
    console.log("CVE mismatch", extracted.cve, cve.id);
    return;
  }

  // Only overwrite fields with values that were actually found, so that a
  // partially rendered page does not erase known data.
  extracted.title ||= api.title;
  extracted.components = extracted.components?.map(decodeHtmlEntities);
  const isPresent = (value) =>
    value !== null && value !== undefined && value !== '' &&
    !(Array.isArray(value) && value.length === 0);
  for (const field of ['title', 'components', 'found_in', 'security_release',
    'oses', 'chromium_labels', 'bug_date', 'severity']) {
    if (isPresent(extracted[field])) {
      cve[field] = extracted[field];
    }
  }
  if (parseInt(extracted.vrp_reward) > 0) {
    cve.vrp_reward = extracted.vrp_reward;
  }
  cve.last_bug_fetch = new Date().toISOString().split('T')[0];

  const hasCommits = cve.commits && Object.keys(cve.commits).length > 0;
  if (hasCommits) {
    // If we have commits, we only skip if the title is already set.
    // This allows us to re-fetch to get the title if it was missing.
    if (cve.title && cve.title != "n/a") {
      console.log("Commits already known, skipping Gerrit resolution.");
      return;
    }
  }

  const fixed_by = new Set();
  for(const change of extracted.fixed_by) {
    const sha = await codeChangeUrlToCommitHash(change);
    if (sha) fixed_by.add(sha);
  }
  if (fixed_by.size > 0) {
    cve.fixed_by = Array.from(fixed_by).sort();
  }
  cve.fixed_by ||= [];

  // Read the structured "Code Changes" fields.
  const commits = new Set(fixed_by);
  for (const change of extracted.code_changes) {
    const sha = await codeChangeUrlToCommitHash(change);
    if (sha) commits.add(sha);
  }
  for (const {origin, project, number} of api.gerrit_changes) {
    const sha = await resolveGerritChange(origin, project, number);
    if (sha) commits.add(sha);
  }

  // Fallback to Gitwatcher comments if no commits were found in the structured
  // fields.
  if (commits.size === 0) {
    for (const link of api.gitwatcher_urls) {
      const sha = await codeChangeUrlToCommitHash(link);
      if (sha) commits.add(sha);
    }
    for (const sha of api.gitwatcher_hashes) {
      commits.add(sha);
    }
  }

  // Last resort: Gerrit changes linked from other comments, submitted after
  // the bug was filed. Older changes are typically mentioned as context.
  if (commits.size === 0 && cve.bug_date) {
    const bug_date = new Date(cve.bug_date);
    for (const link of api.comment_urls) {
      const parsed = parseCodeChangeUrl(link);
      if (!parsed?.number) {
        continue;
      }
      const info = await resolveGerritChangeInfo(
        parsed.origin, parsed.project, parsed.number);
      if (info?.submitted && info.submitted >= bug_date) {
        commits.add(info.sha);
      }
    }
  }

  // Do not erase known commits if nothing was found this time.
  if (commits.size === 0) {
    console.log("No commits found.");
    return;
  }

  cve.commits ||= {}

  // Convert array to object.
  if (Array.isArray(cve.commits)) {
    cve.commits = {};
  }

  // Remove the previous commits that do not exist anymore.
  for(const sha in cve.commits) {
    if (!commits.has(sha)) {
      delete cve.commits[sha];
    }
  }

  // Add the new commits.
  for(const commit of commits) {
    cve.commits[commit] ||= {}
  }

  console.log("Finished");
  console.log(cve);
}

const augmentFromBugganizer = async (database) => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()

  let index = 0;
  for(const cve of database) {
    console.log("Processing", cve.id);

    if (cve.bug == undefined || cve.bug == "n/a") {
      continue;
    }

    if (cve.vrp_reward == "--") {
      delete cve.vrp_reward;
    }

    if (cve.import_stage != undefined) {
      delete cve.import_stage;
    }

    const needsTitle = cve.title === undefined || cve.title === "n/a";
    const needsCommits = !cve.commits || Object.keys(cve.commits).length === 0;

    // Graduated backoff based on the age of the CVE.
    const published = new Date(cve.published);
    const today = new Date();
    const ageInWeeks = (today - published) / (1000 * 60 * 60 * 24 * 7);

    let refreshThresholdDays = 60; // Default for old bugs.
    if (ageInWeeks < 14) { refreshThresholdDays = 3; }
    else if (ageInWeeks < 26) { refreshThresholdDays = 14; }

    const lastFetch = cve.last_bug_fetch ? new Date(cve.last_bug_fetch) : new Date(0);
    const daysSinceLastFetch = (today - lastFetch) / (1000 * 60 * 60 * 24);

    if (!needsTitle && !needsCommits && daysSinceLastFetch < refreshThresholdDays) {
      console.log("Skipping", cve.id, "last fetch was", daysSinceLastFetch.toFixed(1), "days ago. Threshold:", refreshThresholdDays, "days.");
      continue;
    }

    try {
      try {
        await fetchBugganizer(cve, page);
      } catch (e) {
        console.log("Error fetching", cve.bug, e);
      }

      if (index % 10 == 0) {
        saveDatabase(database);
      }
      index++;
    } catch (e) {
      console.log("Error fetching", cve.bug, e);
    }
  }
  await browser.close()
}

// Repositories where fixes are searched, on GitHub, then on Gitiles. Gitiles
// also contains the commits merged into release branches, which the GitHub
// mirrors do not have.
const kRepositories = [
  {
    github: { owner: 'chromium', repo: 'chromium' },
    gitiles: { host: 'chromium.googlesource.com', project: 'chromium/src', repo: 'chromium' },
  },
  {
    github: { owner: 'v8', repo: 'v8' },
    gitiles: { host: 'chromium.googlesource.com', project: 'v8/v8', repo: 'v8' },
  },
  {
    github: { owner: 'google', repo: 'skia' },
    gitiles: { host: 'skia.googlesource.com', project: 'skia', repo: 'skia' },
  },
  {
    github: { owner: 'google', repo: 'dawn' },
    gitiles: { host: 'dawn.googlesource.com', project: 'dawn', repo: 'dawn' },
  },
  {
    github: { owner: 'google', repo: 'angle' },
    gitiles: { host: 'chromium.googlesource.com', project: 'angle/angle', repo: 'angle' },
  },
  {
    github: { owner: 'google', repo: 'swiftshader' },
    gitiles: { host: 'swiftshader.googlesource.com', project: 'SwiftShader', repo: 'swiftshader' },
  },
  {
    github: { owner: 'maitrungduc1410', repo: 'webrtc' },
    gitiles: { host: 'webrtc.googlesource.com', project: 'src', repo: 'webrtc' },
  },
  {
    github: { owner: 'chromium', repo: 'pdfium' },
    gitiles: { host: 'pdfium.googlesource.com', project: 'pdfium', repo: 'pdfium' },
  },
  {
    github: { owner: 'ArthurSonzogni', repo: 'chromiumos-platform2' },
    gitiles: { host: 'chromium.googlesource.com', project: 'chromiumos/platform2', repo: 'chromiumos-platform2' },
  },
  {
    gitiles: { host: 'chromium.googlesource.com', project: 'devtools/devtools-frontend', repo: 'devtools-frontend' },
  },
];

// SVN-era commits use emails like "user@chromium.org@0039d316-1c4b-...".
const normalizeEmail = (email) => email.replace(/^([^@]+@[^@]+)@.*$/, '$1');

// Returns the commit metadata, null if the commit is not in the repository,
// or throws on transient errors.
const fetchCommitFromGithub = async ({owner, repo}, sha) => {
  try {
    console.log("Fetching", sha, repo);
    const response = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner,
      repo,
      ref: sha,
    });
    const data = response.data;
    return {
      message: data.commit.message,
      author: normalizeEmail(data.commit.author.email),
      date: data.commit.author.date,
      repo,
      files: data.files.map(f => f.filename),
    };
  } catch (e) {
    if (e.status == 404 || e.status == 422) {
      return null;
    }
    throw e;
  }
}

const fetchCommitFromGitiles = async ({host, project, repo}, sha) => {
  const url = `https://${host}/${project}/+/${sha}?format=JSON`;
  console.log("Fetching", url);
  const response = await fetch(url);
  if (response.status == 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  const data = JSON.parse(text.substring(text.indexOf('\n') + 1));
  return {
    message: data.message,
    author: normalizeEmail(data.author.email),
    date: new Date(`${data.author.time} UTC`).toISOString(),
    repo,
    files: (data.tree_diff || [])
      .map(f => f.new_path != '/dev/null' ? f.new_path : f.old_path),
  };
}

// Find the Gitiles repository of a commit using cr-rev, which indexes the
// repositories hosted on googlesource.com. It answers chromium/src for unknown
// commits, so this answer is ignored.
const findGitilesRepositoryWithCrrev = async (sha) => {
  try {
    const url = `https://cr-rev.appspot.com/_ah/api/crrev/v1/redirect/${sha}`;
    console.log("Fetching", url);
    const json = await (await fetch(url)).json();
    const match = json.redirectUrl?.match(/^https:\/\/([^\/]+)\/(.+)\/\+\//);
    if (!match || json.repo == "chromium/src") {
      return null;
    }
    const [, host, project] = match;
    const known = kRepositories.find(({gitiles}) =>
      gitiles.host == host && gitiles.project == project);
    return known?.gitiles ||
      { host, project, repo: project.split('/').pop() };
  } catch (e) {
    console.log("Error querying cr-rev", sha, e.message);
    return null;
  }
}

// Search the commit in every known repository. GitHub is tried first, because
// it answers quickly, while Gitiles can take seconds to report a missing
// commit. Returns null if it was not found, or throws on transient errors.
const fetchCommit = async (sha) => {
  const crrev = await findGitilesRepositoryWithCrrev(sha);
  if (crrev) {
    const commit = await fetchCommitFromGitiles(crrev, sha);
    if (commit) {
      return commit;
    }
  }
  if (octokit) {
    for (const {github} of kRepositories) {
      const commit = github && await fetchCommitFromGithub(github, sha);
      if (commit) {
        return commit;
      }
    }
  }
  for (const {gitiles} of kRepositories) {
    const commit = await fetchCommitFromGitiles(gitiles, sha);
    if (commit) {
      return commit;
    }
  }
  return null;
}

const augmentFromGit = async (database) => {
  let index = 0;
  for(const cve of database) {
    // Convert array to object.
    if (Array.isArray(cve.commits)) {
      cve.commits = cve.commits.reduce((acc, commit) => {
        acc[commit] = {}
        return acc
      }, {})
    }

    if (!cve.commits || Object.keys(cve.commits).length == 0) {
      continue;
    }

    for(const sha in cve.commits) {
      // Older versions of this script could insert invalid keys like "null".
      if (!/^[0-9a-f]{40}$/.test(sha)) {
        delete cve.commits[sha];
        continue;
      }

      const type = cve.commits[sha].type;
      if (type == 'automated' ||
        (type != undefined && cve.commits[sha].files != undefined)) {
        continue;
      }

      // Fetch the sha:
      // - description
      // - author
      // - date
      // - reviewer(s) `Reviewed-by:`
      if (++index % 50 == 0) {
        saveDatabase(database);
      }
      let commit;
      try {
        commit = await fetchCommit(sha);
      } catch (e) {
        // Transient error. Retry on the next run.
        console.log("Error fetching", sha, e.message);
        continue;
      }

      if (!commit) {
        cve.commits[sha] = {
          type: 'external',
        }
        continue;
      }

      if (!IsEmailValid(commit.author)) {
        cve.commits[sha] = {
          type: 'automated',
        }
        continue;
      }

      cve.commits[sha] = {
        type: 'commit',
        author: commit.author,
        reviewers: ParseReviewers(commit.message)
          .filter(reviewer => reviewer != commit.author),
        title: commit.message.split('\n')[0],
        date: commit.date,
        repo: commit.repo,
        files: commit.files,
      }
    }
  }
}

//const test = async () => {
  //const browser = await puppeteer.launch({
    //args: ['--no-sandbox', '--disable-setuid-sandbox'],
  //})
  //const page = await browser.newPage()
  //const cve = {
    //"id": "2025-0444",
    //"bug": "https://issues.chromium.org/issues/390889644",
  //};
  //await fetchBugganizer(cve, page)
  //await browser.close()
  //return;
//}

const main = async () => {
  //await test();
  //return;

  await fetchVersionHistory()

  const database = loadDatabase();

  // Step 1: Augment from CVE database.
  await retrieveCveList(database);

  // Step 2: Augment from bugganizer.
  await augmentFromBugganizer(database);

  // Step 3: Augment from git repository.
  await augmentFromGit(database);

  // Final: Save the database to disk.
  saveDatabase(database);
}
main();
