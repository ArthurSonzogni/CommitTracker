import path from 'path';
import {spawn} from 'child_process';
import crypto from 'crypto';
import JSON5 from 'json5';
import fs from 'fs/promises';

import {IsEmailValid} from './is_email_valid.mjs';

// --- Configuration ---
const CONFIG = {
  baseOutputDir: '../public/commit_rates', // Base output directory
  bucketCount: 2048,
  startDate: '2018-01-01',
};


// --- Helpers ---
async function parseFile(library, filename) {
  return library.parse(await fs.readFile(filename, "utf8"));
}

function getBucketId(filepath) {
  let hash = 5381;
  for (let i = 0; i < filepath.length; i++) {
    hash = ((hash << 5) + hash) ^ filepath.charCodeAt(i);
  }
  return (hash >>> 0) % CONFIG.bucketCount;
}

function getTimeBucketIndex(date) {
  const start = new Date(CONFIG.startDate);
  const diffTime = date.getTime() - start.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return Math.floor(diffDays / 7);
}

function compressRates(rates) {
  if (!rates || rates.length === 0) return [];
  const compressed = [];
  let buffer = [];
  let bufferStartIndex = -1;
  let pendingZeros = 0;

  for (let i = 0; i < rates.length; i++) {
    const val = rates[i];
    if (val === 0) {
      if (bufferStartIndex !== -1) pendingZeros++;
      continue;
    }
    if (bufferStartIndex === -1) {
      bufferStartIndex = i;
      buffer.push(val);
      pendingZeros = 0;
      continue;
    }
    if (pendingZeros <= 3) {
      for (let z = 0; z < pendingZeros; z++) buffer.push(0);
      buffer.push(val);
      pendingZeros = 0;
      continue;
    }
    compressed.push(bufferStartIndex);
    compressed.push(buffer);
    bufferStartIndex = i;
    buffer = [val];
    pendingZeros = 0;
  }
  if (bufferStartIndex !== -1) {
    compressed.push(bufferStartIndex);
    compressed.push(buffer);
  }
  return compressed;
}

function decompressRates(compressed) {
  if (!compressed || compressed.length === 0) return [];
  let maxLen = 0;
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i+1];
    const end = start + data.length;
    if (end > maxLen) maxLen = end;
  }
  const rates = new Array(maxLen).fill(0);
  for (let i = 0; i < compressed.length; i += 2) {
    const start = compressed[i];
    const data = compressed[i+1];
    for (let j = 0; j < data.length; j++) {
      rates[start + j] = data[j];
    }
  }
  return rates;
}

