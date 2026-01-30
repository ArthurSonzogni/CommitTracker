import JSON5 from "json5";
import YAML from 'yaml'
import { spawn } from "child_process"
import fs from "fs/promises";

const CONFIG = {
  full: {
    begin: new Date("2008-01-01"),
    end: new Date(),
    iterations: 200,
    power: 0.3, // More iterations near the end.
  }
}

async function pathExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function parseFile(library, filename) {
  return library.parse(await fs.readFile(filename, "utf8"));
}

// A wrapper for lambda functions, printing a description and the time taken to
// execute.
let timed_indent = 0;
async function timed(description, lambda) {
  timed_indent++;
  const start = new Date();
  console.log(" ".repeat(timed_indent * 2),
    description, "...");
  const result = await lambda();
  console.log(" ".repeat(timed_indent * 2),
    description, "took", (new Date() - start) / 1000, "seconds");
  timed_indent--;
  return result;
}

function update_metric(metrics_data, metric_name, file_id, date_id, value) {
  metrics_data[metric_name] ||= {};
  const history = metrics_data[metric_name][file_id] || [];

  const last_value = history.length == 0
    ? 0
    : history[history.length - 1][1]
    ;

  if (value === last_value) {
    return; // Value hasn't changed, no need to store.
  }

  history.push([date_id, value]);
  metrics_data[metric_name][file_id] = history;

  // Check we don't have multiple entries for the same date.
  let count = 0;
  history.forEach(entry => { if (entry[0] === date_id) count++; });
  if (count !== 1) {
    console.warn(`Warning: metric ${metric_name} for file ${file_id} has ${count} entries for date ${date_id}`);
    console.warn(history);
    throw new Error("Duplicate entries for the same date");
  }
}


const clone = async (repo, incremental) => {
  // If the repository is already cloned, we can skip this step.
  try {
    await fs.access(repo.dirname);
    return;
  } catch (e) { }

  // If not incremental, we can clone a full clone, with blobs. This can be
  // restricted to the CONFIG.full.begin date.
  if (!incremental) {
    const since_date = CONFIG.full.begin.toISOString().split('T')[0];
    await fs.writeFile("script.sh", `
      git clone \
      --progress \
      --verbose \
      --shallow-since="${since_date}" \
      https://github.com/${repo.owner}/${repo.repository} \
      ${repo.dirname}
    `)
    const shell = spawn("sh", ["./script.sh"]);
    shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
    shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
    await new Promise(r => shell.on("close", r));
    return;
  }

  // Incremental clone: first do a shallow clone without blobs.
  {
    await fs.writeFile("script.sh", `
      git clone \
      --filter=blob:none \
      --no-checkout \
      --progress \
      --verbose \
      --depth 1 \
      https://github.com/${repo.owner}/${repo.repository} ${repo.dirname}
      `)
    const shell = spawn("sh", ["./script.sh"]);
    shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
    shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
    await new Promise(r => shell.on("close", r));
  }

  // Then fetch the history, still without blobs, but going back one month.
  {
    await fs.writeFile("script.sh", `
      cd ${repo.dirname}
      git fetch \
        --verbose \
        --progress \
        --shallow-since="1 month ago" \
        --filter=blob:none
    `)
    const shell = spawn("sh", ["./script.sh"]);
    shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
    shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
    await new Promise(r => shell.on("close", r));
  }
}

// Entry layout:
// {
//   name        : string,
//   description : string,
//   pattern     : string,
//   file        : string,
// }
async function ProcessEntry(repo, date_id, root, entry, metrics_data, id_counter) {
  await fs.writeFile("script.sh", `
    cd ./${repo.dirname}
    cd ${repo.cone ? repo.cone : "."}
    ${entry.script}
    cd ..;
  `)

  let output = "";
  const shell = spawn("sh", ["./script.sh"]);
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
  });
  await new Promise(r => shell.on("close", r));

  const file_occurrences = new Map();
  const max_depth = entry.max_depth || 999;
  output.split('\n').forEach(line => {
    if (!line) return;
    // Expected format is either:
    // 1. <file>:<occurrences>
    // 2. <file>
    let filename;
    let occurrences;
    const split = line.split(':');
    if (split.length >= 2) {
      filename = split[0];
      occurrences = parseInt(split[1]) || 0;
    } else {
      filename = line;
      occurrences = 1;
    }

    if (!filename) return;

    // Clamp the filename size to `max_depth`
    filename = filename.split('/').slice(0, max_depth).join('/');

    file_occurrences[filename] ||= 0;
    file_occurrences[filename] += occurrences;
  })

  const processed = new Set();
  for (const [filename, occurrences] of Object.entries(file_occurrences)) {
    let current = root;
    for (const component of filename.split('/')) {
      if (!component) continue;
      current.children ||= [];
      let next = current.children.find(c => c.name == component);
      if (!next) {
        next = { name: component, id: id_counter.value++ };
        current.children.push(next);
      }
      current = next;
    }
    processed.add(current.id);
    update_metric(metrics_data, entry.file, current.id, date_id, occurrences);
  }

  // Fill with zeros the missing values for this metric at this date_id.
  const fill_zeros = (node, depth) => {
    if (node.children) {
      node.children.forEach(fill_zeros)
    }

    if (processed.has(node.id)) {
      return;
    }

    // This is a leaf node
    const history = metrics_data[entry.file]?.[node.id];
    if (!history) {
      return;
    }

    // Does it already have a value for this date?
    if (history.length == 0) {
      return;
    }
    if (history[history.length - 1][0] >= date_id) {
      return;
    }

    update_metric(metrics_data, entry.file, node.id, date_id, 0);
  }
  fill_zeros(root);
}

