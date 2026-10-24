// Writes the title, description and link preview tags into the generated
// HTML. The website renders on the client (ssr: false), so without this, link
// previews (Slack, X, ...) and search engines see no title.
//
// Usage, after `nuxt generate`:
//   node scripts/static-meta.mjs [output=.output/public] [data=public/data]
//
// - Pages: from utils/site-pages.json, the same metadata app.vue uses.
// - Developer profiles: one page per developer with at least
//   MIN_CONTRIBUTIONS commits and reviews, from scripts/derive-developers.mjs.
//   The others are still served by the 404.html fallback.

import fs from 'fs';
import path from 'path';

const output = process.argv[2] || '.output/public';
const dataDir = process.argv[3] || 'public/data';
const SITE = 'https://chrome-commit-tracker.arthursonzogni.com';
const MIN_CONTRIBUTIONS = 10;

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
    `<meta property="og:image" content="${SITE}/og-image.png">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="CommitTracker">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="@arthursonzogni">`,
  ].join('');
  return html.replace('<head>', '<head>' + tags);
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
    title: page.title ?? `${page.label} · CommitTracker`,
    description: page.description,
    url: SITE + page.path,
  }));
  pageCount++;
}

// Developer profiles. Kept in sync with pages/developers/[name].vue.
const number = new Intl.NumberFormat('en').format;

// Repositories that are a directory of another one (e.g. blink in chromium):
// their commits are also counted in the parent.
const subdirectories = new Set(
  JSON.parse(fs.readFileSync(path.join(dataDir, 'repositories.json'), 'utf8'))
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
    const review = counts.reduce((sum, [, r]) => sum + r, 0);
    // Skip names that can't be a single path segment.
    if (author + review < MIN_CONTRIBUTIONS || !/^[\w.@+-]+$/.test(name) || name.startsWith('.')) {
      continue;
    }
    const firstYear = Math.min(...counts.map(([, , first]) => first));
    const dir = path.join(output, 'developers', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(shell, {
      title: `${name} · CommitTracker`,
      description: `${name}: ${number(author)} commits and ${number(review)} reviews ` +
        `across ${counts.length} web platform repositories, since ${firstYear}.`,
      url: `${SITE}/developers/${name}`,
    }));
    developerCount++;
  }
}

console.log(`static-meta: ${pageCount} pages, ${developerCount} developer profiles`);
