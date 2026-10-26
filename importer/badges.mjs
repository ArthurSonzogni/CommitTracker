// A badge system for web browser developers and related libraries.

import fs from "fs/promises";
import JSON5 from "json5";
import statusLine from '@alt-jero/status-line';

// Retrieve the list of usernames from every repository.
const usernames = new Set();
const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
const repository_usernames = new Map();
for (const repository of repositories) {
  const repository_dir = `../public/data/${repository.dirname}`;
  const usernames_filename = `${repository_dir}/usernames.json`;
  const usernames_data = JSON.parse(await fs.readFile(usernames_filename, "utf8"));
  repository_usernames.set(repository.dirname, usernames_data);
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
  "angle",
  "pdfium",
  "devtool-frontend",
  "perfetto",
  "wpt",
];

// To avoid opening too many files, cache the results. Authored commits and
// reviews are kept apart, sorted by date. Subdirectory repositories (with a
// "cone") are skipped, their commits are already part of their parent.
const user_commits = new Map();
const user_reviews = new Map();
let username_index = 0;
for (const username of usernames) {
  username_index++;
  if (username_index % 100 == 0) {
    statusLine(`Cache commits [${Math.round(username_index / usernames.size * 100)}%]`);
  }
  const commits = [];
  const reviews = [];
  for (const repository of repositories) {
    if (!repositories_with_commit_count.includes(repository.dirname) ||
        repository.cone) {
      continue;
    }
    const commit_file = `../public/data/${repository.dirname}/usernames/${username}.json`;
    try {
      const commit_text = await fs.readFile(commit_file, "utf8");
      const commit_json = JSON.parse(commit_text);
      for (const commit of commit_json) {
        commit.time = new Date(commit.date).getTime();
        (commit.kind == "author" ? commits : reviews).push(commit);
      }
    } catch (e) {
      // Ignore missing files.
    }
  }
  commits.sort((a, b) => a.time - b.time);
  reviews.sort((a, b) => a.time - b.time);
  user_commits.set(username, commits);
  user_reviews.set(username, reviews);
}

// The developers who authored at least one commit. Badges about commits are
// only computed for them.
const authors = [...usernames].filter(username => user_commits.get(username).length > 0);

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365.25 * DAY;

// Polyglot
{
  // A map collecting how many repositories each user has contributed to.
  const user_repo_count = new Map();
  for (const repository of repositories_with_commit_count) {
    for (const username of repository_usernames.get(repository)) {
      user_repo_count.set(username, (user_repo_count.get(username) ?? 0) + 1);
    }
  }

  const polyglot_levels = [2, 4, 6];
  for(const level of [1, 2, 3]) {
    statusLine.logString(`Processing Polyglot level ${level}...`);
    badges.push({
      category: "polyglot",
      name: `Polyglot n°${level}`,
      description: `I contributed to ${polyglot_levels[level-1]}+ repositories!`,
      details: `I did $0.`,
      image: `/img/badges/polyglot_l${level}.webp`,
    });

    // Give the badge to users who have contributed to the required number of
    // repositories.
    for (const [username, count] of user_repo_count) {
      if (count >= polyglot_levels[level-1]) {
        GiveUserBadge(username, [count]);
      }
    }
  }
}

