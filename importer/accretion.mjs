// Accretion: how many lines of each year survive over time, and who wrote them.
//
// The first-parent history is replayed commit by commit. For every file, we
// keep which commit wrote each of its lines, as runs of consecutive lines:
// [commit, count, commit, count, ...]. A commit diff only needs its hunk
// headers (`@@ -a,b +c,d @@`) to update them, so this is equivalent to running
// `git blame --first-parent` on every file at every commit, at the cost of a
// single `git log -p`.
//
// The merges importing an unrelated history (e.g. Blink in 2015) are followed:
// that history is replayed on its own, and the files it brings keep their
// lines. This is then equivalent to `git blame`.
//
// The state is saved, so the next run only replays the new commits.
//
// Usage: node accretion.mjs <repo dirname> [--since=<date>] [--no-ignore-revs]
//                                           [--validate[=<files>]]
//   --since           Start from this date, instead of the first commit. The
//                     lines existing before are attributed to "unknown".
//   --no-ignore-revs  Do not use .git-blame-ignore-revs.
//   --validate        Compare the state against the repository: the number of
//                     lines of every file, and `git blame` for a few of them.
//                     It needs a full clone.

import fs from "fs/promises";
import path from "path";
import zlib from "zlib";
import { execFileSync, spawn } from "child_process";
import JSON5 from "json5";
import { IsEmailValid } from "./is_email_valid.mjs";
import { mailMap } from "./mailmap.mjs";

const CONFIG = {
  output_dir: "../public/accretion",
  chunk_size: 2000,     // Commits per `git log` process.
  concurrency: 12,      // `git log` processes running at once.
  lookahead: 16,        // Chunks fetched in advance of the replay.
  rename_limit: 5000,
  week: 7 * 24 * 3600,
};

// Only the files matching these pathspecs are counted. The translations
// (*.xtb) aren't code.
const excludeAllBut = (dir, names) => {
  // Exclude every entry of `dir`, except `names`. Git pathspecs can't do it
  // directly, so we exclude every prefix differing from them.
  const globs = [];
  const firsts = new Set(names.map(name => name[0]));
  globs.push(`[!${[...firsts].join("")}]*`);
  for (const name of names) {
    for (let i = 1; i < name.length; i++) {
      globs.push(`${name.slice(0, i)}[!${name[i]}]*`);
    }
    globs.push(`${name}?*`);
  }
  return globs.flatMap(glob => [
    `:(exclude,glob)${dir}/${glob}`,
    `:(exclude,glob)${dir}/${glob}/**`,
  ]);
};
const PATHSPECS = {
  // Blink was named third_party/WebKit until 2017.
  chromium: [".", ":(exclude,glob)**/*.xtb",
    ...excludeAllBut("third_party", ["blink", "WebKit"])],
  default: [".", ":(exclude,glob)**/*.xtb", ":(exclude)third_party"],
};

// Commits whose tree is broken, and restored by the next one. They are
// skipped, and the next commit is diffed against the one before them.
const BROKEN_COMMITS = {
  // "Roll ANGLE r704:r705" kept only DEPS, from the git-svn mirror.
  chromium: ["5d4451ebf298d9d71f716cc0135f465cec41fcd0"],
};

const UNKNOWN = 0; // Commit index of the lines existing before --since.

// --- Git ---------------------------------------------------------------------

// Resolves with the output, as a Buffer when `raw`.
const run = (args, cwd, raw = false) => new Promise((resolve, reject) => {
  const proc = spawn(args[0], args.slice(1), { cwd });
  const chunks = [];
  proc.stdout.on("data", chunk => chunks.push(chunk));
  proc.stderr.on("data", chunk => process.stderr.write(chunk));
  proc.on("close", code => code === 0
    ? resolve(raw ? Buffer.concat(chunks) : Buffer.concat(chunks).toString())
    : reject(new Error(`${args.join(" ")} failed: ${code}`)));
});

