import * as filesystem from "fs";
const fs = filesystem.promises;

const repositories_file = "../static/data/repositories.json";

const group_by_date = list => {
  const out = {};
  list.forEach(item => {
    const year = item.substring(0, 7);
    out[year] ||= 0;
    out[year] ++;
  })
  return out;
}

const processRepository = async (repository) => {
  const repository_dir = `../static/data/${repository.dirname}`;
  const users_filename = `${repository_dir}/users.json`;
  const users_info_filename = `${repository_dir}/users_info.json`;

  const out = {};
  const users = JSON.parse(await fs.readFile(users_filename, "utf8"));
  for(const user of users) {
    const user_filename = `${repository_dir}/users/${user}.json`;
    const info = JSON.parse(await fs.readFile(user_filename, "utf8"));

    const date_author = Object.keys(info.author).sort();
    const date_review = Object.keys(info.review).sort();
    const user_out = {
      author: group_by_date(date_author),
      review: group_by_date(date_review),
    }

    out[user] = user_out;
  }

  await fs.writeFile(users_info_filename, JSON.stringify(out));
}

const main = async () => {
  const repositories = JSON.parse(await fs.readFile(repositories_file, "utf8"));
  for (const repository of repositories) {
    await processRepository(repository);
  }
}

main();