// Browser Hopper, for contributing to several browser engines.
{
  statusLine.logString(`Processing browser hopper badge...`);
  badges.push({
    category: "polyglot",
    name: "Browser Hopper",
    description: "I contributed to several browser engines!",
    details: "I contributed to $0.",
    image: "/img/badges/browser_hopper.webp",
  });
  const engines = {
    "Chromium": "chromium",
    "WebKit": "webkit",
    "Gecko": "firefox",
    "Servo": "servo",
    "Ladybird": "ladybird",
  };
  const user_engines = new Map();
  for (const [engine, repository] of Object.entries(engines)) {
    for (const username of repository_usernames.get(repository)) {
      if (!user_engines.has(username)) {
        user_engines.set(username, []);
      }
      user_engines.get(username).push(engine);
    }
  }
  for (const [username, engine_list] of user_engines) {
    if (engine_list.length >= 2) {
      GiveUserBadge(username, [engine_list.join(", ")]);
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
    image: "/img/badges/empty_commit.webp",
  });
  for(const username of authors) {
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
    image: "/img/badges/old_commit.webp",
  });
  const ten_years_ago = Date.now() - 10 * YEAR;
  for(const username of authors) {
    const oldest = user_commits.get(username)[0];
    if (oldest.time < ten_years_ago) {
      GiveUserBadge(username, [new Date(oldest.time).getUTCFullYear()]);
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
    details: "It was $0 days ago.",
    image: "/img/badges/new_user.webp",
  });
  for(const username of authors) {
    const oldest = user_commits.get(username)[0];
    const diff_days = (Date.now() - oldest.time) / DAY;
    if (diff_days < 365) {
      GiveUserBadge(username, [Math.round(diff_days)]);
    }
  }
}

