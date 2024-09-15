import * as filesystem from "fs";
import JSON5 from "json5";
const fs = filesystem.promises;

const date_functions = {
  "monthly" : date => date.slice(0, 7),
  "quarterly" : date => {
    const d = new Date(date);
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}Q${quarter}`;
  },
  "yearly" : date => date.slice(0, 4),
  "decennial" : date => date.slice(0, 3) + "0",
  "forever" : date => "forever",
};

const kind_functions = {
  "author" : commits => commits.filter(commit => commit.kind == "author"),
  "review" : commits => commits.filter(commit => commit.kind == "review"),
  "both" : commits => commits,
};


const metric_functions = {
  "commit" : (commits, date_grouping) => {
    const out = {};
    commits.forEach(commit => {
      const date = date_grouping(commit.date);
      out[date] ||= 0;
      out[date] += 1;
    });
    return out;
  },

  //"additions" : (commits, date_grouping) => {
    //const out = {};
    //commits.forEach(commit => {
      //const date = date_grouping(commit.date);
      //out[date] ||= 0;
      //out[date] += commit.additions;
    //});
    //return out;
  //},

  //"deletions" : (commits, date_grouping) => {
    //const out = {};
    //commits.forEach(commit => {
      //const date = date_grouping(commit.date);
      //out[date] ||= 0;
      //out[date] += commit.deletions;
    //});
    //return out;
  //},

  //"files" : (commits, date_grouping) => {
    //const out = {};
    //commits.forEach(commit => {
      //const date = date_grouping(commit.date);
      //out[date] ||= 0;
      //out[date] += commit.files;
    //});
    //return out;
  //},

  "contributor" : (commits, date_grouping) => {
    const out = {};
    commits.forEach(commit => {
      const date = date_grouping(commit.date);
      out[date] ||= new Set();
      out[date].add(commit.contributor);
    });
    // Convert the Set to a number.
    for(const date in out) {
      out[date] = out[date].size;
    }
    return out;
  },
}

const ReadJsonCached = async (x_filename, cache) => {
  cache[x_filename] ||= JSON.parse(await fs.readFile(x_filename, "utf8"));
  return cache[x_filename];
}

const summarize = async (type, repository) => {
  const repository_dir = `../public/data/${repository.dirname}`;
  const type_list = `${repository_dir}/${type}.json`;

  const cache = {}
  for(const [date, fn] of Object.entries(date_functions)) {
    for(const [kind, kind_fn] of Object.entries(kind_functions)) {
      for(const [metric, metric_fn] of Object.entries(metric_functions)) {
        if (metric == "contributor" && type != "organizations") {
          continue;
        }
        console.log(`Summarizing ${type} for ${repository.dirname} ${date} ${metric} ${kind}`);
        const out_file = `${repository_dir}/${type}_summary_${metric}_${date}_${kind}.json`;

        const out = {};
        const list = JSON.parse(await fs.readFile(type_list, "utf8"));
        for (const x of list) {
          const commits = await ReadJsonCached(`${repository_dir}/${type}/${x}.json`, cache);
          out[x] = metric_fn(kind_fn(commits), fn);
        }

        await fs.writeFile(out_file, JSON.stringify(out, null, 1));
      }
    }
  }
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
  const repository_dir = `../public/data/${repository.dirname}`;

  const summary_file = `${repository_dir}/organizations_summary_commit_forever_both.json`;
  const summary = JSON.parse(await fs.readFile(summary_file, "utf8"));
  for (const [organization, data] of Object.entries(summary)) {
    organizations_summary[repository.dirname][organization] = Object.values(
      data
    ).reduce((a, b) => a + b, 0);
  }
}
await fs.writeFile(
  `../public/data/organizations_summary.json`,
  JSON.stringify(organizations_summary, null, 1)
);
