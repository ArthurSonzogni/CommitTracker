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
  },
  // The number of metric scripts running at once.
  parallel_scripts: 1,
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

  await fs.writeFile("script.sh", `
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

// Entry layout:
// {
//   name        : string,
//   description : string,
//   pattern     : string,
//   file        : string,
// }
//
// Runs the script of an entry, in the checkout of `repo`. Several can run at
// once.
async function RunEntry(repo, entry) {
  const start = new Date();
  const shell = spawn("sh", ["-c", `
    export REPO_DIRNAME="${repo.dirname}"
    export REPO_NAME="${repo.name}"
    cd ./${repo.dirname}
    cd ${repo.cone ? repo.cone : "."}
    ${entry.script}
  `]);
  const chunks = [];
  shell.stdout.on("data", chunk => chunks.push(chunk));
  await new Promise(r => shell.on("close", r));
  console.log(" ".repeat(timed_indent * 2 + 2), entry.name,
    "took", (new Date() - start) / 1000, "seconds");
  return Buffer.concat(chunks).toString();
}

// Runs `tasks` (functions returning promises), at most `limit` at once.
async function RunParallel(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// The children of each node, by name. Built lazily, for fast lookups.
const children_by_name = new WeakMap();
function GetChild(node, name, id_counter) {
  node.children ||= [];
  let children = children_by_name.get(node);
  if (!children) {
    children = new Map(node.children.map(child => [child.name, child]));
    children_by_name.set(node, children);
  }
  let child = children.get(name);
  if (!child) {
    child = { name, id: id_counter.value++ };
    node.children.push(child);
    children.set(name, child);
  }
  return child;
}

// Records the output of an entry's script, as the value of the metric at
// `date_id`.
function ApplyEntry(output, date_id, root, entry, metrics_data, id_counter) {
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

    file_occurrences.set(filename,
      (file_occurrences.get(filename) || 0) + occurrences);
  })

  const processed = new Set();
  for (const [filename, occurrences] of file_occurrences) {
    let current = root;
    for (const component of filename.split('/')) {
      if (!component) continue;
      current = GetChild(current, component, id_counter);
    }
    processed.add(current.id);
    update_metric(metrics_data, entry.file, current.id, date_id, occurrences);
  }

  // Fill with zeros the missing values for this metric at this date_id. Only
  // the nodes with a history for this metric can need one.
  for (const [node_id, history] of Object.entries(metrics_data[entry.file] || {})) {
    if (processed.has(Number(node_id))) {
      continue;
    }

    // Does it already have a value for this date?
    if (history.length == 0) {
      continue;
    }
    if (history[history.length - 1][0] >= date_id) {
      continue;
    }

    update_metric(metrics_data, entry.file, node_id, date_id, 0);
  }
}

// Computes `entries` at `date_id`, for the current checkout of `repo`.
async function GatherMetrics(repo, date_id, root, entries, metrics_data, id_counter) {
  await timed("Gathering metrics", async () => {
    const outputs = await RunParallel(
      entries.map(entry => () => RunEntry(repo, entry)), CONFIG.parallel_scripts);
    entries.forEach((entry, i) => {
      ApplyEntry(outputs[i], date_id, root, entry, metrics_data, id_counter);
    });
  });
}

// Checks out the last commit of `repo` before `date_string`. Returns its hash,
// or an empty string if there is none.
async function Checkout(repo, date_string) {
  let commit = "";
  await timed(`Checking out at date ${date_string}`, async () => {
    const shell = spawn("sh", ["-c", `
      cd ./${repo.dirname}
      COMMIT=$(git --no-pager log origin/main --until="${date_string}" --max-count=1 --pretty=format:"%H")
      if [ -n "$COMMIT" ]; then
        if git checkout --force $COMMIT > /dev/null 2>&1; then
          echo $COMMIT
        fi
      fi
    `]);
    shell.stdout.on("data", chunk => { commit += chunk.toString(); });
    await new Promise(r => shell.on("close", r));
  });
  return commit.trim();
}

async function IsShallow(repo) {
  let output = "";
  const shell = spawn("git", ["rev-parse", "--is-shallow-repository"],
    { cwd: repo.dirname });
  shell.stdout.on("data", chunk => { output += chunk.toString(); });
  await new Promise(r => shell.on("close", r));
  return output.trim() !== "false";
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
        // Skip the compact copies, derived by scripts/compact-treemap.mjs.
        if (metric_file.endsWith('.json') && !metric_file.endsWith('.compact.json')) {
          const metric_name = metric_file.slice(0, -5);
          metrics_data[metric_name] = await parseFile(JSON5, `${metrics_dir}${metric_file}`);
        }
      }

      // Migrate any legacy alias metric files to canonical metric names.
      for (const entry of entries.metrics || []) {
        if (!metrics_data[entry.file] && entry.aliases) {
          for (const alias of entry.aliases) {
            if (metrics_data[alias]) {
              metrics_data[entry.file] = metrics_data[alias];
              delete metrics_data[alias];
              try {
                await fs.unlink(`${metrics_dir}${alias}.json`);
              } catch (e) {}
              break;
            }
          }
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

  // Metrics added since the last import: compute them at the dates already
  // imported, for them to have a history. This needs the full history of the
  // repository, so it is skipped for shallow clones, like in the CI.
  const new_entries = incremental
    ? entries.metrics.filter(entry => !metrics_data[entry.file])
    : [];
  if (new_entries.length > 0 && await IsShallow(repo)) {
    console.log("Shallow clone: the new metrics start from today:",
      new_entries.map(entry => entry.name).join(", "));
  } else if (new_entries.length > 0) {
    await timed(`Backfilling ${new_entries.map(entry => entry.name).join(", ")}`, async () => {
      let previous_commit = "";
      for (let date_id = 0; date_id < processed_dates.length; date_id++) {
        const commit = await Checkout(repo, processed_dates[date_id]);
        // The same commit has the same values: there is nothing to record.
        if (!commit || commit === previous_commit) {
          continue;
        }
        previous_commit = commit;
        await GatherMetrics(repo, date_id, root, new_entries, metrics_data, id_counter);
      }
    });
  }

  let previous_commit = "";
  for (const date of dates_to_add) {
    const date_string = date.toISOString();
    const commit = await Checkout(repo, date_string);

    if (!commit) {
      console.log(`Skipping date ${date_string} - no commits yet`);
      continue;
    }

    const date_id = processed_dates.length;
    processed_dates.push(date_string);

    // The same commit has the same values: there is nothing to record.
    if (commit === previous_commit) {
      continue;
    }
    previous_commit = commit;
    await GatherMetrics(repo, date_id, root, entries.metrics, metrics_data, id_counter);
  }

  await timed("Writing", async () => {
    await fs.writeFile(dates_filename, JSON.stringify(processed_dates, null, 2));
    await fs.writeFile(file_index_filename, JSON.stringify(root));
    await fs.mkdir(metrics_dir, { recursive: true });
    const available_metrics = [];
    for (const [metric_name, data] of Object.entries(metrics_data)) {
      available_metrics.push(metric_name);
      const filename = `${metrics_dir}${metric_name}.json`;
      await fs.writeFile(filename, JSON.stringify(data));
    }
    await fs.writeFile(`${output_dir}available_metrics.json`, JSON.stringify(available_metrics, null, 2));
  })
}

// Load the list or repositories to process.
const repositories_file = "../repositories.json5";
const repositories = await parseFile(JSON5, repositories_file);

// Gather all metrics to build a global entries.json for the frontend
const all_metrics_map = new Map();

for (const repository of repositories) {
  if (repository.treemap === false) continue;

  const entries_filename = `../treemap/${repository.dirname}.yaml`;
  if (!(await pathExists(entries_filename))) {
    console.log(`Skipping ${repository.dirname} - no treemap config`);
    continue;
  }

  const entries = YAML.parse(await fs.readFile(entries_filename, "utf8"));
  for (const metric of entries.metrics || []) {
    if (!all_metrics_map.has(metric.name)) {
      all_metrics_map.set(metric.name, {
        ...metric,
        aliases: metric.aliases ? [...metric.aliases] : [],
      });
    } else if (metric.aliases) {
      const existing = all_metrics_map.get(metric.name);
      existing.aliases = Array.from(new Set([...(existing.aliases || []), ...metric.aliases]));
    }
  }
}

const global_entries = { metrics: Array.from(all_metrics_map.values()) };

// Create the output directory if it does not exist.
await fs.mkdir("../public/treemap/", { recursive: true });
await fs.writeFile("../public/treemap/entries.json", JSON.stringify(global_entries, null, 1));

const target_repo = process.argv[2];

for (const repository of repositories) {
  if (repository.treemap === false) continue;
  if (target_repo && repository.dirname !== target_repo) continue;

  const entries_filename = `../treemap/${repository.dirname}.yaml`;
  if (!(await pathExists(entries_filename))) {
    continue;
  }

  const entries = YAML.parse(await fs.readFile(entries_filename, "utf8"));

  await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
    await processRepository(repository, entries);
  })
}
