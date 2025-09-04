import JSON5 from "json5";
import YAML from 'yaml'
import { argv } from "process";
import { spawn } from "child_process"
import fs from "fs/promises";

if (argv[2] != "incremental" && argv[2] != "full" && argv[2] != undefined) {
  console.error("Usage: node treemap.mjs [incremental|full]");
  console.error("");
  process.exit(1);
}

const incremental = argv[2] != "full";
console.log("Mode:", incremental ? "incremental" : "full");

// Updates are done weekly. To compress the temporal, dimension, we count the
// number of week since 2020.
function formatDate(date) {
  return Math.floor((date - new Date("2020-01-01")) / (7 * 24 * 60 * 60 * 1000));
}

// A wrapper for lambda functions, printing a description and the time taken to execute.
let timed_indent = 0;
const timed = async (description, lambda) => {
  timed_indent++;
  const start = new Date();
  await lambda();
  console.log(" ".repeat(timed_indent * 2),
    description, "took",  (new Date() - start) / 1000, "seconds");
  timed_indent--;
}

const clone = async (repo) => {
  // If the repository is already cloned, we can skip this step.
  try {
    await fs.access(repo.dirname);
    return;
  } catch (e) {}

  await fs.writeFile("script.sh", `
    rm -rf ${repo.dirname}
    git clone \
    --progress \
    --verbose \
    ${incremental ? "--depth=1" : ""} \
    https://github.com/${repo.owner}/${repo.repository} ${repo.dirname}
    `)
  const shell = spawn("sh", ["./script.sh"]);
  shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
  shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
  await new Promise(r => shell.on("close", r));
}

const get_file_index = (file_index, filename) => {
  if (filename == "") {
    console.warn("Warning: empty filename");
    return -1;
  }

  // Existing entry.
  if (file_index.index[filename] != undefined) {
    return file_index.index[filename];
  }

  // If it has a parent, create the parent first.
  try {
    let parent_filename = filename.split('/').slice(0, -1).join('/');
    let parent_index = get_file_index(file_index, parent_filename);
  } catch (e) {}


  const index = file_index.file.length;
  file_index.index[filename] = index;
  file_index.file[index] = filename;
  return index;
}

// Entry layout:
async function ProcessEntry(repo, date, file_index, data, entry) {
  await fs.writeFile("script.sh", `
    cd ./${repo.dirname}
    cd ${repo.cone ? repo.cone : "."}
    (
      ${entry.script}
    ) | grep "\\.h\\|\\.cpp\\|\\.hpp\\|\\.c\\|\\.cc\\|\\.cxx\\|\\.hxx"
    cd ..;
  `)

  let output = "";
  const shell = spawn("sh", ["./script.sh"]);
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
  });
  await new Promise(r => shell.on("close", r));

  const file_occurrences = new Map();

  output.split('\n').forEach(line => {
    if (line.trim() == "") {
      return;
    }

    // Expected format is either:
    // 1. <file>:<occurrences>
    // 2. <file>
    let filename;
    let occurrences;
    const split = line.split(':');
    if (split.length == 2) {
      filename = split[0];
      occurrences = parseInt(split[1]);
    } else {
      filename = line;
      occurrences = 1;
    }

    // If filename starts with "/", remove it.
    if (filename.startsWith('/')) {
      filename = filename.slice(1);
    }

    file_occurrences[filename] ||= 0;
    file_occurrences[filename] += occurrences;
  })

  const previous_occurences = (filename) => {
    if (data[filename] == undefined) {
      return undefined;
    }

    let prev = undefined;
    let prev_date = undefined;
    Object.entries(data[filename]).forEach(([date_id, value]) => {
      if (date_id >= date) {
        return;
      }

      if (prev_date == undefined || date_id > prev_date) {
        prev_date = date_id;
        prev = value;
      }
    })
    return prev;
  }

  const encountered_files = new Set();
  let sum = 0;
  let sum_new = 0;
  for(const [filename, occurrences] of Object.entries(file_occurrences)) {
    sum += occurrences;

    encountered_files.add(filename);

    // Add the occurrences to the data. Possibly the first.
    data[filename] ||= {};

    // Before adding new data, ensure it is different from the previous data.
    // This avoids storing redundant data.
    if (previous_occurences(filename) == occurrences) {
      continue;
    }

    data[filename][date] ||= 0;
    data[filename][date] += occurrences;

    sum_new += occurrences;
  }

  // If previously defined for this file, but undefined now, set to zero.
  for(const filename of Object.keys(data)) {
    if (!encountered_files.has(filename) && previous_occurences(filename) != 0) {
      data[filename][date] ||= 0;
    }
  }

  console.log("Found", sum, "occurrences of", entry.name, "(new:", sum_new, ")");
}

