import * as filesystem from "fs";
const fs = filesystem.promises;

const user_file = "../static/data/users.json";
const user_dir = "../static/data/users";

const users = JSON.parse(await fs.readFile(user_file, "utf8"));
const date_after = new Date("2022-01-01");
const date_before = new Date("2023-01-01");
for(const user of users) {
  const data = JSON.parse(await fs.readFile(`${user_dir}/${user}.json`, "utf8"));
  for(const time in data.author) {
    if (new Date(time) > date_after && new Date(time) < date_before) {
      for(const reviewer of data.author[time]) {
        console.log(`${user},${reviewer}`);
      }
    }
  }
}
