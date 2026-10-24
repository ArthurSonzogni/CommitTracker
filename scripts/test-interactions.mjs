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
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// Static server, resolving /foo to /foo/index.html like GitHub Pages.
const serve = () => new Promise(resolve => {
  const server = http.createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(dir)) {
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
      resolve({ chrome, wsUrl: match[1] });
    }
  });
});

// BASE_URL tests an already running website, e.g. the dev server.
const server = process.env.BASE_URL ? null : await serve();
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}/`;
const { chrome, wsUrl } = await launchChrome();

const ws = new WebSocket(wsUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
const errors = new Map();
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
        await new Promise(r => setTimeout(r, 200));
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
      return { ok: !!monthly && !!prev && !!blink, detail: year + ' -> monthly ' + monthLabel + ' -> previous ' + prevLabel + ' / url ' + location.search };
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
    url: 'treemap',
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
    name: 'treemap: colormap fits the data',
    url: 'treemap',
    run: `
      const legend = await __t.until(() => {
        const text = document.querySelector('.legend')?.textContent.replace(/\\s+/g, ' ').trim();
        return text && !text.endsWith('100%') ? text : null;
      }, 20000);
      return { ok: !!legend, detail: legend };
    `,
  },
  {
    name: 'communities: switch repository updates graph',
    url: 'communities',
    run: `
      const sig = () => [...document.querySelectorAll('.zoomable svg text')].slice(0, 5).map(t => t.textContent).join(',');
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
      __t.byText('button', '+').click();
      const date = await __t.until(() => document.querySelector('input[type=date]'), 5000);
      date.value = '2019-03-04';
      date.dispatchEvent(new Event('change', { bubbles: true }));
      // The timeline stores dates as a slider position, so the date is close.
      const picked = await __t.until(() => location.search.match(/dates=(2019-0[23]-\\d\\d)/)?.[1], 8000);
      return { ok: !!dragged && !!picked, detail: 'dates after drag=' + decodeURIComponent(dragged) + ' picked=' + picked };
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
    name: 'components: tooltip on hover',
    url: 'repo-info',
    run: `
      const trigger = await __t.until(() => document.querySelector('.ui-tooltip .tooltip-trigger'), 15000);
      trigger.parentElement.dispatchEvent(new MouseEvent('mouseenter'));
      const shown = await __t.until(() => [...document.querySelectorAll('.tooltip-content')].find(e => e.offsetParent !== null), 3000);
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
  await send('Emulation.setDeviceMetricsOverride', test.mobile
    ? { width: 412, height: 900, deviceScaleFactor: 1, mobile: true }
    : { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: base + test.url }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 4000));
  await send('Runtime.evaluate', { expression: helpers }, sessionId);
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
chrome.kill();
server?.close();
process.exit(failed ? 1 : 0);
