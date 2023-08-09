import * as filesystem from "fs";
const fs = filesystem.promises;

const group_by_date = list => {
  const out = {};
  list.forEach(item => {
    const year = item.substring(0, 4);
    out[year] ||= 0;
    out[year] ++;
  })
  return out;
}

const main = async () => {
  const out = {};
  const users_filename = "../static/data/users.json";
  const users = JSON.parse(await fs.readFile(users_filename, "utf8"));
  for(const user of users) {
    const user_filename = `../static/data/users/${user}.json`;
    const info = JSON.parse(await fs.readFile(user_filename, "utf8"));

    const date_author = Object.keys(info.author).sort();
    const date_review = Object.keys(info.review).sort();
    const user_out = {
      author: {
        first: date_author[0],
        last: date_author[date_author.length - 1],
        total: date_author.length,
        by_date: group_by_date(date_author),
      },
      review: {
        first: date_review[0],
        last: date_review[date_review.length - 1],
        total: date_review.length,
        by_date: group_by_date(date_review),
      },
    }

    out[user] = user_out;
  }

  const users_info_filename = "../static/data/users_info.json";
  await fs.writeFile(users_info_filename, JSON.stringify(out));
}

main();
