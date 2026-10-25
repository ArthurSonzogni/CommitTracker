import * as filesystem from "fs";
import { createHash } from "crypto";
import { execSync } from "child_process";
import JSON5 from "json5";
import { DescribeCommunities, UsernameOrganizations } from "./graph_communities.mjs";
const fs = filesystem.promises;

// Generates the community maps of ../public/community-map, for every
// repository and time range.
//
// A graph is only regenerated when its input or the generator changed, so
// that past years are generated once. "forever" changes every week, but
// slightly: it is regenerated at most every FOREVER_MAX_AGE.
//
// Usage:
//   node graph.mjs [repository] [time]
// Set GRAPH_FORCE=1 to regenerate every graph.
const [only_repos, only_date] = process.argv.slice(2);
const force = !!process.env.GRAPH_FORCE;

const repositories_file = "../repositories.json5";
const output_dir = "../public/community-map";
const DAY = 24 * 60 * 60 * 1000;
const FOREVER_MAX_AGE = 28 * DAY;

const RelativeDate = (days) => {
  let date = new Date();
  date.setTime(date.getTime() - days * DAY);
  return date;
};

const task_time = {
  "1m": { min: RelativeDate(30), max: RelativeDate(0) },
  "3m": { min: RelativeDate(90), max: RelativeDate(0) },
  "6m": { min: RelativeDate(180), max: RelativeDate(0) },
  "1y": { min: RelativeDate(365), max: RelativeDate(0) },
  forever: { min: RelativeDate(365 * 100), max: RelativeDate(0) },
};

// Every calendar year since reviews are recorded in the commit descriptions.
const FIRST_YEAR = 2017;
for (let year = FIRST_YEAR; year <= new Date().getFullYear(); ++year) {
  task_time[year] = {
    min: new Date(Date.UTC(year, 0, 1)),
    max: new Date(Math.min(Date.UTC(year + 1, 0, 1), Date.now())),
  };
}

const dates = Object.keys(task_time)
  .filter(date => !only_date || date === only_date);

// The version of the generator: graphs made by another version are
// regenerated.
function GeneratorVersion() {
  const hash = createHash("sha256");
  const sources = filesystem.readdirSync("../graph")
    .filter(file => /\.(cpp|hpp|txt)$/.test(file))
    .sort()
    .map(file => `../graph/${file}`);
  for (const file of [...sources, "graph.mjs", "graph_communities.mjs"]) {
    hash.update(filesystem.readFileSync(file));
  }
  return hash.digest("hex").slice(0, 16);
}

// The author -> reviewer counts, and the activity of the authors, of a
// repository (or a set of them) for every time range.
function NewAccumulator() {
  const out = {};
  for (const date of dates) {
    out[date] = {
      output: {},
      activity: { commits: {}, first: task_time[date].max },
    };
  }
  return out;
}

async function Main() {
  const repositories = JSON5.parse(
    await fs.readFile(repositories_file, "utf8")
  );

  const organizations = UsernameOrganizations(JSON.parse(
    await fs.readFile("../public/data/organizations_emails.json", "utf8")));

  const generator = GeneratorVersion();
  console.log(`Generator version: ${generator}${force ? " (forced)" : ""}`);

  const all = NewAccumulator();
  const all_wanted = !only_repos || only_repos === "all";
  for (const repository of repositories) {
    const own_wanted = !only_repos || only_repos === repository.dirname;
    const in_all = all_wanted && repository.cone == undefined;
    if (!own_wanted && !in_all) {
      continue;
    }

    const own = NewAccumulator();
    await ProcessRepository(repository, [
      ...(own_wanted ? [own] : []),
      ...(in_all ? [all] : []),
    ]);
    if (own_wanted) {
      await GenerateGraphs(repository.dirname, own, generator, organizations);
    }
  }
  if (all_wanted) {
    await GenerateGraphs("all", all, generator, organizations);
  }

  if (!only_repos && !only_date) {
    await RemoveObsoleteGraphs(repositories);
  }
}

