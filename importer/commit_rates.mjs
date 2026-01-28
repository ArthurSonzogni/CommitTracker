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
  console.log(`  Running command: ${command} ${args.join(' ')} (cwd: ${cwd})`);
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

      const rates = decompressRates(data.r);

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

  let shallowSince = CONFIG.startDate;
  if (bucketsState && bucketsState.lastCommitDate) {
    const lastDate = new Date(bucketsState.lastCommitDate);
    if (!isNaN(lastDate.getTime())) {
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

async function processCommits(repo, lastCommit, callback) {
  const currentHead = await runCommand('git', ['rev-parse', 'HEAD'], repo.dirname);
  if (lastCommit === currentHead) {
    console.log("  No new commits since last run.");
    return { head: currentHead, headDate: null };
  }

  const delimiter = ">>>COMMIT:";
  let args = [];
  if (lastCommit) {
    console.log(`  Running git log (Incremental: ${lastCommit.substring(0,7)}..HEAD) ...`);
    args = ['log', `${lastCommit}..HEAD`, '--name-status', '--no-renames', ,'--ignore-submodules', `--pretty=format:${delimiter}%h %ae %aI`, '.'];
  } else {
    console.log(`  Running git log (First run: Full history) ...`);
    args = ['log', '--name-status', '--no-renames', '--ignore-submodules', `--pretty=format:${delimiter}%h %ae %aI`, '.'];
  }

  const env = { 'GIT_NO_LAZY_FETCH': '1' };

  let processedCommits = 0;
  let headDate = null;

  // Buffer to hold the commit currently being parsed
  let currentCommit = null;

  const flushCurrentCommit = () => {
    if (currentCommit) {
      callback(currentCommit);
      processedCommits++;
      if (process.stdout.isTTY && processedCommits % 100 === 0) {
        process.stdout.write(`\r    [${processedCommits}] ${currentCommit.hash} - ${currentCommit.files.length} files`);
      }
    }
  };

  const onLine = (line) => {
    line = line.trim();
    if (!line) return;

    if (line.startsWith(delimiter)) {
      // 1. Finish the previous commit
      flushCurrentCommit();

      // 2. Start new commit
      const rest = line.substring(delimiter.length).trim();
      const parts = rest.split(' ');
      const hash = parts[0];
      const email = parts[1];
      const dateStr = parts[2];

      if (!headDate && dateStr) {
        headDate = dateStr;
      }

      currentCommit = {
        hash,
        email,
        date: dateStr ? new Date(dateStr) : null,
        files: [] // Accumulate files here
      };
      return;
    }

    // It's a file line (status + path)
    if (currentCommit && currentCommit.date) {
      const firstTab = line.indexOf('\t');
      if (firstTab > 0) {
        const status = line.substring(0, firstTab);
        const filepath = line.substring(firstTab + 1);
        currentCommit.files.push({ status, filepath });
      }
    }
  };

  try {
    await runCommand('git', args, repo.dirname, env, onLine);
    // Flush the very last commit encountered
    flushCurrentCommit();
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
  const totalFile = path.join(outputDir, 'total.json');

  await fs.mkdir(outputDir, { recursive: true });

  let bucketsState = { lastCommit: null, lastCommitDate: null };
  try {
    const data = await fs.readFile(bucketsFile, 'utf8');
    bucketsState = JSON.parse(data);
    if (Array.isArray(bucketsState)) bucketsState = { lastCommit: null, lastCommitDate: null };
  } catch (e) {}

  await timed(`Ensuring git repo for ${repo.dirname}`, async () => {
    await ensureRepo(repo, bucketsState);
  });

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
    // Callback now receives a full commit object
    const result = await processCommits(repo, bucketsState.lastCommit, (commit) => {

      // 1. Process deletions and last-seen dates for FILES
      for (const file of commit.files) {
        const { filepath, status } = file;
        // We only care about the latest event.
        if (!lastFileEvents.has(filepath) || lastFileEvents.get(filepath).date < commit.date) {
          lastFileEvents.set(filepath, { status, date: commit.date });
        }
      }

      // Check email is not a known bot.
      if (!IsEmailValid(commit.email)) {
        return;
      }

      const weekIdx = getTimeBucketIndex(commit.date);
      if (weekIdx < 0) return;

      if (commit.files.length === 0) return;

      // 2. Identify all unique file/directories affected by this commit
      const unique = new Set();
      for (const file of commit.files) {

        const { filepath } = file;

        // Filter out invalid paths.
        if (filepath.includes('"') || filepath.includes("'") || filepath.includes('..')) {
          continue;
        }

        unique.add(filepath);

        let currentPath = filepath;
        while (currentPath !== '.' && currentPath !== '') {
          const parent = path.posix.dirname(currentPath);
          const childName = path.posix.basename(currentPath);
          const parentKey = (parent === '.' || parent === '/') ? '.' : parent;

          // Always ensure the hierarchy exists in childMap
          if (!childMap.has(parentKey)) childMap.set(parentKey, new Set());
          childMap.get(parentKey).add(childName);

          unique.add(parentKey);
          currentPath = parentKey;
        }
      }

      const incrementRates = rates => {
        while (rates.length <= weekIdx) rates.push(0);
        rates[weekIdx]++;
      }

      // 3. Increment the DIRECTORY rates (Once per commit)
      for (const dirPath of unique) {
        if (!globalRates.has(dirPath)) globalRates.set(dirPath, []);
        incrementRates(globalRates.get(dirPath));
      }

      // 4. Increment TOTAL rates.
      incrementRates(totalRates);
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

          // Check if it's a directory. If NOT in childMap, it is a file.
          if (!childMap.has(childFullPath)) {
              itemObj.f = 1;
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
      continue;
    }
    await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
      await processRepository(repository);
    })
  }
}

main().catch(console.error);
