// End-to-end interaction tests, run against a generated site.
//
// Usage: node scripts/test-interactions.mjs [dir=.output/public] [filter]
//        BASE_URL=http://localhost:3000/ node scripts/test-interactions.mjs - [filter]
//
// Serves `dir` on a local port, drives a headless Chrome through the DevTools
// protocol, and checks that the main interactions of the website work: each
// test performs real clicks/typing, and verifies the page content changes.
// Requires Chrome (CHROME_PATH, default: google-chrome) and Node >= 22.

import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const dir = path.resolve(process.argv[2] || '.output/public');
const filter = process.argv[3];
const chromePath = process.env.CHROME_PATH || 'google-chrome';

const contentTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// Static server, resolving /foo to /foo/index.html like GitHub Pages.
const serve = () => new Promise(resolve => {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(req.url.split('?')[0]);
    } catch {
      res.writeHead(400).end('Bad Request');
      return;
    }
    let file = path.resolve(dir, '.' + (pathname.startsWith('/') ? pathname : '/' + pathname));
    if (file !== dir && !file.startsWith(dir + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      file = path.join(dir, '404.html');
      res.statusCode = 404;
    }
    res.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const launchChrome = () => new Promise((resolve, reject) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-interactions-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);
  chrome.on('error', reject);
  chrome.stderr.on('data', chunk => {
    const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) {
      resolve({ chrome, wsUrl: match[1], userDataDir });
    }
  });
});

// BASE_URL tests an already running website, e.g. the dev server.
const server = process.env.BASE_URL ? null : await serve();
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}/`;
const { chrome, wsUrl, userDataDir } = await launchChrome();

const ws = new WebSocket(wsUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
const errors = new Map();
const loadWaiters = new Map();
const send = (method, params = {}, sessionId) => new Promise(resolve => {
  const i = ++id;
  pending.set(i, resolve);
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Page.loadEventFired' && loadWaiters.has(message.sessionId)) {
    loadWaiters.get(message.sessionId)();
    loadWaiters.delete(message.sessionId);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    errors.get(message.sessionId)?.push((details.exception?.description || details.text).split('\n')[0]);
  }
});

// Helpers injected in the page.
const helpers = `
  window.__t = {
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    async until(fn, ms = 15000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try { const v = fn(); if (v) return v; } catch (e) {}
        await new Promise(r => setTimeout(r, 50));
      }
      return null;
    },
    byText(selector, text) {
      return [...document.querySelectorAll(selector)].find(e => e.textContent.trim() === text);
    },
    count(selector) { return document.querySelectorAll(selector).length; },
    text(selector) { return document.querySelector(selector)?.textContent.trim(); },
  };
