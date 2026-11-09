// Renders the link preview image of /developer-output, from the data of
// the report at its latest period, with a headless Chrome. The image is
// committed: run it again to refresh its figures.
//
// Usage: node scripts/og-developer-output.mjs [data=public/data/developer-output.json]
//        Requires Chrome (CHROME_PATH, default: google-chrome).
// Writes public/img/og/developer-output.png (1200x630).

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dataFile = process.argv[2] || 'public/data/developer-output.json';
const output = path.resolve('public/img/og/developer-output.png');
const chromePath = process.env.CHROME_PATH || 'google-chrome';

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const all = data.repositories.find(r => r.dirname === 'chromium').groups.find(group => group.id === 'all');
const months = data.months;

const pct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100))}%`;
const short = month => new Date(`${month}-15T00:00:00Z`)
  .toLocaleString('en', { month: 'short', timeZone: 'UTC' });
const end = months.length - 1;
const window = `${short(months[end - data.window + 1])}–${short(months[end])}`;
const year = +months.at(-1).slice(0, 4);

// Year-over-year change of the commits, as in the report's first chart.
const bars = [];
for (let i = 12; i < months.length; i++) {
  if (months[i] < '2017-01' || !all.commits[i - 12]) continue;
  bars.push({ month: months[i], r: all.commits[i] / all.commits[i - 12] - 1 });
}

// The window ending at `last`, as on the page.
const sum = (values, last) => values.slice(last - data.window + 1, last + 1).reduce((a, b) => a + b, 0);
const perAuthorAt = last => sum(all.commits, last) / sum(all.authors, last);
const perAuthor = perAuthorAt(end) / perAuthorAt(end - 12) - 1;
const samePeople = 2 ** all.cohort.p50[end] - 1;
const median = data.size_quantiles.indexOf(0.5);
const figures = [
  [pct(perAuthor), 'commits per author'],
  [pct(samePeople), 'commits by the same people'],
  [pct(all.size.q[end][median] / all.size.q[end - 12][median] - 1), 'lines per commit'],
];

// The chart, as an SVG.
const W = 1080, H = 225, lo = -0.25, hi = Math.max(0.5, ...bars.map(b => b.r));
const y = v => H * (1 - (v - lo) / (hi - lo));
const step = W / bars.length;
const rects = bars.map((b, i) => {
  const top = Math.min(y(0), y(b.r)), height = Math.max(1, Math.abs(y(b.r) - y(0)));
  const fill = b.month >= `${year}-01` ? '#6e56cf' : '#d6d6de';
  return `<rect x="${(i * step + 1).toFixed(1)}" y="${top.toFixed(1)}" width="${(step - 2).toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" fill="${fill}"/>`;
}).join('');
const years = bars
  .map((b, i) => b.month.endsWith('-01') && +b.month.slice(0, 4) % 2 === 1
    ? `<text x="${(i * step).toFixed(1)}" y="${H + 22}">${b.month.slice(0, 4)}</text>` : '')
  .join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #ffffff; font-family: Geist, system-ui, sans-serif; color: #121216; padding: 52px 60px; display: flex; flex-direction: column; gap: 22px; }
  .kicker { font-family: 'Geist Mono', monospace; color: #4b3a9e; font-size: 20px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
  h1 { font-size: 60px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
  .figures { display: flex; gap: 44px; }
  .figure b { display: block; font-family: 'Geist Mono', monospace; font-size: 40px; font-weight: 500; }
  .figure span { color: #3a3a44; font-size: 20px; }
  svg text { font-family: 'Geist Mono', monospace; font-size: 15px; fill: #6b6b78; }
  .caption { color: #6b6b78; font-size: 17px; margin-top: -10px; }
  .site { position: absolute; right: 60px; top: 56px; color: #6b6b78; font-size: 20px; }
</style></head>
<body>
  <div class="site">CommitTracker</div>
  <div>
    <div class="kicker">Report · Chromium · ${window} ${year}</div>
    <h1>Chromium developer output</h1>
  </div>
  <div class="figures">
    ${figures.map(([value, label]) => `<div class="figure"><b>${value}</b><span>${label}</span></div>`).join('')}
  </div>
  <svg width="${W}" height="${H + 28}" viewBox="0 0 ${W} ${H + 28}">
    <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#9b9ba8"/>
    ${rects}${years}
  </svg>
  <div class="caption">${window} ${year} against ${window} ${year - 1}. Bars: commits, against the same month a year earlier.</div>
</body></html>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-developer-output-'));
const page = path.join(dir, 'og.html');
fs.writeFileSync(page, html);
fs.mkdirSync(path.dirname(output), { recursive: true });
execFileSync(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1200,630',
  '--virtual-time-budget=5000',
  `--user-data-dir=${path.join(dir, 'profile')}`,
  `--screenshot=${output}`,
  `file://${page}`,
], { stdio: 'ignore' });
fs.rmSync(dir, { recursive: true, force: true });
console.log(`og-developer-output: wrote ${output}`);