async function GenerateGraphs(repos, accumulator, generator, organizations) {
  for (const date of dates) {
    const { output, activity } = accumulator[date];
    const name = `${repos}_${date}`;
    const file_name = `../graph/build/${name}.csv`;
    const svg_file = `${output_dir}/${name}.svg`;
    const json_file = `${output_dir}/${name}.json`;

    const community_count = CommunityCount(activity, task_time[date]);

    // Delete username with low number of reviewers.
    for (const user in output) {
      if (Object.keys(output[user]).length <= 2) {
        delete output[user];
      }
    }

    // Print as CSV.
    let file_content = "";
    for (const user in output) {
      for (const reviewer in output[user]) {
        file_content += `${user},${reviewer},${output[user][reviewer]}\n`;
      }
    }

    // Skip the graphs that are up to date.
    const input = createHash("sha256")
      .update(file_content)
      .update(String(community_count))
      .digest("hex").slice(0, 16);
    const previous = await ReadPrevious(json_file, `${name}.json`);
    if (!force && previous?.generator === generator) {
      if (previous.input === input) {
        console.log(`${name}: up to date`);
        continue;
      }
      const age = Date.now() - new Date(previous.generated_at).getTime();
      if (date === "forever" && age < FOREVER_MAX_AGE) {
        console.log(`${name}: kept, ${Math.floor(age / DAY)} days old`);
        continue;
      }
    }

    console.log(`${name}: generating, ${community_count} communities`);
    await fs.writeFile(file_name, file_content);

    // Generate the graph, as SVG and JSON, by calling the c++ program.
    execSync(
      `../graph/build/generate ${file_name} ${svg_file} ${community_count}`,
      { stdio: "ignore" });

    // Describe the communities, keeping the colors of the previous version.
    // Empty graphs have no file.
    if (filesystem.existsSync(json_file)) {
      const graph = JSON.parse(await fs.readFile(json_file, "utf8"));
      DescribeCommunities(graph, organizations, previous);
      graph.generator = generator;
      graph.input = input;
      graph.generated_at = new Date().toISOString();
      await fs.writeFile(json_file, JSON.stringify(graph));
    }
  }
}

// Removes the graphs of time ranges and repositories no longer generated.
async function RemoveObsoleteGraphs(repositories) {
  const names = new Set();
  for (const repos of ["all", ...repositories.map(r => r.dirname)]) {
    for (const date in task_time) {
      names.add(`${repos}_${date}`);
    }
  }
  for (const file of await fs.readdir(output_dir)) {
    const match = file.match(/^(.*)\.(svg|json)$/);
    if (match && !names.has(match[1])) {
      console.log(`Removing obsolete ${file}`);
      await fs.unlink(`${output_dir}/${file}`);
    }
  }
}

async function ReadPrevious(file, name) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {}
  try {
    const response = await fetch(
      `https://chrome-commit-tracker.arthursonzogni.com/community-map/${name}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {}
  return null;
}

// The number of communities to show grows with the log of the number of active
// developers: the ones authoring more than 30 commits per year.
function CommunityCount(activity, time) {
  const start = Math.max(time.min.getTime(), activity.first.getTime());
  const years = Math.max(1 / 52, (time.max.getTime() - start) / (365 * DAY));
  const active = Object.values(activity.commits)
    .filter(commits => commits > 30 * years).length;
  return Math.max(2, Math.round(4 * Math.log(active / 8)));
}

// Adds the commits of `repository` to every accumulator, in the time ranges
// they belong to.
async function ProcessRepository(repository, accumulators) {
  const usernames_file = `../public/data/${repository.dirname}/usernames.json`;
  const usernames_dir = `../public/data/${repository.dirname}/usernames`;
  const username = JSON.parse(await fs.readFile(usernames_file, "utf8"));

  for (const user of username) {
    for (const accumulator of accumulators) {
      for (const date of dates) {
        accumulator[date].output[user] ||= {};
      }
    }

    const json = await fs.readFile(`${usernames_dir}/${user}.json`, "utf8");
    const data = JSON.parse(json);
    for (const commit of data) {
      if (commit.kind != "author") continue;
      const commit_date = new Date(commit.date);
      for (const date of dates) {
        const time = task_time[date];
        if (commit_date < time.min || commit_date > time.max) continue;
        for (const accumulator of accumulators) {
          const { output, activity } = accumulator[date];
          activity.commits[user] = (activity.commits[user] || 0) + 1;
          if (commit_date < activity.first) {
            activity.first = commit_date;
          }
          for (const reviewer of commit.peers) {
            output[user][reviewer] ||= 0;
            output[user][reviewer]++;
          }
        }
      }
    }
  }
}

// Call the Main function to run the action
Main();
