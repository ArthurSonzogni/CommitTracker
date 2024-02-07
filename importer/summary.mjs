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

// In the file `organizations_summary.json` contains the summary of the
// organizations for every repositories.
// Format:
// ```json
// {
//  "repository1": {
//    "organization1": 1212
//    "organization2": 1212
//  },
//  "repository2": {
//    "organization1": 1212
//    "organization2": 1212
//  }
// }
// ```
const organizations_summary = {};
for(const repository of repositories) {
  organizations_summary[repository.dirname] = {};
  const repository_dir = `../static/data/${repository.dirname}`;
  const summary_file = `${repository_dir}/organizations_summary.json`;
  const summary = JSON.parse(await fs.readFile(summary_file, "utf8"));
  for(const [organization, data] of Object.entries(summary)) {
    organizations_summary[repository.dirname][organization] =
      Object.values(data.author).reduce((a, b) => a + b, 0);
  }
}
await fs.writeFile("../static/data/organizations_summary.json",
  JSON.stringify(organizations_summary, null, 1));