async function processRepository(repo, entries) {
  if (repo.treemap == false) {
    console.log(`Skipping ${repo.owner}/${repo.repository}`)
    return
  }
  console.log(`Processing ${repo.owner}/${repo.repository}`)

  const output_dir = `../public/treemap/${repo.dirname}/`;
  await fs.mkdir(output_dir, { recursive: true });

  // State variables
  let root;
  let next_id = 0;
  let metrics_data = {};
  let processed_dates = [];

  const file_index_filename = `${output_dir}file_index.json`;
  const dates_filename = `${output_dir}dates.json`;
  const metrics_dir = `${output_dir}metrics/`;

  const incremental = await pathExists(file_index_filename);
  console.log("Incremental:", incremental);

  if (incremental) {
    try {
      root = await parseFile(JSON5, file_index_filename);
      processed_dates = await parseFile(JSON5, dates_filename);

      const find_max_id = node => {
        next_id = Math.max(next_id, node.id + 1);
        if (node.children) {
          node.children.forEach(find_max_id);
        }
      }
      find_max_id(root);

      await fs.mkdir(metrics_dir, { recursive: true });
      const metric_files = await fs.readdir(metrics_dir);
      for (const metric_file of metric_files) {
        if (metric_file.endsWith('.json')) {
          const metric_name = metric_file.slice(0, -5);
          metrics_data[metric_name] = await parseFile(JSON5, `${metrics_dir}${metric_file}`);
        }
      }
    } catch (e) {
      console.error("Error loading incremental data, starting from scratch.", e);
      root = undefined;
      next_id = 0;
      metrics_data = {};
      processed_dates = [];
    }
  }

  if (!root) {
    root = { name: "/", id: next_id++ };
  }

  let dates_to_add = []
  if (incremental) {
    dates_to_add.push(new Date());
  } else {
    for (let i = 0; i < CONFIG.full.iterations; i++) {
      const t = Math.pow(i / (CONFIG.full.iterations - 1), CONFIG.full.power);
      const date = new Date(CONFIG.full.begin.getTime() + t *
        (CONFIG.full.end.getTime() - CONFIG.full.begin.getTime()));
      dates_to_add.push(date);
    }
  }

  await timed(`Cloning ${repo.owner}/${repo.repository}`, async () => {
    await clone(repo, incremental);
  })

  const id_counter = { value: next_id };

  for (const date of dates_to_add) {
    const date_id = processed_dates.length;
    const date_string = date.toISOString();
    processed_dates.push(date_string);

    await timed(`Checking out at date ${date_string}`, async () => {
      if (incremental) {
        console.log("Incremental mode, skipping checkout.");
        return;
      }
      await fs.writeFile("script.sh", `
        cd ./${repo.dirname}
        commit_at_date() {
          git --no-pager log origin/main --until="${date_string}" --max-count=1 --pretty=format:"%H"
        }
        git checkout $(commit_at_date)
        cd ..;
      `)
      const shell = spawn("sh", ["./script.sh"]);
      await new Promise(r => shell.on("close", r));
    })

    await timed("Gathering metrics", async () => {
      for (const entry of entries.metrics) {
        await timed(`Processing ${entry.name}`, async () => {
          await ProcessEntry(repo, date_id, root, entry, metrics_data, id_counter);
        });
      }
    });
  }

  await timed("Writing", async () => {
    await fs.writeFile(dates_filename, JSON.stringify(processed_dates, null, 2));
    await fs.writeFile(file_index_filename, JSON.stringify(root, null, 2));
    await fs.mkdir(metrics_dir, { recursive: true });
    for (const [metric_name, data] of Object.entries(metrics_data)) {
      const filename = `${metrics_dir}${metric_name}.json`;
      await fs.writeFile(filename, JSON.stringify(data));
    }
  })
}

// Load the entries. This is a list of metrics to be collected.
const entries_filename = `../treemap.yaml`;
const entries = YAML.parse(await fs.readFile(entries_filename, "utf8"));

// Create the output directory if it does not exist.
await fs.mkdir("../public/treemap/", { recursive: true });
await fs.writeFile("../public/treemap/entries.json", JSON.stringify(entries, null, 1));

// Load the list or repositories to process.
const repositories_file = "../repositories.json5";
const repositories = await parseFile(JSON5, repositories_file);

for (const repository of repositories) {
  await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
    await processRepository(repository, entries);
  })
}
