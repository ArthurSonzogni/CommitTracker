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
// Usage: node accretion.mjs <repo dirname> [options]
//   --since=<date>      Start from this date, instead of the first commit. The
//                       lines existing before are attributed to "unknown".
//   --validate[=<n>]    Compare the state against the repository: the number of
//                       lines of every file, and `git blame` for n of them.
//                       It needs a full clone.
//   --output=<dir>      Instead of ../public/accretion, for experiments.
// The methods, for comparing them. They are kept in the state, for the next
// runs to use the same:
//   --no-ignore-revs    Do not use .git-blame-ignore-revs.
//   --no-renames        Do not follow the renamed files.
//   --ignore-whitespace Lines only differing by whitespace keep their author.
//   --commit-date       Date the lines when they landed, instead of authored.
//   --exclude=<glob>    Do not count these files. Can be repeated.

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
// (*.xtb, locales/) aren't code.
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
  default: [".", ":(exclude,glob)**/*.xtb", ":(exclude,glob)**/locales/**",
    ":(exclude)third_party"],
};

// Commits whose tree is broken, and restored by the next one. They are
// skipped, and the next commit is diffed against the one before them.
const BROKEN_COMMITS = {
  // "Roll ANGLE r704:r705" kept only DEPS, from the git-svn mirror.
  chromium: ["5d4451ebf298d9d71f716cc0135f465cec41fcd0"],
};

const DEFAULT_OPTIONS = {
  ignore_revs: true,
  renames: true,
  whitespace: false,
  commit_date: false,
  exclude: [],
};

const UNKNOWN = 0; // Commit index of the lines existing before --since.

// The lines nobody wrote by hand are owned by this pseudo-author, skipped by
// the developers like the bots, but still counted in the years:
// - The generated files.
// - The vendored code: the third_party/ directories inside the others, the
//   npm packages, and the copies of the upstream benchmarks.
// - The imports of the web-platform-tests and the WebGPU conformance tests,
//   sometimes landed by developers. "Import maps" and "import text" are
//   features, not imports.
const GENERATED = "generated";
const GENERATED_FILE = new RegExp([
  "(^|/)(gen|generated|generated_[^/]*)/",
  "autogen",
  "WPT_BASE_MANIFEST[^/]*\\.json$",
  "^testing/buildbot/(?!trybot_analyze_config\\.json$)[^/]*\\.json$",
  "./third_party/",
  "(^|/)node_modules/",
  "^third_party/(blink|WebKit)/perf_tests/(speedometer[^/]*|MotionMark)/",
  "^chrome/test/data/dromaeo/",
  // Firefox: the vendored libraries and test suites outside third_party/.
  "^intl/icu/",
  "^js/src/tests/test262/",
  "^js/src/octane/",
  "^testing/web-platform/tests/",
  "^testing/web-platform/mozilla/tests/webgpu/",
  "^dom/webgpu/tests/cts/",
  "^security/nss/",
  "^modules/freetype2/",
  "^gfx/harfbuzz/",
  "^media/lib[^/]*/",
  "^ipc/chromium/src/(base|third_party)/",
  // Servo: the WebGPU conformance tests and their expectations.
  "^tests/wpt/webgpu/",
].join("|"));
const IMPORT_SUBJECT =
  /^(manual(ly)? )?import(ing)?\b(?! maps?\b| text\b)|\b(sync|update) (wpt|cts)\b/i;
const WPT_FILE = new RegExp([
  "^third_party/(blink/web_tests|WebKit/LayoutTests)/(external|imported)/",
  "^tests/wpt/", // Servo.
].join("|"));
// A commit changing at least this many lines, and this share of the total, is
// an event.
const EVENT_LINES = 10000;
const EVENT_SHARE = 0.005;

// Mechanical changes missing from .git-blame-ignore-revs, ignored like them:
// - The mass reformattings and copyright updates.
// - The commits touching many files, with a few lines each.
const REFORMAT_SUBJECT = new RegExp("^(\\[[^\\]]*\\] *)*(" + [
  "Ruff: reformat",
  "Update copyright headers?",
  "Reformat(ting)?\\b",
  "(Run |Apply )?clang-format\\b",
  "(Mass-)?(reformat|autoformat)",
  "git cl format",
].join("|") + ")", "i");
const MECHANICAL_FILES = 1000;
const MECHANICAL_LINES_PER_FILE = 3;

// The activity: the lines changed per directory and year, by kind. A line
// rewritten or removed is an iteration when it is less than a year old, and a
// rework otherwise. The mechanical commits are counted apart.
const KINDS = ["new", "iteration", "rework", "mechanical", "removed"];
const YEAR0 = 1970;
const YEARS = 81;
const Year = time => Math.max(0, Math.min(YEARS - 1,
  new Date(time * 1000).getUTCFullYear() - YEAR0));

