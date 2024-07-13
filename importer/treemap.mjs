import { spawn } from "child_process"
import * as filesystem from "fs";
import JSON5 from "json5";

const fs = filesystem.promises;

async function processRepositories() {
  const repositories_file = "../repositories.json5";
  const repositories = JSON5.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await processRepository(repository);
    break;
  }
}

async function processRepository(repo) {
  if (repo.treemap == false) {
    return
  }

  console.log(`Processing ${repo.owner}/${repo.repository}`)
  // Git clone
  {
    await fs.writeFile("script.sh", `
      rm -rf ${repo.dirname}
      git clone \
        --depth=1 \
        --single-branch \
        --progress \
        --verbose \
        https://github.com/${repo.owner}/${repo.repository} ${repo.dirname}
    `)
    const shell = spawn("sh", ["./script.sh"]);
    shell.stdout.on("data", chunk => { console.log(chunk.toString()); });
    shell.stderr.on("data", chunk => { console.log(chunk.toString()); });
    await new Promise(r => shell.on("close", r));
  }

  const root = {
    name: "/",
  }

  const entries_filename= `../treemap.json5`;
  const entries = JSON5.parse(await fs.readFile(entries_filename, "utf8"));
  await fs.writeFile("../public/treemap/entries.json", JSON.stringify(entries, null, 1));

  for (const entry of entries.metrics) {
    await ProcessEntry(repo, root, entry);
  }
  console.log(JSON.stringify(root, null, 2));

  await fs.mkdir(`../public/treemap/${repo.dirname}/`, { recursive: true });
  const filename = `../public/treemap/${repo.dirname}/latest.json`;
  await fs.writeFile(filename, JSON.stringify(root));

  // Remove git repository
  {
    await fs.writeFile("script.sh", `
      rm -rf ${repo.dirname}
    `)
    const shell = spawn("sh", ["./script.sh"]);
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
async function ProcessEntry(repo, root, entry) {
  console.log(`Processing entry ${entry.name}`);
  console.log(entry);
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
        current.children.sort((a,b) => a.name < b.name);
      }
    }

    if (current[entry.file] == undefined) {
      current[entry.file] = 0;
    }
    current[entry.file]++;
  });
}

processRepositories();