// Code slayer, for having removing more than 100k lines of code in a single
// commit.
{
  statusLine.logString(`Processing code slayer badge...`);
  badges.push({
    category: "misc",
    name: "Code Slayer",
    description: "I deleted more than 100k lines of code at once!",
    details: "I removed $0 lines of code.",
    image: "/img/badges/code_slayer.webp",
  });
  for(const username of authors) {
    const commits = user_commits.get(username);
    for(const commit of commits) {
      if (commit.deletions - commit.additions > 100000) {
        GiveUserBadge(username, [commit.deletions]);
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
    image: "/img/badges/code_cleaner.webp",
  });
  for(const username of authors) {
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

// Fuzzer, for having written a fuzz test.
{
  statusLine.logString(`Processing fuzzer badge...`);
  badges.push({
    category: "misc",
    name: "Fuzzer",
    description: "I wrote a fuzz test!",
    details: "I wrote $0 fuzz tests.",
    image: "/img/badges/fuzzer.webp",
  });
  const fuzz_tests = JSON.parse(await fs.readFile("../public/fuzz-test/data.json", "utf8"));
  const fuzz_test_count = new Map();
  for (const fuzz_test of fuzz_tests) {
    const username = fuzz_test.author.split("@")[0];
    fuzz_test_count.set(username, (fuzz_test_count.get(username) ?? 0) + 1);
  }
  for (const [username, count] of fuzz_test_count) {
    if (user_badges.has(username)) {
      GiveUserBadge(username, [count]);
    }
  }
}

// Badges about the size of the commits.
{
  statusLine.logString(`Processing commit size badges...`);
  badges.push({
    category: "size",
    name: "Builder",
    description: "I added more than 50k lines of code at once!",
    details: "I added $0 lines of code.",
    image: "/img/badges/builder.webp",
  });
  for(const username of authors) {
    for(const commit of user_commits.get(username)) {
      if (commit.additions - commit.deletions > 50000) {
        GiveUserBadge(username, [commit.additions]);
        break;
      }
    }
  }

  badges.push({
    category: "size",
    name: "One-Liner",
    description: "I submitted 50+ commits changing a single line!",
    details: "I did $0.",
    image: "/img/badges/one_liner.webp",
  });
  for(const username of authors) {
    const count = user_commits.get(username).filter(commit =>
      commit.additions <= 1 && commit.deletions <= 1 &&
      commit.additions + commit.deletions > 0).length;
    if (count >= 50) {
      GiveUserBadge(username, [count]);
    }
  }

  badges.push({
    category: "size",
    name: "Surgeon",
    description: "My commits are small and precise: less than 10 lines in the median.",
    details: "My median commit changes $0 lines, over $1 commits.",
    image: "/img/badges/surgeon.webp",
  });
  for(const username of authors) {
    const commits = user_commits.get(username);
    if (commits.length < 50) {
      continue;
    }
    const sizes = commits.map(commit => commit.additions + commit.deletions);
    sizes.sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)];
    if (median < 10) {
      GiveUserBadge(username, [median, commits.length]);
    }
  }

  badges.push({
    category: "size",
    name: "Net Negative",
    description: "Over my 50+ commits, I deleted more lines than I added!",
    details: "I removed $0 more lines than I added.",
    image: "/img/badges/net_negative.webp",
  });
  for(const username of authors) {
    const commits = user_commits.get(username);
    if (commits.length < 50) {
      continue;
    }
    let net = 0;
    for (const commit of commits) {
      net += commit.deletions - commit.additions;
    }
    if (net > 0) {
      GiveUserBadge(username, [net]);
    }
  }
}

// Badges for timezones (AMER, EMEA, APAC).
// Commit dates are stored in UTC. The UTC offset of each developer is
// estimated by assuming their commits are centered around 15:00 local time.
const utc_offsets = new Map();
{
  statusLine.logString(`Processing timezone badges...`);
  for(const username of authors) {
    let acc_dx = 0;
    let acc_dy = 0;
    for(const commit of user_commits.get(username)) {
      const date = new Date(commit.time);
      const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
      acc_dx += Math.cos(hour * Math.PI / 12);
      acc_dy += Math.sin(hour * Math.PI / 12);
    }
    const mean_hour = Math.atan2(acc_dy, acc_dx) * 12 / Math.PI;

    // Wrap into [-11, 13).
    const offset = (((15 - mean_hour + 11) % 24) + 24) % 24 - 11;
    utc_offsets.set(username, offset);
  }

  const regions = [
    ["AMER", offset => offset < -2.5],
    ["EMEA", offset => offset >= -2.5 && offset < 4.5],
    ["APAC", offset => offset >= 4.5],
  ];
  for (const [region, matches] of regions) {
    badges.push({
      category: "timezone",
      name: `${region} timezone`,
      description: `I'm submitting commits from the ${region} timezone!`,
      details: "My estimated timezone is UTC$0.",
      image: `/img/badges/timezone_${region.toLowerCase()}.webp`,
    });
    for(const username of authors) {
      const offset = utc_offsets.get(username);
      if (matches(offset)) {
        const rounded = Math.round(offset);
        GiveUserBadge(username, [rounded < 0 ? `${rounded}` : `+${rounded}`]);
      }
    }
  }
}

// The commit date, in the estimated local time of the developer. Use the
// getUTC* methods to read it.
const LocalDate = (username, commit) => {
  return new Date(commit.time + utc_offsets.get(username) * 60 * 60 * 1000);
}

// Badge for the most productive day of the week.
{
  statusLine.logString(`Processing most productive day of the week badge...`);
  // It contains [int*7] elements, each element is the number of commits for a
  // specific day of the week, starting on Monday.
  const days_count = new Map();
  for(const username of authors) {
    const accumulation = new Array(7).fill(0);
    for(const commit of user_commits.get(username)) {
      const day = (LocalDate(username, commit).getUTCDay() + 6) % 7;
      accumulation[day]++;
    }
    days_count.set(username, accumulation);
  }

  const day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  // Only weekdays: working during the weekend shouldn't be promoted.
  for(const day of [0, 1, 2, 3, 4]) {
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
      image: `/img/badges/day_${day_names[day].toLowerCase()}.webp`,
    });
    for(const username of authors) {
      const max_count = Math.max(...days_count.get(username).slice(0, 5));
      if (max_count == days_count.get(username)[day]) {
        GiveUserBadge(username, days_count.get(username));
      }
    }
  }
}

// Early bird, for committing early in the morning, in local time.
{
  statusLine.logString(`Processing early bird badge...`);
  badges.push({
    category: "time",
    name: "Early Bird",
    description: "15%+ of my commits are made between 05:00 and 08:00!",
    details: "It is the case for $0% of my commits.",
    image: "/img/badges/early_bird.webp",
  });
  for(const username of authors) {
    const commits = user_commits.get(username);
    if (commits.length < 20) {
      continue;
    }
    const count = commits.filter(commit => {
      const hour = LocalDate(username, commit).getUTCHours();
      return hour >= 5 && hour < 8;
    }).length;
    if (count >= 0.15 * commits.length) {
      GiveUserBadge(username, [Math.round(count / commits.length * 100)]);
    }
  }
}