// The diff of a range of commits, with only the lines we need. The content
// lines start with +, - or space, so the filter can't confuse them with
// headers.
const GitLog = (cwd, chunk, pathspecs) => {
  const format = "--format=%x01%H %at %ct %ae";
  const diff = ["-p", "-U0", "-M", `-l${CONFIG.rename_limit}`,
    "--no-color", "--no-ext-diff", "--no-textconv"];
  const quote = args => args
    .map(arg => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
  const [first, last] = [chunk[0], chunk.at(-1)];
  let git;
  if (first.base) {
    // A single commit, diffed against `base`.
    git = `{ ${quote(["git", "log", "-1", format, first.hash])}; ` +
      `${quote(["git", "-c", "core.quotePath=false", "diff", ...diff,
        first.base, first.hash, "--", ...pathspecs])}; }`;
  } else {
    const range = first.parent ? [last.hash, `^${first.parent}`] : [last.hash];
    git = quote(["git", "-c", "core.quotePath=false", "log",
      "--first-parent", "--diff-merges=first-parent", "--reverse",
      ...diff, format, ...range, "--", ...pathspecs]);
  }
  const filter = "LC_ALL=C grep -a -E " +
    "'^(\x01|diff --git |rename (from|to) |(new|deleted) file mode |index |new mode |Binary files |@@ )'";
  // Kept as a Buffer, outside of the JavaScript heap: large refactorings have
  // millions of hunks.
  // bash, as the dash of the CI has no pipefail.
  return run(["bash", "-c", `set -o pipefail; ${git} | ${filter} || [ $? = 1 ]`],
    cwd, true);
};

// --- Runs --------------------------------------------------------------------

const push = (out, commit, count) => {
  if (count === 0) return;
  const n = out.length;
  if (n > 0 && out[n - 2] === commit) {
    out[n - 1] += count;
  } else {
    out.push(commit, count);
  }
};

const lineCount = runs => {
  let total = 0;
  for (let i = 1; i < runs.length; i += 2) total += runs[i];
  return total;
};

// --- State -------------------------------------------------------------------

class State {
  constructor() {
    this.head = null;          // Last replayed commit.
    this.base = null;          // Parent of the first replayed commit.
    this.ignore_revs = true;   // Whether .git-blame-ignore-revs is used.
    this.next_sample = null;   // Unix time of the next sample.
    this.authors = [];         // Author id -> email.
    this.author_ids = new Map();
    this.commit_time = [0];    // Commit index -> author time.
    this.commit_author = [-1]; // Commit index -> author id.
    this.alive = [0];          // Commit index -> lines still alive.
    this.files = new Map();    // Path -> runs, as an Int32Array.
    this.samples = [];         // [time, {year: lines}].
    this.author_samples = [];  // [time, [author id, lines, ...]].
  }

  addCommit(time, email) {
    let author = this.author_ids.get(email);
    if (author === undefined) {
      author = this.authors.length;
      this.authors.push(email);
      this.author_ids.set(email, author);
    }
    this.commit_time.push(time);
    this.commit_author.push(author);
    this.alive.push(0);
    return this.commit_time.length - 1;
  }

  setFile(file, runs) {
    this.removeFile(file);
    if (runs.length === 0) return;
    if (!(runs instanceof Int32Array)) runs = Int32Array.from(runs);
    this.files.set(file, runs);
    for (let i = 0; i < runs.length; i += 2) this.alive[runs[i]] += runs[i + 1];
  }

  removeFile(file) {
    const runs = this.files.get(file);
    if (!runs) return;
    for (let i = 0; i < runs.length; i += 2) this.alive[runs[i]] -= runs[i + 1];
    this.files.delete(file);
  }

  sample(time) {
    const years = {};
    const authors = new Map();
    for (let commit = 0; commit < this.alive.length; commit++) {
      const lines = this.alive[commit];
      if (lines === 0) continue;
      const year = commit === UNKNOWN
        ? "unknown"
        : new Date(this.commit_time[commit] * 1000).getUTCFullYear();
      years[year] = (years[year] || 0) + lines;
      const author = this.commit_author[commit];
      authors.set(author, (authors.get(author) || 0) + lines);
    }
    this.samples.push([time, years]);
    // Every 4 weeks for the authors, as there are many of them.
    if (this.samples.length % 4 === 1) {
      this.author_samples.push([time, [...authors].flat()]);
    }
  }

  // Binary layout, gzipped:
  // - JSON header (length prefixed).
  // - commit_time, commit_author as Uint32 arrays.
  // - For each file: path length, path, run count, runs as varints.
  serialize() {
    const header = Buffer.from(JSON.stringify({
      version: 1,
      head: this.head,
      base: this.base,
      ignore_revs: this.ignore_revs,
      next_sample: this.next_sample,
      authors: this.authors,
      commits: this.commit_time.length,
      files: this.files.size,
      samples: this.samples,
      author_samples: this.author_samples,
    }));
    const parts = [];
    const u32 = value => {
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(value >>> 0);
      parts.push(buffer);
    };
    u32(header.length);
    parts.push(header);
    parts.push(Buffer.from(Uint32Array.from(this.commit_time).buffer));
    parts.push(Buffer.from(Uint32Array.from(this.commit_author).buffer));

    let bytes = new Uint8Array(1 << 24);
    let size = 0;
    const varint = value => {
      if (size + 10 > bytes.length) {
        const bigger = new Uint8Array(bytes.length * 2);
        bigger.set(bytes);
        bytes = bigger;
      }
      while (value >= 0x80) {
        bytes[size++] = (value & 0x7f) | 0x80;
        value = Math.floor(value / 128);
      }
      bytes[size++] = value;
    };
    const encoder = new TextEncoder();
    for (const [file, runs] of this.files) {
      const name = encoder.encode(file);
      varint(name.length);
      for (const byte of name) varint(byte);
      varint(runs.length / 2);
      for (const value of runs) varint(value);
    }
    parts.push(Buffer.from(bytes.buffer, 0, size));
    return zlib.gzipSync(Buffer.concat(parts));
  }

  static deserialize(data) {
    const state = new State();
    const buffer = zlib.gunzipSync(data);
    let offset = 0;
    const header_length = buffer.readUInt32LE(0);
    offset += 4;
    const header = JSON.parse(buffer.subarray(offset, offset + header_length));
    offset += header_length;
    state.head = header.head;
    state.base = header.base;
    state.ignore_revs = header.ignore_revs;
    state.next_sample = header.next_sample;
    state.authors = header.authors;
    state.authors.forEach((email, id) => state.author_ids.set(email, id));
    state.samples = header.samples;
    state.author_samples = header.author_samples;
    const u32s = () => {
      const array = new Uint32Array(header.commits);
      for (let i = 0; i < header.commits; i++) {
        array[i] = buffer.readUInt32LE(offset);
        offset += 4;
      }
      return Array.from(array);
    };
    state.commit_time = u32s();
    state.commit_author = u32s().map(id => id === 0xffffffff ? -1 : id);
    state.alive = new Array(header.commits).fill(0);

    const varint = () => {
      let value = 0;
      let factor = 1;
      for (;;) {
        const byte = buffer[offset++];
        value += (byte & 0x7f) * factor;
        if (byte < 0x80) return value;
        factor *= 128;
      }
    };
    const decoder = new TextDecoder();
    for (let i = 0; i < header.files; i++) {
      const name = new Uint8Array(varint());
      for (let j = 0; j < name.length; j++) name[j] = varint();
      const runs = new Int32Array(varint() * 2);
      for (let j = 0; j < runs.length; j++) runs[j] = varint();
      state.setFile(decoder.decode(name), runs);
    }
    return state;
  }
}

// --- Replay ------------------------------------------------------------------

// Paths are quoted by git when they contain special characters.
const unquote = text => {
  if (!text.startsWith('"')) return text;
  const bytes = [];
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== "\\") {
      bytes.push(...Buffer.from(text[i]));
      continue;
    }
    const c = text[++i];
    if (c >= "0" && c <= "7") {
      bytes.push(parseInt(text.slice(i, i + 3), 8));
      i += 2;
    } else {
      bytes.push({ n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 }[c] ??
        c.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString();
};

// "diff --git a/<path> b/<path>". When there is no rename, both paths are
// equal, which resolves the ambiguity of paths containing spaces.
const parseDiffLine = line => {
  const text = line.slice("diff --git ".length);
  if (text.startsWith('"')) {
    const end = text.indexOf('" ', 1);
    return unquote(text.slice(0, end + 1)).slice(2);
  }
  return text.slice(2, 2 + (text.length - 5) / 2);
};

class Replayer {
  constructor(state, ignore_revs, cwd) {
    this.state = state;
    this.cwd = cwd;
    this.ignore_revs = ignore_revs;
    this.desync = 0;
    // False while replaying the history imported by a merge.
    this.main = true;
    // Merge commit -> files of the history it imports.
    this.imports = new Map();
  }

  // Apply the hunks of one file, for the commit `commit`.
  applyHunks(file, hunks, commit, ignored, hash, old_blob) {
    const old = this.state.files.get(file) || [];
    const out = [];
    let run = 0;     // Index in `old`.
    let offset = 0;  // Lines of old[run] already consumed.
    let position = 0;

    // Move `count` lines from the old runs to `target` (if any).
    const take = (count, target) => {
      position += count;
      while (count > 0) {
        if (run >= old.length) {
          throw new Error(`${file}: hunk past the end of the file`);
        }
        const n = Math.min(count, old[run + 1] - offset);
        if (target) push(target, old[run], n);
        count -= n;
        offset += n;
        if (offset === old[run + 1]) {
          run += 2;
          offset = 0;
        }
      }
    };

    try {
      // `hunks` is flat: [a, b, d, a, b, d, ...] for `@@ -a,b +c,d @@`.
      for (let h = 0; h < hunks.length; h += 3) {
        const [a, b, d] = [hunks[h], hunks[h + 1], hunks[h + 2]];
        const start = b === 0 ? a : a - 1;
        take(start - position, out);
        if (!ignored || b === 0) {
          take(b, null);
          push(out, commit, d);
          continue;
        }
        // Ignored revision: the new lines keep the authors of the lines they
        // replace, spread proportionally.
        const removed = [];
        take(b, removed);
        const lines = [];
        for (let i = 0; i < removed.length; i += 2) {
          for (let j = 0; j < removed[i + 1]; j++) lines.push(removed[i]);
        }
        for (let i = 0; i < d; i++) {
          push(out, lines[Math.floor(i * b / d)], 1);
        }
      }
      take(lineCount(old) - position, out);
    } catch (error) {
      // The state doesn't match the repository. This happens when git
      // considered a previous version as binary, and showed no hunks. The
      // lines of the previous version are then attributed to this commit.
      console.warn("Desync:", hash, error.message);
      this.desync++;
      this.state.removeFile(file);
      if (old_blob && !/^0+$/.test(old_blob)) {
        const content = execFileSync("git", ["cat-file", "-p", old_blob],
          { cwd: this.cwd, maxBuffer: 1 << 30 });
        let lines = 0;
        for (const byte of content) if (byte === 10) lines++;
        if (content.length && content.at(-1) !== 10) lines++;
        this.state.setFile(file, [commit, lines]);
        this.applyHunks(file, hunks, commit, ignored, hash, null);
      }
      return;
    }
    this.state.setFile(file, out);
  }

  // Replay the filtered output of `GitLog`.
  replay(output, expected) {
    const state = this.state;
    let commit = -1;
    let hash = null;
    let ignored = false;
    let block = null;
    let replayed = 0;

    // Apply the blocks of the current commit. The renames first, at once, as
    // a commit can swap files.
    let blocks = [];
    const flush = () => {
      // The files added by a merge importing a history keep their lines.
      const imported = this.imports.get(hash);
      if (imported) {
        this.imports.delete(hash);
        blocks = blocks.filter(block => {
          const runs = imported.get(block.to);
          let added = 0;
          for (let h = 2; h < block.hunks.length; h += 3) added += block.hunks[h];
          if (!block.added || !runs || lineCount(runs) !== added) return true;
          state.setFile(block.to, runs);
          imported.delete(block.to);
          return false;
        });
      }
      const renamed = blocks.filter(block => block.from !== block.to);
      const moved = renamed.map(block => state.files.get(block.from));
      renamed.forEach(block => state.removeFile(block.from));
      renamed.forEach((block, i) => moved[i] && state.setFile(block.to, moved[i]));
      for (const block of blocks) {
        // Binary files, symlinks and submodules have no lines.
        if (block.deleted || block.binary || block.mode === "120000" ||
          block.mode === "160000") {
          state.removeFile(block.to);
        } else if (block.hunks.length > 0) {
          this.applyHunks(block.to, block.hunks, commit, ignored, hash,
            block.old_blob);
        }
      }
      blocks = [];
    };

    for (let start = 0; start < output.length;) {
      let end = output.indexOf(10, start);
      if (end === -1) end = output.length;
      const line = output.toString("utf8", start, end);
      start = end + 1;
      if (line.startsWith("\x01")) {
        flush();
        let author_time, commit_time, email;
        [hash, author_time, commit_time, ...email] = line.slice(1).split(" ");
        // Commits not touching the pathspecs are omitted.
        while (replayed < expected.length && expected[replayed].hash !== hash) {
          replayed++;
        }
        if (replayed++ === expected.length) {
          throw new Error(`Unexpected commit ${hash}`);
        }
        const time = Number(commit_time);
        while (this.main && state.next_sample !== null && time >= state.next_sample) {
          state.sample(state.next_sample);
          state.next_sample += CONFIG.week;
        }
        if (this.main && state.next_sample === null) {
          state.next_sample = NextMonday(time);
        }
        commit = state.addCommit(Number(author_time), email.join(" "));
        ignored = this.ignore_revs.has(hash);
      } else if (line.startsWith("diff --git ")) {
        const file = parseDiffLine(line);
        block = { from: file, to: file, hunks: [], mode: null };
        blocks.push(block);
      } else if (line.startsWith("@@ ")) {
        const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        block.hunks.push(
          Number(match[1]),
          match[2] === undefined ? 1 : Number(match[2]),
          match[4] === undefined ? 1 : Number(match[4]),
        );
      } else if (line.startsWith("rename from ")) {
        block.from = unquote(line.slice("rename from ".length));
      } else if (line.startsWith("rename to ")) {
        block.to = unquote(line.slice("rename to ".length));
      } else if (line.startsWith("new file mode ")) {
        block.mode = line.slice("new file mode ".length);
        block.added = true;
      } else if (line.startsWith("deleted file mode ")) {
        block.deleted = true;
      } else if (line.startsWith("new mode ")) {
        block.mode = line.slice("new mode ".length);
      } else if (line.startsWith("index ")) {
        const [, blobs, mode] = line.split(" ");
        block.old_blob = blobs.split("..")[0];
        if (mode) block.mode = mode;
      } else if (line.startsWith("Binary files ")) {
        block.binary = true;
      }
    }
    flush();
    if (this.main) state.head = expected.at(-1).hash;
  }
}

const NextMonday = time => {
  const date = new Date(time * 1000);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7 || 7));
  return date.getTime() / 1000;
};

