// Renders 1200x630 Open Graph link preview images for flagship pages
// (/security, /accretion, /cve/overview, /repositories) using headless Chrome.
// Matches the visual style of og-developer-output.mjs.
//
// Usage: node scripts/derive/og-cards.mjs [publicDir=public]
//        Requires Chrome (CHROME_PATH, default: google-chrome).

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const publicDir = path.resolve(process.argv[2] || 'public');
const outDir = path.join(publicDir, 'img', 'og');
const chromePath = process.env.CHROME_PATH || 'google-chrome';

const fmtInt = (n) => new Intl.NumberFormat('en').format(Math.round(n));
const fmtCompact = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
};
const fmtMoney = (n) => {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};
const escapeHtml = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function renderCardHtml({ kicker, title, figures, svg, caption }) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #ffffff; font-family: Geist, system-ui, sans-serif; color: #121216; padding: 52px 60px; display: flex; flex-direction: column; gap: 22px; }
  .kicker { font-family: 'Geist Mono', monospace; color: #4b3a9e; font-size: 20px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
  h1 { font-size: 58px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.06; }
  .figures { display: flex; gap: 36px; flex-wrap: nowrap; }
  .figure b { display: block; font-family: 'Geist Mono', monospace; font-size: 38px; font-weight: 500; }
  .figure span { color: #3a3a44; font-size: 18px; }
  svg text { font-family: 'Geist Mono', monospace; font-size: 15px; fill: #6b6b78; }
  .caption { color: #6b6b78; font-size: 17px; margin-top: -10px; }
  .site { position: absolute; right: 60px; top: 56px; color: #6b6b78; font-size: 20px; }
</style></head>
<body>
  <div class="site">CommitTracker</div>
  <div>
    <div class="kicker">${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(title)}</h1>
  </div>
  <div class="figures">
    ${figures.map(([value, label]) => `<div class="figure"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('')}
  </div>
  ${svg}
  <div class="caption">${escapeHtml(caption)}</div>
</body></html>`;
}

function screenshot(html, outFile, tmpDir) {
  const page = path.join(tmpDir, `${path.basename(outFile, '.png')}.html`);
  fs.writeFileSync(page, html);
  execFileSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1200,630',
    '--virtual-time-budget=5000',
    `--user-data-dir=${path.join(tmpDir, 'profile')}`,
    `--screenshot=${outFile}`,
    `file://${page}`,
  ], { stdio: 'ignore' });
  console.log(`og-cards: wrote ${outFile}`);
}

function buildSecurityCard() {
  const file = path.join(publicDir, 'data', 'security.json');
  if (!fs.existsSync(file)) return null;
  const sec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const chromeSpan = sec.spanification.scopes.first_party.repos.find((r) => r.repo === 'chromium');
  const todo = sec.spanification.unsafeTodo.totals;
  const rust = sec.rust.totals;
  const dangling = sec.danglingPointers.totals;

  const series = sec.spanification.unsafeTodo.totalSeries.filter(([, v]) => v > 0);
  const W = 1080, H = 220;
  const maxV = Math.max(1, ...series.map(([, v]) => v));
  const pts = series.map(([, v], i) => {
    const x = series.length > 1 ? (i / (series.length - 1)) * W : W;
    const y = H - (v / maxV) * (H - 18) - 6;
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const labels = [0, Math.floor(series.length / 2), series.length - 1]
    .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
    .map((i) => {
      const x = series.length > 1 ? (i / (series.length - 1)) * W : 0;
      const anchor = i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle';
      return `<text x="${x.toFixed(1)}" y="${H + 22}" text-anchor="${anchor}">${series[i][0].slice(0, 7)}</text>`;
    })
    .join('');

  return renderCardHtml({
    kicker: `Security · 6 repositories · ${sec.latestDate}`,
    title: 'Chromium security hardening',
    figures: [
      [`${chromeSpan ? chromeSpan.coveragePct.toFixed(1) : '—'}%`, 'Chrome spanification'],
      [fmtInt(todo.current), 'UNSAFE_TODO left'],
      [fmtInt(rust.current), 'first-party Rust files'],
      [fmtInt(dangling.current), 'DanglingUntriaged'],
    ],
    svg: `<svg width="${W}" height="${H + 28}" viewBox="0 0 ${W} ${H + 28}">
      <defs>
        <linearGradient id="secFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6e56cf" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#6e56cf" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="#d6d6de"/>
      <path d="${area}" fill="url(#secFill)"/>
      <path d="${line}" fill="none" stroke="#6e56cf" stroke-width="3.5" stroke-linejoin="round"/>
      ${labels}
    </svg>`,
    caption: 'UNSAFE_TODO macro burn-down across Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC.',
  });
}

function buildAccretionCard() {
  const file = path.join(publicDir, 'accretion', 'chromium', 'cohorts.json');
  if (!fs.existsSync(file)) return null;
  const acc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = acc.dates.length;
  const lastRow = acc.lines[n - 1];
  const totalLines = lastRow.reduce((a, b) => a + b, 0);
  const freshPct = totalLines ? ((acc.recent[n - 1] || 0) / totalLines) * 100 : 0;
  const medianYears = (acc.median_age / 365.25).toFixed(1);

  // Downsample to ~120 x-points for crisp SVG.
  const step = Math.max(1, Math.floor(n / 120));
  const indices = [];
  for (let i = 0; i < n; i += step) indices.push(i);
  if (indices.at(-1) !== n - 1) indices.push(n - 1);

  const W = 1080, H = 220;
  const totals = indices.map((i) => acc.lines[i].reduce((a, b) => a + b, 0));
  const maxLines = Math.max(1, ...totals);

  // Group cohorts into 6 color bands so the stacked silhouette reads clearly.
  const numYears = acc.years.length;
  const palette = ['#d6d6de', '#b8b2e8', '#9888de', '#7c65d6', '#6e56cf', '#4b3a9e'];
  const bucketCount = palette.length;
  const cum = indices.map(() => 0);
  const paths = [];

  for (let b = 0; b < bucketCount; b++) {
    const startCol = Math.floor((b * numYears) / bucketCount);
    const endCol = Math.floor(((b + 1) * numYears) / bucketCount);
    const lower = [...cum];
    const upper = indices.map((rowIdx, k) => {
      let s = 0;
      for (let c = startCol; c < endCol; c++) s += acc.lines[rowIdx][c] || 0;
      cum[k] += s;
      return cum[k];
    });
    const topPts = upper.map((v, k) => {
      const x = (k / (indices.length - 1)) * W;
      const y = H - (v / maxLines) * (H - 8);
      return `${k === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const botPts = lower
      .map((v, k) => {
        const x = (k / (indices.length - 1)) * W;
        const y = H - (v / maxLines) * (H - 8);
        return `L${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .reverse();
    paths.push(`<path d="${topPts.join(' ')} ${botPts.join(' ')} Z" fill="${palette[b]}"/>`);
  }

  const firstYear = Number(acc.dates[0].slice(0, 4));
  const lastYear = Number(acc.dates.at(-1).slice(0, 4));
  const yearLabels = [];
  for (let y = firstYear + 1; y <= lastYear; y += 3) {
    const idx = acc.dates.findIndex((d) => d.startsWith(`${y}-`));
    if (idx >= 0) {
      const x = (idx / (n - 1)) * W;
      yearLabels.push(`<text x="${x.toFixed(1)}" y="${H + 22}">${y}</text>`);
    }
  }

  return renderCardHtml({
    kicker: `Code accretion · Chromium · ${acc.dates.at(-1)}`,
    title: 'Lines of code alive by year written',
    figures: [
      [fmtCompact(totalLines), 'lines alive'],
      [`${medianYears}y`, 'median line age'],
      [`${freshPct.toFixed(0)}%`, 'written in last year'],
      [fmtInt(acc.bus_factor), 'bus factor'],
    ],
    svg: `<svg width="${W}" height="${H + 28}" viewBox="0 0 ${W} ${H + 28}">
      ${paths.join('')}
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="#9b9ba8"/>
      ${yearLabels.join('')}
    </svg>`,
    caption: 'Each layer represents lines written in that era that still survive in Chromium today.',
  });
}

function buildCveCard() {
  const file = path.join(publicDir, 'cve', 'summary.json');
  if (!fs.existsSync(file)) return null;
  const cves = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byYear = new Map();
  let totalReward = 0;
  let highCrit = 0;

  for (const c of cves) {
    const y = Number(c.year || (c.published || '').slice(0, 4));
    if (!Number.isFinite(y) || y < 2010) continue;
    const entry = byYear.get(y) || { total: 0, highCrit: 0 };
    entry.total++;
    if (c.severity === 'High' || c.severity === 'Critical') {
      entry.highCrit++;
      highCrit++;
    }
    byYear.set(y, entry);
    const r = Number(c.vrp_reward);
    if (Number.isFinite(r) && r > 0) totalReward += r;
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const W = 1080, H = 220;
  const maxTotal = Math.max(1, ...years.map((y) => byYear.get(y).total));
  const step = W / years.length;
  const barW = Math.max(6, step - 8);

  const bars = years.map((y, i) => {
    const { total, highCrit: hc } = byYear.get(y);
    const x = i * step + (step - barW) / 2;
    const totalH = (total / maxTotal) * (H - 12);
    const hcH = (hc / maxTotal) * (H - 12);
    const label = i % 2 === 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${H + 22}" text-anchor="middle">${y}</text>` : '';
    return `
      <rect x="${x.toFixed(1)}" y="${(H - totalH).toFixed(1)}" width="${barW.toFixed(1)}" height="${totalH.toFixed(1)}" rx="3" fill="#d6d6de"/>
      <rect x="${x.toFixed(1)}" y="${(H - hcH).toFixed(1)}" width="${barW.toFixed(1)}" height="${hcH.toFixed(1)}" rx="3" fill="#eb6834"/>
      ${label}
    `;
  }).join('');

  return renderCardHtml({
    kicker: `Vulnerabilities · Chromium · ${years[0]}–${years.at(-1)}`,
    title: 'Chromium CVEs & VRP rewards',
    figures: [
      [fmtInt(cves.length), 'tracked CVEs'],
      [fmtInt(highCrit), 'High & Critical'],
      [fmtMoney(totalReward), 'VRP rewards'],
    ],
    svg: `<svg width="${W}" height="${H + 28}" viewBox="0 0 ${W} ${H + 28}">
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="#9b9ba8"/>
      ${bars}
    </svg>`,
    caption: 'CVEs per year (orange: High & Critical severity, gray: Medium, Low, and unrated).',
  });
}

function buildRepositoriesCard() {
  const file = path.join(publicDir, 'data', 'repositories_stats.json');
  if (!fs.existsSync(file)) return null;
  const stats = JSON.parse(fs.readFileSync(file, 'utf8'));
  const repos = Object.entries(stats)
    .map(([name, s]) => ({
      name,
      commits: s.total_commits || 0,
      contributors: s.total_contributors || 0,
    }))
    .sort((a, b) => b.commits - a.commits);

  const totalCommits = repos.reduce((sum, r) => sum + r.commits, 0);
  const top = repos.slice(0, 8);
  const W = 1080, H = 225;
  const maxC = Math.max(1, top[0]?.commits || 1);
  const rowH = H / top.length;
  const labelW = 190;
  const barMaxW = W - labelW - 110;

  const rows = top.map((r, i) => {
    const y = i * rowH;
    const bw = Math.max(4, (r.commits / maxC) * barMaxW);
    const fill = i === 0 ? '#6e56cf' : '#9888de';
    return `
      <text x="0" y="${(y + rowH * 0.68).toFixed(1)}" fill="#121216" font-weight="600">${escapeHtml(r.name)}</text>
      <rect x="${labelW}" y="${(y + 5).toFixed(1)}" width="${bw.toFixed(1)}" height="${(rowH - 10).toFixed(1)}" rx="4" fill="${fill}"/>
      <text x="${(labelW + bw + 12).toFixed(1)}" y="${(y + rowH * 0.68).toFixed(1)}">${fmtCompact(r.commits)}</text>
    `;
  }).join('');

  return renderCardHtml({
    kicker: `Web Platform · ${repos.length} repositories`,
    title: 'Web platform repositories',
    figures: [
      [String(repos.length), 'tracked repositories'],
      [fmtCompact(totalCommits), 'total commits'],
      [fmtCompact(stats.chromium?.total_contributors || 0), 'Chromium contributors'],
    ],
    svg: `<svg width="${W}" height="${H + 8}" viewBox="0 0 ${W} ${H + 8}">${rows}</svg>`,
    caption: 'Largest tracked repositories by total commits.',
  });
}

fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-cards-'));

try {
  const cards = [
    ['security.png', buildSecurityCard()],
    ['accretion.png', buildAccretionCard()],
    ['cve-overview.png', buildCveCard()],
    ['repositories.png', buildRepositoriesCard()],
  ];
  for (const [filename, html] of cards) {
    if (!html) continue;
    screenshot(html, path.join(outDir, filename), tmpDir);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
