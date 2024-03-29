import * as filesystem from "fs";
import JSON5 from "json5";
const fs = filesystem.promises;

const project_date = commit => commit.date.substring(0,7);

const group_by_date = (commits, value) => {
  const out = {};
  commits.forEach(commit => {
    const date = project_date(commit);
    out[date] ||= 0;
    out[date] += value(commit)
  });
  return out;
};

const summarize = async (kind, repository) => {
  const repository_dir = `../static/data/${repository.dirname}`;
  const kind_list = `${repository_dir}/${kind}.json`;
  const kind_summary = `${repository_dir}/${kind}_summary.json`;

  const out = {};
  const list = JSON.parse(await fs.readFile(kind_list, "utf8"));
  for (const x of list) {
    const x_filename = `${repository_dir}/${kind}/${x}.json`;
    const commits = JSON.parse(await fs.readFile(x_filename, "utf8"));

    const author = commits.filter(commit => commit.kind == "author");
    const review = commits.filter(commit => commit.kind == "review");

    out[x] = {
      author: {
        commit: group_by_date(author, commit => 1),
        additions: group_by_date(author, commit => commit.additions),
        deletions: group_by_date(author, commit => commit.deletions),
        changedFiles: group_by_date(author, commit => commit.changedFiles),
      },
      review: {
        commit: group_by_date(review, commit => 1),
        additions: group_by_date(review, commit => commit.additions),
        deletions: group_by_date(review, commit => commit.deletions),
        changedFiles: group_by_date(review, commit => commit.changedFiles),
      },
    };
  }

  await fs.writeFile(kind_summary, JSON.stringify(out, null, 1));
};

const repositories_file = await fs.readFile("../repositories.json5", "utf8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {
  for (const kind of ["usernames", "emails", "organizations"]) {
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
for (const repository of repositories) {
  organizations_summary[repository.dirname] = {};
  const repository_dir = `../static/data/${repository.dirname}`;
  const summary_file = `${repository_dir}/organizations_summary.json`;
  const summary = JSON.parse(await fs.readFile(summary_file, "utf8"));
  for (const [organization, data] of Object.entries(summary)) {
    organizations_summary[repository.dirname][organization] = Object.values(
      data.author.commit
    ).reduce((a, b) => a + b, 0);
  }
}
await fs.writeFile(
  "../static/data/organizations_summary.json",
  JSON.stringify(organizations_summary, null, 1)
);
