import * as filesystem from 'fs';
import path from 'path';
import {execFileSync} from 'child_process';
import {mailMap} from './mailmap.mjs';
import {octokit} from './octokit.mjs';

const fs = filesystem.promises;

const gitGrepFiles = (cwd, needle) => {
  try {
    return execFileSync('git', ['grep', '-l', needle], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean);
  } catch (e) {
    if (e.status === 1) {
      return [];
    }
    throw e;
  }
};

const lineAt = (text, index) => {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
};

const stripCppCommentsPreservingNewlines = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');

const stripGnCommentsPreservingNewlines = (text) =>
  text.replace(/#[^\n]*/g, '');

const main = async () => {
  const clone_dirname = 'chromium';

  // Git clone Chromium:
  await fs.rm(clone_dirname, {recursive: true, force: true});
  execFileSync(
    'git',
    [
      'clone',
      '--depth=1',
      '--branch',
      'main',
      '--single-branch',
      'https://github.com/chromium/chromium',
      clone_dirname,
    ],
    {stdio: 'inherit'},
  );

  const fuzz_tests = [];

  // Find FUZZ_TEST(a, b) in .cc files:
  const cc_files = gitGrepFiles(clone_dirname, 'FUZZ_TEST(').filter((file) =>
    file.endsWith('.cc'),
  );
  for (const file of cc_files) {
    const raw = await fs.readFile(path.join(clone_dirname, file), 'utf8');
    const clean = stripCppCommentsPreservingNewlines(raw);
    for (const match of clean.matchAll(
      /\bFUZZ_TEST\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    )) {
      fuzz_tests.push({
        file,
        line: lineAt(clean, match.index),
        suite_name: match[1],
        function: match[2],
        type: 'FUZZ_TEST',
      });
    }
  }

  // Find fuzzer_test("a") in BUILD.gn files:
  const gn_files = gitGrepFiles(clone_dirname, 'fuzzer_test(').filter((file) =>
    file.endsWith('BUILD.gn'),
  );
  for (const file of gn_files) {
    const raw = await fs.readFile(path.join(clone_dirname, file), 'utf8');
    const clean = stripGnCommentsPreservingNewlines(raw);
    for (const match of clean.matchAll(
      /\bfuzzer_test\s*\(\s*"([^"]+)"\s*\)\s*\{/g,
    )) {
      fuzz_tests.push({
        file,
        line: lineAt(clean, match.index),
        suite_name: match[1],
        function: 'main',
        type: 'fuzzer_test',
      });
    }
  }

  const current_file = '../public/fuzz-test/data.json';
  const current_json = JSON.parse(await fs.readFile(current_file, 'utf8'));
  const key_list = new Set();
  for (const commit of current_json) {
    key_list.add(commit.suite_name + commit.function);
  }

  // Skip files that are too slow.
  const skipped_files = [
    'chrome/test/BUILD.gn',
    'chrome/browser/BUILD.gn',
  ];

  // Git blame using Github GraphQL API:
  for (const fuzz_test of fuzz_tests) {
    console.log(
      'Blaming',
      fuzz_test.file,
      fuzz_test.line,
      fuzz_test.suite_name,
      fuzz_test.function,
    );

    const key = fuzz_test.suite_name + fuzz_test.function;
    if (key_list.has(key)) {
      console.log('Skipping', fuzz_test.suite_name, fuzz_test.function);
      continue;
    }

    fuzz_test.author = '';
    fuzz_test.sha = '';

    if (skipped_files.includes(fuzz_test.file)) {
      continue;
    }

    fuzz_test.date = new Date().toISOString();

    try {
      const blame = await octokit.graphql(
        `
        query BlameFile($path: String!) {
          repository(owner: "chromium", name: "chromium") {
            ref(qualifiedName: "main") {
              target {
                ... on Commit {
                  blame(path: $path) {
                    ranges {
                      startingLine
                      endingLine
                      commit {
                        oid
                        committedDate
                        author {
                          email
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        `,
        {path: fuzz_test.file},
      );

      const ranges = blame.repository.ref.target.blame.ranges;
      const range = ranges.find((r) => {
        return r.startingLine <= fuzz_test.line && r.endingLine >= fuzz_test.line;
      });

      if (range) {
        fuzz_test.author = mailMap(range.commit.author.email);
        fuzz_test.sha = range.commit.oid;
        fuzz_test.date = range.commit.committedDate;
      }
    } catch (e) {
      console.log('Failed to blame file', fuzz_test.file);
    }
  }

  // Merge the data with the current JSON
  const new_json = current_json.concat(fuzz_tests);
  // Merge duplicates having the same suite_name and function.
  const map = new Map();
  for (const commit of new_json) {
    const proposed = commit;
    const key = commit.suite_name + commit.function;
    // Merge
    if (map.has(key)) {
      const existing = map.get(key);

      // Take the sha and author from the oldest entry, but the line and file of
      // the newest entry.
      if (!proposed.date || (existing.date && existing.date < proposed.date)) {
        proposed.sha = existing.sha;
        proposed.author = existing.author;
      } else {
        proposed.line = existing.line;
        proposed.file = existing.file;
      }
      proposed.type ||= existing.type;
      if (existing.date) {
        if (!proposed.date || proposed.date < existing.date) {
          proposed.date = existing.date;
        }
      }
    }
    map.set(key, proposed);
  }

  const output_array = Array.from(map.values());

  // Write back the data
  await fs.writeFile(current_file, JSON.stringify(output_array, null, 1));
};

main();
