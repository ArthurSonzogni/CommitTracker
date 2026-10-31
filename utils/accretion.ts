export const REPO_EXCLUSIONS: Record<string, string> = {
  chromium:
    "WPT_BASE_MANIFEST*.json, testing/buildbot/*.json (except trybot_analyze_config.json), third_party/blink/perf_tests/{speedometer*,MotionMark}/, and chrome/test/data/dromaeo/.",
  firefox:
    "intl/icu/, js/src/tests/test262/, js/src/octane/, testing/web-platform/tests/, testing/web-platform/mozilla/tests/webgpu/, dom/webgpu/tests/cts/, security/nss/, modules/freetype2/, gfx/harfbuzz/, media/lib*/, and ipc/chromium/src/{base,third_party}/.",
  webkit:
    "LayoutTests/{imported,webgl,platform}/, JSTests/{test262,ChakraCore,wasm/spec-tests,es6,mozilla}/, PerformanceTests/{JetStream*,JSBench,Speedometer*,MotionMark*,ARES-6,SunSpider,Octane,Kraken,Dromaeo}/, and Websites/browserbench.org/.",
  servo:
    "tests/wpt/{tests,webgl,webgpu,meta,meta-legacy}/ (while Servo's own tests in tests/wpt/mozilla/ are kept) and tests/blink_perf_tests/.",
  ladybird: "wpt-import/ directories.",
  v8: "test/webkit/ and test/unittests/gay-*.cc.",
  skia: "modules/canvaskit/npm_build/ and resources/skottie/.",
  swiftshader:
    "Khronos and system headers in include/{vulkan,vk_video,KHR,EGL,GLES*,Wayland,xcb}/ and tests/regres/testlists/.",
  angle:
    "Khronos headers in include/{GLES*,EGL,KHR,CL,vulkan,vk_video}/ and src/tests/gl_tests/media/.",
  webrtc: "rtc_tools/rtc_event_log_visualizer/conversational_speech_en.h.",
  llvm:
    "libc/test/src/math/exhaustive/*.wc (plus LLVM test files whose assertions are auto-generated in their first 40 lines).",
  chromeos: "TPM specification files in trunks/generator/raw_*.",
};

export type ActivityKind = "new" | "iteration" | "rework" | "mechanical" | "removed";

export interface AccretionActivity {
  years: number[];
  new: number[];
  iteration: number[];
  rework: number[];
  mechanical: number[];
  removed: number[];
}

export interface CohortData {
  dates: string[];
  years: Array<number | string>;
  lines: number[][];
  recent?: number[];
  median_age?: number | null;
  reviewed_lines?: number;
  reviewed_since?: string;
  activity?: AccretionActivity;
  contributors?: {
    years: number[];
    commits: number[];
    core: number[];
    regular: number[];
    driveby: number[];
  };
  recent_contributors?: {
    commits: number;
    core: number;
    regular: number;
    driveby: number;
    authors: number;
  };
  top?: Array<[string, number]>;
  top_organizations?: Array<[string, number]>;
  languages?: Array<{ id: string; label: string; hint: string; lines: number }>;
  label?: string;
  bus_factor?: number;
  bus_factor_reviewed?: number;
}

export interface DirectorySummaryEntry {
  path: string;
  lines: number;
  recent: number;
  year_ago?: number;
  reworked?: number;
  median_age?: number | null;
  reviewed_lines?: number;
  label?: string;
  authors?: number;
  core?: number;
  bus_factor?: number;
  bus_factor_reviewed?: number;
}

export interface OwnershipTreeNode {
  key: string;
  path?: string;
  name: string;
  lines: number;
  owned: number;
  children?: OwnershipTreeNode[];
}

export interface CohortReductionRow {
  label: number | string;
  values: Array<number | null>;
}

export interface CohortReductionResult {
  ages: number[];
  rows: CohortReductionRow[];
}

export function isBlinkPath(path: string): boolean {
  return path === "third_party/blink" || path.startsWith("third_party/blink/");
}

// Blink is treated as a top-level directory in Chromium.
export function parentOf(path: string): string {
  return path === "third_party/blink" || !path.includes("/")
    ? ""
    : path.slice(0, path.lastIndexOf("/"));
}

export function buildBreadcrumbs(directory: string): Array<{ path: string; name: string }> {
  const parts: Array<{ path: string; name: string }> = [];
  for (let path = directory; path; path = parentOf(path)) {
    parts.unshift({
      path,
      name: path.slice(parentOf(path).length).replace(/^\//, ""),
    });
  }
  return parts;
}

export function directoryPack(path: string): string {
  return isBlinkPath(path) ? "third_party/blink" : path.split("/")[0];
}

export function isUntrackedBelow(directory: string): boolean {
  if (!directory) return false;
  return directory.split("/").length - (isBlinkPath(directory) ? 1 : 0) >= 3;
}

export function unpackDirectory(pack: any, path: string): CohortData | null {
  if (!pack) return null;
  const raw = pack.directories ? pack.directories[path] : pack[path];
  if (!raw) return null;
  if (!pack.directories) return raw;
  const width = raw.years.length;
  return {
    ...raw,
    dates: pack.dates.slice(raw.first),
    lines: raw.lines.map((row: number[]) =>
      row.length === width ? row : [...row, ...new Array(width - row.length).fill(0)],
    ),
  };
}

export function indexDirectoriesByParent<T extends { path: string }>(
  directories: readonly T[],
): Map<string, T[]> {
  const byParent = new Map<string, T[]>();
  for (const entry of directories) {
    const parent = parentOf(entry.path);
    if (entry.path === parent) continue;
    let list = byParent.get(parent);
    if (!list) {
      list = [];
      byParent.set(parent, list);
    }
    list.push(entry);
  }
  return byParent;
}

export function sumRow(row: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < row.length; i++) {
    total += row[i];
  }
  return total;
}