// --- Output ------------------------------------------------------------------

const Day = time => new Date(time * 1000).toISOString().slice(0, 10);

const WriteOutput = async (state, dir) => {
  // Cohorts: one row per sample, one column per year.
  const keys = new Set();
  for (const [, years] of state.samples) {
    Object.keys(years).forEach(key => keys.add(key));
  }
  const years = [...keys].sort();
  await fs.writeFile(path.join(dir, "cohorts.json"), JSON.stringify({
    dates: state.samples.map(([time]) => Day(time)),
    years,
    lines: state.samples.map(([, values]) => years.map(year => values[year] || 0)),
  }));

  // Usernames: their lines over time, merging their emails like the rest of
  // the site. The state keeps the raw emails, for the mailmap to be updated
  // without replaying the history.
  const usernames = new Map();
  const dates = state.author_samples.map(([time]) => Day(time));
  state.author_samples.forEach(([, values], index) => {
    for (let i = 0; i < values.length; i += 2) {
      const [id, lines] = [values[i], values[i + 1]];
      // The bots count in the years, but aren't developers.
      if (id === -1 || !IsEmailValid(state.authors[id])) continue;
      const username = mailMap(state.authors[id]).split("@")[0];
      if (!usernames.has(username)) {
        usernames.set(username, new Array(dates.length).fill(0));
      }
      usernames.get(username)[index] += lines;
    }
  });

  await fs.rm(path.join(dir, "usernames"), { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "usernames"), { recursive: true });
  const leaderboard = [];
  for (const [username, lines] of usernames) {
    const first = lines.findIndex(value => value > 0);
    if (first === -1) continue;
    await fs.writeFile(path.join(dir, "usernames", `${username}.json`),
      JSON.stringify({ dates: dates.slice(first), lines: lines.slice(first) }));
    leaderboard.push({ username, lines: lines.at(-1), peak: Math.max(...lines) });
  }
  leaderboard.sort((a, b) => b.lines - a.lines);
  await fs.writeFile(path.join(dir, "leaderboard.json"),
    JSON.stringify(leaderboard.slice(0, 100)));
};

