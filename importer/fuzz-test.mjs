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
    author=$(git show -s --format='%ae' $sha)

    # Print the line number and the blame
    # Output is JSON.
    echo "{"
      echo "  \\"file\\": \\"$file\\","
      echo "  \\"line\\": $line,"
      echo "  \\"suite_name\\": \\"$a\\","
      echo "  \\"function\\": \\"$b\\","
      echo "},"
    done
    done
    `)

  let output = "";
  const shell = spawn("sh", ["./script.sh"]);
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
  });
  await new Promise(r => shell.on("close", r));

  const fuzz_tests = JSON5.parse(`[${output}]`);

  // Git blame using Github GraphQL API:
  for (const fuzz_test of fuzz_tests) {
    const {file, line, suite_name, function: func} = fuzz_test;

    const blame = await octokit.graphql(`
      query {
        repository(owner: "chromium", name: "chromium") {
          ref(qualifiedName: "main") {
            target {
              ... on Commit {
                blame(path: "${file}") {
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
      return range.startingLine <= line && line <= range.endingLine
    });

    fuzz_test.author = range.commit.author.email;
    fuzz_test.sha = range.commit.oid;
    fuzz_test.date = range.commit.committedDate;
  }

  // Merge the data with the current JSON
  const current_file = '../public/fuzz-test/data.json';
  const current_json = JSON.parse(await fs.readFile(current_file, "utf8"));

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
        if (existing.date < proposed.date) {
          proposed.sha = existing.sha;
          proposed.author = existing.author;
        } else {
          proposed.line = existing.line;
          proposed.file = existing.file;
        }
    }
    map.set(key, proposed);
  }

  const output_array = Array.from(map.values());

  console.log(JSON.stringify(output_array, null, 1));

  // Write back the data
  await fs.writeFile(current_file, JSON.stringify(output_array, null, 1));
}

main();
