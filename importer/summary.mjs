import * as filesystem from "fs";
import JSON5 from "json5";
const fs = filesystem.promises;

const group_by_date = list => {
  const out = {};
  list.forEach(item => {
    const year = item.substring(0, 7);
    out[year] ||= 0;
    out[year] ++;
  })
  return out;
}

const summarize = async (kind, repository) => {
  const repository_dir = `../static/data/${repository.dirname}`;
  const kind_list = `${repository_dir}/${kind}.json`;
  const kind_summary = `${repository_dir}/${kind}_summary.json`;

  const out = {};
  const list = JSON.parse(await fs.readFile(kind_list, "utf8"));
  for(const x of list) {
    const x_filename = `${repository_dir}/${kind}/${x}.json`;
    const info = JSON.parse(await fs.readFile(x_filename, "utf8"));

    const date_author = Object.keys(info.author).sort();
    const date_review = Object.keys(info.review).sort();

    out[x] = {
      author: group_by_date(date_author),
      review: group_by_date(date_review),
    }

    if (kind == "organizations") {
      out[x].emails = info.emails;
    }
  }

  await fs.writeFile(kind_summary, JSON.stringify(out, null, 1));
}

const repositories_file = await fs.readFile("../repositories.json5", "utf8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {
  for(const kind of [
    "usernames",
    "emails",
    "organizations",
  ]) {
    await summarize(kind, repository);
  }
}
