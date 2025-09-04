import JSON5 from "json5";
import YAML from 'yaml'
import { argv } from "process";
import { spawn } from "child_process"
import fs from "fs/promises";
import fsSync from "fs"

async function directoryExists(path) {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // Directory does not exist
    }
    throw err; // Some other error occurred
  }
}

// Import is full if the ../public/treemap/ directory does not exist.
// Otherwise, it is incremental.

const incremental = await directoryExists("../public/treemap");

console.log("Running in", incremental ? "incremental" : "full", "mode.");

// The `file_index` object maps filenames to integer indices for compact storage.
// - `file`: An array where `file[i]` is the filename for index `i`.
// - `index`: A map where `index[filename]` is the index for that filename.
let file_index;
//
// The `data` object stores the collected metrics. It has the following structure:
// `data[metric_name][filename][date_id] = value;
// - `metric_name`: The name of the metric (e.g., "loc", "cog").
// - `filename`: The path to the source file being analyzed.
// - `date_id`: The week number since 2020-01-01.
// - `value`: The value of the metric for that file at that time.
let data;

// The `date_index` object maps dates to integer indices for compact storage.
// - `dates`: An array where `dates[i]` is the date for index `i`.
// - `index`: A map where `index[date]` is the index for that date.
let date_index;

const get_date_index = (date) => {
  const date_str = date.toISOString().slice(0, 10);
  if (date_index.index[date_str] !== undefined) {
    return date_index.index[date_str];
  }
  const index = date_index.dates.length;
  date_index.dates.push(date_str);
  date_index.index[date_str] = index;
  return index;
}

// A wrapper for lambda functions, printing a description and the time taken to execute.
let timed_indent = 0;
const timed = async (description, lambda) => {
  timed_indent++;
  const start = new Date();
  const result = await lambda();
  console.log(" ".repeat(timed_indent * 2),
    description, "took",  (new Date() - start) / 1000, "seconds");
  timed_indent--;
  return result;
}

// Encapsulates executing a shell script.
// Writes the `scriptContent` to a temporary `script.sh` file and executes it.
// Returns the captured stdout.
const execute_shell_command = async (scriptContent, {stream = false} = {}) => {
  await fs.writeFile("script.sh", scriptContent);
  const shell = spawn("sh", ["./script.sh"]);

  if (stream) {
    shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
    shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
  }

  let output = "";
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
  });

  await new Promise(r => shell.on("close", r));
  return output;
}


const clone = async (repo) => {
  // If the repository is already cloned, we can skip this step.
  try {
    await fs.access(repo.dirname);
    return;
  } catch (e) {}

  await execute_shell_command(`
    git clone \
    --progress \
    --verbose \
    ${incremental ? "--depth=1" : ""} \
    https://github.com/${repo.owner}/${repo.repository} ${repo.dirname}
    `, {stream: true});
}

const get_file_index = (filename) => {
  // Root directory.
  if (filename == "") {
    return -1;
  }

  // Existing entry.
  if (file_index.index[filename] != undefined) {
    return file_index.index[filename];
  }

  // If it has a parent, create the parent first.
  try {
    let parent_filename = filename.split('/').slice(0, -1).join('/');
    let parent_index = get_file_index(parent_filename);
  } catch (e) {}


  const index = file_index.file.length;
  file_index.index[filename] = index;
  file_index.file[index] = filename;
  return index;
}

// Runs the script defined in a metric entry and returns the raw output.
async function execute_metric_script(repo, entry) {
  return await execute_shell_command(`
    cd ./${repo.dirname}
    ${repo.cone ? "cd " + repo.cone : ""}
    (
      ${entry.script}
    ) | grep "\.h\\|\.cpp\\|\.hpp\\|\.c\\|\.cc\\|\.cxx\\|\.hxx"
    cd ..;
  `);
}

// Parses the raw output of a metric script into a map of filenames to occurrences.
function parse_script_output(output) {
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

    // If filename starts with ".", remove it.
    if (filename.startsWith('.')) {
      filename = filename.slice(1);
    }

    // If filename starts with "/", remove it.
    if (filename.startsWith('/')) {
      filename = filename.slice(1);
    }

    file_occurrences[filename] ||= 0;
    file_occurrences[filename] += occurrences;
  });
  return file_occurrences;
}