// --- Validation --------------------------------------------------------------

const Validate = async (state, cwd, dir, pathspecs, blame_count) => {
  // 1. The number of lines of every file.
  const output = await run(["git", "-c", "core.quotePath=false", "grep", "-I",
    "-c", "", state.head, "--", ...pathspecs], cwd);
  const expected = new Map();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const colon = line.lastIndexOf(":");
    expected.set(line.slice(state.head.length + 1, colon),
      Number(line.slice(colon + 1)));
  }
  let mismatches = 0;
  for (const [file, count] of expected) {
    const actual = state.files.has(file) ? lineCount(state.files.get(file)) : 0;
    if (actual !== count) {
      if (mismatches++ < 20) console.log("Line count:", file, actual, "vs", count);
    }
  }
  for (const file of state.files.keys()) {
    if (!expected.has(file)) {
      if (mismatches++ < 20) console.log("Unexpected file:", file);
    }
  }
  console.log(`Line counts: ${expected.size} files, ${mismatches} mismatches`);

  // 2. `git blame` of a few files, line by line. The lines from before
  // --since are "boundary" lines. Unlike the replay, `git blame` follows the
  // imported histories, and the broken commits, through their second parent.
  // Its heuristic for the ignored revisions differs a bit from ours.
  const range = state.base ? [state.head, `^${state.base}`] : [state.head];
  const options = [];
  if (state.ignore_revs) {
    const file = path.resolve(dir, "ignore-revs.tmp");
    await fs.writeFile(file, await run(["git", "show",
      `${state.head}:.git-blame-ignore-revs`], cwd));
    options.push(`--ignore-revs-file=${file}`);
  }
  // Prefer the files modified by the replayed commits.
  const files = [...state.files.keys()].filter(file =>
    state.files.get(file).some((value, i) => i % 2 === 0 && value !== UNKNOWN));
  let lines = 0;
  let errors = 0;
  for (let i = 0; i < blame_count; i++) {
    const file = files[Math.floor(Math.random() * files.length)];
    const blame = await run(["git", "blame", "--line-porcelain", ...options,
      ...range, "--", file], cwd);
    const blamed = [];
    for (const line of blame.split("\n")) {
      if (/^[0-9a-f]{40} /.test(line)) {
        blamed.push({});
      } else if (line.startsWith("author-mail ")) {
        blamed.at(-1).email = line.slice("author-mail <".length, -1);
      } else if (line.startsWith("author-time ")) {
        blamed.at(-1).time = Number(line.slice("author-time ".length));
      } else if (line === "boundary") {
        blamed.at(-1).boundary = true;
      }
    }
    const runs = state.files.get(file);
    let index = 0;
    let file_errors = 0;
    for (let r = 0; r < runs.length; r += 2) {
      for (let j = 0; j < runs[r + 1]; j++, index++) {
        lines++;
        const commit = runs[r];
        const expected = blamed[index];
        const ok = commit === UNKNOWN
          ? expected?.boundary
          : !expected?.boundary &&
          expected?.email === state.authors[state.commit_author[commit]] &&
          expected?.time === state.commit_time[commit];
        if (!ok) file_errors++;
      }
    }
    if (index !== blamed.length) file_errors++;
    if (file_errors) console.log("Blame:", file, file_errors, "errors");
    errors += file_errors;
  }
  console.log(`Blame: ${blame_count} files, ${lines} lines, ${errors} errors`);
};