// Badges about the length of the career.
{
  statusLine.logString(`Processing veteran badges...`);
  const veteran_levels = [5, 10, 15, 20];
  for (const years of veteran_levels) {
    badges.push({
      category: "veteran",
      name: `Veteran ${years} years`,
      description: `My first and latest commits are ${years}+ years apart!`,
      details: "They are $0 years apart.",
      image: `/img/badges/veteran_${years}.webp`,
    });
    for(const username of authors) {
      const commits = user_commits.get(username);
      const career = (commits[commits.length - 1].time - commits[0].time) / YEAR;
      if (career >= years) {
        GiveUserBadge(username, [Math.floor(career)]);
      }
    }
  }

  // Streak, for committing every week during a long period. Weeks start on
  // Monday (the epoch is a Thursday).
  const streak_levels = [13, 26, 52];
  const streaks = new Map();
  for(const username of authors) {
    let longest = 0;
    let current = 0;
    let previous_week = null;
    for(const commit of user_commits.get(username)) {
      const week = Math.floor((LocalDate(username, commit).getTime() / DAY + 3) / 7);
      if (week == previous_week) {
        continue;
      }
      current = week == previous_week + 1 ? current + 1 : 1;
      longest = Math.max(longest, current);
      previous_week = week;
    }
    streaks.set(username, longest);
  }
  for (const [level, weeks] of streak_levels.entries()) {
    badges.push({
      category: "veteran",
      name: `Streak n°${level+1}`,
      description: `I committed every week, ${weeks} weeks in a row!`,
      details: "My longest streak is $0 weeks.",
      image: `/img/badges/streak_l${level+1}.webp`,
    });
    for(const [username, longest] of streaks) {
      if (longest >= weeks) {
        GiveUserBadge(username, [longest]);
      }
    }
  }

  badges.push({
    category: "veteran",
    name: "Comeback",
    description: "I came back after 2+ years without committing!",
    details: "I came back after $0 years, in $1.",
    image: "/img/badges/comeback.webp",
  });
  for(const username of authors) {
    const commits = user_commits.get(username);
    let longest_gap = 0;
    let comeback = null;
    // Require 5 commits after the gap, to be truly back.
    for(let i = 1; i + 5 <= commits.length; i++) {
      const gap = commits[i].time - commits[i-1].time;
      if (gap > longest_gap) {
        longest_gap = gap;
        comeback = commits[i];
      }
    }
    if (longest_gap >= 2 * YEAR) {
      GiveUserBadge(username, [
        Math.round(longest_gap / YEAR * 10) / 10,
        new Date(comeback.time).getUTCFullYear(),
      ]);
    }
  }
}

// Badges about reviews.
{
  statusLine.logString(`Processing review badges...`);
  const review_levels = [1, 100, 1000, 5000];
  for (const [level, count] of review_levels.entries()) {
    badges.push({
      category: "review",
      name: `Reviewer n°${level+1}`,
      description: `I reviewed ${count}+ commits.`,
      details: "I reviewed $0 commits.",
      image: `/img/badges/reviewer_l${level+1}.webp`,
    });
    for(const username of usernames) {
      const reviews = user_reviews.get(username).length;
      if (reviews >= count) {
        GiveUserBadge(username, [reviews]);
      }
    }
  }

  badges.push({
    category: "review",
    name: "The Gatekeeper",
    description: "I reviewed 100+ commits, and twice more than I authored!",
    details: "I reviewed $0 commits and authored $1.",
    image: "/img/badges/the_gatekeeper.webp",
  });
  for(const username of usernames) {
    const reviews = user_reviews.get(username).length;
    const commits = user_commits.get(username).length;
    if (reviews >= 100 && reviews >= 2 * commits) {
      GiveUserBadge(username, [reviews, commits]);
    }
  }

  // Mentor, for having reviewed the very first commit of many developers.
  badges.push({
    category: "review",
    name: "Mentor",
    description: "I reviewed the very first commit of 10+ developers!",
    details: "I reviewed the first commit of $0 developers.",
    image: "/img/badges/mentor.webp",
  });
  const mentees = new Map();
  for(const username of authors) {
    for (const reviewer of user_commits.get(username)[0].peers) {
      mentees.set(reviewer, (mentees.get(reviewer) ?? 0) + 1);
    }
  }
  for (const [username, count] of mentees) {
    if (count >= 10 && user_badges.has(username)) {
      GiveUserBadge(username, [count]);
    }
  }
}