// Updates the main data object with new occurrences from a metric script.
function update_data_from_output(data, date, file_occurrences, max_depth) {
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

  // Aggregate values for the current date, including parent directories.
  const current_date_values = new Map();
  for (const [filename, occurrences] of Object.entries(file_occurrences)) {
    let path = filename;
    while (path != "") {
      const previous = current_date_values.get(path) || 0;
      current_date_values.set(path, previous + occurrences);
      const components = path.split('/');
      path = components.slice(0, -1).join('/');
    }
    // Also add the root directory.
    const previous = current_date_values.get("") || 0;
    current_date_values.set("", previous + occurrences);
  }

  // Get a set of all files/directories we need to check (old and new)
  const all_paths = new Set(Object.keys(data));
  for (const path of current_date_values.keys()) {
    all_paths.add(path);
  }

  // Update data for paths that have changed or are new
  for (const path of all_paths) {
    if (max_depth && path.split('/').length > max_depth) {
      continue;
    }

    const new_value = current_date_values.get(path) || 0;
    const old_value = previous_occurences(path);

    // If value is unchanged, do nothing to avoid redundant data.
    if (new_value === old_value) {
      continue;
    }

    // Also, if the value is 0 and there was no previous value, do nothing.
    if (new_value === 0 && old_value === undefined) {
        continue;
    }

    data[path] ||= {};
    data[path][date] = new_value;
  }

  // Calculate sum and sum_new for logging purposes (based on files only)
  let sum = 0;
  let sum_new = 0;
  for(const [filename, occurrences] of Object.entries(file_occurrences)) {
    sum += occurrences;
    if (previous_occurences(filename) !== occurrences) {
        sum_new += occurrences;
    }
  }

  return {sum, sum_new};
}

// Processes a single metric entry for a given repository and date.
async function ProcessEntry(repo, date, data, entry) {
  const output = await execute_metric_script(repo, entry);
  const file_occurrences = parse_script_output(output);
  const {sum, sum_new} = update_data_from_output(data, date, file_occurrences, entry.max_depth || 0);
  console.log("Found", sum, "occurrences of", entry.name, "(new:", sum_new, ")");
}

async function load_file_index(repo) {
  const file_index = {
    file: [],
    index: {},
  };
  try {
    const data = await fs.readFile(`../public/treemap/${repo.dirname}/file_index.json`);
    for (const line of data.toString().split('\n')) {
      if (line.trim() == "") continue;
      const split = line.split(':');
      const parent_index = parseInt(split[0]);
      const filename = split[1];
      const parent_path = parent_index == -1 ? "" : (file_index.file[parent_index] + "/");
      const fullname = parent_path + filename;
      const index = file_index.file.length;
      file_index.index[fullname] = index;
      file_index.file[index] = fullname;
    }
  } catch (e) {}
  return file_index;
}

async function load_date_index(repo) {
  const date_index = {
    dates: [],
    index: {},
  };
  try {
    const data = await fs.readFile(`../public/treemap/${repo.dirname}/date_index.json`);
    date_index.dates = JSON.parse(data.toString());
    date_index.dates.forEach((date, i) => {
      date_index.index[date] = i;
    });
  } catch (e) {}
  return date_index;
}

async function load_metric_data(repo, entries) {
  const data = {};
  for (const entry of entries.metrics) {
    try {
      const entry_data = {};
      const file_entry = `../public/treemap/${repo.dirname}/data/${entry.file}.json`;
      if (!(await fs.access(file_entry).then(() => true).catch(() => false))) {
        continue;
      }

      const file_entry_data = await fs.readFile(file_entry, "utf8");
      for (const line of file_entry_data.split('\n')) {
        if (line.trim() == "") continue;
        const [index_str, list] = line.split(' ');
        const index = parseInt(index_str);
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
  return data;
}

async function save_data(repo, entries) {
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

    // Write the date index.
    await fs.writeFile(
      `../public/treemap/${repo.dirname}/date_index.json`,
      JSON.stringify(date_index.dates, null, 1)
    );

    // Write each entry.
    for (const entry of entries.metrics) {
      let file_entry = `../public/treemap/${repo.dirname}/data/${entry.file}.json`;
      let file_entry_seralized = "";
      for(const [filename, file_data] of Object.entries(data[entry.file] || {})) {
        const index = get_file_index(filename);
        let list = Object.entries(file_data)
          .map(([date, value]) => `${date}:${value}`)
          .join(',');
        file_entry_seralized += `${index} ${list}\n`;
      }

      await fs.writeFile(file_entry, file_entry_seralized);
    }
  })
}

async function extend_data(repo, entries) {
  let date =
    incremental
      ? new Date()
      : new Date("2020-01-01");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  while(date < tomorrow) {
    const date_id = get_date_index(date);

    // Checkout the repository at the given date.
    if (!incremental) {
      await timed(`Checking out at date ${date.toISOString()}`, async () => {
        await execute_shell_command(`
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
        `);
      })
    }

    await timed("Gathering metrics", async () => {
      for (const entry of entries.metrics) {
        await timed(`Processing ${entry.name}`, async () => {
          data[entry.file] ||= {};
          await ProcessEntry(repo, date_id, data[entry.file], entry);
        });
      }
    });

    date.setDate(date.getDate() + 700);

    await save_data(repo, entries);
  }
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

  file_index = await load_file_index(repo);
  date_index = await load_date_index(repo);
  data = await load_metric_data(repo, entries);

  await extend_data(repo, entries);
  await save_data(repo, entries);

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
    // Only process chromium.
    if (repository.owner != "chromium" && repository.repository != "chromium") {
      console.log(`Skipping ${repository.owner}/${repository.repository}`);
      continue;
    }

    await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
      await processRepository(repository, entries);
    })
  }
}


processRepositories();
