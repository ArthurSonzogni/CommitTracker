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
//   --state=<file>      Read and write the state here instead of <output>/<repo>/state.bin.gz.
//   --write-only        Write the JSON output from the state without fetching git.
//   --rebuild-recent    Fill the commits of the last year, for the
//                       contributors of the last 365 days, from the history
//                       instead of replaying it. For a state from before they
//                       were kept. It needs a year of history, cloned if
//                       missing.
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
import { loadOrganizations } from "./organizations.mjs";

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

// The lines nobody wrote by hand count nowhere: not in the lines alive, the
// years, the directories or the developers. They are still replayed, for the
// lines moved from or to them to keep their authors:
// - The generated files: by their path, or by a header saying so (see
//   GENERATED_HEADER).
// - The vendored code: the third_party/-like directories, the npm packages,
//   the directories with vendoring metadata (Firefox's moz.yaml), and the
//   copies of the upstream test suites and benchmarks.
// - The baselines produced by the tools: the -expected.txt files, the
//   expectations of the compilers.
// - The imports of the web-platform-tests and the WebGPU conformance tests,
//   sometimes landed by developers, and the commits of the import bots.
const GENERATED = "generated";
const GENERATED_PATHS = [
  "(^|/)(gen|generated|generated_[^/]*)/",
  "autogen",
  // Vendored, at any depth, but Chromium's own Blink.
  "(?!^third_party/(blink|WebKit)/)(^|/)(third_party|ThirdParty|third-party|thirdparty|vendor|vendored|node_modules)/",
  "(^|/)(package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|Cargo\\.lock|go\\.sum|poetry\\.lock|Gemfile\\.lock)$",
  "\\.min\\.(js|css)$|\\.js\\.map$|\\.pb\\.(go|h|cc)$|_pb2(_grpc)?\\.pyi?$",
  // The baselines. The -expected.html of the reftests are written by hand.
  "-expected\\.(txt|png|wav|pdf)$|\\.expected\\.[a-z0-9]+$|\\.expected/|(^|/)bytecode_expectations/",
];
const GENERATED_PATHS_OF = {
  chromium: [
    "WPT_BASE_MANIFEST[^/]*\\.json$",
    "^testing/buildbot/(?!trybot_analyze_config\\.json$)[^/]*\\.json$",
    "^third_party/(blink|WebKit)/perf_tests/(speedometer[^/]*|MotionMark)/",
    "^chrome/test/data/dromaeo/",
  ],
  firefox: [
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
  ],
  webkit: [
    "^LayoutTests/(imported|webgl)/",
    "^LayoutTests/platform/",
    "^JSTests/(test262|ChakraCore|wasm/spec-tests|es6|mozilla)/",
    "^PerformanceTests/(JetStream[^/]*|JSBench|Speedometer[^/]*|MotionMark[^/]*|ARES-6|SunSpider|Octane|Kraken|Dromaeo)/",
    "^Websites/browserbench\\.org/",
  ],
  // The WPT copy, but Servo's own tests in tests/wpt/mozilla/.
  servo: ["^tests/wpt/(tests|webgl|webgpu|meta|meta-legacy)/", "^tests/blink_perf_tests/"],
  ladybird: ["(^|/)wpt-import/"],
  v8: ["^test/webkit/", "^test/unittests/gay-[^/]*\\.cc$"],
  skia: ["^modules/canvaskit/npm_build/", "^resources/skottie/"],
  // The Khronos headers, and the test lists of the regres bot.
  swiftshader: ["^include/(vulkan|vk_video|KHR|EGL|GLES[^/]*|Wayland|xcb)/", "^tests/regres/testlists/"],
  angle: ["^include/(GLES[^/]*|EGL|KHR|CL|vulkan|vk_video)/", "^src/tests/gl_tests/media/"],
  webrtc: ["^rtc_tools/rtc_event_log_visualizer/conversational_speech_en\\.h$"],
  llvm: ["^libc/test/src/math/exhaustive/.*\\.wc$"],
  // The TPM specification, from which trunks is generated.
  chromeos: ["^trunks/generator/raw_"],
};
let GENERATED_FILE = new RegExp(GENERATED_PATHS.join("|"));
// The rules of a repository, before replaying or writing it.
const UseRepository = dirname => {
  GENERATED_FILE = new RegExp(
    [...GENERATED_PATHS, ...(GENERATED_PATHS_OF[dirname] || [])].join("|"));
};
// A file whose first lines say it is generated (POSIX ERE, for awk), like the
// tests of LLVM whose assertions are generated. The templates generating them
// say so too, but are written by hand.
const GENERATED_HEADER = "@generated|DO NOT EDIT|" +
  "[Tt]his (file|code|header) (is|was|has been) (auto(matically)?[- ]?)?generated|" +
  "AUTO-?GENERATED|[Aa]uto-?generated (file|code|by|from|with|using)|" +
  "[Aa]utomatically generated";
const GENERATED_HEADER_LINES = 40;
const TEMPLATE_FILE = /\.(tmpl|template|in|j2|jinja2?|hbs|mako)$|(^|\/)templates?\//;
// The metadata of a vendored directory.
const VENDORED_METADATA = /(^|\/)moz\.yaml$/;
// The bots importing code: the syncs of the web-platform-tests, the rolls,
// the translations. Not the commit queues, landing the code of developers.
const IMPORT_BOT = /^(\d+\+github-actions\[bot\]|wptsync|release\+treescript|\d+\+servo-wpt-sync|servo-ops|infra@servo\.org|swiftshader\.regress|devtools-ci-autoroll-builder)(@|$)/;
// The bots reformatting code, whose commits are mechanical.
const REFORMAT_BOT = /^blink-reformat@/;
const IMPORT_SUBJECT =
  /^(manual(ly)? )?import(ing)?\b(?! maps?\b| text\b)|\b(sync|update) (wpt|cts)\b/i;
const WPT_FILE = new RegExp([
  "^third_party/(blink/web_tests|WebKit/LayoutTests)/(external|imported)/",
  "^tests/wpt/", // Servo.
].join("|"));
// A commit changing at least this many lines, and this share of the total, is
// an event.
const EVENT_LINES = 10000;
const LANG_EVENT_LINES = 2000;
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

const LANGUAGES = [
  {
    id: "cpp",
    label: "C/C++",
    hint: "C, C++ & Objective-C/C++ (.c, .cc, .cpp, .h, .m, .mm, …)",
    ext: /^(c|cc|cpp|cxx|c\+\+|h|hh|hpp|hxx|inc|inl|ipp|tpp|m|mm)$/i,
  },
  {
    id: "web",
    label: "HTML/JS/TS",
    hint: "HTML, CSS, JavaScript & TypeScript (.html, .css, .js, .ts, …)",
    ext: /^(html|htm|xhtml|xht|css|scss|js|mjs|cjs|jsx|ts|mts|cts|tsx)$/i,
  },
  {
    id: "java",
    label: "Java",
    hint: "Java & Kotlin (.java, .kt)",
    ext: /^(java|kt)$/i,
  },
  {
    id: "python",
    label: "Python",
    hint: "Python (.py, .pyi)",
    ext: /^(py|pyi|pyw)$/i,
  },
  {
    id: "rust",
    label: "Rust",
    hint: "Rust (.rs)",
    ext: /^rs$/i,
  },
];
const LANG_COUNT = LANGUAGES.length;
const LanguageIndex = file => {
  const slash = file.lastIndexOf("/");
  const base = slash === -1 ? file : file.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return -1;
  const ext = base.slice(dot + 1);
  for (let i = 0; i < LANG_COUNT; i++) {
    if (LANGUAGES[i].ext.test(ext)) return i;
  }
  return -1;
};
// Language-scoped directory keys in `directories`, `activity`, `contributors`,
// and `recent` use a leading colon, which never begins a tracked repository
// path (`:cpp` for the root, `:cpp/chrome` for a subdirectory).
const LangScopeKey = (langIndex, directory) =>
  directory ? `:${LANGUAGES[langIndex].id}/${directory}` : `:${LANGUAGES[langIndex].id}`;

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

