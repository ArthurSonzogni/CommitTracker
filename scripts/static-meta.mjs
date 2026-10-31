// Writes the title, description and link preview tags into the generated
// HTML. The website renders on the client (ssr: false), so without this, link
// previews (Slack, X, ...) and search engines see no title.
//
// Usage, after `nuxt generate`:
//   node scripts/static-meta.mjs [output=.output/public] [data=public/data]
//
// - Pages: from utils/site-pages.json, shared with utils/pageMeta.ts & app.vue.
// - Developer profiles: one page per developer with at least
//   MIN_CONTRIBUTIONS commits and reviews, from scripts/derive-developers.mjs.
//   The others are still served by the 404.html fallback.
// - Years in review: one page per developer and year with at least
//   MIN_YEAR_CONTRIBUTIONS commits and reviews that year, from the yearly
//   summaries. Kept in sync with pages/developers/[name]/[year].vue.

import fs from 'fs';
import path from 'path';

const output = process.argv[2] || '.output/public';
const dataDir = process.argv[3] || 'public/data';
const SITE_URL = 'https://chrome-commit-tracker.arthursonzogni.com';
const SITE_NAME = 'CommitTracker';
const SITE_OG_IMAGE = `${SITE_URL}/og-image.png`;
const SITE_TWITTER = '@arthursonzogni';
const MIN_CONTRIBUTIONS = 10;
const MIN_YEAR_CONTRIBUTIONS = 25;

const escape = text => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const shell = fs.readFileSync(path.join(output, '200.html'), 'utf8');

const render = (html, { title, description, url }) => {
  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:url" content="${escape(url)}">`,
    `<meta property="og:image" content="${SITE_OG_IMAGE}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="${SITE_TWITTER}">`,
  ].join('');
  return html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace('<head>', '<head>' + tags);
};

// Pages.
const pages = JSON.parse(fs.readFileSync('utils/site-pages.json', 'utf8'));
let pageCount = 0;
for (const page of pages) {
  const file = path.join(output, page.path, 'index.html');
  if (!fs.existsSync(file)) {
    console.warn(`static-meta: no ${file}`);
    continue;
  }
  fs.writeFileSync(file, render(fs.readFileSync(file, 'utf8'), {
    title: page.title ?? `${page.label} · ${SITE_NAME}`,
    description: page.description,
    url: SITE_URL + page.path,
  }));
  pageCount++;
}

// Developer profiles. Kept in sync with utils/pageMeta.ts and pages/developers/[name]/index.vue.
const number = new Intl.NumberFormat('en').format;
const plural = (count, word, words = `${word}s`) =>
  `${number(count)} ${count === 1 ? word : words}`;

// Repositories that are a directory of another one (e.g. blink in chromium):
// their commits are also counted in the parent.
const allRepositories = JSON.parse(fs.readFileSync(path.join(dataDir, 'repositories.json'), 'utf8'));
const subdirectories = new Set(
  allRepositories
    .filter(repository => repository.parent)
    .map(repository => repository.dirname));

let developerCount = 0;
const developersDir = path.join(dataDir, 'developers');
for (const shard of fs.existsSync(developersDir) ? fs.readdirSync(developersDir) : []) {
  const developers = JSON.parse(fs.readFileSync(path.join(developersDir, shard), 'utf8'));
  for (const [name, repositories] of Object.entries(developers)) {
    const counts = Object.entries(repositories)
      .filter(([dirname]) => !subdirectories.has(dirname))
      .map(([, count]) => count);
    if (counts.length == 0) {
      continue;
    }
    const author = counts.reduce((sum, [a]) => sum + a, 0);
    const review = counts.reduce((sum, [, r]) => r + sum, 0);
    // Skip names that can't be a single path segment.
    if (author + review < MIN_CONTRIBUTIONS || !/^[\w.@+-]+$/.test(name) || name.startsWith('.')) {
      continue;
    }
    const firstYear = Math.min(...counts.map(([, , first]) => first));
    const dir = path.join(output, 'developers', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(shell, {
      title: `${name} · ${SITE_NAME}`,
      description: `${name}: ${number(author)} commits and ${number(review)} reviews ` +
        `across ${counts.length} web platform repositories, since ${firstYear}.`,
      url: `${SITE_URL}/developers/${name}`,
    }));
    developerCount++;
  }
}

// Years in review: {name: {year: {author, review, repositories}}}, over the
// top-level repositories.
const years = new Map();
for (const repository of allRepositories) {
  if (subdirectories.has(repository.dirname)) {
    continue;
  }
  for (const kind of ['author', 'review']) {
    const file = path.join(dataDir, repository.dirname, `usernames_summary_commit_yearly_${kind}.json`);
    if (!fs.existsSync(file)) {
      continue;
    }
    for (const [name, counts] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
      for (const [year, count] of Object.entries(counts)) {
        if (!years.has(name)) {
          years.set(name, {});
        }
        const entry = years.get(name)[year] ??= { author: 0, review: 0, repositories: new Set() };
        entry[kind] += count;
        entry.repositories.add(repository.dirname);
      }
    }
  }
}

let yearCount = 0;
for (const [name, entries] of years) {
  if (!/^[\w.@+-]+$/.test(name) || name.startsWith('.')) {
    continue;
  }
  for (const [year, { author, review, repositories }] of Object.entries(entries)) {
    if (author + review < MIN_YEAR_CONTRIBUTIONS) {
      continue;
    }
    const dir = path.join(output, 'developers', name, year);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(shell, {
      title: `${name} in ${year} · ${SITE_NAME}`,
      description: `${name} in ${year}: ${plural(author, 'commit')} and ${plural(review, 'review')} ` +
        `across ${plural(repositories.size, 'web platform repository', 'web platform repositories')}.`,
      url: `${SITE_URL}/developers/${name}/${year}`,
    }));
    yearCount++;
  }
}

console.log(`static-meta: ${pageCount} pages, ${developerCount} developer profiles, ${yearCount} years in review`);
