import * as filesystem from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import JSON5 from 'json5';
import { mailMap } from './mailmap.mjs';
import { IsEmailValid } from './is_email_valid.mjs';

const fs = filesystem.promises;
const CONCURRENCY = 64;

const isValidAddress = email => email !== 'deleted' && IsEmailValid(email);

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

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

export const dedupAndSortCommits = (commits, ownerEmail) => {
  const map = new Map();
  for (const commit of commits) {
    commit.peers = [...new Set(commit.peers.map(mailMap))].filter(
      peer => peer !== ownerEmail && isValidAddress(peer),
    );
    // Drop standalone self-review entries whose only peer was the author itself.
    if (commit.kind === 'review' && commit.peers.length === 0) {
      continue;
    }
    // The hash is abbreviated: it identifies a commit together with its date.
    const key = commit.sha ?
      `${commit.date}\0${commit.sha}` :
      `${commit.date}\0${commit.additions}\0${commit.deletions}\0${commit.files}`;
    const preexisting = map.get(key);
    if (!preexisting || (preexisting.kind === 'review' && commit.kind === 'author')) {
      map.set(key, commit);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
};

export const migrateLogins = (logins, survivingEmails) => {
  const next = {};
  for (const [email, login] of Object.entries(logins)) {
    const mapped = mailMap(email);
    if (email === mapped && survivingEmails.has(mapped)) {
      next[mapped] = login;
    }
  }
  for (const [email, login] of Object.entries(logins)) {
    const mapped = mailMap(email);
    if (survivingEmails.has(mapped) && !(mapped in next)) {
      next[mapped] = login;
    }
  }
  return Object.fromEntries(Object.entries(next).sort());
};

export const processRepository = async (repository, dataRoot = '../public/data') => {
  const repoDir = `${dataRoot}/${repository.dirname}`;
  const emailsDir = `${repoDir}/emails`;
  const emailsFilename = `${repoDir}/emails.json`;
  const loginsFilename = `${repoDir}/logins.json`;

  if (!await statIfExists(emailsFilename)) {
    return;
  }

  const emails = JSON.parse(await fs.readFile(emailsFilename, 'utf8'));
  const candidateEmails = new Set();
  let merged = 0;
  let removed = 0;

  for (const email of emails) {
    const mapped = mailMap(email);
    const oldFile = `${emailsDir}/${email}.json`;
    const newFile = `${emailsDir}/${mapped}.json`;

    if (!isValidAddress(mapped)) {
      if (await statIfExists(oldFile)) {
        console.log(`---- Dropping invalid ${email} (${repository.dirname})`);
        await fs.unlink(oldFile);
        removed++;
      }
      continue;
    }

    if (email === mapped) {
      if (await statIfExists(oldFile)) {
        candidateEmails.add(mapped);
      }
      continue;
    }

    const oldStat = await statIfExists(oldFile);
    if (!oldStat) {
      continue;
    }

    console.log(`---- Merging ${email} into ${mapped} (${repository.dirname})`);
    merged++;
    const newStat = await statIfExists(newFile);
    const sameFile = newStat && oldStat.dev === newStat.dev && oldStat.ino === newStat.ino;

    if (!newStat || sameFile) {
      // Read and unlink before writing so case-only normalization is safe on
      // case-insensitive filesystems.
      const oldData = JSON.parse(await fs.readFile(oldFile, 'utf8'));
      const cleaned = dedupAndSortCommits(oldData, mapped);
      await fs.unlink(oldFile);
      if (cleaned.length > 0) {
        await fs.writeFile(newFile, JSON.stringify(cleaned, null, 1));
        candidateEmails.add(mapped);
      }
    } else {
      const oldData = JSON.parse(await fs.readFile(oldFile, 'utf8'));
      const newData = JSON.parse(await fs.readFile(newFile, 'utf8'));
      const combined = dedupAndSortCommits(newData.concat(oldData), mapped);
      await fs.unlink(oldFile);
      if (combined.length > 0) {
        await fs.writeFile(newFile, JSON.stringify(combined, null, 1));
        candidateEmails.add(mapped);
      } else {
        await fs.unlink(newFile);
      }
    }
  }

  // Update peers and deduplicate commits, writing only files that changed.
  const surviving = new Set();
  let rewritten = 0;
  await mapWithConcurrency([...candidateEmails], CONCURRENCY, async email => {
    const file = `${emailsDir}/${email}.json`;
    const raw = await fs.readFile(file, 'utf8');
    const cleaned = dedupAndSortCommits(JSON.parse(raw), email);
    if (cleaned.length === 0) {
      await fs.unlink(file);
      removed++;
      return;
    }
    surviving.add(email);
    const serialized = JSON.stringify(cleaned, null, 1);
    if (serialized !== raw) {
      await fs.writeFile(file, serialized);
      rewritten++;
    }
  });

  const sortedUsers = [...surviving].sort();
  const emailsRaw = await fs.readFile(emailsFilename, 'utf8');
  const emailsOut = JSON.stringify(sortedUsers, null, 1);
  if (emailsOut !== emailsRaw) {
    await fs.writeFile(emailsFilename, emailsOut);
  }

  const loginsRaw = await fs.readFile(loginsFilename, 'utf8').catch(() => null);
  if (loginsRaw !== null) {
    const loginsOut = JSON.stringify(migrateLogins(JSON.parse(loginsRaw), surviving), null, 1);
    if (loginsOut !== loginsRaw) {
      await fs.writeFile(loginsFilename, loginsOut);
    }
  }

  if (merged || removed || rewritten) {
    console.log(`-- ${repository.dirname}: merged=${merged} removed=${removed} rewritten=${rewritten}`);
  }
};

const main = async () => {
  const repositories = JSON5.parse(await fs.readFile('../repositories.json5', 'utf8'));
  for (const repository of repositories) {
    await processRepository(repository);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
