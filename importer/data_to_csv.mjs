import * as filesystem from "fs";
const fs = filesystem.promises;

const user_file = "../static/data/chrome/users.json";
const user_dir = "../static/data/chrome/users";

const users = JSON.parse(await fs.readFile(user_file, "utf8"));
const date_after = new Date("2022-01-01");
const date_before = new Date("2023-01-01");

const output = {};

for(const user of users) {
  if (output[user] === undefined) {
    output[user] = {};
  }
  const data = JSON.parse(await fs.readFile(`${user_dir}/${user}.json`, "utf8"));
  for(const time in data.author) {
    if (new Date(time) > date_after && new Date(time) < date_before) {
      for(const reviewer of data.author[time]) {
        if (output[user][reviewer] === undefined) {
          output[user][reviewer] = 0;
        }
        output[user][reviewer]++;
      }
    }
  }
}

// Delete users with no reviewers
for(const user in output) {
  if (Object.keys(output[user]).length === 0) {
    delete output[user];
  }
}

// For every users, filter out the 5% of the commits from the least active
// reviewers.
for(const user in output) {
  const reviewers = Object.entries(output[user]).sort((a, b) => b[1] - a[1]);
  let sum = 0;
  reviewers.forEach(([_, count]) => sum += count);
  sum *= 0.95;
  output[user] = reviewers.filter(([reviewer, count]) => {
    sum -= count;
    return sum > 0;
  });
}

// Print it out for gephi:
console.log("Source,Target")
for(const user in output) {
  for(const reviewer of output[user]) {
    if (reviewer[1] > 2) {
      for(let i = 0; i < reviewer[1]; i++) {
        console.log(`${user},${reviewer[0]}`)
      }
    }
  }
}
