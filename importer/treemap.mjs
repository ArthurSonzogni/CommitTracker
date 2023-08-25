import { spawn } from "child_process"
import * as filesystem from "fs";

const fs = filesystem.promises;

async function processRepositories() {
  const repositories_file = "../static/data/repositories.json";
  const repositories = JSON.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await processRepository(repository);
  }
}

async function processRepository(repo) {
  // Git clone
  {
    await fs.writeFile("script.sh", `
      rm -rf ${repo.dirname}
      git clone https://github.com/${repo.owner}/${repo.repository} ${repo.dirname}
    `) 
    const shell = spawn("sh", ["./script.sh"]);
    shell.on("message", console.log);
    shell.stderr.on("data", chunk => console.error(chunk.toString()));
    shell.stdout.on("data", chunk => console.log(chunk.toString()));
    await new Promise(r => shell.on("close", r));
  }

  const root = {
    name: "/",
    children: [],
  }

  const entries_filename= `../static/data/chrome/treemap/entries.json`;
  const entries = JSON.parse(await fs.readFile(entries_filename, "utf8"));
  for (const entry of entries) {
    await ProcessEntry(repo, root, entry);
  }

  await fs.mkdir(`../static/data/${repo.dirname}/treemap/`, { recursive: true });
  const filename = `../static/data/${repo.dirname}/treemap/latest.json`;

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

  await fs.writeFile("script.sh", `
    cd ./${repo.dirname};
    git grep "${entry.pattern}" \
      | cut -f1 -d':' \
      | grep -v "test" \
      | grep -v "codelabs" \
      | grep -v "/tools" \
      | grep "\\.h\\|\\.cc"
    cd ..
  `)

  let output = "";
  const shell = spawn("sh", ["./script.sh"]);
  shell.on("message", console.log);
  shell.stderr.on("data", chunk => console.error(chunk.toString()));
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
    console.log(chunk.toString());
  });
  await new Promise(r => shell.on("close", r));

  output.split('\n').forEach(line => {
    console.log(line);
    let current = root;
    for(const component of line.split('/')) {
      let found = false;
      while(true) {
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
          children: []
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
