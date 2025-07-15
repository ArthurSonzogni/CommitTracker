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

// Optimize the tree.
const optimize = node => {
  // Children are sorted by name.
  if (node.children) {
    return {
      name: node.name,
      children: node.children.map(optimize).sort((a,b) => a.name < b.name),
    }
  }

  // Transitions:
  // 1. (undefined -> 0) -> (undefined -> undefined)
  // 2. (x -> x) -> (x -> undefined)
  {
    const previous = {}
    Object
      .keys(node.data)
      .sort((a,b) => parseInt(a) < parseInt(b))
      .forEach(date => {
      const data = node.data[date];
      const keys = Object.keys(data);
      for (const key of keys) {
        // 1.
        if (previous[key] == undefined && data[key] == 0) {
          delete data[key];
        }
        // 2.
        if (previous[key] == data[key]) {
          delete data[key];
        }
        previous[key] = data[key];
      }
    })

    // Delete empty data.
    Object.keys(node.data).forEach(date => {
      if (Object.keys(node.data[date]).length == 0) {
        delete node.data[date];
      }
    })
  }

  return {
    name: node.name,
    data: node.data,
  }
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

async function processRepository(repo, entries) {
  if (repo.treemap == false) {
    console.log(`Skipping ${repo.owner}/${repo.repository}`)
    return
  }

  console.log(`Processing ${repo.owner}/${repo.repository}`)

  await timed(`Cloning ${repo.owner}/${repo.repository}`, clone(repo));

  let root = {
    name: "/",
  }
  let date = new Date("2020-01-01");

  // Try to load the latest treemap.
  try {
    const filename = `../public/treemap/${repo.dirname}/latest.json`;
    const data = JSON.parse(await fs.readFile(filename, "utf8"));
    root = data;
    date = new Date(root.next_date);
  } catch (e) {}

  if (incremental) {
    date = new Date();
  }

  const today = new Date();
  let max_iterations = incremental ? 10 : 10000000;
  while(incremental || (date < today && max_iterations--)) {
    const date_id = formatDate(date)

    // Checkout the repository at the given date.
    if (!incremental) {
      await timed(`Checking out at date ${date.toISOString()}`, async () =>
      {
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
          await ProcessEntry(repo, date_id, root, entry);
        });
        index++;
      }
    });

    date.setDate(date.getDate() + 7);

    await timed("Optimizing", () => {
      root = optimize(root);
    });
    root.next_date = date;

    // Write the treemap to disk.
    await timed("Writing", async () => {
      await fs.mkdir(`../public/treemap/${repo.dirname}/`, { recursive: true });
      const filename = `../public/treemap/${repo.dirname}/latest.json`;
      await fs.writeFile(filename, JSON.stringify(root));
    })

    if (incremental) {
      break;
    }
  }

  // Remove git repository
  if (incremental) {
    await timed("Removing repository", async () => {
      await fs.writeFile("script.sh", `
        rm -rf ${repo.dirname}
      `)
      const shell = spawn("sh", ["./script.sh"]);
      await new Promise(r => shell.on("close", r));
    });
  }
}

// Entry layout:
// {
//   name        : string,
//   description : string,
//   pattern     : string,
//   file        : string,
// }
async function ProcessEntry(repo, date, root, entry) {
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

  let sum = 0;
  output.split('\n').forEach(line => {

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

    file_occurrences[filename] ||= 0;
    file_occurrences[filename] += occurrences;
  })

  //console.log("Found", Object.keys(file_occurrences).length, "files");
  //console.log(file_occurrences);

  for(const [filename, occurrences] of Object.entries(file_occurrences)) {
    let current = root;
    for(const component of filename.split('/')) {
      let found = false;
      while(true) {
        current.children ||= [];
        for(const child of current.children) {
          if (child.name == component) {
            found = true;
            current = child;
          }
        }
        if (found) {
          break;
        }

        current.children.push({
          name: component,
        })
      }
    }

    current.data ||= {};
    current.data[date] ||= {}
    current.data[date][entry.file] = occurrences;
    sum++;
  }
  console.log("Found", sum, "occurrences of", entry.name);

  // Fill with zeros the missing values.
  const fill_zeros = node => {
    if (node.children) {
      node.children.forEach(fill_zeros);
    } else {
      node.data[date] ||= {};
      node.data[date][entry.file] ||= 0;
    }
  }
  fill_zeros(root);
}

processRepositories();