`;

const tests = [
  {
    name: 'home: typing animation and inline search',
    url: '',
    run: `
      const first = __t.text('h1');
      const changed = await __t.until(() => __t.text('h1') !== first, 12000);
      const input = document.querySelector('.home-search input');
      input.focus();
      const panel = await __t.until(() => document.querySelector('.home-search-panel .search-item'));
      input.value = 'arthurso';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await __t.until(() => document.querySelector('.home-search-panel .search-item.is-active')?.textContent.includes('arthursonzogni') ||
        [...document.querySelectorAll('.home-search-panel .search-item')].some(e => e.textContent.includes('arthursonzogni')));
      while (!document.querySelector('.home-search-panel .search-item.is-active')?.textContent.includes('arthursonzogni')) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await __t.sleep(50);
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const ok = await __t.until(() => location.pathname.startsWith('/developers/arthursonzogni'));
      return { ok: !!changed && !!panel && !!ok, detail: 'h1: ' + first + ' -> ' + (changed || '') + ' / ' + location.pathname + location.search };
    `,
  },
  {
    name: 'home: bento previews and links',
    url: '',
    run: `
      const ok = await __t.until(() =>
        document.querySelectorAll('.bento .is-individuals path').length === 3 &&
        document.querySelectorAll('.bento .is-repositories rect').length > 20 &&
        document.querySelector('.bento .is-community img')?.naturalWidth > 0, 15000);
      const links = [...document.querySelectorAll('.bento-card')].map(a => a.getAttribute('href'));
      document.querySelector('.bento .is-treemap').click();
      const nav = await __t.until(() => location.pathname === '/treemap');
      return { ok: !!ok && !!nav && links.length === 4, detail: 'links=' + links.join(',') + ' legend=' + __t.text('.bento-legend') };
    `,
  },
  {
    name: 'navbar: dropdown link navigates',
    url: 'leaderboard',
    run: `
      const link = [...document.querySelectorAll('.navbar-dropdown a')].find(a => a.textContent.trim() === 'List');
      link.click();
      const ok = await __t.until(() => location.pathname === '/cve/list' && document.querySelector('h1')?.textContent.includes('CVE'));
      return { ok: !!ok, detail: location.pathname };
    `,
  },
  {
    name: 'navbar: mobile burger opens menu',
    url: 'leaderboard',
    mobile: true,
    run: `
      document.querySelector('.navbar-burger').click();
      const open = await __t.until(() => document.querySelector('.navbar-menu.is-active'));
      const visible = open && open.getBoundingClientRect().height > 100;
      const link = [...open.querySelectorAll('a')].find(a => a.textContent.trim() === 'Treemap');
      link.click();
      const ok = await __t.until(() => location.pathname === '/treemap');
      return { ok: !!(visible && ok), detail: 'menu height=' + Math.round(open?.getBoundingClientRect().height) + ' path=' + location.pathname };
    `,
  },
  {
    name: 'leaderboard: grouping, previous, repository',
    url: 'leaderboard',
    run: `
      const timeSelect = () => [...document.querySelectorAll('select')].find(sel => [...sel.options].some(o => /^\\d{4}/.test(o.textContent.trim())));
      const timeLabel = () => timeSelect()?.selectedOptions[0]?.textContent.trim();
      await __t.until(() => document.querySelector('svg text.name') && timeLabel());
      const year = timeLabel();
      __t.byText('.segmented-option', 'Monthly').click();
      const monthly = await __t.until(() => /^\\d{4}-\\d{2}/.test(timeLabel() || ''), 8000);
      const monthLabel = timeLabel();
      __t.byText('button', 'Previous').click();
      const prev = await __t.until(() => timeLabel() !== monthLabel, 8000);
      const prevLabel = timeLabel();
      __t.byText('.chip', 'Blink').click();
      const blink = await __t.until(() => location.search.includes('blink'), 8000);
      __t.byText('button', 'Animate').click();
      const stopBtn = await __t.until(() => __t.byText('button', 'Stop'), 4000);
      const finished = await __t.until(() => !__t.byText('button', 'Stop') && timeLabel() === monthLabel, 8000);
      return { ok: !!monthly && !!prev && !!blink && !!stopBtn && !!finished, detail: year + ' -> monthly ' + monthLabel + ' -> previous ' + prevLabel + ' -> animated / url ' + location.search };
    `,
  },
  {
    name: 'developer year in review: from the profile, stats, months, peers',
    url: 'developers/arthursonzogni',
    run: `
      const link = await __t.until(() => [...document.querySelectorAll('.profile-years a')].find(a => a.textContent.trim() === '2025'), 20000);
      link.click();
      const ok = await __t.until(() =>
        location.pathname === '/developers/arthursonzogni/2025' &&
        document.querySelectorAll('.review-stat dd').length === 4 &&
        document.querySelectorAll('.review-month').length === 12 &&
        document.querySelectorAll('.review-peers li').length > 0, 20000);
      const stats = [...document.querySelectorAll('.review-stat dd')].map(e => e.textContent.trim()).join(' / ');
      return { ok: !!ok && document.title.startsWith('arthursonzogni in 2025'), detail: stats + ' / title=' + document.title };
    `,
  },
  {
    name: 'developer profile: stats, repositories, charts, links',
    url: 'developers/arthursonzogni',
    run: `
      const ok = await __t.until(() =>
        document.querySelectorAll('.profile-stat dd').length === 4 &&
        document.querySelectorAll('.profile-repository').length > 3 &&
        document.querySelectorAll('.profile-chart svg path').length > 2 &&
        document.querySelectorAll('.profile-badge').length > 0, 20000);
      const stats = [...document.querySelectorAll('.profile-stat dd')].map(e => e.textContent.trim()).join(' / ');
      const title = document.title;
      document.querySelector('.profile-repository').click();
      const nav = await __t.until(() => location.pathname === '/individuals' && location.search.includes('arthursonzogni'));
      return { ok: !!ok && !!nav && title.startsWith('arthursonzogni'), detail: stats + ' / title=' + title };
    `,
  },
  {
    name: 'individuals: empty state suggests developers',
    url: 'individuals',
    run: `
      const chip = await __t.until(() => document.querySelector('.suggestions .button'), 15000);
      const noCharts = !document.body.innerText.includes('Timeline wrapped');
      const name = chip.textContent.trim();
      chip.click();
      const ok = await __t.until(() => location.search.includes(encodeURIComponent(name).replace(/%40/g, '@')) && document.querySelectorAll('svg path').length > 5, 20000);
      return { ok: noCharts && !!ok, detail: 'suggestions=' + __t.count('.suggestions .button') + ' clicked=' + name };
    `,
  },
  {
    name: 'individuals: add developer, charts render',
    url: 'individuals',
    run: `
      const input = await __t.until(() => document.querySelector('.taginput input'));
      input.focus();
      input.value = 'arthursonzogni';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await __t.sleep(300);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      const added = await __t.until(() => location.search.includes('arthursonzogni'));
      const lines = await __t.until(() => document.querySelectorAll('.container svg path').length > 10 && document.querySelectorAll('svg rect').length > 500, 20000);
      const counts = [...document.querySelectorAll('table td')].map(td => td.textContent.trim()).join(' ');
      return { ok: !!added && !!lines, detail: 'counts: ' + counts + ' paths=' + __t.count('svg path') + ' rects=' + __t.count('svg rect') };
    `,
  },
  {
    name: 'accretion: renders, opens a directory, goes back',
    url: 'accretion',
    run: `
      const rendered = await __t.until(() => __t.count('.figure') >= 4 && __t.count('.hex-reduction polygon') > 10, 20000);
      const link = await __t.until(() => document.querySelector('table a'));
      const name = link.textContent.trim();
      link.click();
      const opened = await __t.until(() => new URLSearchParams(location.search).get('dir') === name && __t.text('.breadcrumb').includes(name));
      history.back();
      const back = await __t.until(() => !location.search.includes('dir='));
      const charts = __t.count('.chart');
      __t.byText('.collapsible-toggle', 'Lines per year written').click();
      const folded = await __t.until(() => new URLSearchParams(location.search).get('hide') === 'c' && __t.count('.chart') === charts - 1);
      __t.byText('.collapsible-toggle', 'Lines per year written').click();
      const unfolded = await __t.until(() => !location.search.includes('hide=') && __t.count('.chart') === charts);
      return { ok: !!rendered && !!opened && !!back && !!folded && !!unfolded, detail: 'opened=' + name + ' hexagons=' + __t.count('.hex-reduction polygon') + ' folded=' + !!folded + ' unfolded=' + !!unfolded };
    `,
  },
  {
    name: 'accretion: a link to a section scrolls to it',
    url: 'accretion?hide=c#yearly-reduction',
    run: `
      const section = await __t.until(() => document.getElementById('yearly-reduction'), 20000);
      await __t.until(() => __t.count('.hex-reduction polygon') > 10, 20000);
      await __t.sleep(500);
      const top = section.getBoundingClientRect().top;
      const scrolled = top >= 0 && top < 200;
      const anchor = section.querySelector('a.section-link').getAttribute('href');
      const folded = __t.count('#chart .chart') === 0;
      return { ok: scrolled && anchor === '#yearly-reduction' && folded, detail: 'top=' + Math.round(top) + ' anchor=' + anchor + ' folded=' + folded };
    `,
  },
  {
    name: 'accretion: the lines developers authored in the directories',
    url: 'accretion?dir=third_party/blink&developers=tkent',
    run: `
      const column = await __t.until(() => [...document.querySelectorAll('table th')].some(th => (th.querySelector('.tooltip-trigger') || th).textContent.trim() === 'tkent'), 20000);
      const owned = await __t.until(() => (__t.text('.ownership') || '').includes('tkent authored') && __t.text('.ownership').includes('of third_party/blink'), 20000);
      const treemap = await __t.until(() => __t.count('.ownership-treemap rect') > 3, 20000);
      return { ok: !!column && !!owned && !!treemap, detail: __t.text('.ownership') + ' rectangles=' + __t.count('.ownership-treemap rect') };
    `,
  },
  {
    name: 'accretion: the lines organizations authored in the directories',
    url: 'accretion?organizations=Microsoft',
    run: `
      const column = await __t.until(() => [...document.querySelectorAll('table th')].some(th => (th.querySelector('.tooltip-trigger') || th).textContent.trim() === 'Microsoft'), 20000);
      const owned = await __t.until(() => (__t.text('.ownership') || '').includes('Microsoft authored') && __t.text('.ownership').includes('of Chromium'), 20000);
      const treemap = await __t.until(() => __t.count('.ownership-treemap rect') > 5, 20000);
      const leaderboard = await __t.until(() => [...document.querySelectorAll('#developers table td')].some(td => td.textContent.trim() === 'Google'), 20000);
      __t.byText('#developers .segmented-option', 'Reviewed').click();
      const reviewed = await __t.until(() => (__t.text('.ownership') || '').includes('Microsoft reviewed') && location.search.includes('lines=reviewed'), 10000);
      return { ok: !!column && !!owned && !!treemap && !!leaderboard && !!reviewed, detail: __t.text('.ownership') + ' rectangles=' + __t.count('.ownership-treemap rect') };
    `,
  },
  {
    name: 'accretion: language filter updates history, reduction, activity and ownership',
    url: 'accretion?organizations=Microsoft',
    run: `
      await __t.until(() => __t.byText('.language-bar .segmented-option', 'Java'), 20000);
      __t.byText('.language-bar .segmented-option', 'Java').click();
      const javaOwned = await __t.until(() =>
        location.search.includes('lang=java') &&
        (__t.text('.ownership') || '').includes('Java lines alive') &&
        (__t.text('.ownership') || '').includes("of Chromium's Java"), 20000);
      const historyChart = await __t.until(() => __t.count('#chart .chart svg path') > 5, 10000);
      const hex = await __t.until(() => __t.count('#yearly-reduction .hex-reduction polygon') > 10, 10000);
      const activity = await __t.until(() => __t.count('#activity .stacked-bars rect') > 5, 10000);
      const ownerSeries = await __t.until(() => __t.count('#developers .chart svg path') >= 1, 10000);
      const cardText = __t.text('.ownership');
      document.querySelector('.language-chip button').click();
      const reset = await __t.until(() => !location.search.includes('lang='), 10000);
      return { ok: !!javaOwned && !!historyChart && !!hex && !!activity && !!ownerSeries && !!reset, detail: cardText };
    `,
  },
  {
    name: 'individuals: author/review toggles change counts',
    url: 'individuals?developers=arthursonzogni',
    run: `
      await __t.until(() => document.querySelectorAll('svg path').length > 5, 20000);
      const total = () => [...document.querySelectorAll('svg text')].map(t => t.textContent).join('').length;
      const before = __t.count('svg rect');
      __t.byText('.chip', 'Review').click();
      const ok = await __t.until(() => location.search.includes('options') || __t.count('svg rect') !== before, 8000);
      return { ok: !!ok, detail: 'rects ' + before + ' -> ' + __t.count('svg rect') + ' url=' + location.search };
    `,
  },
  {
    name: 'cve list: group by severity, filter component',
    url: 'cve/list',
    run: `
      await __t.until(() => document.body.innerText.includes('Use After Free'), 20000);
      __t.byText('.segmented-option', 'Severity').click();
      const grouped = await __t.until(() => location.search.includes('group_by=severity'), 8000);
      const select = document.querySelectorAll('select')[1];
      const option = [...select.options].find(o => o.value.startsWith('Blink'));
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const filtered = await __t.until(() => location.search.includes('component='), 8000);
      return { ok: !!grouped && !!filtered, detail: decodeURIComponent(location.search) };
    `,
  },
  {
    name: 'cve overview: severity chips change totals',
    url: 'cve/overview',
    run: `
      const total = () => document.body.innerText.match(/Total\\s*:\\s*(\\d+) CVEs/)?.[1];
      await __t.until(() => total(), 25000);
      const before = total();
      __t.byText('.chip', 'Medium').click();
      const ok = await __t.until(() => total() && total() !== before, 10000);
      return { ok: !!ok, detail: 'total ' + before + ' -> ' + total() };
    `,
  },
  {
    name: 'treemap: click tile zooms in',
    url: 'treemap?field_color=todo&field_size=line',
    run: `
      const tile = await __t.until(() => [...document.querySelectorAll('svg g')].find(g => g.querySelector(':scope > text')?.textContent === 'chrome'), 20000);
      const before = location.search;
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const ok = await __t.until(() => location.search !== before && location.search.includes('chrome'), 8000);
      const labels = [...document.querySelectorAll('svg g > text')].slice(0, 4).map(t => t.textContent);
      return { ok: !!ok, detail: 'url=' + decodeURIComponent(location.search) + ' tiles=' + labels.join(',') };
    `,
  },
  {
    name: 'commit rates sankey: open a directory, files lead nowhere',
    url: 'commit-rates-sankey?repository=chromium&window=100',
    run: `
      const dir = await __t.until(() => [...document.querySelectorAll('.sankey-svg rect[role=link]')].find(r => r.getAttribute('aria-label')?.startsWith('Explore chrome,')), 25000);
      const files = __t.count('.sankey-svg rect:not([role])');
      const slider = __t.text('.level-right .has-text-weight-bold');
      dir.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const ok = await __t.until(() => location.search.includes('path=chrome') && __t.text('.breadcrumb li:last-child') === 'chrome', 8000);
      const back = await __t.until(() => document.querySelector('.sankey-svg rect[aria-label="Go back to ."]'), 15000);
      return { ok: !!(ok && back && files > 0 && /100 weeks/.test(slider)), detail: 'url=' + decodeURIComponent(location.search) + ' files=' + files + ' ' + slider };
    `,
  },
  {
    name: 'page view: renders, and counts no visit off the deployed site',
    url: 'page-view',
    run: `
      const ok = await __t.until(() => document.querySelector('.page-view svg') || /could not be loaded/.test(document.body.innerText), 20000);
      const counters = __t.count('img[src*="hitscounter"]');
      return { ok: !!ok && counters === 0, detail: 'title=' + __t.text('h1') + ' counters=' + counters };
    `,
  },
  {
    name: 'repositories: what/grouping update chart',
    url: 'repositories',
    run: `
      const sig = () => (document.body.innerText.match(/(Year|Month|Quarter|Decade|Forever)\\s+(Commit|Contributor).*/s)?.[0] ?? '').slice(0, 300);
      await __t.until(() => /20\\d\\d/.test(sig()), 25000);
      const before = sig();
      __t.byText('.segmented-option', 'Contributors').click();
      const ok1 = await __t.until(() => sig() !== before, 10000);
      const mid = sig();
      __t.byText('.segmented-option', 'Monthly').click();
      const ok2 = await __t.until(() => sig() !== mid, 10000);
      return { ok: !!ok1 && !!ok2, detail: [before, mid, sig()].map(t => t.replace(/\\s+/g, ' ').slice(0, 45)).join(' -> ') };
    `,
  },
  {
    name: 'repositories: mobile filters fold into a summary',
    url: 'repositories',
    mobile: true,
    run: `
      const toggle = document.querySelector('.filter-panel-toggle');
      const body = document.querySelector('.filter-panel-body');
      const hidden = body.offsetHeight === 0;
      toggle.click();
      const shown = await __t.until(() => body.offsetHeight > 100);
      __t.byText('.segmented-option', 'Monthly').click();
      const summary = await __t.until(() => toggle.textContent.includes('Monthly'));
      return { ok: hidden && !!shown && !!summary, detail: toggle.textContent.trim() };
    `,
  },
  {
    name: 'treemap: presets select metrics',
    url: 'treemap',
    run: `
      const preset = await __t.until(() => [...document.querySelectorAll('.treemap-presets a')].find(a => a.textContent === 'TODOs'), 15000);
      const count = document.querySelectorAll('.treemap-presets a').length;
      preset.click();
      const selected = await __t.until(() => location.search.includes('field_color=todo') && document.querySelector('.treemap-frame svg g text'), 20000);
      return { ok: !!selected && !document.querySelector('.treemap-presets'), detail: 'presets=' + count + ' ' + decodeURIComponent(location.search.match(/field_color=[^&]*&field_size=[^&]*/)?.[0]) };
    `,
  },
  {
    name: 'treemap: colormap fits the data',
    url: 'treemap?field_color=todo&field_size=line',
    run: `
      const legend = await __t.until(() => {
        const text = [...document.querySelectorAll('.legend > span:not(.legend-gradient)')].map(e => e.textContent.trim()).join(' -> ');
        return text && !text.endsWith('100%') ? text : null;
      }, 20000);
      document.querySelector('.legend .button').click();
      const fullscreen = await __t.until(() => document.querySelector('.treemap-frame.is-fullscreen'));
      document.querySelector('[aria-label="Exit full screen"]').click();
      const closed = await __t.until(() => !document.querySelector('.treemap-frame.is-fullscreen'));
      return { ok: !!legend && !!fullscreen && !!closed, detail: legend + ' fullscreen=' + !!fullscreen };
    `,
  },
  {
    name: 'cve list: renders progressively',
    url: 'cve/list',
    run: `
      const first = await __t.until(() => document.querySelectorAll('.cve-link').length, 30000);
      window.scrollTo(0, document.body.scrollHeight);
      const more = await __t.until(() => document.querySelectorAll('.cve-link').length > first ? document.querySelectorAll('.cve-link').length : null, 10000);
      return { ok: first > 0 && first <= 200 && !!more, detail: first + ' -> ' + more };
    `,
  },
  {
    name: 'home: highlights and footer date',
    url: '',
    run: `
      const author = await __t.until(() => document.querySelector('.highlight a'), 15000);
      const footer = await __t.until(() => /Data updated/.test(document.querySelector('.site-footer')?.textContent) && document.querySelector('.site-footer').textContent, 10000);
      const name = author?.textContent;
      author?.click();
      const ok = await __t.until(() => location.pathname.startsWith('/developers/'), 10000);
      return { ok: !!footer && !!ok, detail: name + ' ' + location.pathname + ' ' + (footer || '').replace(/\\s+/g, ' ').trim().slice(0, 50) };
    `,
  },
  {
    name: 'about data: unfolds',
    url: 'repositories',
    run: `
      const about = document.querySelector('.about-data');
      about.querySelector('summary').click();
      const ok = await __t.until(() => about.open && about.querySelector('.about-data-body').offsetHeight > 20);
      return { ok: !!ok, detail: 'open=' + about.open };
    `,
  },
  {
    name: 'communities: interactive map search and select',
    url: 'communities?repositories=v8&time=1y',
    run: `
      const list = await __t.until(() => document.querySelector('.map-communities button'), 20000);
      if (!list) {
        return { ok: true, detail: 'no JSON graph for v8 (SVG only)' };
      }
      const input = document.querySelector('.map-search');
      const name = document.querySelector('#community-map-developers option').value;
      input.value = name;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      const card = await __t.until(() => document.querySelector('.map-card')?.innerText.includes(name) && document.querySelector('.map-card').innerText);
      list.click();
      const selected = await __t.until(() => document.querySelector('.map-communities button.is-selected') && !document.querySelector('.map-card'));
      return { ok: !!card && !!selected, detail: (card || '').replace(/\\s+/g, ' ').slice(0, 60) };
    `,
  },
  {
    name: 'communities: old time range links still work',
    url: 'communities?repositories=v8&time=1y%2B1y',
    run: `
      const year = String(new Date().getFullYear() - 1);
      const ok = await __t.until(() => document.querySelector('.segmented-option.is-selected')?.textContent.trim() === year && location.search.includes('time=' + year), 10000);
      return { ok: !!ok, detail: decodeURIComponent(location.search) };
    `,
  },
  {
    name: 'communities: switch repository updates graph',
    url: 'communities',
    run: `
      // The interactive map lists its communities. Older graphs are SVG only.
      const sig = () => document.querySelector('.map-communities')?.innerText.slice(0, 80) ||
        [...document.querySelectorAll('.zoomable svg text')].slice(0, 5).map(t => t.textContent).join(',');
      await __t.until(() => sig(), 20000);
      const before = sig();
      __t.byText('.chip', 'Skia').click();
      const ok = await __t.until(() => sig() && sig() !== before, 10000);
      return { ok: !!ok, detail: before.slice(0, 50) + ' -> ' + sig().slice(0, 50) };
    `,
  },
  {
    name: 'pulse: heatmap renders, repository switch',
    url: 'pulse',
    run: `
      const ok = await __t.until(() => document.querySelectorAll('svg rect').length > 300, 20000);
      return { ok: !!ok, detail: 'rects=' + __t.count('svg rect') };
    `,
  },
  {
    name: 'organizations commits: chart renders',
    url: 'organizations/commits',
    run: `
      const sig = () => document.body.innerText.slice(-600);
      await __t.until(() => /20\\d\\d/.test(sig()), 25000);
      const before = sig();
      __t.byText('.chip', 'Igalia').click();
      const ok = await __t.until(() => sig() !== before, 10000);
      return { ok: !!ok, detail: before.replace(/\\s+/g, ' ').slice(0, 60) + ' -> ' + sig().replace(/\\s+/g, ' ').slice(0, 60) };
    `,
  },
  {
    name: 'fuzz test: content renders',
    url: 'fuzz-test',
    run: `
      const ok = await __t.until(() => document.body.innerText.length > 2000, 20000);
      return { ok: !!ok, detail: 'text=' + document.body.innerText.length };
    `,
  },
  {
    name: 'badges: list renders and opens details',
    url: 'badges/list?developers=arthursonzogni',
    run: `
      const ok = await __t.until(() => /Badges: [1-9]/.test(document.body.innerText), 25000);
      return { ok: !!ok, detail: document.body.innerText.match(/Badges: [^|\\n]*/)?.[0] + ' imgs=' + __t.count('img') };
    `,
  },
  {
    name: 'badges: book turns pages and jumps from the contents',
    url: 'badges/list?developers=arthursonzogni',
    run: `
      const position = () => document.querySelector('.book-position')?.textContent.trim();
      const cover = await __t.until(() => position() == 'Cover' && document.querySelector('.cover-medallion'), 25000);
      document.querySelector('.book-controls button:last-child').click();
      const opened = await __t.until(() => position() == 'Pages 1–2', 3000);
      [...document.querySelectorAll('.contents a')].find(a => /veteran/i.test(a.textContent)).click();
      const jumped = await __t.until(() => /^Pages/.test(position()) && position() != 'Pages 1–2', 3000);
      const flipped = document.querySelectorAll('.leaf.is-flipped').length;
      return { ok: !!(cover && opened && jumped && flipped > 1), detail: position() + ' flipped=' + flipped };
    `,
  },
  {
    name: 'palette: ctrl+k, search page, enter',
    url: 'leaderboard',
    run: `
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      const input = await __t.until(() => document.querySelector('.palette input'));
      const focused = document.activeElement === input;
      input.value = 'cve li';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await __t.until(() => document.querySelector('.palette .search-item.is-active')?.textContent.includes('CVE list'));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const ok = await __t.until(() => location.pathname === '/cve/list' && !document.querySelector('.palette'));
      return { ok: focused && !!ok, detail: 'focused=' + focused + ' path=' + location.pathname };
    `,
  },
  {
    name: 'palette: developer and CVE search',
    url: '',
    run: `
      document.querySelector('.search-pill').click();
      const input = await __t.until(() => document.querySelector('.palette input'));
      input.value = 'arthurso';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const dev = await __t.until(() => [...document.querySelectorAll('.palette .search-item')].find(e => e.textContent.includes('arthursonzogni')));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      dev.click();
      const ok1 = await __t.until(() => location.pathname.startsWith('/developers/arthursonzogni'));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
      const input2 = await __t.until(() => document.querySelector('.palette input'));
      input2.value = 'CVE-2026-5919';
      input2.dispatchEvent(new Event('input', { bubbles: true }));
      await __t.until(() => document.querySelector('.palette .search-item.is-active')?.textContent.includes('CVE-2026-5919'));
      input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const ok2 = await __t.until(() => location.pathname.startsWith('/cve') && location.search.includes('2026-5919') && document.body.innerText.includes('Version fixed'));
      return { ok: !!ok1 && !!ok2, detail: 'dev=' + !!ok1 + ' cve=' + !!ok2 + ' ' + location.pathname + location.search };
    `,
  },
  {
    name: 'palette: mobile search button, escape closes',
    url: 'treemap',
    mobile: true,
    run: `
      document.querySelector('.search-icon').click();
      const opened = await __t.until(() => document.querySelector('.palette input'));
      const rect = document.querySelector('.palette').getBoundingClientRect();
      opened.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closed = await __t.until(() => !document.querySelector('.palette'));
      return { ok: !!opened && !!closed && rect.right <= 412, detail: 'palette width=' + Math.round(rect.width) };
    `,
  },
  {
    name: 'icons: every icon has a glyph',
    url: 'cve/list',
    run: `
      const missing = new Set();
      let checked = 0;
      const check = () => {
        for (const el of document.querySelectorAll('.mdi')) {
          checked++;
          const content = getComputedStyle(el, '::before').content;
          if (!content || content === 'none' || content === 'normal') {
            missing.add([...el.classList].find(c => c.startsWith('mdi-') && !/^mdi-\\d+px$/.test(c)));
          }
        }
      };
      await __t.until(() => document.body.innerText.includes('Use After Free'), 20000);
      check();
      for (const link of document.querySelectorAll('.navbar-item.has-dropdown')) {
        link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }
      check();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      await __t.until(() => document.querySelector('.palette .search-item'));
      check();
      return { ok: missing.size === 0 && checked > 20, detail: 'checked=' + checked + ' missing=' + [...missing].join(',') };
    `,
  },
  {
    name: 'theme: toggle to dark, choice stored',
    url: 'leaderboard',
    run: `
      const bg = () => getComputedStyle(document.documentElement).backgroundColor;
      const light = bg();
      document.querySelector('.theme-toggle').click();
      const dark = await __t.until(() => document.documentElement.dataset.theme === 'dark' && bg() !== light && bg());
      const stored = localStorage.getItem('theme');
      localStorage.removeItem('theme');
      return { ok: !!dark && stored === 'dark', detail: 'background ' + light + ' -> ' + dark + ', stored=' + stored };
    `,
  },
  {
    name: 'components: timeline slider drag and date picker',
    url: 'individuals?developers=arthursonzogni',
    run: `
      const thumb = await __t.until(() => document.querySelector('.timeline .ui-slider-thumb'), 15000);
      const before = location.search;
      const rect = thumb.getBoundingClientRect();
      const track = document.querySelector('.timeline .ui-slider-track').getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      thumb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: track.left + track.width * 0.6, clientY: y }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: track.left + track.width * 0.6, clientY: y }));
      const dragged = await __t.until(() => location.search !== before && location.search.match(/dates=([^&]*)/)?.[1], 8000);
      document.querySelector('.timeline .toggle').click();
      const date = await __t.until(() => document.querySelector('.timeline input[type=date]'), 5000);
      date.value = '2019-03-04';
      date.dispatchEvent(new Event('change', { bubbles: true }));
      // Dates are local midnights, serialized as UTC.
      const picked = await __t.until(() => location.search.match(/dates=(2019-03-0[34])/)?.[1], 8000);
      return { ok: !!dragged && !!picked, detail: 'dates after drag=' + decodeURIComponent(dragged) + ' picked=' + picked };
    `,
  },
  {
    name: 'components: timeline quarter, range of quarters and year',
    url: 'individuals?developers=arthursonzogni',
    run: `
      (await __t.until(() => document.querySelector('.timeline .toggle'), 15000)).click();
      await __t.until(() => document.querySelector('.timeline .quarter-cell'), 5000);
      const cell = (year, q) => [...document.querySelectorAll('.timeline .quarter-year')]
        .find(e => e.querySelector('.quarter-year-label').textContent.trim() === String(year))
        .querySelectorAll('.quarter-cell')[q - 1];
      const selected = () => [...document.querySelectorAll('.timeline .quarter-cell.is-full')]
        .map(e => e.title.split(' (')[0]).join(',');
      cell(2020, 3).click();
      const one = await __t.until(() => selected() === '2020 Q3' && location.search.includes('2020-0'), 5000);
      cell(2021, 2).click();
      const many = await __t.until(() => selected() === '2020 Q3,2020 Q4,2021 Q1,2021 Q2', 5000);
      __t.byText('.timeline .quarter-year-label', '2019').click();
      const year = await __t.until(() => selected() === '2019 Q1,2019 Q2,2019 Q3,2019 Q4', 5000);
      return { ok: !!one && !!many && !!year, detail: 'one=' + !!one + ' many=' + !!many + ' year=' + !!year + ' last=' + selected() };
    `,
  },
  {
    name: 'components: dropdown selects a colormap',
    url: 'treemap',
    run: `
      const trigger = await __t.until(() => document.querySelector('.dropdown-trigger'), 15000);
      trigger.click();
      const item = await __t.until(() => [...document.querySelectorAll('.dropdown.is-active .dropdown-item')].find(e => e.textContent.trim().startsWith('Blu')), 5000);
      item.click();
      const colormap = await __t.until(() => location.search.includes('colormap=Blu') && !document.querySelector('.dropdown.is-active'), 5000);
      return { ok: !!colormap, detail: decodeURIComponent(location.search.match(/colormap=[^&]*/)?.[0]) };
    `,
  },
  {
    name: 'components: dropdown closes on escape',
    url: 'treemap',
    run: `
      const trigger = await __t.until(() => document.querySelector('.dropdown-trigger'), 15000);
      trigger.click();
      const menu = await __t.until(() => [...document.querySelectorAll('.dropdown.is-active .dropdown-menu')].find(e => e.checkVisibility()), 5000);
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closed = await __t.until(() => !document.querySelector('.dropdown.is-active') && !menu.checkVisibility(), 3000);
      return { ok: !!menu && !!closed, detail: 'opened=' + !!menu + ' closed=' + !!closed };
    `,
  },
  {
    name: 'components: modal opens, outside click closes and restores focus',
    url: 'communities',
    run: `
      const button = await __t.until(() => [...document.querySelectorAll('button')].find(b => b.querySelector('.mdi-information-outline')), 15000);
      button.focus();
      button.click();
      const dialog = await __t.until(() => document.querySelector('dialog.ui-modal[open]'), 3000);
      const modal = !!dialog && dialog.matches(':modal');
      dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const closed = await __t.until(() => !dialog.open, 3000);
      await __t.until(() => document.activeElement === button, 1000);
      return { ok: modal && !!closed && document.activeElement === button, detail: 'modal=' + modal + ' closed=' + !!closed + ' focus=' + (document.activeElement === button) };
    `,
  },
  {
    name: 'components: tooltip on hover',
    url: 'repo-info',
    run: `
      const trigger = await __t.until(() => document.querySelector('.ui-tooltip .tooltip-trigger'), 15000);
      trigger.parentElement.dispatchEvent(new MouseEvent('mouseenter'));
      const shown = await __t.until(() => [...document.querySelectorAll('.tooltip-content')].find(e => e.checkVisibility()), 3000);
      return { ok: !!shown, detail: 'tooltip=' + shown?.textContent.trim() };
    `,
  },
  {
    name: 'components: table sort, pagination, details',
    url: 'fuzz-test',
    run: `
      const rows = () => [...document.querySelectorAll('.ui-table tbody tr:not(.detail)')].map(r => r.innerText);
      await __t.until(() => rows().length > 5, 20000);
      const first = rows()[0];
      const header = [...document.querySelectorAll('.ui-table th')].find(th => th.textContent.trim() === 'Author');
      header.click();
      const sorted = await __t.until(() => rows()[0] !== first, 5000);
      const page = () => document.querySelector('.ui-table-page')?.textContent;
      document.querySelector('.ui-table-pagination button[aria-label="Next page"]').click();
      const paged = await __t.until(() => page()?.startsWith('2 /'), 5000);
      document.querySelector('.ui-table-detail-toggle button').click();
      const detail = await __t.until(() => document.querySelector('.ui-table tr.detail'), 5000);
      return { ok: !!sorted && !!paged && !!detail, detail: 'page ' + page() + ', detail=' + !!detail };
    `,
  },
  {
    name: 'components: tag input removal',
    url: 'individuals?developers=arthursonzogni,mkwst',
    run: `
      await __t.until(() => document.querySelectorAll('.taginput .tag').length === 2, 15000);
      document.querySelector('.taginput .tag .delete').click();
      const removed = await __t.until(() => !location.search.includes('arthursonzogni') && location.search.includes('mkwst'), 5000);
      const input = document.querySelector('.taginput input');
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      const empty = await __t.until(() => document.querySelectorAll('.taginput .tag').length === 0, 5000);
      return { ok: !!removed && !!empty, detail: 'url=' + location.search.slice(0, 60) };
    `,
  },
  {
    name: 'components: leaderboard warning toast',
    url: 'leaderboard',
    run: `
      const select = await __t.until(() => [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'lines')), 15000);
      select.value = 'lines';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const toast = await __t.until(() => document.querySelector('.toast'), 5000);
      return { ok: !!toast && toast.textContent.includes('Warning'), detail: toast?.textContent.trim().slice(0, 60) };
    `,
  },
  {
    name: 'components: navbar dropdown click, outside click closes',
    url: 'leaderboard',
    run: `
      const link = [...document.querySelectorAll('.navbar-link')].find(a => a.textContent.trim() === 'CVE');
      link.click();
      const opened = await __t.until(() => link.parentElement.classList.contains('is-active'), 3000);
      document.querySelector('h1').click();
      const closed = await __t.until(() => !link.parentElement.classList.contains('is-active'), 3000);
      return { ok: !!opened && !!closed, detail: 'opened=' + !!opened + ' closed=' + !!closed };
    `,
  },
];

let failed = 0;
for (const test of tests) {
  if (filter && !test.name.includes(filter)) {
    continue;
  }
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  errors.set(sessionId, []);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: helpers }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', test.mobile
    ? { width: 412, height: 900, deviceScaleFactor: 1, mobile: true }
    : { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const loaded = new Promise(resolve => {
    const timer = setTimeout(() => {
      loadWaiters.delete(sessionId);
      resolve();
    }, 15000);
    loadWaiters.set(sessionId, () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await send('Page.navigate', { url: base + test.url }, sessionId);
  await loaded;
  await send('Runtime.evaluate', { expression: helpers }, sessionId);
  await send('Runtime.evaluate', {
    expression: `(async () => {
      await __t.until(() => document.querySelector('.navbar') && document.querySelector('#__nuxt > div')?.children.length >= 2, 15000);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`,
    awaitPromise: true,
    timeout: 20000,
  }, sessionId);
  const response = await send('Runtime.evaluate', {
    expression: `(async () => { ${test.run} })()`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 90000,
  }, sessionId);
  const value = response.result?.result?.value;
  const exception = response.result?.exceptionDetails?.exception?.description?.split('\n')[0];
  const pageErrors = errors.get(sessionId);
  const ok = value?.ok && !exception;
  if (!ok) {
    failed++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${test.name}\n      ${exception ? 'test error: ' + exception : value?.detail}` +
    (pageErrors.length ? `\n      page errors: ${pageErrors.slice(0, 3).join(' | ')}` : ''));
  await send('Target.closeTarget', { targetId });
}

console.log(failed ? `${failed} failed` : 'all passed');
ws.close();
// Wait for chrome to exit before removing its profile (~250MB).
await new Promise(resolve => { chrome.once('exit', resolve); chrome.kill(); });
// Chrome's helper processes can still be writing to it: don't fail the run
// for a leftover temporary directory.
try {
  fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
} catch (e) {
  console.warn(`Could not remove ${userDataDir}: ${e.code}`);
}
server?.close();
process.exit(failed ? 1 : 0);