// Of the lines a year ago, the share rewritten or removed in place since: the
// rework of the last 12 months. Without the activity, from the lines older
// than a year, which is wrong when old code was moved in: then unknown.
export function oldCodeRewritten(
  reworked: number | undefined,
  old: number,
  yearAgo: number | null | undefined,
): number | null {
  if (!yearAgo) return null;
  if (reworked !== undefined) return reworked / yearAgo;
  return old <= yearAgo ? 1 - old / yearAgo : null;
}

// Activity of the last 365 days anchored to the dataset's latest sample date,
// estimated from the yearly counts as if spread evenly across the previous year.
export function estimateRecentActivity(
  activity: AccretionActivity,
  anchorDate: Date,
): Record<ActivityKind, number> {
  const year = anchorDate.getUTCFullYear();
  const weight = Math.max(
    0,
    1 - (anchorDate.getTime() - Date.UTC(year, 0, 1)) / (365 * 86400e3),
  );
  const value = (kind: ActivityKind, y: number): number => {
    const i = activity.years.indexOf(y);
    return i === -1 ? 0 : activity[kind][i] || 0;
  };
  return {
    new: value("new", year) + weight * value("new", year - 1),
    iteration: value("iteration", year) + weight * value("iteration", year - 1),
    rework: value("rework", year) + weight * value("rework", year - 1),
    mechanical: value("mechanical", year) + weight * value("mechanical", year - 1),
    removed: value("removed", year) + weight * value("removed", year - 1),
  };
}

// For each cohort year, the share of its lines removed during each following
// year, measured at the sample closest to consecutive January 1sts (within 21 days).
export function computeCohortReduction(
  data: Pick<CohortData, "dates" | "years" | "lines"> | null | undefined,
): CohortReductionResult {
  if (!data) return { ages: [], rows: [] };
  const { dates, years, lines } = data;
  const january: Record<number, number> = {};
  const distance = (i: number, year: number) =>
    Math.abs(new Date(dates[i]).getTime() - new Date(`${year}-01-01`).getTime());

  dates.forEach((date, i) => {
    const year = Number(date.slice(0, 4)) + (date.slice(5) > "07" ? 1 : 0);
    // Within 3 weeks, for directories sampled every 4 weeks.
    if (distance(i, year) > 21 * 86400e3) return;
    if (january[year] === undefined || distance(i, year) < distance(january[year], year)) {
      january[year] = i;
    }
  });

  const rows: CohortReductionRow[] = [];
  for (const year of years.filter(y => y !== "unknown")) {
    const column = years.indexOf(year);
    const values: Array<number | null> = [];
    for (let age = 1; ; age++) {
      const start = january[Number(year) + age];
      const end = january[Number(year) + age + 1];
      if (start === undefined || end === undefined) break;
      const before = lines[start][column];
      values.push(before ? 1 - lines[end][column] / before : null);
    }
    if (values.length) rows.push({ label: year, values });
  }

  const maxAge = Math.max(0, ...rows.map(row => row.values.length));
  const ages = Array.from({ length: maxAge }, (_, i) => i + 1);
  const median = ages.map((_, i) => {
    const values = rows
      .map(row => row.values[i])
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  });

  return {
    ages,
    rows: [
      { label: "Median", values: median },
      ...rows.reverse().map(row => ({
        ...row,
        values: ages.map((_, i) => row.values[i] ?? null),
      })),
    ],
  };
}

// Years for half of a cohort's lines to be gone, compounding median reduction rates.
export function computeHalfLife(medianRates: ReadonlyArray<number | null>): number | null {
  let alive = 1;
  for (let age = 0; age < medianRates.length; age++) {
    const rate = medianRates[age];
    if (rate === null || rate === undefined) return null;
    const next = alive * (1 - rate);
    if (next <= 0.5) return age + (alive - 0.5) / (alive - next);
    alive = next;
  }
  return null;
}

export function buildOwnershipTree<T extends DirectorySummaryEntry>(params: {
  rootPath: string;
  rootLabel: string;
  rootLines: number;
  rootOwned: number;
  ownerMap: ReadonlyMap<string, number>;
  directoriesByParent: ReadonlyMap<string, readonly T[]>;
  denomOf: (entry: T) => number | undefined;
}): OwnershipTreeNode {
  const { rootPath, rootLabel, rootLines, rootOwned, ownerMap, directoriesByParent, denomOf } = params;

  const build = (
    path: string,
    label: string,
    lines: number,
    ownedHere: number,
  ): OwnershipTreeNode => {
    const directChildren = directoriesByParent.get(path) || [];
    const sub: OwnershipTreeNode[] = [];
    for (const entry of directChildren) {
      const childOwned = ownerMap.get(entry.path);
      if (!childOwned) continue;
      sub.push(
        build(
          entry.path,
          entry.path.slice(path.length).replace(/^\//, ""),
          denomOf(entry) || entry.lines,
          childOwned,
        ),
      );
    }
    const rest = ownedHere - sub.reduce((sum, child) => sum + child.owned, 0);
    if (sub.length && rest > 0) {
      sub.push({ key: `${path}/…`, name: "…", lines, owned: rest });
    }
    return { key: path || "/", path, name: label, lines, owned: ownedHere, children: sub };
  };

  return build(rootPath, rootLabel, rootLines, rootOwned);
}