// The diff of a range of commits, with only the lines we need: the headers,
// and the added lines saying the file is generated, within its first lines.
// The content lines start with +, - or space, so the filter can't confuse them
// with headers.
const GitLog = (cwd, chunk, pathspecs, options) => {
  const format = "--format=%x01%H %at %ct %ae%x02%s%x02" +
    "%(trailers:key=Reviewed-by,valueonly,separator=%x03)";
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
  const filter = `LC_ALL=C awk '
    /^(\x01|diff --git |rename (from|to) |(new|deleted) file mode |index |new mode |Binary files )/ {
      print; line = ${GENERATED_HEADER_LINES} + 1; next }
    /^@@ / { print; split($3, start, ","); line = substr(start[1], 2) + 0; next }
    /^[+]/ { if (line <= ${GENERATED_HEADER_LINES} && /${GENERATED_HEADER}/) print; line++ }'`;
  // Kept as a Buffer, outside of the JavaScript heap: large refactorings have
  // millions of hunks.
  // bash, as the dash of the CI has no pipefail.
  return run(["bash", "-c", `set -o pipefail; ${git} | ${filter}`], cwd, true);
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
    this.lang_alive = LANGUAGES.map(() => [0]); // Language -> commit -> lines.
    this.lang_total = new Array(LANG_COUNT).fill(0);
    this.has_lang_history = true;
    // The commits adding or removing many lines at once, explaining the steps
    // of the charts: [time, lines, hash, subject, path].
    this.events = [];
    this.lang_events = LANGUAGES.map(() => []);
    // The files with a generated header, and the vendored directories: their
    // lines count nowhere, like those of GENERATED_FILE.
    this.marked = new Set();
    this.vendored = new Set();
    this.excluded_authors = []; // Author id -> whose lines count nowhere.
    // Commit index -> author ids of its reviewers, from the Reviewed-by
    // trailers of Gerrit.
    this.reviewers = new Map();
    this.files = new Map();    // Path -> runs, as an Int32Array.
    this.samples = [];         // [time, {year: lines}, recent].
    this.author_samples = [];  // [time, [author id, lines, ...]].
    this.lang_samples = LANGUAGES.map(() => []);
    this.lang_author_samples = LANGUAGES.map(() => []);
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
    this.lang_removals = LANGUAGES.map(() => new Map());
    // Directory -> [time, author id, ...]: the commits of the last
    // RECENT_WINDOW, and the time since which they are all there (0 when
    // replayed from the first commit, null when missing).
    this.recent = new Map();
    this.recent_since = 0;
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

  // "Name <email>", separated by \x03.
  setReviewers(commit, trailers) {
    const ids = [];
    for (const trailer of trailers.split("\x03")) {
      const email = /<([^<>]+)>/.exec(trailer)?.[1];
      if (!email || email === this.authors[this.commit_author[commit]]) continue;
      const id = this.authorId(email);
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length) this.reviewers.set(commit, ids);
  }

  // Whether the lines of this author count nowhere: the imports.
  excludedAuthor(author) {
    if (author < 0) return false;
    let excluded = this.excluded_authors[author];
    if (excluded === undefined) {
      const email = this.authors[author];
      excluded = this.excluded_authors[author] = email === GENERATED || IMPORT_BOT.test(email);
    }
    return excluded;
  }

  // Whether the lines of this file count nowhere.
  excludedFile(file) {
    if (GENERATED_FILE.test(file) || this.marked.has(file)) return true;
    if (this.vendored.size === 0) return false;
    return Directories(file).some(directory => this.vendored.has(directory));
  }

  // Changes whether a file has a generated header, or a directory is vendored,
  // recounting their lines.
  setMarked(file, marked) {
    if (this.marked.has(file) === marked) return;
    const runs = this.files.get(file);
    if (runs) this.account(file, runs, -1);
    if (marked) this.marked.add(file);
    else this.marked.delete(file);
    if (runs) this.account(file, runs, 1);
  }

  setVendored(directory, vendored) {
    if (this.vendored.has(directory) === vendored) return;
    const files = [...this.files].filter(([file]) => file.startsWith(directory + "/"));
    for (const [file, runs] of files) this.account(file, runs, -1);
    if (vendored) this.vendored.add(directory);
    else this.vendored.delete(directory);
    for (const [file, runs] of files) this.account(file, runs, 1);
  }

  addCommit(time, email) {
    this.commit_time.push(time);
    this.commit_author.push(this.authorId(email));
    this.commit_month.push(Month(time));
    this.alive.push(0);
    for (let l = 0; l < LANG_COUNT; l++) this.lang_alive[l].push(0);
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
    if (this.excludedFile(file)) return;
    const rawDirs = Directories(file);
    const lang = LanguageIndex(file);
    const keys = lang === -1
      ? rawDirs
      : [...rawDirs, ...rawDirs.map(d => LangScopeKey(lang, d))];
    const directories = keys.map(directory => {
      let arr = this.directories.get(directory);
      if (!arr) {
        arr = new Int32Array(MONTHS);
        this.directories.set(directory, arr);
      }
      return arr;
    });
    const langAlive = lang === -1 ? null : this.lang_alive[lang];
    for (let i = 0; i < runs.length; i += 2) {
      const commit = runs[i];
      if (this.excludedAuthor(this.commit_author[commit])) continue;
      const lines = sign * runs[i + 1];
      this.alive[commit] += lines;
      this.total += lines;
      if (langAlive) {
        langAlive[commit] += lines;
        this.lang_total[lang] += lines;
      }
      const month = this.commit_month[commit];
      for (const months of directories) months[month] += lines;
    }
  }

  // The lines changed in `file` by `commit`: [removed runs, lines removed,
  // lines added] per hunk.
  recordActivity(file, commit, changes, mechanical) {
    if (this.excludedFile(file) || this.excludedAuthor(this.commit_author[commit])) return;
    const time = this.commit_time[commit];
    const year = Year(time);
    const author = this.commit_author[commit];
    const rawDirs = ["", ...Directories(file)];
    const lang = LanguageIndex(file);
    const keys = lang === -1
      ? rawDirs
      : [...rawDirs, ...rawDirs.map(d => LangScopeKey(lang, d))];
    const counters = keys.map(directory => {
      let arr = this.activity.get(directory);
      if (!arr) {
        arr = new Int32Array(KINDS.length * YEARS);
        this.activity.set(directory, arr);
      }
      return arr;
    });
    const add = (kind, lines) => {
      if (lines <= 0) return;
      const idx = kind * YEARS + year;
      for (const counter of counters) counter[idx] += lines;
    };
    const langRemovals = lang === -1 ? null : this.lang_removals[lang];
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
        if (written < 0 || author < 0) continue;
        if (!this.removals.has(written)) this.removals.set(written, new Map());
        const by = this.removals.get(written);
        by.set(author, (by.get(author) || 0) + lines);
        if (langRemovals) {
          if (!langRemovals.has(written)) langRemovals.set(written, new Map());
          const langBy = langRemovals.get(written);
          langBy.set(author, (langBy.get(author) || 0) + lines);
        }
      }
    }
  }

  // A commit touching these files, for the contributors of their directories.
  recordCommit(commit, files) {
    const time = this.commit_time[commit];
    const year = Year(time);
    const author = this.commit_author[commit];
    const directories = CommitDirectories(this, files);
    if (!directories) return;
    this.recordRecent(time, author, directories);
    for (const directory of directories) {
      if (!this.contributors.has(directory)) this.contributors.set(directory, new Map());
      const years = this.contributors.get(directory);
      if (!years.has(year)) years.set(year, new Map());
      const authors = years.get(year);
      authors.set(author, (authors.get(author) || 0) + 1);
    }
  }

  recordRecent(time, author, directories) {
    for (const directory of directories) {
      if (!this.recent.has(directory)) this.recent.set(directory, []);
      this.recent.get(directory).push(time, author);
    }
  }

  // Forget the recent commits older than the window.
  pruneRecent(time) {
    for (const [directory, commits] of this.recent) {
      let i = 0;
      while (i < commits.length && commits[i] < time - RECENT_WINDOW) i += 2;
      if (i === commits.length) this.recent.delete(directory);
      else if (i > 0) this.recent.set(directory, commits.slice(i));
    }
  }

  sample(time) {
    const years = {};
    const authors = new Map();
    let recent = 0; // Lines of the last 365 days.
    const langYears = LANGUAGES.map(() => ({}));
    const langAuthors = LANGUAGES.map(() => new Map());
    const langRecent = new Array(LANG_COUNT).fill(0);
    // Every 4 weeks for the directories and the authors, as there are many of them.
    const quadWeekly = this.samples.length % 4 === 0;
    const cutoff = time - 365 * 86400;
    for (let commit = 0; commit < this.alive.length; commit++) {
      const lines = this.alive[commit];
      if (lines === 0) continue;
      const year = commit === UNKNOWN
        ? "unknown"
        : new Date(this.commit_time[commit] * 1000).getUTCFullYear();
      const isRecent = commit !== UNKNOWN && this.commit_time[commit] > cutoff;
      const author = this.commit_author[commit];
      years[year] = (years[year] || 0) + lines;
      if (isRecent) recent += lines;
      if (quadWeekly) authors.set(author, (authors.get(author) || 0) + lines);
      for (let l = 0; l < LANG_COUNT; l++) {
        const lLines = this.lang_alive[l][commit];
        if (lLines === 0) continue;
        langYears[l][year] = (langYears[l][year] || 0) + lLines;
        if (isRecent) langRecent[l] += lLines;
        if (quadWeekly && author >= 0) {
          const map = langAuthors[l];
          map.set(author, (map.get(author) || 0) + lLines);
        }
      }
    }
    this.samples.push([time, years, recent]);
    for (let l = 0; l < LANG_COUNT; l++) {
      if (this.lang_samples[l].length > 0 || Object.keys(langYears[l]).length > 0) {
        this.lang_samples[l].push([time, langYears[l], langRecent[l]]);
      }
    }
    if (quadWeekly) {
      this.sampleDirectories(time);
      this.author_samples.push([time, [...authors].flat()]);
      for (let l = 0; l < LANG_COUNT; l++) {
        if (this.lang_author_samples[l].length > 0 || langAuthors[l].size > 0) {
          this.lang_author_samples[l].push([time, [...langAuthors[l]].flat()]);
        }
      }
    }
    this.pruneRecent(time);
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
    for (const directory of [...this.activity.keys(), ...this.contributors.keys(),
      ...this.recent.keys()]) {
      this.directoryId(directory);
    }
    const header = Buffer.from(JSON.stringify({
      version: this.has_lang_history ? 2 : 1,
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
      recent: this.recent.size,
      recent_since: this.recent_since,
      reviewed: this.reviewers.size,
      marked: [...this.marked],
      vendored: [...this.vendored],
      ...(this.has_lang_history ? {
        lang_samples: this.lang_samples,
        lang_events: this.lang_events,
        lang_author_samples: this.lang_author_samples.map(s => s.length),
        lang_removals: this.lang_removals.map(m => m.size),
      } : {}),
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
    for (const [directory, commits] of this.recent) {
      varint(this.directoryId(directory));
      varint(commits.length / 2);
      for (const value of commits) varint(value);
    }
    for (const [written, by] of this.removals) {
      varint(written);
      varint(by.size);
      for (const [author, lines] of by) {
        varint(author);
        varint(lines);
      }
    }
    for (const [commit, ids] of this.reviewers) {
      varint(commit);
      varint(ids.length);
      ids.forEach(varint);
    }
    if (this.has_lang_history) {
      for (let l = 0; l < LANG_COUNT; l++) {
        for (const [time, values] of this.lang_author_samples[l]) {
          varint(Math.floor(time));
          varint(values.length / 2);
          for (const value of values) varint(value);
        }
      }
      for (let l = 0; l < LANG_COUNT; l++) {
        for (const [written, by] of this.lang_removals[l]) {
          varint(written);
          varint(by.size);
          for (const [author, lines] of by) {
            varint(author);
            varint(lines);
          }
        }
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
    state.has_lang_history = (header.version || 1) >= 2;
    state.head = header.head;
    state.base = header.base;
    state.options = { ...DEFAULT_OPTIONS, ...header.options };
    state.next_sample = header.next_sample;
    state.authors = header.authors;
    state.authors.forEach((email, id) => state.author_ids.set(email, id));
    state.samples = header.samples;
    state.author_samples = header.author_samples;
    state.events = header.events || [];
    if (header.lang_samples) state.lang_samples = header.lang_samples;
    if (header.lang_events) state.lang_events = header.lang_events;
    state.activity_complete = header.activity_complete === true;
    state.recent_since = header.recent_since ?? null;
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
    state.lang_alive = LANGUAGES.map(() => new Array(header.commits).fill(0));
    state.marked = new Set(header.marked || []);
    state.vendored = new Set(header.vendored || []);
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
    for (let i = 0; i < (header.recent || 0); i++) {
      const directory = state.directory_names[varint()];
      const commits = new Array(varint() * 2);
      for (let j = 0; j < commits.length; j++) commits[j] = varint();
      state.recent.set(directory, commits);
    }
    for (let i = 0; i < (header.removals || 0); i++) {
      const by = new Map();
      state.removals.set(varint(), by);
      for (let j = varint(); j > 0; j--) {
        const author = varint();
        by.set(author, varint());
      }
    }
    for (let i = 0; i < (header.reviewed || 0); i++) {
      const commit = varint();
      const ids = new Array(varint());
      for (let j = 0; j < ids.length; j++) ids[j] = varint();
      state.reviewers.set(commit, ids);
    }
    if (header.lang_author_samples) {
      for (let l = 0; l < header.lang_author_samples.length; l++) {
        const list = state.lang_author_samples[l];
        for (let i = 0; i < header.lang_author_samples[l]; i++) {
          const time = varint();
          const values = new Array(varint() * 2);
          for (let j = 0; j < values.length; j++) values[j] = varint();
          if (list) list.push([time, values]);
        }
      }
    }
    if (header.lang_removals) {
      for (let l = 0; l < header.lang_removals.length; l++) {
        const map = state.lang_removals[l];
        for (let i = 0; i < header.lang_removals[l]; i++) {
          const by = new Map();
          const written = varint();
          for (let j = varint(); j > 0; j--) {
            const author = varint();
            by.set(author, varint());
          }
          if (map) map.set(written, by);
        }
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
      const langBefore = state.lang_total.slice();
      // The lines added or removed per file, for the events.
      const delta = new Map();
      const langDelta = LANGUAGES.map(() => new Map());
      const track = (file, change) => {
        const total = state.total;
        const lTotals = state.lang_total.slice();
        change();
        if (state.total !== total) {
          delta.set(file, (delta.get(file) || 0) + state.total - total);
        }
        for (let l = 0; l < LANG_COUNT; l++) {
          const diff = state.lang_total[l] - lTotals[l];
          if (diff !== 0) {
            langDelta[l].set(file, (langDelta[l].get(file) || 0) + diff);
          }
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
      // A generated header follows its file.
      const marked = renamed.map(block => state.marked.has(block.from));
      renamed.forEach(block => track(block.from, () => {
        state.removeFile(block.from);
        state.setMarked(block.from, false);
      }));
      renamed.forEach((block, i) => moved[i] && track(block.to, () => {
        state.setMarked(block.to, marked[i]);
        state.setFile(block.to, moved[i]);
      }));
      for (const block of blocks) {
        // Binary files, symlinks and submodules have no lines.
        if (block.deleted || block.binary || block.mode === "120000" ||
          block.mode === "160000") {
          const runs = state.files.get(block.to);
          if (this.main && runs) {
            state.recordActivity(block.to, commit, [[runs, lineCount(runs), 0]], mechanical);
          }
          track(block.to, () => {
            state.removeFile(block.to);
            state.setMarked(block.to, false);
          });
        } else if (block.hunks.length > 0) {
          track(block.to, () => this.applyHunks(block.to, block.hunks, commit,
            mechanical, hash, block.old_blob));
        }
        if (block.generated_header && !TEMPLATE_FILE.test(block.to)) {
          track(block.to, () => state.setMarked(block.to, true));
        }
        if (VENDORED_METADATA.test(block.to) && (block.added || block.deleted)) {
          const directory = block.to.split("/").slice(0, -1).join("/");
          if (directory) track(directory, () => state.setVendored(directory, !block.deleted));
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
      if (this.main) {
        for (let l = 0; l < LANG_COUNT; l++) {
          const lLines = state.lang_total[l] - langBefore[l];
          if (Math.abs(lLines) >= Math.max(LANG_EVENT_LINES, EVENT_SHARE * langBefore[l])) {
            state.lang_events[l].push([time, lLines, hash, subject, EventPath(langDelta[l], lLines)]);
          }
        }
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
        // The subject, then the reviewers.
        const reviewers = line.indexOf("\x02", separator + 1);
        subject = line.slice(separator + 1, reviewers === -1 ? undefined : reviewers);
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
        if (reviewers !== -1) state.setReviewers(commit, line.slice(reviewers + 1));
        ignored = this.ignore_revs.has(hash) || (state.options.ignore_revs &&
          (REFORMAT_SUBJECT.test(subject) || REFORMAT_BOT.test(email.join(" "))));
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
      } else if (line.startsWith("+")) {
        // A line of the GENERATED_HEADER, from the filter.
        block.generated_header = true;
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
  const sampleNow = state.samples.at(-1)?.[0] ?? now;
  const { getOrganization, hasDynamicAffiliation } = await loadOrganizations();
  // The canonical email and username of each author, or null for the bots.
  const emailOf = state.authors.map(email => IsEmailValid(email) && !IMPORT_BOT.test(email)
    ? mailMap(email)
    : null);
  const usernameOf = emailOf.map(email => email ? email.split("@")[0] : null);
  const staticOrgOf = emailOf.map(email => email && !hasDynamicAffiliation(email)
    ? getOrganization(email, "")
    : null);
  const organizationOf = (author, time) => author < 0 || !emailOf[author]
    ? null
    : staticOrgOf[author] ?? getOrganization(emailOf[author], Day(time));
  const commitOrg = state.commit_time.map((time, commit) =>
    commit === UNKNOWN ? null : organizationOf(state.commit_author[commit], time));

  const review_start = ReviewStart(state);
  const reviewersOf = commit => review_start !== null && state.commit_time[commit] >= review_start
    ? state.reviewers.get(commit) || []
    : null;
  // The people who know each commit: its author and its reviewers.
  const people = commit => {
    const author = state.commit_author[commit];
    const known = author === -1 ? [] : [usernameOf[author]];
    for (const id of reviewersOf(commit) || []) known.push(usernameOf[id]);
    return [...new Set(known.filter(Boolean))];
  };

  // Decode directory samples once; both the repository root and each language
  // slice project from the same decoded maps.
  const decodeDirectoryValues = values => {
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
  const decodedDirSamples = [...state.directory_samples, [now, state.directoryValues(now)]]
    .map(([time, values]) => [time, decodeDirectoryValues(values)]);

  const MIN_LANGUAGE_LINES = 100;
  await fs.rm(path.join(dir, "languages"), { recursive: true, force: true });

  const makeScope = (langIndex, outDir, summary) => ({
    langIndex,
    outDir,
    summary,
    indices: new Map(summary.map((entry, index) => [entry.path, index])),
    ownership: new Map(),       // Username -> Map(index -> lines).
    reviewership: new Map(),    // Username -> Map(index -> lines).
    orgOwnership: new Map(),    // Organization -> Map(index -> lines).
    orgReviewership: new Map(), // Organization -> Map(index -> lines).
    knownLines: new Map(),      // Index -> Map(commit -> lines) in review era.
    reviewedLines: new Map(),   // Index -> lines with a human reviewer.
    allLines: new Map(),        // Index -> lines with an author or reviewer.
  });

  const rootSummary = await WriteDirectories(
    state, dir, usernameOf, organizationOf, decodedDirSamples,
    { langIndex: -1, minLines: 1000, hasHistory: true, now });
  const rootScope = makeScope(-1, dir, rootSummary);

  const availableLanguages = [];
  const langScopes = new Map();
  for (let l = 0; l < LANG_COUNT; l++) {
    const lang = LANGUAGES[l];
    const rootTotal = state.lang_total[l] || 0;
    if (rootTotal < MIN_LANGUAGE_LINES) continue;
    availableLanguages.push({
      id: lang.id,
      label: lang.label,
      hint: lang.hint,
      lines: rootTotal,
    });
    const langDir = path.join(dir, "languages", lang.id);
    await fs.mkdir(langDir, { recursive: true });
    const minLines = Math.min(1000, Math.max(200, Math.floor(rootTotal * 0.005)));
    const langSummary = await WriteDirectories(
      state, langDir, usernameOf, organizationOf, decodedDirSamples,
      { langIndex: l, minLines, hasHistory: state.has_lang_history, now });
    langScopes.set(l, makeScope(l, langDir, langSummary));
  }

  // Single pass over all surviving file runs to populate author and reviewer
  // ownership for both the whole repository and each active language.
  const credit = (map, owner, owned, lines) => {
    let directories = map.get(owner);
    if (!directories) {
      directories = new Map();
      map.set(owner, directories);
    }
    for (const index of owned) directories.set(index, (directories.get(index) || 0) + lines);
  };
  const creditScope = (scope, owned, commit, lines, username, org, reviewers, reviewerOrgs, hasHumanReviewer) => {
    if (username) credit(scope.ownership, username, owned, lines);
    if (org) credit(scope.orgOwnership, org, owned, lines);
    if (reviewers) {
      for (const id of reviewers) {
        const reviewer = usernameOf[id];
        if (!reviewer || reviewer === username) continue;
        credit(scope.reviewership, reviewer, owned, lines);
      }
      for (const revOrg of reviewerOrgs) {
        credit(scope.orgReviewership, revOrg, owned, lines);
      }
    }
    if (hasHumanReviewer) {
      for (const index of owned) {
        scope.reviewedLines.set(index, (scope.reviewedLines.get(index) || 0) + lines);
      }
    }
    if (!username && !reviewers?.length) return;
    for (const index of owned) {
      scope.allLines.set(index, (scope.allLines.get(index) || 0) + lines);
    }
    if (!reviewers) return;
    for (const index of owned) {
      let commits = scope.knownLines.get(index);
      if (!commits) {
        commits = new Map();
        scope.knownLines.set(index, commits);
      }
      commits.set(commit, (commits.get(commit) || 0) + lines);
    }
  };

  for (const [file, runs] of state.files) {
    if (state.excludedFile(file)) continue;
    const rawDirs = Directories(file);
    const rootOwned = rawDirs.map(d => rootScope.indices.get(d)).filter(i => i !== undefined);
    rootOwned.push(-1);
    const lang = LanguageIndex(file);
    const langScope = lang === -1 ? null : langScopes.get(lang);
    const langOwned = langScope
      ? [...rawDirs.map(d => langScope.indices.get(d)).filter(i => i !== undefined), -1]
      : null;
    for (let i = 0; i < runs.length; i += 2) {
      const [commit, lines] = [runs[i], runs[i + 1]];
      const author = state.commit_author[commit];
      if (author !== -1 && state.excludedAuthor(author)) continue;
      const username = author === -1 ? null : usernameOf[author];
      const org = commitOrg[commit];
      const reviewers = reviewersOf(commit);
      const reviewerOrgs = reviewers ? new Set() : null;
      let hasHumanReviewer = false;
      for (const id of reviewers || []) {
        const reviewer = usernameOf[id];
        if (!reviewer || reviewer === username) continue;
        hasHumanReviewer = true;
        const revOrg = organizationOf(id, state.commit_time[commit]);
        if (revOrg) reviewerOrgs.add(revOrg);
      }
      creditScope(rootScope, rootOwned, commit, lines, username, org, reviewers, reviewerOrgs, hasHumanReviewer);
      if (langScope) {
        creditScope(langScope, langOwned, commit, lines, username, org, reviewers, reviewerOrgs, hasHumanReviewer);
      }
    }
  }

  const synthesizeFromAlive = (alive, time) => {
    const years = {};
    const authors = new Map();
    let recent = 0;
    const cutoff = time - 365 * 86400;
    for (let commit = 0; commit < alive.length; commit++) {
      const count = alive[commit];
      if (count === 0) continue;
      const year = commit === UNKNOWN
        ? "unknown"
        : new Date(state.commit_time[commit] * 1000).getUTCFullYear();
      years[year] = (years[year] || 0) + count;
      if (commit !== UNKNOWN && state.commit_time[commit] > cutoff) recent += count;
      const author = state.commit_author[commit];
      if (author >= 0) authors.set(author, (authors.get(author) || 0) + count);
    }
    return {
      samples: [[time, years, recent]],
      authorSamples: [[time, [...authors].flat()]],
    };
  };

  const OWNED_MIN = 10; // Lines, below which a directory isn't listed.
  const USER_LANG_SERIES_MIN = 100; // Peak lines for per-language developer series.
  const recentYearCutoff = Year(now) - RECENT_YEARS + 1;
  const level = directory => directory.split("/").length -
    (directory.startsWith("third_party/blink") ? 1 : 0);
  const BreadthOf = map => {
    const counts = [...(map || [])].sort((a, b) => b[1] - a[1]);
    const total = counts.reduce((sum, [, count]) => sum + count, 0);
    if (!total) return undefined;
    const entropy = -counts.reduce((sum, [, count]) =>
      sum + count / total * Math.log(count / total), 0);
    return {
      effective: Math.round(Math.exp(entropy) * 10) / 10,
      components: counts.slice(0, 5),
      share: counts[0][1] / total,
    };
  };
  const topPairs = map => map && [...map].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const writeScopeFiles = async scope => {
    const isLang = scope.langIndex !== -1;
    const hasHistory = !isLang || state.has_lang_history;
    const rootKey = isLang ? LangScopeKey(scope.langIndex, "") : "";
    const dirPrefix = isLang ? `${rootKey}/` : "";
    const alive = isLang ? state.lang_alive[scope.langIndex] : state.alive;
    const eventsList = isLang
      ? (hasHistory ? state.lang_events[scope.langIndex] : [])
      : state.events;
    const removalsMap = isLang
      ? (hasHistory ? state.lang_removals[scope.langIndex] : new Map())
      : state.removals;

    let samples = isLang ? state.lang_samples[scope.langIndex] : state.samples;
    let authorSamples = isLang ? state.lang_author_samples[scope.langIndex] : state.author_samples;
    if (!hasHistory || samples.length === 0 || authorSamples.length === 0) {
      const synth = synthesizeFromAlive(alive, sampleNow);
      if (!hasHistory || samples.length === 0) samples = synth.samples;
      if (!hasHistory || authorSamples.length === 0) authorSamples = synth.authorSamples;
    }

    await fs.writeFile(path.join(scope.outDir, "events.json"), JSON.stringify(
      eventsList.map(([time, lines, hash, subject, eventPath]) =>
        ({ date: Day(time), lines, hash, subject, path: eventPath }))));

    // Directory bus factors and review-era knowledge figures.
    const authored = scope.summary.map(() => []);
    for (const directories of scope.ownership.values()) {
      for (const [index, count] of directories) if (index >= 0) authored[index].push(count);
    }
    const reviewedFigures = index => {
      if (review_start === null) return {};
      const era = [...(scope.knownLines.get(index)?.values() || [])].reduce((a, b) => a + b, 0);
      const coverage = era / (scope.allLines.get(index) || 1);
      return {
        bus_factor_reviewed: coverage >= REVIEWED_COVERAGE_MIN
          ? KnowledgeFactor(scope.knownLines.get(index), people)
          : undefined,
        reviewed_coverage: Math.round(coverage * 1000) / 1000,
        reviewed_lines: scope.reviewedLines.get(index) || 0,
      };
    };
    scope.summary.forEach((entry, index) => {
      entry.bus_factor = BusFactor(authored[index]);
      Object.assign(entry, reviewedFigures(index));
    });
    await fs.writeFile(path.join(scope.outDir, "directories.json"), JSON.stringify(scope.summary));
    const reviewed = {
      ...reviewedFigures(-1),
      reviewed_since: review_start === null ? undefined : Day(review_start),
    };

    // Usernames and organizations: lines alive over time.
    const usernames = new Map();
    const orgSeries = new Map();
    const dates = authorSamples.map(([time]) => Day(time));
    authorSamples.forEach(([time, values], index) => {
      for (let i = 0; i < values.length; i += 2) {
        const [id, count] = [values[i], values[i + 1]];
        if (id === -1 || !emailOf[id]) continue;
        const username = usernameOf[id];
        if (!usernames.has(username)) {
          usernames.set(username, new Array(dates.length).fill(0));
        }
        usernames.get(username)[index] += count;
        const org = organizationOf(id, time);
        if (org) {
          if (!orgSeries.has(org)) {
            orgSeries.set(org, new Array(dates.length).fill(0));
          }
          orgSeries.get(org)[index] += count;
        }
      }
    });

    // Commits and breadth across depth-2 components in this scope.
    const matchScopeDir = rawKey => {
      if (!isLang) return rawKey.startsWith(":") ? null : rawKey;
      if (rawKey === rootKey) return "";
      if (rawKey.startsWith(dirPrefix)) return rawKey.slice(dirPrefix.length);
      return null;
    };
    const components = new Map();
    const commits = new Map();
    const orgComponents = new Map();
    const orgCommits = new Map();
    const orgAuthors = new Map();
    const add_commits = (commitsMap, componentsMap, owner, directory, count) => {
      if (directory === "") {
        commitsMap.set(owner, (commitsMap.get(owner) || 0) + count);
        return;
      }
      if (!componentsMap.has(owner)) componentsMap.set(owner, new Map());
      const counts = componentsMap.get(owner);
      counts.set(directory, (counts.get(directory) || 0) + count);
    };
    const recent_complete = hasHistory && state.activity_complete && RecentComplete(state, now);
    for (const rawKey of recent_complete ? state.recent.keys() : []) {
      const directory = matchScopeDir(rawKey);
      if (directory === null || (directory !== "" && level(directory) !== 2)) continue;
      for (const [username, count] of RecentCommits(state, rawKey, usernameOf, now)) {
        add_commits(commits, components, username, directory, count);
      }
      const list = state.recent.get(rawKey) || [];
      for (let i = 0; i < list.length; i += 2) {
        if (list[i] < now - 365 * 86400) continue;
        const org = organizationOf(list[i + 1], list[i]);
        if (!org) continue;
        add_commits(orgCommits, orgComponents, org, directory, 1);
        if (directory === "" && usernameOf[list[i + 1]]) {
          if (!orgAuthors.has(org)) orgAuthors.set(org, new Set());
          orgAuthors.get(org).add(usernameOf[list[i + 1]]);
        }
      }
    }
    const yearly = hasHistory && state.activity_complete && !recent_complete ? state.contributors : [];
    for (const [rawKey, years] of yearly) {
      const directory = matchScopeDir(rawKey);
      if (directory === null || (directory !== "" && level(directory) !== 2)) continue;
      for (const [year, authors] of years) {
        if (year < recentYearCutoff) continue;
        const midYear = Date.UTC(YEAR0 + year, 6, 1) / 1000;
        for (const [author, count] of authors) {
          const username = usernameOf[author];
          if (username) add_commits(commits, components, username, directory, count);
          const org = organizationOf(author, midYear);
          if (org) {
            add_commits(orgCommits, orgComponents, org, directory, count);
            if (directory === "" && username) {
              if (!orgAuthors.has(org)) orgAuthors.set(org, new Set());
              orgAuthors.get(org).add(username);
            }
          }
        }
      }
    }

    // Whose lines were removed by whom, mechanical commits aside.
    const removedBy = new Map();
    const removedOf = new Map();
    const removedTotal = new Map();
    const orgRemovedBy = new Map();
    const orgRemovedOf = new Map();
    const orgRemovedTotal = new Map();
    const addRemoval = (map, key, other, count) => {
      if (!map.has(key)) map.set(key, new Map());
      map.get(key).set(other, (map.get(key).get(other) || 0) + count);
    };
    for (const [written, by] of (hasHistory && state.activity_complete) ? removalsMap : []) {
      const writer = usernameOf[written];
      const writerOrg = organizationOf(written, sampleNow);
      for (const [author, count] of by) {
        const remover = usernameOf[author];
        const removerOrg = organizationOf(author, sampleNow);
        if (writer) removedTotal.set(writer, (removedTotal.get(writer) || 0) + count);
        if (writer && remover) {
          addRemoval(removedBy, writer, remover, count);
          addRemoval(removedOf, remover, writer, count);
        }
        if (writerOrg) orgRemovedTotal.set(writerOrg, (orgRemovedTotal.get(writerOrg) || 0) + count);
        if (writerOrg && removerOrg) {
          addRemoval(orgRemovedBy, writerOrg, removerOrg, count);
          addRemoval(orgRemovedOf, removerOrg, writerOrg, count);
        }
      }
    }

    // Developer buckets and leaderboards.
    await fs.rm(path.join(scope.outDir, "usernames"), { recursive: true, force: true });
    await fs.mkdir(path.join(scope.outDir, "usernames"), { recursive: true });
    const leaderboard = [];
    const buckets = new Map();
    const allUsernames = new Set([
      ...usernames.keys(),
      ...scope.ownership.keys(),
      ...scope.reviewership.keys(),
    ]);
    const seriesMin = isLang ? USER_LANG_SERIES_MIN : 0;
    for (const username of allUsernames) {
      const series = usernames.get(username);
      const first = series ? series.findIndex(value => value > 0) : -1;
      const totalLines = scope.ownership.get(username)?.get(-1) ??
        (first !== -1 ? series.at(-1) : 0);
      const reviewedTotal = scope.reviewership.get(username)?.get(-1) || 0;
      if (first === -1 && !totalLines && !reviewedTotal) continue;
      const peak = first !== -1
        ? Math.max(totalLines, ...series.slice(first))
        : totalLines;
      const keepSeries = first !== -1 && peak >= seriesMin;
      const bucket = UsernameBucket(username);
      if (!buckets.has(bucket)) buckets.set(bucket, { dates, users: {} });
      const directories = [...(scope.ownership.get(username) || [])]
        .filter(([index, owned]) => index >= 0 && owned >= OWNED_MIN)
        .sort((a, b) => a[0] - b[0]);
      const reviewedDirs = [...(scope.reviewership.get(username) || [])]
        .filter(([index, count]) => index >= 0 && count >= OWNED_MIN)
        .sort((a, b) => a[0] - b[0]);
      const breadth = BreadthOf(components.get(username));
      buckets.get(bucket).users[username] = {
        first: keepSeries ? first : undefined,
        lines: keepSeries ? series.slice(first) : undefined,
        total: totalLines || undefined,
        directories: directories.length ? directories.flat() : undefined,
        reviewed: reviewedDirs.length ? reviewedDirs.flat() : undefined,
        reviewed_total: reviewedTotal || undefined,
        commits: commits.get(username),
        breadth,
        removals: removedTotal.has(username) || removedOf.has(username) ? {
          total: removedTotal.get(username) || 0,
          self: removedBy.get(username)?.get(username) || 0,
          by: topPairs(removedBy.get(username)),
          of: topPairs(removedOf.get(username)),
        } : undefined,
      };
      if (totalLines > 0 || first !== -1) {
        leaderboard.push({
          username,
          lines: totalLines,
          peak,
          commits: commits.get(username),
          breadth: breadth?.effective,
        });
      }
    }
    for (const [bucket, content] of buckets) {
      await fs.writeFile(path.join(scope.outDir, "usernames", `${bucket}.json`),
        JSON.stringify(content));
    }
    leaderboard.sort((a, b) => b.lines - a.lines || b.peak - a.peak || a.username.localeCompare(b.username));
    await fs.writeFile(path.join(scope.outDir, "leaderboard.json"),
      JSON.stringify(leaderboard.slice(0, 100)));
    if (review_start !== null) {
      const leaderboardReviewed = [...scope.reviewership]
        .map(([username, dirs]) => ({ username, lines: dirs.get(-1) || 0 }))
        .filter(entry => entry.lines > 0)
        .sort((a, b) => b.lines - a.lines || a.username.localeCompare(b.username))
        .slice(0, 100);
      await fs.writeFile(path.join(scope.outDir, "leaderboard_reviewed.json"),
        JSON.stringify(leaderboardReviewed));
    }

    // Organizations.
    const allOrgs = new Set([
      ...orgSeries.keys(),
      ...scope.orgOwnership.keys(),
      ...scope.orgReviewership.keys(),
    ]);
    const organizationsOut = {};
    for (const org of [...allOrgs].sort()) {
      const series = orgSeries.get(org) || [];
      const first = series.findIndex(value => value > 0);
      const totalLines = scope.orgOwnership.get(org)?.get(-1) || 0;
      const reviewedTotal = scope.orgReviewership.get(org)?.get(-1) || 0;
      if (first === -1 && !totalLines && !reviewedTotal) continue;
      const directories = [...(scope.orgOwnership.get(org) || [])]
        .filter(([index, owned]) => index >= 0 && owned >= OWNED_MIN)
        .sort((a, b) => a[0] - b[0]);
      const reviewedDirs = [...(scope.orgReviewership.get(org) || [])]
        .filter(([index, count]) => index >= 0 && count >= OWNED_MIN)
        .sort((a, b) => a[0] - b[0]);
      const breadth = BreadthOf(orgComponents.get(org));
      organizationsOut[org] = {
        first: first === -1 ? dates.length : first,
        lines: first === -1 ? [] : series.slice(first),
        total: totalLines,
        peak: Math.max(totalLines, ...(first === -1 ? [0] : series.slice(first))),
        directories: directories.flat(),
        reviewed: reviewedDirs.length ? reviewedDirs.flat() : undefined,
        reviewed_total: reviewedTotal || undefined,
        commits: orgCommits.get(org),
        authors: orgAuthors.get(org)?.size,
        breadth,
        removals: orgRemovedTotal.has(org) || orgRemovedOf.has(org) ? {
          total: orgRemovedTotal.get(org) || 0,
          self: orgRemovedBy.get(org)?.get(org) || 0,
          by: topPairs(orgRemovedBy.get(org)),
          of: topPairs(orgRemovedOf.get(org)),
        } : undefined,
      };
    }
    await fs.writeFile(path.join(scope.outDir, "organizations.json"),
      JSON.stringify({ dates, organizations: organizationsOut }));

    // Cohorts: one row per sample, one column per year, plus root activity & contributors.
    const keys = new Set();
    for (const [, years] of samples) {
      Object.keys(years).forEach(key => keys.add(key));
    }
    const years = [...keys].sort();
    const lines = samples.map(([, values]) => years.map(year => values[year] || 0));
    const total = lines.at(-1)?.reduce((a, b) => a + b, 0) || 0;
    const last_time = samples.at(-1)?.[0] ?? now;
    const year_ago_index = samples.findLastIndex(([time]) => time <= last_time - 365 * 86400);
    const total_year_ago = year_ago_index === -1
      ? 0
      : lines[year_ago_index].reduce((a, b) => a + b, 0);
    const activity = hasHistory
      ? DirectoryActivity(state, rootKey, usernameOf, organizationOf, now)
      : {};
    const rootAuthored = [...scope.ownership.values()]
      .map(dirs => dirs.get(-1) || 0)
      .filter(count => count > 0);
    await fs.writeFile(path.join(scope.outDir, "cohorts.json"), JSON.stringify({
      dates: samples.map(([time]) => Day(time)),
      years,
      lines,
      recent: samples.map(([, , recentCount]) => recentCount),
      median_age: MedianAge(state, alive, sampleNow),
      ...activity,
      label: activity.activity
        ? ActivityLabel(activity.activity, total, total_year_ago, now)
        : undefined,
      bus_factor: BusFactor(rootAuthored),
      ...reviewed,
      ...(isLang ? {} : { languages: availableLanguages }),
    }));
  };

  await writeScopeFiles(rootScope);
  for (const langScope of langScopes.values()) {
    await writeScopeFiles(langScope);
  }
};

// The median age of the lines alive, in days, at the last sample.
const MedianAge = (state, alive, now) => {
  const commits = [];
  for (let commit = 1; commit < alive.length; commit++) {
    if (alive[commit] > 0) commits.push(commit);
  }
  commits.sort((a, b) => state.commit_time[b] - state.commit_time[a]);
  const total = commits.reduce((sum, commit) => sum + alive[commit], 0);
  if (!total) return null;
  let seen = 0;
  for (const commit of commits) {
    seen += alive[commit];
    if (2 * seen >= total) {
      return Math.round((now - state.commit_time[commit]) / 86400);
    }
  }
  return null;
};

// Directories: for each with at least MIN_LINES lines, its lines per year
// over time (directories/<path>.json), and a summary (directories.json).
// Whether the recent commits of a state cover the last 365 days.
const RecentComplete = (state, now) =>
  state.recent_since !== null && state.recent_since <= now - 365 * 86400;

// The commits per username in a directory during the last 365 days.
const RecentCommits = (state, directory, usernameOf, now) => {
  const users = new Map();
  const commits = state.recent.get(directory) || [];
  for (let i = 0; i < commits.length; i += 2) {
    if (commits[i] < now - 365 * 86400) continue;
    const username = usernameOf[commits[i + 1]];
    if (username) users.set(username, (users.get(username) || 0) + 1);
  }
  return users;
};

// The directories ("" for the root) of a commit touching these files, for its
// contributors. Null when it only touched excluded files.
const CommitDirectories = (state, files) => {
  const directories = new Set([""]);
  let counted = false;
  for (const file of files) {
    if (state.excludedFile(file)) continue;
    counted = true;
    const rawDirs = Directories(file);
    rawDirs.forEach(directory => directories.add(directory));
    const lang = LanguageIndex(file);
    if (lang !== -1) {
      directories.add(LangScopeKey(lang, ""));
      rawDirs.forEach(directory => directories.add(LangScopeKey(lang, directory)));
    }
  }
  return counted ? directories : null;
};

// The activity and the contributors of a directory ("" for the root), with
// the authors merged into usernames, and the bots left out.
const RECENT_YEARS = 3; // For the top authors, without the recent commits.
// The recent commits are kept this long, for the contributors of the last 365
// days.
const RECENT_WINDOW = 400 * 86400;
const DirectoryActivity = (state, directory, usernameOf, organizationOf, now) => {
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
      const orgs = new Map();
      const midYear = Date.UTC(YEAR0 + year, 6, 1) / 1000;
      for (const [author, commits] of byYear.get(year)) {
        const username = usernameOf[author];
        if (username) users.set(username, (users.get(username) || 0) + commits);
        const org = organizationOf(author, midYear);
        if (org) orgs.set(org, (orgs.get(org) || 0) + commits);
      }
      // Core: about a commit a month. Drive-by: one or two in the year.
      const row = { year: YEAR0 + year, commits: 0, core: 0, regular: 0, driveby: 0, users, orgs };
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
    const topOrgs = new Map();
    for (const row of rows) {
      if (row.year < YEAR0 + Year(now) - RECENT_YEARS + 1) continue;
      for (const [username, commits] of row.users) {
        top.set(username, (top.get(username) || 0) + commits);
      }
      for (const [org, commits] of row.orgs) {
        topOrgs.set(org, (topOrgs.get(org) || 0) + commits);
      }
    }
    result.top = [...top].sort((a, b) => b[1] - a[1]).slice(0, 10);
    result.top_organizations = [...topOrgs].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }
  // With the recent commits: the contributors and the top authors of exactly
  // the last 365 days.
  if (RecentComplete(state, now)) {
    const users = RecentCommits(state, directory, usernameOf, now);
    const recent = { commits: 0, authors: users.size, core: 0, regular: 0, driveby: 0 };
    for (const commits of users.values()) {
      recent.commits += commits;
      recent[commits >= 12 ? "core" : commits >= 3 ? "regular" : "driveby"]++;
    }
    result.recent_contributors = recent;
    result.top = [...users].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const orgs = new Map();
    const list = state.recent.get(directory) || [];
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] < now - 365 * 86400) continue;
      const org = organizationOf(list[i + 1], list[i]);
      if (org) orgs.set(org, (orgs.get(org) || 0) + 1);
    }
    result.top_organizations = [...orgs].sort((a, b) => b[1] - a[1]).slice(0, 10);
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

// The time since which the reviewers are recorded: the first month when at
// least half of the commits have some. Before, they are unknown rather than
// missing: Chromium moved to Gerrit in 2017. Null without reviewers.
const ReviewStart = state => {
  if (state.reviewers.size === 0) return null;
  const commits = new Map(); // Month -> [commits, reviewed].
  for (let commit = 1; commit < state.commit_time.length; commit++) {
    const month = state.commit_month[commit];
    if (!commits.has(month)) commits.set(month, [0, 0]);
    const counts = commits.get(month);
    counts[0]++;
    if (state.reviewers.has(commit)) counts[1]++;
  }
  const month = [...commits].sort((a, b) => a[0] - b[0])
    .find(([, [all, reviewed]]) => all >= 10 && reviewed >= all / 2)?.[0];
  if (month === undefined) return null;
  let start = Infinity;
  for (let commit = 1; commit < state.commit_time.length; commit++) {
    if (state.commit_month[commit] === month) start = Math.min(start, state.commit_time[commit]);
  }
  return start;
};
// The figures counting the reviewers need this share of the lines alive to
// be written since the start of the review era.
const REVIEWED_COVERAGE_MIN = 0.5;

// How many people must leave for half of the lines to be known by nobody: a
// line is known by the author and the reviewers of its commit. The people
// leave from the one knowing the most lines, like the truck factor of
// Avelino et al. With the authors only, it is BusFactor.
const KnowledgeFactor = (commitLines, people) => {
  const groups = [...commitLines].map(([commit, lines]) => [people(commit), lines])
    .filter(([persons]) => persons.length);
  const total = groups.reduce((sum, [, lines]) => sum + lines, 0);
  if (!total) return undefined;
  const known = new Map(); // Person -> lines known.
  const groupsOf = new Map(); // Person -> group indices.
  groups.forEach(([persons, lines], i) => persons.forEach(person => {
    known.set(person, (known.get(person) || 0) + lines);
    if (!groupsOf.has(person)) groupsOf.set(person, []);
    groupsOf.get(person).push(i);
  }));
  const remaining = Int32Array.from(groups, ([persons]) => persons.length);
  const order = [...known].sort((a, b) => b[1] - a[1]).map(([person]) => person);
  let orphaned = 0;
  for (let count = 1; count <= order.length; count++) {
    for (const i of groupsOf.get(order[count - 1])) {
      if (--remaining[i] === 0) orphaned += groups[i][1];
    }
    if (orphaned >= total / 2) return count;
  }
  return order.length;
};

// The files grouping the developers and the directories. The page computes
// them the same way.
const UsernameBucket = username =>
  /^[a-z0-9]/i.test(username) ? username[0].toLowerCase() : "_";
const DirectoryPack = directory => directory.startsWith("third_party/blink")
  ? "third_party/blink"
  : directory.split("/")[0];

const WriteDirectories = async (state, dir, usernameOf, organizationOf, decodedSamples, options) => {
  const { langIndex = -1, minLines = 1000, hasHistory = true, now = Math.floor(Date.now() / 1000) } = options;
  const isLang = langIndex !== -1;
  const prefix = isLang ? `${LangScopeKey(langIndex, "")}/` : "";
  const samples = hasHistory ? decodedSamples : [decodedSamples.at(-1)];
  const allDates = samples.map(([time]) => Day(time));
  const current = samples.at(-1)[1];
  // The last sample at least a year old.
  const year_ago = hasHistory
    ? samples.findLast(([time]) => time <= now - 365 * 86400)?.[1]
    : undefined;

  const output = path.join(dir, "directories");
  await fs.rm(output, { recursive: true, force: true });
  const summary = [];
  // Grouped by top-level directory, as one file per directory would make
  // thousands of files to deploy. Each pack shares `dates` once and trims
  // trailing zeros on `lines` rows.
  const packs = new Map();
  for (const [rawName, { recent, years }] of current) {
    let relPath;
    if (!isLang) {
      if (rawName.startsWith(":")) continue;
      relPath = rawName;
    } else {
      if (!rawName.startsWith(prefix)) continue;
      relPath = rawName.slice(prefix.length);
    }
    const lines = Object.values(years).reduce((a, b) => a + b, 0);
    if (lines < minLines) continue;

    // The median age, in years, from the lines per month.
    const months = state.directories.get(rawName);
    let seen = 0;
    let median_age = null;
    for (let month = MONTHS - 1; month > 0; month--) {
      seen += months[month];
      if (2 * seen >= lines) {
        median_age = Math.round((Month(now) - month) / 1.2) / 10;
        break;
      }
    }
    const before = year_ago?.get(rawName);
    const lines_year_ago = hasHistory
      ? (before ? Object.values(before.years).reduce((a, b) => a + b, 0) : 0)
      : undefined;
    const activity = hasHistory
      ? DirectoryActivity(state, rawName, usernameOf, organizationOf, now)
      : {};
    const last = YEAR0 + Year(now) - 1;
    const lastContributors = activity.contributors?.years.indexOf(last) ?? -1;
    summary.push({
      path: relPath,
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
      authors: activity.recent_contributors?.authors ??
        (lastContributors === -1 ? undefined : ["core", "regular", "driveby"]
          .reduce((sum, key) => sum + activity.contributors[key][lastContributors], 0)),
      core: activity.recent_contributors?.core ??
        (lastContributors === -1 ? undefined : activity.contributors.core[lastContributors]),
    });

    const first = samples.findIndex(([, values]) => values.has(rawName));
    const dirSamples = samples.slice(first);
    const keys = new Set();
    dirSamples.forEach(([, values]) => {
      const entry = values.get(rawName);
      if (entry) Object.keys(entry.years).forEach(key => keys.add(key));
    });
    const columns = [...keys].sort();
    const pack = DirectoryPack(relPath);
    if (!packs.has(pack)) packs.set(pack, { dates: allDates, directories: {} });
    packs.get(pack).directories[relPath] = {
      first,
      years: columns,
      lines: dirSamples.map(([, values]) => {
        const entry = values.get(rawName);
        if (!entry) return [];
        const row = columns.map(year => entry.years[year] || 0);
        while (row.length > 0 && row.at(-1) === 0) row.pop();
        return row;
      }),
      recent: dirSamples.map(([, values]) => values.get(rawName)?.recent || 0),
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
  UseRepository(dirname);
  const values = name => flags
    .filter(f => f === `--${name}` || f.startsWith(`--${name}=`))
    .map(f => f.includes("=") ? f.slice(f.indexOf("=") + 1) : true);
  const flag = name => values(name)[0];
  const cwd = flag("repo-dir") || dirname;
  if (flag("concurrency")) {
    CONFIG.concurrency = Number(flag("concurrency"));
    CONFIG.lookahead = Math.max(CONFIG.lookahead, CONFIG.concurrency + 4);
  }
  const dir = path.join(flag("output") || CONFIG.output_dir, dirname);
  const state_file = flag("state") || path.join(dir, "state.bin.gz");
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
  if (flag("write-only")) {
    await WriteOutput(state, dir);
    return;
  }
  const pathspecs = [...(PATHSPECS[dirname] || PATHSPECS.default),
    ...state.options.exclude.map(glob => `:(exclude,glob)${glob}`)];

  // In the CI, there is no checkout, or a shallow one: fetch the history since
  // the last replayed commit. Its commit date is less than a week before the
  // next sample.
  // Or the year before, to rebuild the recent commits.
  const depth = 2 * CONFIG.week + (flag("rebuild-recent") ? RECENT_WINDOW : 0);
  const since = state.next_sample
    ? [`--shallow-since=${new Date((state.next_sample - depth) * 1000).toISOString()}`]
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

  if (flag("rebuild-recent")) await RebuildRecent(state, cwd, pathspecs);

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
  if (commits.length > 0 || flag("rebuild-recent")) {
    if (commits.length > 0) await Replay(state, cwd, pathspecs, ignore_revs, commits);
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

// Fills the recent commits of a state from the history, like the replay
// would: the first-parent commits touching the pathspecs until the last one
// replayed, without the generated files, the WPT imports being generated.
const RebuildRecent = async (state, cwd, pathspecs) => {
  const time = state.options.commit_date ? "%ct" : "%at";
  const head = Number((await run(["git", "log", "-1", `--format=${time}`, state.head], cwd)).trim());
  const start = head - RECENT_WINDOW;
  const output = await run(["git", "-c", "core.quotePath=false", "log",
    "--first-parent", `--format=%x01${time} %ae%x02%s`, "--name-only",
    `--since=${new Date(start * 1000).toISOString()}`, state.head,
    "--", ...pathspecs], cwd);
  const commits = [];
  for (const block of output.split("\x01").slice(1)) {
    const [header, ...lines] = block.split("\n");
    const separator = header.indexOf("\x02");
    const [when, ...email] = header.slice(0, separator).split(" ");
    const subject = header.slice(separator + 1);
    const files = lines.filter(Boolean).map(unquote);
    const imported = IMPORT_SUBJECT.test(subject) && files.some(file => WPT_FILE.test(file));
    commits.push([Number(when), state.authorId(imported ? GENERATED : email.join(" ")), files]);
  }
  state.recent = new Map();
  // Oldest first, like the replay.
  for (const [when, author, files] of commits.reverse()) {
    const directories = CommitDirectories(state, files);
    if (directories && when >= start) state.recordRecent(when, author, directories);
  }
  state.recent_since = start;
  console.log(`Recent commits rebuilt since ${Day(start)}: ${commits.length} commits`);
};

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