// Badges about the people developers work with.
{
  statusLine.logString(`Processing social badges...`);
  const peer_levels = [50, 200];
  const peer_counts = new Map();
  for(const username of usernames) {
    const peers = new Set();
    for (const commit of user_commits.get(username)) {
      commit.peers.forEach(peer => peers.add(peer));
    }
    for (const review of user_reviews.get(username)) {
      review.peers.forEach(peer => peers.add(peer));
    }
    peers.delete(username);
    peer_counts.set(username, peers.size);
  }
  for (const [level, count] of peer_levels.entries()) {
    badges.push({
      category: "social",
      name: `Social Butterfly n°${level+1}`,
      description: `I worked with ${count}+ different developers!`,
      details: "I worked with $0 developers.",
      image: `/img/badges/social_butterfly_l${level+1}.webp`,
    });
    for (const [username, peers] of peer_counts) {
      if (peers >= count) {
        GiveUserBadge(username, [peers]);
      }
    }
  }

  badges.push({
    category: "social",
    name: "Best Buddies",
    description: "Over my 50+ commits, the same reviewer reviewed more than half of them!",
    details: "$0 reviewed $1% of my commits.",
    image: "/img/badges/best_buddies.webp",
  });
  for(const username of authors) {
    const commits = user_commits.get(username);
    if (commits.length < 50) {
      continue;
    }
    const reviewers = new Map();
    for (const commit of commits) {
      for (const reviewer of commit.peers) {
        reviewers.set(reviewer, (reviewers.get(reviewer) ?? 0) + 1);
      }
    }
    let best = null;
    let best_count = 0;
    for (const [reviewer, count] of reviewers) {
      if (count > best_count && reviewer != username) {
        best = reviewer;
        best_count = count;
      }
    }
    if (best_count > commits.length / 2) {
      GiveUserBadge(username, [best, Math.round(best_count / commits.length * 100)]);
    }
  }
}

// Rank badges, for being among the top committers of a year in Chromium.
{
  statusLine.logString(`Processing rank badges...`);
  const yearly = JSON.parse(await fs.readFile(
    "../public/data/chromium/usernames_summary_commit_yearly_author.json", "utf8"));
  const years = new Set();
  for (const counts of Object.values(yearly)) {
    Object.keys(counts).forEach(year => years.add(year));
  }
  // The rank of every user, for every year.
  const ranks = new Map();
  for (const year of [...years].sort()) {
    const ranking = Object.keys(yearly)
      .filter(username => yearly[username][year])
      .sort((a, b) => yearly[b][year] - yearly[a][year]);
    ranking.forEach((username, index) => {
      if (!ranks.has(username)) {
        ranks.set(username, []);
      }
      ranks.get(username).push([year, index + 1]);
    });
  }

  const rank_levels = [100, 10, 1];
  for (const rank of rank_levels) {
    badges.push({
      category: "rank",
      name: rank == 1 ? "Top Committer" : `Top ${rank} Committer`,
      description: rank == 1
        ? "I was the top Chromium committer of a year!"
        : `I was among the top ${rank} Chromium committers of a year!`,
      details: "In $0.",
      image: `/img/badges/top_${rank}.webp`,
    });
    for (const [username, user_ranks] of ranks) {
      const matching_years = user_ranks
        .filter(([year, user_rank]) => user_rank <= rank)
        .map(([year, user_rank]) => year);
      if (matching_years.length > 0 && user_badges.has(username)) {
        GiveUserBadge(username, [matching_years.join(", ")]);
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
      image: `/img/badges/${repository.replace("-", "_")}_l${i+1}.webp`,
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
