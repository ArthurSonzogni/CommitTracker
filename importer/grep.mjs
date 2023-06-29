import { spawn } from "child_process"
import * as filesystem from "fs";

const fs = filesystem.promises;

// Entry layout:
// {
//   name        : string,
//   description : string,
//   pattern     : string,
//   file        : string,
// }
const ProcessEntry = async (root, entry) => {
  
  await fs.writeFile("script.sh", `
    cd ./chromium;
    git grep "${entry.pattern}" \
      | cut -f1 -d':' \
      | grep -v "test" \
      | grep -v "codelabs" \
      | grep -v "/test" \
      | grep "\\.h\\|\\.cc"
    cd ..
  `)

  let output = "";
  const shell = spawn("sh", ["./script.sh"]);
  shell.on("message", console.log);
  shell.stderr.on("data", console.error);
  shell.stdout.on("data", chunk => {
    output += chunk.toString();
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

const main = async () => {
  const root = {
    name: "/",
    children: [],
  }

  const entries_filename= "../static/data/grep/entries.json"
  const entries = JSON.parse(await fs.readFile(entries_filename, "utf8"));
  for (const entry of entries) {
    await ProcessEntry(root, entry);
  }

  const filename = `../static/data/grep/root.json`;

  console.log(JSON.stringify(root, null, 2));

  await fs.writeFile(filename, JSON.stringify(root));
}

main();