async function runCommand(command, args, cwd = process.cwd(), env = process.env, liveLineCallback = null) {
  if (typeof env === 'function') {
    liveLineCallback = env;
    env = process.env;
  }
  const proc = spawn(command, args, { cwd, env: { ...process.env, ...env } });
  let fullOutput = '';
  let lineBuffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', data => {
    if (liveLineCallback) {
      lineBuffer += data;
      let lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();
      for (const line of lines) liveLineCallback(line);
    } else {
      fullOutput += data;
    }
  });
  proc.stderr.on('data', (data) => process.stderr.write(data));
  const code = await new Promise(r => proc.on('close', r));
  if (liveLineCallback && lineBuffer) liveLineCallback(lineBuffer);
  if (code !== 0) throw new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`);
  return fullOutput ? fullOutput.trim() : '';
}

let timed_indent = 0;
async function timed(description, lambda) {
  timed_indent++;
  const start = new Date();
  console.log(" ".repeat(timed_indent * 2), description, "...");
  try {
    const result = await lambda();
    console.log(" ".repeat(timed_indent * 2), description, "took", (new Date() - start) / 1000, "seconds");
    timed_indent--;
    return result;
  } catch (e) {
    console.error(" ".repeat(timed_indent * 2), description, "FAILED:", e.message);
    timed_indent--;
    throw e;
  }
}

function loadBucket(jsonContent, globalRates, deletionMap, childMap) {
  for (const [dirPath, childrenObj] of Object.entries(jsonContent)) {
    const childrenSet = new Set();
    for (const [childName, data] of Object.entries(childrenObj)) {
      childrenSet.add(childName);
      const childFullPath = (dirPath === '.' || dirPath === '') ? childName : `${dirPath}/${childName}`;

      // Handle the object format: { r: [...], d: number | undefined }
      const rates = decompressRates(data.r);

      // Load deletion timestamp if it exists
      if (data.d !== undefined) {
          deletionMap.set(childFullPath, data.d);
      }

      globalRates.set(childFullPath, rates);
    }
    if (childrenSet.size > 0) {
      if (!childMap.has(dirPath)) {
        childMap.set(dirPath, childrenSet);
      } else {
        const existing = childMap.get(dirPath);
        childrenSet.forEach(c => existing.add(c));
      }
    }
  }
}

async function loadAllBuckets(outputDir, globalRates, deletionMap, childMap) {
  try {
    const mainFile = path.join(outputDir, 'main.json');
    const content = await fs.readFile(mainFile, 'utf8');
    loadBucket(JSON.parse(content), globalRates, deletionMap, childMap);
  } catch (e) {}

  const batchSize = 100;
  for (let i = 0; i < CONFIG.bucketCount; i += batchSize) {
    const promises = [];
    for (let j = 0; j < batchSize && (i + j) < CONFIG.bucketCount; j++) {
      const bucketIndex = i + j;
      promises.push((async () => {
        const bucketFile = path.join(outputDir, `${bucketIndex}.json`);
        try {
          const content = await fs.readFile(bucketFile, 'utf8');
          loadBucket(JSON.parse(content), globalRates, deletionMap, childMap);
        } catch (e) {}
      })());
    }
    await Promise.all(promises);
  }
}

async function ensureRepo(repo, bucketsState) {
  const gitDir = path.join(repo.dirname, '.git');
  const repoUrl = repo.url || `https://github.com/${repo.owner}/${repo.repository}`;

  // Calculate the fetch start date based on previous state
  let shallowSince = CONFIG.startDate;
  if (bucketsState && bucketsState.lastCommitDate) {
    const lastDate = new Date(bucketsState.lastCommitDate);
    if (!isNaN(lastDate.getTime())) {
      // Add a safety margin (e.g., 30 days) to ensure we overlap slightly and catch everything
      lastDate.setDate(lastDate.getDate() - 30);
      shallowSince = lastDate.toISOString();
    }
  }

  try {
    await fs.access(gitDir);
    await runCommand('git', ['fetch', '--progress', '--verbose', `--shallow-since=${shallowSince}`, '--filter=blob:none'], repo.dirname);
  } catch (err) {
    await runCommand('git', ['clone', '--progress', '--verbose', '--filter=blob:none', '--depth', '1', '--no-checkout', repoUrl, repo.dirname], '.');
    await runCommand('git', ['fetch', '--progress', '--verbose', `--shallow-since=${shallowSince}`, '--filter=blob:none'], repo.dirname);
  }
}

// Updated: Accepts totalRates to count unique commits per week
async function processCommits(repo, lastCommit, totalRates, callback) {
  const currentHead = await runCommand('git', ['rev-parse', 'HEAD'], repo.dirname);
  if (lastCommit === currentHead) {
    console.log("  No new commits since last run.");
    return { head: currentHead, headDate: null };
  }

  const delimiter = ">>>COMMIT:";
  let args = [];
  if (lastCommit) {
    console.log(`  Running git log (Incremental: ${lastCommit.substring(0,7)}..HEAD) ...`);
    args = ['log', `${lastCommit}..HEAD`, '--name-status', '--no-renames', `--pretty=format:${delimiter}%h %ae %aI`, '.'];
  } else {
    console.log(`  Running git log (First run: Full history) ...`);
    args = ['log', '--name-status', '--no-renames', `--pretty=format:${delimiter}%h %ae %aI`, '.'];
  }

  const env = { 'GIT_NO_LAZY_FETCH': '1' };
  let currentCommitDate = null;
  let currentCommitIsValid = false;
  let processedCommits = 0;
  let processedFiles = 0;

  // Capture the date of the newest commit (which comes first in git log)
  let headDate = null;

  const onLine = (line) => {
    line = line.trim();
    if (!line) return;
    if (line.startsWith(delimiter)) {
      const rest = line.substring(delimiter.length).trim();
      const parts = rest.split(' ');
      const hash = parts[0];
      const email = parts[1];
      const dateStr = parts[2];

      // Capture the date of the very first commit we see (HEAD)
      if (!headDate && dateStr) {
        headDate = dateStr;
      }

      currentCommitIsValid = IsEmailValid(email);
      if (currentCommitIsValid && dateStr) {
        currentCommitDate = new Date(dateStr);

        // --- NEW: Update Total Commit Count ---
        const weekIdx = getTimeBucketIndex(currentCommitDate);
        if (weekIdx >= 0) {
            while (totalRates.length <= weekIdx) totalRates.push(0);
            totalRates[weekIdx]++;
        }
        // --------------------------------------
      }

      // Even if invalid, we might need the date for deletion logic
      if (!currentCommitIsValid && dateStr) {
         currentCommitDate = new Date(dateStr);
      }

      processedCommits++;
      if (process.stdout.isTTY && processedCommits % 100 === 0) {
        process.stdout.write(`\r    [${processedCommits}] ${hash} - ${processedFiles} files`);
      }
    } else {
      if (currentCommitDate) {
        const firstTab = line.indexOf('\t');
        if (firstTab > 0) {
          const status = line.substring(0, firstTab);
          const filepath = line.substring(firstTab + 1);

          if (currentCommitIsValid || status.startsWith('D')) {
            callback(filepath, status, currentCommitDate, currentCommitIsValid);
            processedFiles++;
          }
        }
      }
    }
  };

  try {
    await runCommand('git', args, repo.dirname, env, onLine);
    if (process.stdout.isTTY) process.stdout.write('\n');
  } catch (e) {
    if (e.message.includes('lazy fetch')) return { head: currentHead, headDate: headDate };
    throw e;
  }
  return { head: currentHead, headDate: headDate };
}

