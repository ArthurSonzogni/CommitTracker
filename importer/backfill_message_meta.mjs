// Enriches existing public/data/<repo>/emails/*.json in place with commit
// message length (`msg`), flag bitmask (`flags`), primary bug ID (`bug`), and
// missing `sha` from local git clones under importer/<dirname>, and compacts
// all email JSON files.
//
// Preserves existing `peers` (Gerrit + GitHub PR reviews), `additions`,
// `deletions`, `files`, and `logins.json`.
//
// Usage (from importer/):
//   node backfill_message_meta.mjs [dirname ...]

import fs from 'fs/promises';
import { execFileSync, spawn } from 'child_process';
import JSON5 from 'json5';
import { mailMap } from './mailmap.mjs';
import { parseCommitMessage } from './parse_commit_message.mjs';

const CONCURRENCY = 64;

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        await fn(items[next++]);
      }
    }),
  );
}

const resolveNewestRef = (gitDir) => {
  const candidates = [];
  try {
    const sym = execFileSync('git', ['-C', gitDir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (sym) candidates.push(sym);
  } catch {}
  candidates.push('origin/main', 'origin/master', 'origin/trunk', 'HEAD');

  let bestRef = 'HEAD';
  let bestTime = -1;
  for (const ref of new Set(candidates)) {
    try {
      const ct = Number(execFileSync('git', ['-C', gitDir, 'log', '-1', '--format=%ct', ref], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim());
      if (Number.isFinite(ct) && ct > bestTime) {
        bestTime = ct;
        bestRef = ref;
      }
    } catch {}
  }
  return bestRef;
};

const loadRepoState = async (repo) => {
  const repoDir = `../public/data/${repo.dirname}`;
  const emailsDir = `${repoDir}/emails`;
  const emails = JSON.parse(await fs.readFile(`${repoDir}/emails.json`, 'utf8'));

  const files = new Map();       // email -> commits[]
  const bySha = new Map();       // sha -> entry[]
  const byEmailDate = new Map(); // `${email}\0${date}` -> entry[]
  const byDate = new Map();      // date -> entry[]
  let totalAuthors = 0;

  await mapWithConcurrency(emails, CONCURRENCY, async (email) => {
    const raw = await fs.readFile(`${emailsDir}/${email}.json`, 'utf8');
    const commits = JSON.parse(raw);
    files.set(email, commits);
    for (const c of commits) {
      if (c.kind !== 'author') continue;
      totalAuthors++;
      if (c.sha) {
        let list = bySha.get(c.sha);
        if (!list) bySha.set(c.sha, list = []);
        list.push(c);
      }
      const key = `${email}\0${c.date}`;
      let list = byEmailDate.get(key);
      if (!list) byEmailDate.set(key, list = []);
      list.push(c);

      let dlist = byDate.get(c.date);
      if (!dlist) byDate.set(c.date, dlist = []);
      dlist.push(c);
    }
  });

  return {
    repo,
    emailsDir,
    files,
    bySha,
    byEmailDate,
    byDate,
    totalAuthors,
    matched: 0,
    matchedSet: new Set(),
  };
};

const findTargetEntry = (state, sha, email, date) => {
  // 1. Exact sha + date match.
  const shaList = state.bySha.get(sha);
  if (shaList) {
    for (const entry of shaList) {
      if (entry.date === date && !state.matchedSet.has(entry)) {
        return entry;
      }
    }
  }
  // 2. Same author email + exact committer timestamp.
  const edList = state.byEmailDate.get(`${email}\0${date}`);
  if (edList) {
    for (const entry of edList) {
      if ((!entry.sha || entry.sha === sha) && !state.matchedSet.has(entry)) {
        return entry;
      }
    }
  }
  // 3. Unique-second fallback (handles historical mailmap rewrites).
  const dList = state.byDate.get(date);
  if (dList && dList.length === 1) {
    const entry = dList[0];
    if ((!entry.sha || entry.sha === sha) && !state.matchedSet.has(entry)) {
      return entry;
    }
  }
  return null;
};

const applyParsed = (entry, sha, parsed) => {
  if (!entry.sha) entry.sha = sha;
  entry.msg = parsed.msg;
  if (parsed.flags) {
    entry.flags = parsed.flags;
  } else {
    delete entry.flags;
  }
  if (parsed.bug) {
    entry.bug = parsed.bug;
  } else {
    delete entry.bug;
  }
};

const processGitGroup = async (gitDir, repos) => {
  const ref = resolveNewestRef(gitDir);
  console.log(`\n=== ${gitDir} (ref=${ref}) -> [${repos.map(r => r.dirname).join(', ')}] ===`);

  const states = [];
  for (const repo of repos) {
    states.push(await loadRepoState(repo));
  }

  let scanned = 0;
  await new Promise((resolve, reject) => {
    const proc = spawn(
      'git',
      ['-C', gitDir, 'log', '-z', '--no-merges', '--format=%H%x1f%ae%x1f%ct%x1f%B', ref],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    proc.stdout.setEncoding('utf8');
    let buffer = '';

    const handleRecord = (record) => {
      if (!record) return;
      scanned++;
      const sep1 = record.indexOf('\x1f');
      if (sep1 === -1) return;
      const sep2 = record.indexOf('\x1f', sep1 + 1);
      if (sep2 === -1) return;
      const sep3 = record.indexOf('\x1f', sep2 + 1);
      if (sep3 === -1) return;

      const sha = record.slice(0, 7);
      const rawEmail = record.slice(sep1 + 1, sep2);
      const ct = Number(record.slice(sep2 + 1, sep3));
      if (!Number.isFinite(ct)) return;
      const date = new Date(ct * 1000).toISOString().replace('.000Z', 'Z');
      const email = mailMap(rawEmail);

      let parsed = null;
      for (const state of states) {
        const entry = findTargetEntry(state, sha, email, date);
        if (!entry) continue;
        if (parsed === null) {
          parsed = parseCommitMessage(record.slice(sep3 + 1));
        }
        applyParsed(entry, sha, parsed);
        state.matchedSet.add(entry);
        state.matched++;
      }
    };

    proc.stdout.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      let start = 0;
      while ((idx = buffer.indexOf('\0', start)) !== -1) {
        handleRecord(buffer.slice(start, idx));
        start = idx + 1;
      }
      if (start > 0) buffer = buffer.slice(start);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (buffer) handleRecord(buffer);
      if (code !== 0) reject(new Error(`git log exited with ${code} in ${gitDir}`));
      else resolve();
    });
  });

  // Write compacted JSON files back.
  for (const state of states) {
    const entries = [...state.files.entries()];
    await mapWithConcurrency(entries, CONCURRENCY, async ([email, commits]) => {
      await fs.writeFile(`${state.emailsDir}/${email}.json`, JSON.stringify(commits));
    });
    const pct = state.totalAuthors ? (100 * state.matched / state.totalAuthors).toFixed(2) : '0.00';
    console.log(`  ${state.repo.dirname}: matched ${state.matched}/${state.totalAuthors} (${pct}%) | scanned ${scanned} git commits`);
  }
};

const repositories = JSON5.parse(await fs.readFile('../repositories.json5', 'utf8'));
const filter = new Set(process.argv.slice(2));
const selected = filter.size ? repositories.filter(r => filter.has(r.dirname)) : repositories;

// Group by parent local git clone so parent + cone sub-repos share one git log pass.
const groups = new Map();
for (const repo of selected) {
  const gitDir = repo.parent || repo.dirname;
  let list = groups.get(gitDir);
  if (!list) groups.set(gitDir, list = []);
  list.push(repo);
}

for (const [gitDir, repos] of groups) {
  try {
    await fs.access(`${gitDir}/.git`);
  } catch {
    console.warn(`Skipping ${gitDir}: local clone not found`);
    continue;
  }
  await processGitGroup(gitDir, repos);
}