async function processRepository(repo, entries) {
  if (!repo.treemap) {
    console.log(`Skipping ${repo.owner}/${repo.repository}`)
    return
  }

  console.log(`Processing ${repo.owner}/${repo.repository}`)

  await timed(`Cloning ${repo.owner}/${repo.repository}`, async () => {
    await clone(repo);
  })

  let file_index = {
    file: new Array(), // Map from index to filename.
    index: new Map(),  // Map from filename to index.
  }
  let data = {};

  // Try to load the latest treemap.
  try {
    // The data is a list of <parent_index>:<filename>
    // Read the file_index line by line:
    {
      const data = await fs.readFile(
        `../public/treemap/${repo.dirname}/file_index.json`
      )
      for (const line of data.split('\n')) {
        const split = line.split(':');
        const parent_index = parseInt(split[0]);
        const filename = split[1];
        const fullname = parent_index == -1 ? "" : (file_index.file[parent_index] + "/");
        const index = file_index.file.length
        file_index.index[fullname] = index;
        file_index.file[index] = fullname;
      }
    }

    for (const entry of entries.metrics) {
      try {
        const entry_data = {};
        // The data is a list of line.
        // Each line contains <file_index> <list>
        // The <list> is a list of <date_id>:<value>, separated by commas.
        const file_entry = `../public/treemap/${repo.dirname}/data/${entry.file}.json`;
        const file_entry_data = await fs.readFile(file_entry, "utf8");
        for (const line of file_entry_data.split('\n')) {
          const [index, list] = list.split(' ');
          const filename = file_index.file[index];
          const file_data = {};
          for (const pair of list.split(',')) {
            const split = pair.split(':');
            const date_id = parseInt(split[0]);
            const value = parseInt(split[1]);
            file_data[date_id] = value;
          }
          entry_data[filename] = file_data;
        }

        data[entry.file] = entry_data;
      } catch (e) {
        console.log(`Could not load data for entry ${entry.name}:`, e);
      }
    }

  } catch (e) {}

  let date =
    incremental
      ? new Date()
      : new Date(new Date() - 1000 * 60 * 60 * 24 * 7 * 4)
  // : new Date("2020-01-01");

  const today = new Date();
  let max_iterations = incremental ? 10 : 10000000;
  while(incremental || (date < today && max_iterations--)) {
    const date_id = formatDate(date)

    // Checkout the repository at the given date.
    if (!incremental) {
      await timed(`Checking out at date ${date.toISOString()}`, async () => {
        await fs.writeFile("script.sh", `
          cd ./${repo.dirname}
          commit_at_date() {
            git \
              --no-pager \
              log \
              origin/main \
              --until="${date.toISOString()}" \
              --max-count=1 \
              --pretty=format:"%H"
          }

          git checkout $(commit_at_date)
          cd ..;
        `)
        const shell = spawn("sh", ["./script.sh"]);
        await new Promise(r => shell.on("close", r));
      })
    }

    await timed("Gathering metrics", async () => {
      let index = 0;
      for (const entry of entries.metrics) {
        await timed(`Processing ${entry.name}`, async () => {
          data[entry.file] ||= {};
          await ProcessEntry(repo, date_id, file_index, data[entry.file], entry);
        });
        index++;
      }
    });

    date.setDate(date.getDate() + 7);

    // Write the treemap to disk.
    await timed("Writing", async () => {
      await fs.mkdir(`../public/treemap/${repo.dirname}/data`, { recursive: true });

      // Write the file index.
      let file_index_serialized = "";
      for(const [index, filename] of file_index.file.entries()) {
        const components = filename.split('/');
        if (components.length == 1) {
          file_index_serialized += `-1:${filename}\n`;
          continue;
        }
        const parent_filename = components.slice(0, -1).join('/');
        const parent_index = file_index.index[parent_filename];

        file_index_serialized += `${parent_index}:${filename.split('/').slice(-1)[0]}\n`;
      }
      await fs.writeFile(
        `../public/treemap/${repo.dirname}/file_index.json`,
        file_index_serialized
      );

      // Write each entry.
      for (const entry of entries.metrics) {
        let file_entry = `../public/treemap/${repo.dirname}/data/${entry.file}.json`;
        let file_entry_seralized = "";
        for(const [filename, file_data] of Object.entries(data[entry.file] || {})) {
          const index = get_file_index(file_index, filename);
          if (index == -1) {
            console.warn(`Warning: file ${filename} not found in file index.`);
            continue;
          }
          let list = Object.entries(file_data)
            .map(([date, value]) => `${date}:${value}`)
            .join(',');
          file_entry_seralized += `${index} ${list}\n`;
        }

        await fs.writeFile(file_entry, file_entry_seralized);
      }
    })

    if (incremental) {
      break;
    }
  }

  // Remove git repository
  //if (incremental) {
    //await timed("Removing repository", async () => {
      //await fs.writeFile("script.sh", `
        //rm -rf ${repo.dirname}
      //`)
      //const shell = spawn("sh", ["./script.sh"]);
      //await new Promise(r => shell.on("close", r));
    //});
  //}
}

async function processRepositories() {
  // Load the entries. This is a list of metrics to be collected.
  const entries_filename= `../treemap.yaml`;
  const entries = YAML.parse(await fs.readFile(entries_filename, "utf8"));
  await fs.mkdir("../public/treemap/", { recursive: true });
  await fs.writeFile("../public/treemap/entries.json", JSON.stringify(entries, null, 1));

  const repositories_file = "../repositories.json5";
  const repositories = JSON5.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
      await processRepository(repository, entries);
    })
    break;
  }
}


processRepositories();