// The directories are tracked up to this depth, with Blink counted as a
// top-level directory. Their lines are counted per month written in: index 0
// for UNKNOWN, then one per month since 2000.
const DIRECTORY_DEPTH = 3;
const MONTHS = 1 + 12 * 50;
const Month = time => {
  const date = new Date(time * 1000);
  return 1 + Math.max(0, (date.getUTCFullYear() - 2000) * 12 + date.getUTCMonth());
};
const Directories = file => {
  const parts = file.split("/");
  parts.pop();
  if (parts[0] === "third_party" && (parts[1] === "blink" || parts[1] === "WebKit")) {
    // Blink was named third_party/WebKit until 2017.
    parts.splice(0, 2, "third_party/blink");
  }
  const directories = [];
  for (let i = 1; i <= Math.min(DIRECTORY_DEPTH, parts.length); i++) {
    directories.push(parts.slice(0, i).join("/"));
  }
  return directories;
};

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
const GitLog = (cwd, chunk, pathspecs, options) => {
  const format = "--format=%x01%H %at %ct %ae%x02%s";
  const diff = ["-p", "-U0",
    ...(options.renames ? ["-M", `-l${CONFIG.rename_limit}`] : ["--no-renames"]),
    ...(options.whitespace ? ["-w"] : []),
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
    this.options = DEFAULT_OPTIONS; // The method, see the usage.
    this.next_sample = null;   // Unix time of the next sample.
    this.authors = [];         // Author id -> email.
    this.author_ids = new Map();
    this.commit_time = [0];    // Commit index -> author time.
    this.commit_author = [-1]; // Commit index -> author id.
    this.alive = [0];          // Commit index -> lines still alive.
    this.total = 0;            // Lines alive.
    // The commits adding or removing many lines at once, explaining the steps
    // of the charts: [time, lines, hash, subject, path].
    this.events = [];
    this.generated = [0];      // Commit index -> those in GENERATED_FILE.
    this.files = new Map();    // Path -> runs, as an Int32Array.
    this.samples = [];         // [time, {year: lines}, recent].
    this.author_samples = [];  // [time, [author id, lines, ...]].
    this.commit_month = [0];   // Commit index -> Month().
    this.directories = new Map(); // Directory -> lines per month (Int32Array).
    this.directory_names = []; // Directory id -> name.
    this.directory_ids = new Map();
    // Whether the activity, the contributors and the removals were recorded
    // since the first commit. A state from before they existed is missing
    // them, and they aren't written until it is replayed again.
    this.activity_complete = true;
    // Directory ("" for the root) -> Int32Array(KINDS x YEARS), the lines
    // changed.
    this.activity = new Map();
    // Directory -> Map(year -> Map(author id -> commits)).
    this.contributors = new Map();
    // Author id -> Map(author id -> lines): whose lines were removed by whom.
    this.removals = new Map();
    // Every 4 weeks: [time, [directory id, recent, years count,
    //                         (year - 2000, lines)...]...].
    this.directory_samples = [];
  }

  authorId(email) {
    let author = this.author_ids.get(email);
    if (author === undefined) {
      author = this.authors.length;
      this.authors.push(email);
      this.author_ids.set(email, author);
    }
    return author;
  }

  addCommit(time, email) {
    this.commit_time.push(time);
    this.commit_author.push(this.authorId(email));
    this.commit_month.push(Month(time));
    this.alive.push(0);
    this.generated.push(0);
    return this.commit_time.length - 1;
  }

  setFile(file, runs) {
    this.removeFile(file);
    if (runs.length === 0) return;
    if (!(runs instanceof Int32Array)) runs = Int32Array.from(runs);
    this.files.set(file, runs);
    this.account(file, runs, 1);
  }

  removeFile(file) {
    const runs = this.files.get(file);
    if (!runs) return;
    this.account(file, runs, -1);
    this.files.delete(file);
  }

  // Count (sign = 1) or uncount (sign = -1) the lines of a file.
  account(file, runs, sign) {
    const directories = Directories(file).map(directory => {
      if (!this.directories.has(directory)) {
        this.directories.set(directory, new Int32Array(MONTHS));
      }
      return this.directories.get(directory);
    });
    const generated = GENERATED_FILE.test(file);
    for (let i = 0; i < runs.length; i += 2) {
      const lines = sign * runs[i + 1];
      this.alive[runs[i]] += lines;
      this.total += lines;
      if (generated) this.generated[runs[i]] += lines;
      const month = this.commit_month[runs[i]];
      for (const months of directories) months[month] += lines;
    }
  }

  // The lines changed in `file` by `commit`: [removed runs, lines removed,
  // lines added] per hunk.
  recordActivity(file, commit, changes, mechanical) {
    if (GENERATED_FILE.test(file)) return;
    const time = this.commit_time[commit];
    const year = Year(time);
    const author = this.commit_author[commit];
    const counters = ["", ...Directories(file)].map(directory => {
      if (!this.activity.has(directory)) {
        this.activity.set(directory, new Int32Array(KINDS.length * YEARS));
      }
      return this.activity.get(directory);
    });
    const add = (kind, lines) => {
      if (lines <= 0) return;
      for (const counter of counters) counter[kind * YEARS + year] += lines;
    };
    for (const [removed, b, d] of changes) {
      add(4, b - d);
      if (mechanical) {
        add(3, Math.max(b, d));
        continue;
      }
      add(0, d - b);
      for (let i = 0; i < removed.length; i += 2) {
        const [origin, lines] = [removed[i], removed[i + 1]];
        const young = origin !== UNKNOWN && time - this.commit_time[origin] < 365 * 86400;
        add(young ? 1 : 2, lines);
        if (origin === UNKNOWN) continue;
        const written = this.commit_author[origin];
        if (!this.removals.has(written)) this.removals.set(written, new Map());
        const by = this.removals.get(written);
        by.set(author, (by.get(author) || 0) + lines);
      }
    }
  }

  // A commit touching these files, for the contributors of their directories.
  recordCommit(commit, files) {
    const year = Year(this.commit_time[commit]);
    const author = this.commit_author[commit];
    const directories = new Set([""]);
    for (const file of files) {
      if (GENERATED_FILE.test(file)) continue;
      Directories(file).forEach(directory => directories.add(directory));
    }
    if (directories.size === 1 && files.every(file => GENERATED_FILE.test(file))) return;
    for (const directory of directories) {
      if (!this.contributors.has(directory)) this.contributors.set(directory, new Map());
      const years = this.contributors.get(directory);
      if (!years.has(year)) years.set(year, new Map());
      const authors = years.get(year);
      authors.set(author, (authors.get(author) || 0) + 1);
    }
  }

  sample(time) {
    const years = {};
    const authors = new Map();
    const generated = this.authorId(GENERATED);
    let recent = 0; // Lines of the last 365 days.
    for (let commit = 0; commit < this.alive.length; commit++) {
      const lines = this.alive[commit];
      if (lines === 0) continue;
      const year = commit === UNKNOWN
        ? "unknown"
        : new Date(this.commit_time[commit] * 1000).getUTCFullYear();
      years[year] = (years[year] || 0) + lines;
      if (commit !== UNKNOWN && this.commit_time[commit] > time - 365 * 86400) {
        recent += lines;
      }
      const author = this.commit_author[commit];
      const own = lines - this.generated[commit];
      if (own) authors.set(author, (authors.get(author) || 0) + own);
      if (this.generated[commit]) {
        authors.set(generated, (authors.get(generated) || 0) + this.generated[commit]);
      }
    }
    this.samples.push([time, years, recent]);
    if (this.samples.length % 4 === 1) this.sampleDirectories(time);
    // Every 4 weeks for the authors, as there are many of them.
    if (this.samples.length % 4 === 1) {
      this.author_samples.push([time, [...authors].flat()]);
    }
  }

  sampleDirectories(time) {
    this.directory_samples.push([time, this.directoryValues(time)]);
  }

  directoryId(directory) {
    let id = this.directory_ids.get(directory);
    if (id === undefined) {
      id = this.directory_names.length;
      this.directory_names.push(directory);
      this.directory_ids.set(directory, id);
    }
    return id;
  }

  // The directories at `time`, in the format of `directory_samples`.
  directoryValues(time) {
    const last_year = Month(time) - 12;
    const values = [];
    for (const [directory, months] of this.directories) {
      const years = new Map();
      let recent = 0;
      for (let month = 0; month < MONTHS; month++) {
        const lines = months[month];
        if (lines === 0) continue;
        // UNKNOWN is year -1, stored as 0.
        const year = month === 0 ? 0 : 1 + Math.floor((month - 1) / 12);
        years.set(year, (years.get(year) || 0) + lines);
        if (month > last_year) recent += lines;
      }
      if (years.size === 0) continue;
      values.push(this.directoryId(directory), recent, years.size, ...[...years].flat());
    }
    return values;
  }

  // Binary layout, gzipped:
  // - JSON header (length prefixed).
  // - commit_time, commit_author as Uint32 arrays.
  // - For each file: path length, path, run count, runs as varints.
  // - For each directory sample: time, value count, values as varints.
  serialize() {
    for (const directory of [...this.activity.keys(), ...this.contributors.keys()]) {
      this.directoryId(directory);
    }
    const header = Buffer.from(JSON.stringify({
      version: 1,
      head: this.head,
      base: this.base,
      options: this.options,
      next_sample: this.next_sample,
      authors: this.authors,
      commits: this.commit_time.length,
      files: this.files.size,
      samples: this.samples,
      author_samples: this.author_samples,
      events: this.events,
      directory_names: this.directory_names,
      directory_samples: this.directory_samples.length,
      activity: this.activity.size,
      contributors: this.contributors.size,
      removals: this.removals.size,
      activity_complete: this.activity_complete,
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
    for (const [time, values] of this.directory_samples) {
      varint(time);
      varint(values.length);
      for (const value of values) varint(value);
    }
    // The activity, sparse: directory, then (index, lines) pairs.
    for (const [directory, counters] of this.activity) {
      varint(this.directoryId(directory));
      const nonzero = [];
      counters.forEach((lines, index) => lines && nonzero.push(index, lines));
      varint(nonzero.length / 2);
      for (const value of nonzero) varint(value);
    }
    for (const [directory, years] of this.contributors) {
      varint(this.directoryId(directory));
      varint(years.size);
      for (const [year, authors] of years) {
        varint(year);
        varint(authors.size);
        for (const [author, commits] of authors) {
          varint(author);
          varint(commits);
        }
      }
    }
    for (const [written, by] of this.removals) {
      varint(written);
      varint(by.size);
      for (const [author, lines] of by) {
        varint(author);
        varint(lines);
      }
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
    state.options = { ...DEFAULT_OPTIONS, ...header.options };
    state.next_sample = header.next_sample;
    state.authors = header.authors;
    state.authors.forEach((email, id) => state.author_ids.set(email, id));
    state.samples = header.samples;
    state.author_samples = header.author_samples;
    state.events = header.events || [];
    state.activity_complete = header.activity_complete === true;
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
    state.commit_month = state.commit_time.map((time, i) => i === UNKNOWN ? 0 : Month(time));
    state.alive = new Array(header.commits).fill(0);
    state.generated = new Array(header.commits).fill(0);
    state.directory_names = header.directory_names || [];
    state.directory_names.forEach((name, id) => state.directory_ids.set(name, id));

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
    for (let i = 0; i < (header.directory_samples || 0); i++) {
      const time = varint();
      const values = new Array(varint());
      for (let j = 0; j < values.length; j++) values[j] = varint();
      state.directory_samples.push([time, values]);
    }
    for (let i = 0; i < (header.activity || 0); i++) {
      const directory = state.directory_names[varint()];
      const counters = new Int32Array(KINDS.length * YEARS);
      for (let j = varint(); j > 0; j--) {
        const index = varint();
        counters[index] = varint();
      }
      state.activity.set(directory, counters);
    }
    for (let i = 0; i < (header.contributors || 0); i++) {
      const years = new Map();
      state.contributors.set(state.directory_names[varint()], years);
      for (let j = varint(); j > 0; j--) {
        const authors = new Map();
        years.set(varint(), authors);
        for (let k = varint(); k > 0; k--) {
          const author = varint();
          authors.set(author, varint());
        }
      }
    }
    for (let i = 0; i < (header.removals || 0); i++) {
      const by = new Map();
      state.removals.set(varint(), by);
      for (let j = varint(); j > 0; j--) {
        const author = varint();
        by.set(author, varint());
      }
    }
    return state;
  }
}

// --- Replay ------------------------------------------------------------------

// Where an event happened: the deepest directory holding most of its lines
// added or removed. "" for the root.
const EventPath = (delta, lines) => {
  const directories = new Map();
  for (const [file, change] of delta) {
    const parts = file.split("/");
    for (let i = 0; i < parts.length; i++) {
      const directory = parts.slice(0, i).join("/");
      directories.set(directory, (directories.get(directory) || 0) + change);
    }
  }
  let path = "";
  for (const [directory, change] of directories) {
    if (change * Math.sign(lines) >= 0.75 * Math.abs(lines) &&
      directory.split("/").length > path.split("/").length) {
      path = directory;
    }
  }
  return path;
};

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
    // [removed runs, lines removed, lines added] per hunk, for the activity.
    const changes = [];
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
        const removed = [];
        take(b, removed);
        changes.push([removed, b, d]);
        if (!ignored || b === 0) {
          push(out, commit, d);
          continue;
        }
        // Ignored revision: the new lines keep the authors of the lines they
        // replace, spread proportionally.
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
    if (this.main) this.state.recordActivity(file, commit, changes, ignored);
  }

  // Replay the filtered output of `GitLog`.
  replay(output, expected) {
    const state = this.state;
    let commit = -1;
    let hash = null;
    let ignored = false;
    let subject = "";
    let time = 0;
    let block = null;
    let replayed = 0;

    // Apply the blocks of the current commit. The renames first, at once, as
    // a commit can swap files.
    let blocks = [];
    const flush = () => {
      const before = state.total;
      // The lines added or removed per file, for the events.
      const delta = new Map();
      const track = (file, change) => {
        const total = state.total;
        change();
        if (state.total !== total) {
          delta.set(file, (delta.get(file) || 0) + state.total - total);
        }
      };
      // The files added by a merge importing a history keep their lines.
      const imported = this.imports.get(hash);
      if (imported) {
        this.imports.delete(hash);
        blocks = blocks.filter(block => {
          const runs = imported.get(block.to);
          let added = 0;
          for (let h = 2; h < block.hunks.length; h += 3) added += block.hunks[h];
          if (!block.added || !runs || lineCount(runs) !== added) return true;
          track(block.to, () => state.setFile(block.to, runs));
          imported.delete(block.to);
          return false;
        });
      }
      if (IMPORT_SUBJECT.test(subject) && blocks.some(block => WPT_FILE.test(block.to))) {
        state.commit_author[commit] = state.authorId(GENERATED);
      }
      let added = 0;
      for (const block of blocks) {
        for (let h = 2; h < block.hunks.length; h += 3) added += block.hunks[h];
      }
      const mechanical = ignored || (state.options.ignore_revs &&
        blocks.length >= MECHANICAL_FILES &&
        added <= MECHANICAL_LINES_PER_FILE * blocks.length);
      const renamed = blocks.filter(block => block.from !== block.to);
      const moved = renamed.map(block => state.files.get(block.from));
      renamed.forEach(block => track(block.from, () => state.removeFile(block.from)));
      renamed.forEach((block, i) => moved[i] &&
        track(block.to, () => state.setFile(block.to, moved[i])));
      for (const block of blocks) {
        // Binary files, symlinks and submodules have no lines.
        if (block.deleted || block.binary || block.mode === "120000" ||
          block.mode === "160000") {
          const runs = state.files.get(block.to);
          if (this.main && runs) {
            state.recordActivity(block.to, commit, [[runs, lineCount(runs), 0]], mechanical);
          }
          track(block.to, () => state.removeFile(block.to));
        } else if (block.hunks.length > 0) {
          track(block.to, () => this.applyHunks(block.to, block.hunks, commit,
            mechanical, hash, block.old_blob));
        }
      }
      if (this.main && commit > 0 && blocks.length) {
        state.recordCommit(commit, blocks.map(block => block.to));
      }
      blocks = [];
      const lines = state.total - before;
      if (this.main && Math.abs(lines) >= Math.max(EVENT_LINES, EVENT_SHARE * before)) {
        state.events.push([time, lines, hash, subject, EventPath(delta, lines)]);
      }
    };

    for (let start = 0; start < output.length;) {
      let end = output.indexOf(10, start);
      if (end === -1) end = output.length;
      const line = output.toString("utf8", start, end);
      start = end + 1;
      if (line.startsWith("\x01")) {
        flush();
        let author_time, commit_time, email;
        const separator = line.indexOf("\x02");
        subject = line.slice(separator + 1);
        [hash, author_time, commit_time, ...email] = line.slice(1, separator).split(" ");
        // Commits not touching the pathspecs are omitted.
        while (replayed < expected.length && expected[replayed].hash !== hash) {
          replayed++;
        }
        if (replayed++ === expected.length) {
          throw new Error(`Unexpected commit ${hash}`);
        }
        time = Number(commit_time);
        while (this.main && state.next_sample !== null && time >= state.next_sample) {
          state.sample(state.next_sample);
          state.next_sample += CONFIG.week;
        }
        if (this.main && state.next_sample === null) {
          state.next_sample = NextMonday(time);
        }
        commit = state.addCommit(Number(state.options.commit_date
          ? commit_time : author_time), email.join(" "));
        ignored = this.ignore_revs.has(hash) ||
          (state.options.ignore_revs && REFORMAT_SUBJECT.test(subject));
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
  const now = Math.floor(Date.now() / 1000);
  // The username of each author, or null for the bots.
  const usernameOf = state.authors.map(email => IsEmailValid(email)
    ? mailMap(email).split("@")[0]
    : null);

  await fs.writeFile(path.join(dir, "events.json"), JSON.stringify(
    state.events.map(([time, lines, hash, subject, path]) =>
      ({ date: Day(time), lines, hash, subject, path }))));

  const summary = await WriteDirectories(state, dir, usernameOf);

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

  // The lines each developer authored, alive today, in the directories of the
  // summary, as [index in the summary, lines, ...]. The generated files have
  // no author.
  const ownership = new Map(); // Username -> Map(index -> lines).
  const indices = new Map(summary.map((entry, index) => [entry.path, index]));
  for (const [file, runs] of state.files) {
    if (GENERATED_FILE.test(file)) continue;
    const owned = Directories(file).map(directory => indices.get(directory))
      .filter(index => index !== undefined);
    if (owned.length === 0) continue;
    for (let i = 0; i < runs.length; i += 2) {
      const author = state.commit_author[runs[i]];
      const username = author === -1 ? null : usernameOf[author];
      if (!username) continue;
      if (!ownership.has(username)) ownership.set(username, new Map());
      const directories = ownership.get(username);
      for (const index of owned) {
        directories.set(index, (directories.get(index) || 0) + runs[i + 1]);
      }
    }
  }
  const OWNED_MIN = 10; // Lines, below which a directory isn't listed.

  // The bus factor of each directory, from the lines authored alive.
  const authored = summary.map(() => []);
  for (const directories of ownership.values()) {
    for (const [index, lines] of directories) authored[index].push(lines);
  }
  summary.forEach((entry, index) => entry.bus_factor = BusFactor(authored[index]));
  await fs.writeFile(path.join(dir, "directories.json"), JSON.stringify(summary));

  // The breadth of each developer during the last years: their commits per
  // component, a directory two levels deep (Blink counting as one).
  const recent = Year(now) - RECENT_YEARS + 1;
  const level = directory => directory.split("/").length -
    (directory.startsWith("third_party/blink") ? 1 : 0);
  const components = new Map(); // Username -> Map(component -> commits).
  const commits = new Map(); // Username -> commits.
  for (const [directory, years] of state.activity_complete ? state.contributors : []) {
    if (directory !== "" && level(directory) !== 2) continue;
    for (const [year, authors] of years) {
      if (year < recent) continue;
      for (const [author, count] of authors) {
        const username = usernameOf[author];
        if (!username) continue;
        if (directory === "") {
          commits.set(username, (commits.get(username) || 0) + count);
          continue;
        }
        if (!components.has(username)) components.set(username, new Map());
        const counts = components.get(username);
        counts.set(directory, (counts.get(directory) || 0) + count);
      }
    }
  }
  const Breadth = username => {
    const counts = [...(components.get(username) || [])].sort((a, b) => b[1] - a[1]);
    const total = counts.reduce((sum, [, count]) => sum + count, 0);
    if (!total) return undefined;
    // The effective number of components: e^entropy.
    const entropy = -counts.reduce((sum, [, count]) =>
      sum + count / total * Math.log(count / total), 0);
    return {
      effective: Math.round(Math.exp(entropy) * 10) / 10,
      components: counts.slice(0, 5),
      share: counts[0][1] / total,
    };
  };

  // Whose lines were removed by whom, mechanical commits aside.
  const removedBy = new Map(); // Username -> Map(username -> lines).
  const removedOf = new Map(); // Username -> Map(username -> lines).
  const removedTotal = new Map(); // Username -> lines, by anyone.
  const add = (map, key, other, lines) => {
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(other, (map.get(key).get(other) || 0) + lines);
  };
  for (const [written, by] of state.activity_complete ? state.removals : []) {
    const writer = usernameOf[written];
    for (const [author, lines] of by) {
      const remover = usernameOf[author];
      if (writer) removedTotal.set(writer, (removedTotal.get(writer) || 0) + lines);
      if (writer && remover) {
        add(removedBy, writer, remover, lines);
        add(removedOf, remover, writer, lines);
      }
    }
  }
  const top = map => map && [...map].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Grouped by first letter, as one file per developer would make tens of
  // thousands of files to deploy.
  await fs.rm(path.join(dir, "usernames"), { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "usernames"), { recursive: true });
  const leaderboard = [];
  const buckets = new Map();
  for (const [username, lines] of usernames) {
    const first = lines.findIndex(value => value > 0);
    if (first === -1) continue;
    const bucket = UsernameBucket(username);
    if (!buckets.has(bucket)) buckets.set(bucket, { dates, users: {} });
    const directories = [...(ownership.get(username) || [])]
      .filter(([, owned]) => owned >= OWNED_MIN)
      .sort((a, b) => a[0] - b[0]);
    const breadth = Breadth(username);
    buckets.get(bucket).users[username] = {
      first,
      lines: lines.slice(first),
      directories: directories.flat(),
      commits: commits.get(username),
      breadth,
      removals: removedTotal.has(username) || removedOf.has(username) ? {
        total: removedTotal.get(username) || 0,
        self: removedBy.get(username)?.get(username) || 0,
        by: top(removedBy.get(username)),
        of: top(removedOf.get(username)),
      } : undefined,
    };
    leaderboard.push({
      username,
      lines: lines.at(-1),
      peak: Math.max(...lines),
      commits: commits.get(username),
      breadth: breadth?.effective,
    });
  }
  for (const [bucket, content] of buckets) {
    await fs.writeFile(path.join(dir, "usernames", `${bucket}.json`),
      JSON.stringify(content));
  }
  leaderboard.sort((a, b) => b.lines - a.lines);
  await fs.writeFile(path.join(dir, "leaderboard.json"),
    JSON.stringify(leaderboard.slice(0, 100)));

  // Cohorts: one row per sample, one column per year. With the activity and
  // the contributors of the whole repository.
  const keys = new Set();
  for (const [, years] of state.samples) {
    Object.keys(years).forEach(key => keys.add(key));
  }
  const years = [...keys].sort();
  const lines = state.samples.map(([, values]) => years.map(year => values[year] || 0));
  const total = lines.at(-1)?.reduce((a, b) => a + b, 0) || 0;
  // The last sample at least a year before the last one.
  const last_time = state.samples.at(-1)?.[0] ?? now;
  const year_ago_index = state.samples.findLastIndex(([time]) => time <= last_time - 365 * 86400);
  const total_year_ago = year_ago_index === -1
    ? 0
    : lines[year_ago_index].reduce((a, b) => a + b, 0);
  const activity = DirectoryActivity(state, "", usernameOf, now);
  await fs.writeFile(path.join(dir, "cohorts.json"), JSON.stringify({
    dates: state.samples.map(([time]) => Day(time)),
    years,
    lines,
    recent: state.samples.map(([, , recent]) => recent),
    median_age: MedianAge(state),
    ...activity,
    label: activity.activity
      ? ActivityLabel(activity.activity, total, total_year_ago, now)
      : undefined,
    bus_factor: BusFactor([...usernames.values()].map(series => series.at(-1))),
  }));
};

// The median age of the lines alive, in days, at the last sample.
const MedianAge = state => {
  const now = state.samples.at(-1)[0];
  const commits = [];
  for (let commit = 1; commit < state.alive.length; commit++) {
    if (state.alive[commit] > 0) commits.push(commit);
  }
  commits.sort((a, b) => state.commit_time[b] - state.commit_time[a]);
  const total = commits.reduce((sum, commit) => sum + state.alive[commit], 0);
  let seen = 0;
  for (const commit of commits) {
    seen += state.alive[commit];
    if (2 * seen >= total) {
      return Math.round((now - state.commit_time[commit]) / 86400);
    }
  }
  return null;
};

// Directories: for each with at least MIN_LINES lines, its lines per year
// over time (directories/<path>.json), and a summary (directories.json).
// The activity and the contributors of a directory ("" for the root), with
// the authors merged into usernames, and the bots left out.
const RECENT_YEARS = 3; // For the top authors and the breadth of developers.
const DirectoryActivity = (state, directory, usernameOf, now) => {
  const result = {};
  if (!state.activity_complete) return result;
  const counters = state.activity.get(directory);
  if (counters) {
    const years = [];
    for (let year = 0; year < YEARS; year++) {
      if (KINDS.some((_, kind) => counters[kind * YEARS + year])) years.push(year);
    }
    result.activity = {
      years: years.map(year => YEAR0 + year),
      ...Object.fromEntries(KINDS.map((kind, k) =>
        [kind, years.map(year => counters[k * YEARS + year])])),
    };
  }
  const byYear = state.contributors.get(directory);
  if (byYear) {
    const rows = [...byYear.keys()].sort((a, b) => a - b).map(year => {
      const users = new Map();
      for (const [author, commits] of byYear.get(year)) {
        const username = usernameOf[author];
        if (username) users.set(username, (users.get(username) || 0) + commits);
      }
      // Core: about a commit a month. Drive-by: one or two in the year.
      const row = { year: YEAR0 + year, commits: 0, core: 0, regular: 0, driveby: 0, users };
      for (const commits of users.values()) {
        row.commits += commits;
        row[commits >= 12 ? "core" : commits >= 3 ? "regular" : "driveby"]++;
      }
      return row;
    });
    result.contributors = Object.fromEntries(
      ["year", "commits", "core", "regular", "driveby"].map(key =>
        [key === "year" ? "years" : key, rows.map(row => row[key])]));
    const top = new Map();
    for (const row of rows) {
      if (row.year < YEAR0 + Year(now) - RECENT_YEARS + 1) continue;
      for (const [username, commits] of row.users) {
        top.set(username, (top.get(username) || 0) + commits);
      }
    }
    result.top = [...top].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }
  return result;
};

// The activity of the last 365 days, estimated from the yearly counts: the
// current year, and the part of the previous one still in the window, as if
// spread evenly over that year.
const RecentActivity = (activity, now) => {
  const year = YEAR0 + Year(now);
  const elapsed = now - Date.UTC(year, 0, 1) / 1000;
  const weight = Math.max(0, 1 - elapsed / (365 * 86400));
  const value = (kind, year) => {
    const i = activity.years.indexOf(year);
    return i === -1 ? 0 : activity[kind][i];
  };
  return Object.fromEntries(KINDS.map(kind =>
    [kind, value(kind, year) + weight * value(kind, year - 1)]));
};

// What happened to a directory during the last 365 days. Growing and
// Shrinking come from its lines alive, like its growth. Otherwise, from the
// lines changed.
const ActivityLabel = (activity, lines, year_ago, now) => {
  const growth = year_ago ? lines / year_ago - 1 : 0;
  if (growth > 0.05) return "Growing";
  if (growth < -0.05) return "Shrinking";
  const recent = RecentActivity(activity, now);
  const development = recent.new + recent.iteration;
  const refactoring = recent.rework + recent.mechanical;
  if (development + refactoring < 0.02 * lines) return "Dormant";
  if (refactoring > development) return "Refactored";
  return "Maintained";
};

// The number of authors having written half of the lines.
const BusFactor = lines => {
  const sorted = [...lines].sort((a, b) => b - a);
  const half = sorted.reduce((a, b) => a + b, 0) / 2;
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i];
    if (sum >= half) return i + 1;
  }
  return sorted.length;
};

// The files grouping the developers and the directories. The page computes
// them the same way.
const UsernameBucket = username =>
  /^[a-z0-9]/i.test(username) ? username[0].toLowerCase() : "_";
const DirectoryPack = directory => directory.startsWith("third_party/blink")
  ? "third_party/blink"
  : directory.split("/")[0];

const WriteDirectories = async (state, dir, usernameOf) => {
  const MIN_LINES = 1000;
  // The state is at the last commit, newer than the last sample.
  const now = Math.floor(Date.now() / 1000);
  const decode = values => {
    const result = new Map();
    for (let i = 0; i < values.length;) {
      const [id, recent, count] = [values[i], values[i + 1], values[i + 2]];
      const years = {};
      for (let j = 0; j < count; j++) {
        const year = values[i + 3 + 2 * j];
        years[year === 0 ? "unknown" : String(1999 + year)] = values[i + 4 + 2 * j];
      }
      result.set(state.directory_names[id], { recent, years });
      i += 3 + 2 * count;
    }
    return result;
  };
  // The samples, plus the current lines.
  const samples = [...state.directory_samples, [now, state.directoryValues(now)]]
    .map(([time, values]) => [time, decode(values)]);
  const current = samples.at(-1)[1];
  // The last sample at least a year old.
  const year_ago = samples.findLast(([time]) => time <= now - 365 * 86400)?.[1];

  const output = path.join(dir, "directories");
  await fs.rm(output, { recursive: true, force: true });
  const summary = [];
  // Grouped by top-level directory, as one file per directory would make
  // thousands of files to deploy.
  const packs = new Map();
  for (const [name, { recent, years }] of current) {
    const lines = Object.values(years).reduce((a, b) => a + b, 0);
    if (lines < MIN_LINES) continue;

    // The median age, in years, from the lines per month.
    const months = state.directories.get(name);
    let seen = 0;
    let median_age = null;
    for (let month = MONTHS - 1; month > 0; month--) {
      seen += months[month];
      if (2 * seen >= lines) {
        median_age = Math.round((Month(now) - month) / 1.2) / 10;
        break;
      }
    }
    const before = year_ago?.get(name);
    const lines_year_ago = before
      ? Object.values(before.years).reduce((a, b) => a + b, 0)
      : 0;
    const activity = DirectoryActivity(state, name, usernameOf, now);
    const last = YEAR0 + Year(now) - 1;
    const lastContributors = activity.contributors?.years.indexOf(last) ?? -1;
    summary.push({
      path: name,
      lines,
      recent,
      year_ago: lines_year_ago,
      median_age,
      label: activity.activity
        ? ActivityLabel(activity.activity, lines, lines_year_ago, now)
        : undefined,
      // The lines a year old or more, rewritten or removed in place during
      // the last 12 months: the moves aside, unlike the lines alive.
      reworked: activity.activity
        ? Math.round(RecentActivity(activity.activity, now).rework)
        : undefined,
      authors: lastContributors === -1 ? undefined : ["core", "regular", "driveby"]
        .reduce((sum, key) => sum + activity.contributors[key][lastContributors], 0),
      core: lastContributors === -1 ? undefined : activity.contributors.core[lastContributors],
    });

    const history = samples.filter(([, values]) => values.has(name));
    const keys = new Set();
    history.forEach(([, values]) => Object.keys(values.get(name).years)
      .forEach(key => keys.add(key)));
    const columns = [...keys].sort();
    const pack = DirectoryPack(name);
    if (!packs.has(pack)) packs.set(pack, {});
    packs.get(pack)[name] = {
      dates: history.map(([time]) => Day(time)),
      years: columns,
      lines: history.map(([, values]) => columns.map(year =>
        values.get(name).years[year] || 0)),
      recent: history.map(([, values]) => values.get(name).recent),
      ...activity,
    };
  }
  for (const [pack, content] of packs) {
    const file = path.join(output, `${pack}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(content));
  }
  summary.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return summary;
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
  if (state.options.ignore_revs) {
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
          [expected?.email, GENERATED].includes(state.authors[state.commit_author[commit]]) &&
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
  const values = name => flags
    .filter(f => f === `--${name}` || f.startsWith(`--${name}=`))
    .map(f => f.includes("=") ? f.slice(f.indexOf("=") + 1) : true);
  const flag = name => values(name)[0];
  const cwd = dirname;
  const dir = path.join(flag("output") || CONFIG.output_dir, dirname);
  const state_file = path.join(dir, "state.bin.gz");
  await fs.mkdir(dir, { recursive: true });

  let state;
  try {
    state = State.deserialize(await fs.readFile(state_file));
    console.log(`Loaded state at ${state.head}: ${state.files.size} files`);
  } catch (error) {
    state = new State();
    state.options = {
      ignore_revs: !flag("no-ignore-revs"),
      renames: !flag("no-renames"),
      whitespace: !!flag("ignore-whitespace"),
      commit_date: !!flag("commit-date"),
      exclude: values("exclude"),
    };
  }
  console.log("Options:", JSON.stringify(state.options));
  const pathspecs = [...(PATHSPECS[dirname] || PATHSPECS.default),
    ...state.options.exclude.map(glob => `:(exclude,glob)${glob}`)];

  // In the CI, there is no checkout, or a shallow one: fetch the history since
  // the last replayed commit. Its commit date is less than a week before the
  // next sample.
  const since = state.next_sample
    ? [`--shallow-since=${new Date((state.next_sample - 2 * CONFIG.week) * 1000).toISOString()}`]
    : [];
  const cloned = await fs.access(cwd).then(() => true, () => false);
  if (cloned) {
    if ((await run(["git", "rev-parse", "--is-shallow-repository"], cwd)).trim() === "true") {
      const branch = (await Branch(cwd)).slice("origin/".length);
      await run(["git", "fetch", ...since, "origin", branch], cwd);
    }
  } else {
    const repositories = JSON5.parse(await fs.readFile("../repositories.json5", "utf8"));
    const repo = repositories.find(repo => repo.dirname === dirname);
    await run(["git", "clone", "--single-branch", "--no-checkout", ...since,
      `https://github.com/${repo.owner}/${repo.repository}`, cwd], ".");
  }

  // The default branch, e.g. origin/main.
  const branch = await Branch(cwd);

  if (flag("validate")) {
    const count = flag("validate") === true ? 50 : Number(flag("validate"));
    await Validate(state, cwd, dir, pathspecs, count);
    return;
  }

  const ignore_revs = new Set();
  if (state.options.ignore_revs) {
    try {
      const text = await run(["git", "show", `${branch}:.git-blame-ignore-revs`], cwd);
      for (const line of text.split("\n")) {
        const hash = line.trim();
        if (/^[0-9a-f]{40}$/.test(hash)) ignore_revs.add(hash);
      }
    } catch (error) { }
  }
  console.log(`Ignored revisions: ${ignore_revs.size}`);

  // The commits to replay, oldest first, with their first parent.
  const range = state.head ? [`${state.head}..${branch}`] : [branch];
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
  // Their merges are the first commits descending from a root other than the
  // main one. Checking every merge would be slow for the repositories having
  // many.
  const candidates = new Set();
  if (!shallow) {
    const head = commits.at(-1).hash;
    const roots = (await run(["git", "rev-list", "--max-parents=0", head], cwd))
      .split("\n").filter(Boolean);
    for (const root of roots) {
      const descendants = new Set((await run(["git", "rev-list",
        "--ancestry-path", `${root}..${head}`], cwd)).split("\n"));
      const merge = commits.find(commit => descendants.has(commit.hash));
      if (merge) candidates.add(merge.hash);
    }
  }
  for (const commit of commits) {
    if (!commit.second || !candidates.has(commit.hash)) continue;
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
    for (const [file, runs] of state.files) state.account(file, runs, -1);
    replayer.imports.set(commit.hash, state.files);
    replayer.main = true;
    state.files = files;
  }

  await ReplayChunks(replayer, commits, cwd, pathspecs);
  console.log(`Desync: ${replayer.desync}`);
};

// The commits of the first-parent history, oldest first.
const Branch = cwd => run(["git", "symbolic-ref", "--short",
  "refs/remotes/origin/HEAD"], cwd).then(ref => ref.trim(), () => "origin/main");

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
      pending[next] = GitLog(cwd, chunks[next++], pathspecs, state.options)
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