// --- Main --------------------------------------------------------------------

const main = async () => {
  const [dirname, ...flags] = process.argv.slice(2);
  const flag = name => {
    const arg = flags.find(f => f === `--${name}` || f.startsWith(`--${name}=`));
    return arg && (arg.includes("=") ? arg.split("=")[1] : true);
  };
  const cwd = dirname;
  const pathspecs = PATHSPECS[dirname] || PATHSPECS.default;
  const dir = path.join(CONFIG.output_dir, dirname);
  const state_file = path.join(dir, "state.bin.gz");
  await fs.mkdir(dir, { recursive: true });

  let state;
  try {
    state = State.deserialize(await fs.readFile(state_file));
    console.log(`Loaded state at ${state.head}: ${state.files.size} files`);
  } catch (error) {
    state = new State();
  }

  // In the CI, there is no checkout, or a shallow one: fetch the history since
  // the last replayed commit. Its commit date is less than a week before the
  // next sample.
  const since = state.next_sample
    ? [`--shallow-since=${new Date((state.next_sample - 2 * CONFIG.week) * 1000).toISOString()}`]
    : [];
  const cloned = await fs.access(cwd).then(() => true, () => false);
  if (cloned) {
    if ((await run(["git", "rev-parse", "--is-shallow-repository"], cwd)).trim() === "true") {
      await run(["git", "fetch", ...since, "origin", "main"], cwd);
    }
  } else {
    const repositories = JSON5.parse(await fs.readFile("../repositories.json5", "utf8"));
    const repo = repositories.find(repo => repo.dirname === dirname);
    await run(["git", "clone", "--single-branch", "--no-checkout", ...since,
      `https://github.com/${repo.owner}/${repo.repository}`, cwd], ".");
  }

  if (flag("validate")) {
    const count = flag("validate") === true ? 50 : Number(flag("validate"));
    await Validate(state, cwd, dir, pathspecs, count);
    return;
  }

  const ignore_revs = new Set();
  if (!state.head) state.ignore_revs = !flag("no-ignore-revs");
  if (state.ignore_revs) {
    try {
      const text = await run(["git", "show", "origin/main:.git-blame-ignore-revs"], cwd);
      for (const line of text.split("\n")) {
        const hash = line.trim();
        if (/^[0-9a-f]{40}$/.test(hash)) ignore_revs.add(hash);
      }
    } catch (error) { }
  }
  console.log(`Ignored revisions: ${ignore_revs.size}`);

  // The commits to replay, oldest first, with their first parent.
  const range = state.head ? [`${state.head}..origin/main`] : ["origin/main"];
  if (!state.head && flag("since")) range.push(`--since=${flag("since")}`);
  let commits = await RevList(cwd, range);
  const broken = new Set(BROKEN_COMMITS[dirname] || []);
  commits = commits.filter((commit, i) => {
    if (!broken.has(commit.hash)) return true;
    if (commits[i + 1]) commits[i + 1].base = commit.parent;
    return false;
  });
  console.log(`Commits to replay: ${commits.length}`);
  if (commits.length > 0) {
    await Replay(state, cwd, pathspecs, ignore_revs, commits);
    await fs.writeFile(state_file, state.serialize());
    const size = (await fs.stat(state_file)).size;
    console.log(`State: ${(size / 1e6).toFixed(1)} MB`);
  }
  await WriteOutput(state, dir);
};

