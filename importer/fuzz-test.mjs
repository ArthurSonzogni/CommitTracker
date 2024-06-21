import * as filesystem from 'fs';
import JSON5 from 'json5';
import core from '@actions/core';
import statusLine from '@alt-jero/status-line';
import { spawn } from "child_process"
import {Octokit} from 'octokit';
import {throttling} from '@octokit/plugin-throttling';
const fs = filesystem.promises;

const AuthToken = async () => {
  try {
    return await fs.readFile('.token', 'utf8');
  } catch (e) {
  }

  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  if (process.env.TOKEN) {
    return process.env.TOKEN;
  }
};

const MyOctokit = Octokit.plugin(throttling);
const octokit = new MyOctokit({
  auth: await AuthToken(),
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      statusLine.error(
        `Request quota exhausted for request ${options.method} ${options.url}`,
      );

      if (retryCount < 10) {
        statusLine.error(
          `Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      statusLine.error(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
      );
    },
  },
});

const main = async () => {
  const clone_dirname = 'chromium';

  // Git clone Chromium:
  {
    await fs.writeFile("script.sh", `
      rm -rf ${clone_dirname}
      git clone \
      --depth=1 \
      --branch main \
      --single-branch \
      https://github.com/chromium/chromium ${clone_dirname}
      `)
    const shell = spawn("sh", ["./script.sh"]);
    await new Promise(r => shell.on("close", r));
  }

  // Retrieve all the fuzz tests:
  await fs.writeFile("script.sh", `
    cd ./${clone_dirname};

    # Find FUZZ_TEST("a","b") in .cc files
    (
      files=$(
        git grep -l "FUZZ_TEST(" \\
          | cut -f1 -d: \\
          | grep "\\.cc"
      )

      for file in $files; do
      # Search for every FUZZ_TEST(<a>,<b>), capture a and b
      capture_arg="[[:blank:]]*\\([^,\\ ]*\\)[[:blank:]]*"
      matches=$(
        cat $file \\
        | tr -d '\\n' \\
        | sed -n "s/.*FUZZ_TEST($capture_arg,$capture_arg).*/\\1,\\2\\n/p" \
      )

      for match in $matches; do
        # Split the match into a and b
        a=$(echo $match | cut -f1 -d,)
        b=$(echo $match | cut -f2 -d,)

        # Find the line number of the FUZZ_TEST
        line=$(grep -n "$b)" $file | cut -f1 -d: | head -n1)

        # Print the line number and the blame
        # Output is JSON.
        echo "{"
        echo "  \\"file\\": \\"$file\\","
        echo "  \\"line\\": $line,"
        echo "  \\"suite_name\\": \\"$a\\","
        echo "  \\"function\\": \\"$b\\","
        echo "  \\"type\\": \\"FUZZ_TEST\\","
        echo "},"
        done
      done
    )

    # Find fuzzer_test("a") in BUILD.gn files
    (
      files=$(
        git grep -l "fuzzer_test(" \\
          | cut -f1 -d: \\
          | grep "BUILD.gn"
      )

      for file in $files; do
      # Search for every fuzzer_test(<a>), capture a
      matches=$(
        cat $file | sed -n "s/.*fuzzer_test(\\"\\([^\\"]*\\)\\") {/\\1/p"
      )

      for match in $matches; do
        # Find the line number of the fuzzer_test
        line=$(grep -n "$match" $file | cut -f1 -d: | head -n1)

        # Print the line number and the blame
        # Output is JSON.
        echo "{"
        echo "  \\"file\\": \\"$file\\","
        echo "  \\"line\\": $line,"
        echo "  \\"suite_name\\": \\"$match\\","
        echo "  \\"function\\": \\"main\\","
        echo "  \\"type\\": \\"fuzzer_test\\","
        echo "},"
        done
      done
    )
  `)

  let output = "";
  const shell = spawn("sh", ["./script.sh"]);
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
  });
  await new Promise(r => shell.on("close", r));

  const current_file = '../public/fuzz-test/data.json';
  const current_json = JSON.parse(await fs.readFile(current_file, "utf8"));
  const key_list = new Set()
  for (const commit of current_json) {
    key_list.add(commit.suite_name + commit.function);
  }

  const fuzz_tests = JSON5.parse(`[${output}]`);

  // Git blame using Github GraphQL API:
  for (const fuzz_test of fuzz_tests) {
    console.log("Blaming", fuzz_test.file, fuzz_test.line, fuzz_test.suite_name, fuzz_test.function);

    const key = fuzz_test.suite_name + fuzz_test.function;
    if (key_list.has(key)) {
      console.log("Skipping", fuzz_test.suite_name, fuzz_test.function);
      continue;
    }

    fuzz_test.author = "";
    fuzz_test.sha = "";
    fuzz_test.date = (new Date()).toISOString();

    // Skip files that are too slow.
    const skipped_files = [
      "chrome/test/BUILD.gn",
      "chrome/browser/BUILD.gn",
    ]
    if (skipped_files.includes(fuzz_test.file)) {
      continue;
    }

    try {
      const blame = await octokit.graphql(`
        query {
          repository(owner: "chromium", name: "chromium") {
            ref(qualifiedName: "main") {
              target {
                ... on Commit {
                  blame(path: "${fuzz_test.file}") {
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
        `);

      const ranges = blame.repository.ref.target.blame.ranges;
      const range = ranges.find(range => {
        return range.startingLine <= fuzz_test.line && //
               range.endingLine >= fuzz_test.line;
      });

      fuzz_test.author = range.commit.author.email;
      fuzz_test.sha = range.commit.oid;
      fuzz_test.date = range.commit.committedDate;
    } catch (e) {
      console.log("Failed to blame file", fuzz_test.file);
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
}

main();
