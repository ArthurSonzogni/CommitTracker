// A badge system for web browser developers and related libraries.

import fs from "fs/promises";
import JSON5 from "json5";
import statusLine from '@alt-jero/status-line';

// Retrieve the list of usernames from every repository.
const usernames = new Set();
const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {
  const repository_dir = `../public/data/${repository.dirname}`;
  const usernames_filename = `${repository_dir}/usernames.json`;
  const usernames_data = JSON.parse(await fs.readFile(usernames_filename, "utf8"));
  for (const username of usernames_data) {
    usernames.add(username);
  }
}
console.log(`Total usernames: ${usernames.size}`);

const badges = [];

// Create all the badges for each username.
const user_badges = new Map();
for (const username of usernames) {
  user_badges.set(username, []);
}

const GiveUserBadge = (username, data) => {
  user_badges.get(username).push([badges.length-1, data]);

  badges[badges.length-1].recipients ||= 0;
  badges[badges.length-1].recipients++;
}

const repositories_with_commit_count = [
  "chromium",
  "v8",
  "clusterfuzz",
  "dawn",
  "skia",
  "partition_alloc",
  "webrtc",
  "swiftshader",
  "gn",
  "llvm",
  //"angle",
  //"pdfium",
];

// To avoid opening too many files, cache the results.
const user_commits = new Map();
let username_index = 0;
for (const username of usernames) {
  username_index++;
  if (username_index % 100 == 0) {
    statusLine(`Cache commits [${Math.round(username_index / usernames.size * 100)}%]`);
  }
  const commits = [];
  for (const repository of repositories_with_commit_count) {
    const commit_file = `../public/data/${repository}/usernames/${username}.json`;
    try {
      const commit_text = await fs.readFile(commit_file, "utf8");
      const commit_json = JSON.parse(commit_text);
      for (const commit of commit_json) {
        commits.push(commit);
      }
    } catch (e) {
      // Ignore missing files.
    }
  }
  user_commits.set(username, commits);
}


// Polyglot
const polyglot_levels = [2, 4, 6];
for(const level of [1, 2, 3]) {
  statusLine.logString(`Processing Polyglot level ${level}...`);
  badges.push({
    category: "polyglot",
    name: `Polyglot n°${level}`,
    description: `I contributed to more than ${polyglot_levels[level-1]}+ repositories!`,
    details: `I did $0.`,
    image: `/img/badges/polyglot_l${level}.jpeg`,
  });

  // A map collecting how many repositories each user has contributed to.
  const user_repo_count = new Map();

  // Iterate over all the repositories.
  for (const repository of repositories) {
    if (!repositories_with_commit_count.includes(repository.dirname)) {
      continue
    }

    const repository_dir = `../public/data/${repository.dirname}`;
    const usernames_filename = `${repository_dir}/usernames.json`;
    const usernames_data = JSON.parse(await fs.readFile(usernames_filename, "utf8"));
    for (const username of usernames_data) {
      if (!user_repo_count.has(username)) {
        user_repo_count.set(username, 0);
      }
      user_repo_count.set(username, user_repo_count.get(username) + 1);
    }
  }

  // Iterate over the user_repo_count map and give the badge to users who have
  // contributed to the required number of repositories.
  for (const [username, count] of user_repo_count) {
    if (count >= polyglot_levels[level-1]) {
      GiveUserBadge(username, [count]);
    }
  }
}

// Badge for submitting an empty commit.
{
  statusLine.logString(`Processing empty commit badge...`);
  badges.push({
    category: "misc",
    name: "Empty Commit",
    description: "I submitted an empty commit! Why?",
    image: "/img/badges/empty_commit.jpeg",
  });
  for(const username of usernames) {
    const commits = user_commits.get(username);
    for(const commit of commits) {
      if (commit.files == 0) {
        GiveUserBadge(username, []);
        break;
      }
    }
  }
}