const Replay = async (state, cwd, pathspecs, ignore_revs, commits) => {
  // Starting from --since: the existing lines are attributed to UNKNOWN.
  if (!state.head && commits[0].parent) {
    const parent = commits[0].parent;
    state.base = parent;
    const output = await run(["git", "-c", "core.quotePath=false", "grep", "-I",
      "-c", "", parent, "--", ...pathspecs], cwd);
    for (const line of output.split("\n")) {
      if (!line) continue;
      const colon = line.lastIndexOf(":");
      state.setFile(line.slice(parent.length + 1, colon),
        [UNKNOWN, Number(line.slice(colon + 1))]);
    }
    console.log(`Initial state at ${parent}: ${state.files.size} files`);
  }

  const replayer = new Replayer(state, ignore_revs, cwd);

  // The histories imported by a merge, from an unrelated repository, are
  // replayed first, into their own files.
  const shallow = (await run(["git", "rev-parse", "--is-shallow-repository"],
    cwd)).trim() === "true";
  for (const commit of commits) {
    if (!commit.second || shallow) continue;
    const related = await run(["git", "merge-base", commit.parent, commit.second],
      cwd).then(() => true, () => false);
    if (related) continue;
    const side = await RevList(cwd, [commit.second]);
    console.log(`Importing ${side.length} commits, merged by ${commit.hash}`);
    const files = state.files;
    state.files = new Map();
    replayer.main = false;
    await ReplayChunks(replayer, side, cwd, pathspecs);
    // Their lines count once the merge adds them to the main history.
    for (const runs of state.files.values()) {
      for (let i = 0; i < runs.length; i += 2) state.alive[runs[i]] -= runs[i + 1];
    }
    replayer.imports.set(commit.hash, state.files);
    replayer.main = true;
    state.files = files;
  }

  await ReplayChunks(replayer, commits, cwd, pathspecs);
  console.log(`Desync: ${replayer.desync}`);
};