async function processRepository(repo) {
  const outputDir = path.join(CONFIG.baseOutputDir, repo.dirname);
  const bucketsFile = path.join(outputDir, 'buckets.json');
  // NEW: Total file path
  const totalFile = path.join(outputDir, 'total.json');

  await fs.mkdir(outputDir, { recursive: true });

  // Read buckets state BEFORE ensuring repo to check for last commit date
  let bucketsState = { lastCommit: null, lastCommitDate: null };
  try {
    const data = await fs.readFile(bucketsFile, 'utf8');
    bucketsState = JSON.parse(data);
    if (Array.isArray(bucketsState)) bucketsState = { lastCommit: null, lastCommitDate: null };
  } catch (e) {}

  await timed(`Ensuring git repo for ${repo.dirname}`, async () => {
    await ensureRepo(repo, bucketsState);
  });

  // NEW: Load existing total.json if it exists (for incremental updates)
  let totalRates = [];
  try {
      const data = await fs.readFile(totalFile, 'utf8');
      totalRates = JSON.parse(data);
  } catch (e) {}

  const globalRates = new Map();
  const deletionMap = new Map();
  const childMap = new Map();

  await timed(`Loading all buckets for ${repo.dirname}`, async () => {
    await loadAllBuckets(outputDir, globalRates, deletionMap, childMap);
  });

  if (!globalRates.has('.')) {
    const rootChildren = childMap.get('.');
    if (rootChildren) {
      let maxLen = 0;
      const allChildRates = [];
      for (const child of rootChildren) {
        const r = globalRates.get(child) || [];
        if (r.length > maxLen) maxLen = r.length;
        allChildRates.push(r);
      }
      const rootRates = new Array(maxLen).fill(0);
      for (const r of allChildRates) {
        for (let i = 0; i < r.length; i++) rootRates[i] += r[i];
      }
      globalRates.set('.', rootRates);
    }
  }

  let newHead = null;
  let newHeadDate = null;
  const lastFileEvents = new Map();

  await timed(`Analyzing commits`, async () => {
    // Pass totalRates to processCommits
    const result = await processCommits(repo, bucketsState.lastCommit, totalRates, (filepath, status, date, authorIsValid) => {
      // We only care about the latest event.
      if (!lastFileEvents.has(filepath) || lastFileEvents.get(filepath).date < date) {
        lastFileEvents.set(filepath, { status, date });
      }

      if (!authorIsValid) return;

      const weekIdx = getTimeBucketIndex(date);
      if (weekIdx < 0) return;

      let currentPath = filepath;
      while (true) {
        if (!globalRates.has(currentPath)) globalRates.set(currentPath, []);
        const rates = globalRates.get(currentPath);
        while (rates.length <= weekIdx) rates.push(0);
        rates[weekIdx]++;

        // Recursively add to parent directories
        if (currentPath === '.' || currentPath === '') break;
        const parent = path.posix.dirname(currentPath);
        const childName = path.posix.basename(currentPath);
        const parentKey = (parent === '.' || parent === '/') ? '.' : parent;
        if (!childMap.has(parentKey)) childMap.set(parentKey, new Set());
        childMap.get(parentKey).add(childName);
        currentPath = parentKey;
      }
    });
    newHead = result.head;
    newHeadDate = result.headDate;
  });

  // --- Step: Apply File Deletion Status ---
  for (const [filepath, { status, date }] of lastFileEvents) {
    if (status.startsWith('D')) {
       deletionMap.set(filepath, date.getTime());
    } else {
       deletionMap.delete(filepath);
    }
  }

  // --- Step 5b: Propagate Deletion Status Upwards ---
  await timed(`Propagating directory deletion status`, async () => {
    const dirStatusCache = new Map();
    const getDeletionStatus = (path) => {
      if (dirStatusCache.has(path)) return dirStatusCache.get(path);

      if (childMap.has(path)) {
          const children = childMap.get(path);
          let maxDeletionTime = 0;
          let isAlive = false;

          for (const childName of children) {
            const childFullPath = (path === '.') ? childName : `${path}/${childName}`;
            const childTime = getDeletionStatus(childFullPath);

            if (childTime === null) {
               isAlive = true;
               break;
            }
            if (childTime > maxDeletionTime) maxDeletionTime = childTime;
          }

          if (isAlive) {
              dirStatusCache.set(path, null);
              deletionMap.delete(path);
              return null;
          } else {
              dirStatusCache.set(path, maxDeletionTime);
              deletionMap.set(path, maxDeletionTime);
              return maxDeletionTime;
          }
      }

      if (deletionMap.has(path)) {
          return deletionMap.get(path);
      }
      return null;
    };

    const allDirs = Array.from(childMap.keys());
    for (const dir of allDirs) {
        getDeletionStatus(dir);
    }
  });

  await timed(`Saving data`, async () => {
    // NEW: Save total.json
    await fs.writeFile(totalFile, JSON.stringify(totalRates));

    const bucketGroups = new Map();
    let rootData = null;

    for (const dirPath of childMap.keys()) {
      if (dirPath === '.') {
        rootData = dirPath;
        continue;
      }
      const bucketId = getBucketId(dirPath);
      if (!bucketGroups.has(bucketId)) bucketGroups.set(bucketId, []);
      bucketGroups.get(bucketId).push(dirPath);
    }

    const generateDirObj = (dirPath) => {
      const childrenObj = {};
      const childrenNames = childMap.get(dirPath);
      if (childrenNames) {
        for (const childName of childrenNames) {
          const childFullPath = (dirPath === '.') ? childName : `${dirPath}/${childName}`;
          const childRates = globalRates.get(childFullPath) || [];
          const compressed = compressRates(childRates);

          const deletedAt = deletionMap.get(childFullPath);

          const itemObj = { r: compressed };
          if (deletedAt !== undefined) {
              itemObj.d = deletedAt;
          }

          childrenObj[childName] = itemObj;
        }
      }
      return childrenObj;
    };

    if (rootData) {
      const mainObj = { ".": generateDirObj('.') };
      await fs.writeFile(path.join(outputDir, 'main.json'), JSON.stringify(mainObj));
    }

    const batchSize = 100;
    const allBuckets = Array.from(bucketGroups.keys());

    for (let i = 0; i < allBuckets.length; i += batchSize) {
      const promises = [];
      for (let j = 0; j < batchSize && (i + j) < allBuckets.length; j++) {
        const bucketIdx = allBuckets[i + j];
        promises.push((async () => {
          const dirsInBucket = bucketGroups.get(bucketIdx);
          const bucketObj = {};
          for (const dirPath of dirsInBucket) {
            bucketObj[dirPath] = generateDirObj(dirPath);
          }
          const bucketFile = path.join(outputDir, `${bucketIdx}.json`);
          await fs.writeFile(bucketFile, JSON.stringify(bucketObj));
        })());
      }
      await Promise.all(promises);
    }
  });

  bucketsState.lastCommit = newHead;
  // Save the date of the last processed commit to use for future delta fetches
  if (newHeadDate) {
      bucketsState.lastCommitDate = newHeadDate;
  }
  await fs.writeFile(bucketsFile, JSON.stringify(bucketsState, null, 2));
}

async function main() {
  const repositories_file = "../repositories.json5";
  console.log(`Loading repositories from ${repositories_file}...`);
  const repositories = await parseFile(JSON5, repositories_file);

  for (const repository of repositories) {
    if (repository.cone) {
      console.log(`Skipping cone repository: ${repository.owner}/${repository.repository}`);
    }
    await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
      await processRepository(repository);
    })
  }
}

main().catch(console.error);