// Badge for submitting a commit more than 10 years ago.
{
  statusLine.logString(`Processing old commit badge...`);
  badges.push({
    category: "misc",
    name: "Old Commit",
    description: "I submitted a commit more than 10 years ago!",
    details: "It was in $0.",
    image: "/img/badges/ancient.png",
  });
  for(const username of usernames) {
    const commits = user_commits.get(username);
    for(const commit of commits) {
      const date = new Date(commit.date);
      if (date.getFullYear() < 2012) {
        GiveUserBadge(username, [date.getFullYear()]);
        break;
      }
    }
  }
}

// Badge for having its oldest commit less than a year ago.
{
  statusLine.logString(`Processing new user badge...`);
  badges.push({
    category: "misc",
    name: "New User",
    description: "I made my very first commit less than a year ago!",
    details: "It was in $0 days ago.",
    image: "/img/badges/young.png",
  });
  for(const username of usernames) {
    const commits = user_commits.get(username);
    let oldest = new Date();
    for(const commit of commits) {
      const date = new Date(commit.date);
      if (date < oldest) {
        oldest = date;
      }
    }
    const now = new Date();
    const diff = now - oldest;
    const diff_days = diff / (1000 * 60 * 60 * 24);
    if (diff_days < 365) {
      GiveUserBadge(username, [diff_days]);
    }
  }
}

// Code slayer, for having removing more than 1000 lines of code in a single
// commit.
{
  statusLine.logString(`Processing code slayer badge...`);
  badges.push({
    category: "misc",
    name: "Code Slayer",
    description: "I deleted more than 100k lines of code at once!",
    details: "I removed $0 lines of code.",
    image: "/img/badges/code_slayer.jpeg",
  });
  for(const username of usernames) {
    const commits = user_commits.get(username);
    for(const commit of commits) {
      if (commit.deletions - commit.additions > 100000) {
        GiveUserBadge(username, [commit.lines_removed]);
        break;
      }
    }
  }
}

// Code cleaner, for having modified more than 1000 files at once.
{
  statusLine.logString(`Processing code cleaner badge...`);
  badges.push({
    category: "misc",
    name: "Code Cleaner",
    description: "Cleanup time! I modified more than 1k files at once!",
    details: "I modified $0 files.",
    image: "/img/badges/cleanup.jpeg",
  });
  for(const username of usernames) {
    const commits = user_commits.get(username);
    for(const commit of commits) {
      if (commit.files > 1000 &&
          commit.additions < commit.deletions*4 &&
          commit.deletions < commit.additions*4) {
        GiveUserBadge(username, [commit.files]);
        break;
      }
    }
  }
}