// The commits of the first-parent history, oldest first.
const RevList = async (cwd, range) => (await run(["git", "rev-list",
  "--first-parent", "--reverse", "--parents", ...range], cwd))
  .split("\n").filter(line => line).map(line => {
    const [hash, parent, second] = line.split(" ");
    return { hash, parent, second };
  });

const ReplayChunks = async (replayer, commits, cwd, pathspecs) => {
  const state = replayer.state;
  // A commit diffed against a base is a chunk on its own.
  const chunks = [];
  for (const commit of commits) {
    const last = chunks.at(-1);
    if (!last || commit.base || last[0].base || last.length === CONFIG.chunk_size) {
      chunks.push([commit]);
    } else {
      last.push(commit);
    }
  }

  // Fetch the chunks in parallel, replay them in order.
  const pending = [];
  let next = 0;
  let running = 0;
  let replayed = 0;
  const schedule = () => {
    while (running < CONFIG.concurrency && next < chunks.length &&
      next < replayed + CONFIG.lookahead) {
      running++;
      pending[next] = GitLog(cwd, chunks[next++], pathspecs)
        .finally(() => { running--; schedule(); });
    }
  };
  const start = Date.now();
  let done = 0;
  for (; replayed < chunks.length; replayed++) {
    schedule();
    const output = await pending[replayed];
    pending[replayed] = null;
    replayer.replay(output, chunks[replayed]);
    done += chunks[replayed].length;
    const elapsed = (Date.now() - start) / 1000;
    const memory = process.memoryUsage();
    console.log(`${Day(state.commit_time.at(-1))} ${done}/${commits.length} ` +
      `commits, ${Math.round(done / elapsed)}/s, ${state.files.size} files, ` +
      `heap ${Math.round(memory.heapUsed / 1e6)} MB, ` +
      `arrays ${Math.round(memory.arrayBuffers / 1e6)} MB`);
  }
};

await main();
