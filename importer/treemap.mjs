import { spawn } from "child_process"
import * as filesystem from "fs";
import JSON5 from "json5";
import { argv } from "process";

const fs = filesystem.promises;

async function processRepositories() {
  const repositories_file = "../repositories.json5";
  const repositories = JSON5.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await timed(`Processing ${repository.owner}/${repository.repository}`, async () => {
      await processRepository(repository);
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

  // If data are the same for two consecutive datapoints, the data from the
  // second can be removed.
  {
    const current_data = {}
    Object
      .keys(node.data)
      .sort((a,b) => parseInt(a) < parseInt(b))
      .forEach(date => {
      const data = node.data[date];
      const keys = Object.keys(data);
      for (const key of keys) {
        if (current_data[key] == data[key]) {
          delete data[key];
        }
        current_data[key] = data[key];
      }
    })

    // Delete empty data.
    Object.keys(node.data).forEach(date => {
      if (Object.keys(node.data[date]).length == 0) {
        delete node.data[date];
      }
    })
  }

  // If a value transition from x to undefined, it must first be set to 0.
  // If a value transition from 0 to 0, it can be removed.
  {
    const current_data = {};
    Object
      .keys(node.data)
      .sort((a,b) => parseInt(a) < parseInt(b))
      .forEach(date => {
      const data = node.data[date];
      const keys = Object.keys(data);
      for (const key of keys) {
        if (current_data[key] != undefined && data[key] == undefined) {
          data[key] = 0;
        }
        if (current_data[key] == 0 && data[key] == 0) {
          delete data[key];
        }
        current_data[key] = data[key];
      }
    })
  }

  return {
    name: node.name,
    data: node.data,
  }
}

const clone = async (repo) => {
  await fs.writeFile("script.sh", `
    rm -rf ${repo.dirname}
    git clone \
    --single-branch \
    --progress \
    --verbose \
    https://github.com/${repo.owner}/${repo.repository} ${repo.dirname}
    `)
  //#--depth=1 \
  const shell = spawn("sh", ["./script.sh"]);
  shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
  shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
  await new Promise(r => shell.on("close", r));
}


async function processRepository(repo) {
  if (repo.treemap == false) {
    return
  }

  // Load the entries. This is a list of metrics to be collected.
  const entries_filename= `../treemap.json5`;
  const entries = JSON5.parse(await fs.readFile(entries_filename, "utf8"));
  await fs.mkdir("../public/treemap/", { recursive: true });
  await fs.writeFile("../public/treemap/entries.json", JSON.stringify(entries, null, 1));

  console.log(`Processing ${repo.owner}/${repo.repository}`)

  await timed(`Cloning ${repo.owner}/${repo.repository}`, async () => {
    await clone(repo);
  })


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


  const today = new Date();
  let max_iterations = 5;
  while(date < today && max_iterations--) {
    const date_id = formatDate(date)

    // Checkout the repository at the given date.
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
  }


  // Remove git repository
  //{
    //await fs.writeFile("script.sh", `
      //rm -rf ${repo.dirname}
    //`)
    //const shell = spawn("sh", ["./script.sh"]);
    //await new Promise(r => shell.on("close", r));
  //}
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

  let sum = 0;
  output.split('\n').forEach(line => {
    let current = root;
    for(const component of line.split('/')) {
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
    current.data[date][entry.file] ||= 0;
    current.data[date][entry.file]++;
    sum++;
  });
}

processRepositories();