// Badges for timezones (UTC, UTC+8, UTC+16)
// This is auto-detected based on the commit time.
{
  statusLine.logString(`Processing timezone badges...`);
  const angles = new Map();
  for(const username of usernames) {
    const accumulation = new Array(24*2).fill(0);
    for(const commit of user_commits.get(username)) {
      const date = new Date(commit.date);
      const hour = date.getUTCHours();
      const minute = date.getUTCMinutes();
      accumulation[hour * 2 + (minute >= 30 ? 1 : 0)]++;
    }

    // Compute deviation.
    let acc_dx = 0;
    let acc_dy = 0;
    for(let i = 0; i < 24*2; i++) {
      acc_dx += Math.cos(i * Math.PI / 12) * accumulation[i];
      acc_dy += Math.sin(i * Math.PI / 12) * accumulation[i];
    }

    let angle = Math.atan2(acc_dy, acc_dx);
    angle /= 2 * Math.PI;

    // Shift the angle so that commits in 8h-16h are in the middle.
    angle += 0.9

    while(angle < 0) {
      angle += 1;
    }

    // Find a buckets.
    angles.set(username, angle);
  }

  badges.push({
    category: "timezone",
    name: "AMER timezone",
    description: "I'm submitting commits from the AMER timezone!",
    details: "",
    image: "/img/badges/timezone_3.jpeg",
  });
  for(const username of usernames) {
    if (Math.round(angles.get(username) * 3) % 3 == 2) {
      GiveUserBadge(username, []);
    }
  }

  badges.push({
    category: "timezone",
    name: "EMEA timezone",
    description: "I'm submitting commits from the EMEA timezone!",
    details: "",
    image: "/img/badges/timezone_1.jpeg",
  });
  for(const username of usernames) {
    if (Math.round(angles.get(username) * 3) % 3 == 0) {
      GiveUserBadge(username, []);
    }
  }

  badges.push({
    category: "timezone",
    name: "APAC timezone",
    image: "/img/badges/timezone_2.jpeg",
    description: "I'm submitting commits in from APAC timezone!",
    details: "",
  });
  for(const username of usernames) {
    if (Math.round(angles.get(username) * 3) % 3 == 1) {
      GiveUserBadge(username, []);
    }
  }

  // Badge for the most productive day of the week.
  statusLine.logString(`Processing most productive day of the week badge...`);
  const days_count = new Map();
  // It contains [int*7] elements, each element is the number of commits for a
  // specific day of the week.
  for(const username of usernames) {
    const accumulation = new Array(7).fill(0);

    // To account for timezone, shift commit date by some amount to make the
    // days of the week to fit the timezone.
    const timezone_shift = angles.get(username) * 24 - 48;

    for(const commit of user_commits.get(username)) {
      if (commit.kind != "author") {
        continue;
      }
      let date = new Date(commit.date);
      date = new Date(date.getTime() + timezone_shift * 60 * 60 * 1000);
      accumulation[date.getUTCDay()]++;
    }

    days_count.set(username, accumulation);
  }

  const day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  for(const day of [0, 1, 2, 3, 4, 5, 6]) {
    badges.push({
      category: "weekday",
      name: `Most Productive ${day_names[day]}`,
      description: `I'm most productive on ${day_names[day]}!`,
      details: `
      <ul>
        <li>Monday: $0</li>
        <li>Tuesday: $1</li>
        <li>Wednesday: $2</li>
        <li>Thursday: $3</li>
        <li>Friday: $4</li>
        <li>Saturday: $5</li>
        <li>Sunday: $6</li>
      </ul>`,
      image: `/img/badges/day_${day}.jpeg`,
    });
    for(const username of usernames) {
      const max_count = Math.max(...days_count.get(username));
      if (max_count == days_count.get(username)[day]) {
        GiveUserBadge(username, days_count.get(username));
      }
    }
  }
}

for (const repository of repositories_with_commit_count) {
  const badge_levels =
    repository === "chromium"
      ? [1, 25, 100, 500, 1000, 2000]
      : [1, 25, 100];
  for(let i = 0; i < badge_levels.length; i++) {
    statusLine.logString(`Processing ${repository} commit level ${i}...`);
    badges.push({
      category: repository,
      //name: `${repository} commit Level ${i+1}`,
      name: `${repository} commit n°${i+1}`,
      description: `I have made ${badge_levels[i]} commits to ${repository}.`,
      details: `I did $0 commits.`,
      image: `/img/badges/${repository}_l${i+1}.jpeg`,
    });
    const data = await fs.readFile(`../public/data/${repository}/usernames_summary_commit_forever_author.json`, "utf-8");
    const data_json = JSON.parse(data);
    for(const username in data_json) {
      const count = parseInt(data_json[username].forever)
      if (count >= badge_levels[i]) {
        GiveUserBadge(username, [count]);
      }
    }
  }
}

// Serialize the badges.json file.
await fs.writeFile("../public/badges.json", JSON.stringify(badges, null, 2));

// Print the badges to the public directory.
const badges_dir = "../public/badges";
await fs.mkdir(badges_dir, { recursive: true });

// Because there are 25k username, we need to group them into larger chunks to
// avoid hitting the file descriptor limit.
// We are grouping together usernames by the first 2 characters of the username.
const user_badges_chunks = new Map();
for (const username of usernames) {
  const chunk = username.substring(0, 1);
  if (!user_badges_chunks.has(chunk)) {
    user_badges_chunks.set(chunk, []);
  }
  user_badges_chunks.get(chunk).push(username);
}

for (const [chunk, chunk_usernames] of user_badges_chunks) {
  const chunk_badges = new Map();
  for (const username of chunk_usernames) {
    chunk_badges.set(username, user_badges.get(username));
  }
  const chunk_badges_filename = `${badges_dir}/${chunk}.json`;
  await fs.writeFile(chunk_badges_filename, JSON.stringify(Object.fromEntries(chunk_badges)));
}
