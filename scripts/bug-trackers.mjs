// Maps (repository dirname, numeric bug ID) to its public issue tracker key,
// fetch parameters, and fallback web URL. Shared by derive-top-bugs.mjs and
// importer/fetch_bug_titles.mjs.

export const ISSUETRACKER_MIN_ID = 30_000_000;
const MONORAIL_CHROMIUM_MAX_ID = 1_530_000;

const MONORAIL_REPOS = {
  chromium: { project: "chromium", host: "issues.chromium.org" },
  blink: { project: "chromium", host: "issues.chromium.org" },
  partition_alloc: { project: "chromium", host: "issues.chromium.org" },
  "devtool-frontend": { project: "chromium", host: "issues.chromium.org" },
  gn: { project: "chromium", host: "issues.chromium.org" },
  chromeos: { project: "chromium", host: "issues.chromium.org" },
  v8: { project: "v8", host: "issues.chromium.org" },
  skia: { project: "skia", host: "issues.skia.org" },
  dawn: { project: "dawn", host: "issues.chromium.org" },
  angle: { project: "angleproject", host: "issues.angleproject.org" },
  webrtc: { project: "webrtc", host: "issues.webrtc.org" },
  pdfium: { project: "pdfium", host: "issues.chromium.org" },
};

const BUGANIZER_ONLY_REPOS = new Set(["swiftshader", "openscreen", "perfetto"]);

const GITHUB_REPOS = {
  llvm: { owner: "llvm", repo: "llvm-project" },
  servo: { owner: "servo", repo: "servo" },
  carbon: { owner: "carbon-language", repo: "carbon-lang" },
  ladybird: { owner: "LadybirdBrowser", repo: "ladybird" },
};

export function resolveBugTracker(dirname, id) {
  if (!Number.isInteger(id) || id <= 0) return null;

  if (dirname === "firefox" || dirname === "spidermonkey") {
    return {
      key: `mozilla:${id}`,
      kind: "bugzilla",
      baseUrl: "https://bugzilla.mozilla.org",
      id,
      fallbackUrl: `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`,
    };
  }

  if (dirname === "webkit" || dirname === "jsc") {
    return {
      key: `webkit:${id}`,
      kind: "bugzilla",
      baseUrl: "https://bugs.webkit.org",
      id,
      fallbackUrl: `https://bugs.webkit.org/show_bug.cgi?id=${id}`,
    };
  }

  if (dirname === "wpt") {
    if (id >= ISSUETRACKER_MIN_ID) {
      return {
        key: `it:${id}`,
        kind: "issuetracker",
        host: "issues.chromium.org",
        id,
        fallbackUrl: `https://crbug.com/${id}`,
      };
    }
    if (id >= 100_000 && id <= MONORAIL_CHROMIUM_MAX_ID) {
      return {
        key: `chromium:${id}`,
        kind: "monorail",
        project: "chromium",
        host: "issues.chromium.org",
        id,
        fallbackUrl: `https://crbug.com/${id}`,
      };
    }
    if (id > MONORAIL_CHROMIUM_MAX_ID) {
      return {
        key: `mozilla:${id}`,
        kind: "bugzilla",
        baseUrl: "https://bugzilla.mozilla.org",
        id,
        fallbackUrl: `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`,
      };
    }
    return {
      key: `gh:web-platform-tests/wpt:${id}`,
      kind: "github",
      owner: "web-platform-tests",
      repo: "wpt",
      id,
      fallbackUrl: `https://github.com/web-platform-tests/wpt/issues/${id}`,
    };
  }

  if (dirname === "clusterfuzz") {
    if (id >= ISSUETRACKER_MIN_ID) {
      return {
        key: `it:${id}`,
        kind: "issuetracker",
        host: "issues.chromium.org",
        id,
        fallbackUrl: `https://crbug.com/${id}`,
      };
    }
    return {
      key: `gh:google/clusterfuzz:${id}`,
      kind: "github",
      owner: "google",
      repo: "clusterfuzz",
      id,
      fallbackUrl: `https://github.com/google/clusterfuzz/issues/${id}`,
    };
  }

  if (GITHUB_REPOS[dirname]) {
    const { owner, repo } = GITHUB_REPOS[dirname];
    return {
      key: `gh:${owner}/${repo}:${id}`,
      kind: "github",
      owner,
      repo,
      id,
      fallbackUrl: `https://github.com/${owner}/${repo}/issues/${id}`,
    };
  }

  if (MONORAIL_REPOS[dirname]) {
    const { project, host } = MONORAIL_REPOS[dirname];
    if (id >= ISSUETRACKER_MIN_ID) {
      return {
        key: `it:${id}`,
        kind: "issuetracker",
        host,
        id,
        fallbackUrl:
          host === "issues.chromium.org"
            ? `https://crbug.com/${id}`
            : `https://${host}/issues/${id}`,
      };
    }
    return {
      key: `${project}:${id}`,
      kind: "monorail",
      project,
      host,
      id,
      fallbackUrl:
        project === "chromium"
          ? `https://crbug.com/${id}`
          : `https://crbug.com/${project}/${id}`,
    };
  }

  if (BUGANIZER_ONLY_REPOS.has(dirname)) {
    if (id >= ISSUETRACKER_MIN_ID) {
      return {
        key: `it:${id}`,
        kind: "issuetracker",
        host: "issuetracker.google.com",
        id,
        fallbackUrl: `https://issuetracker.google.com/issues/${id}`,
      };
    }
    return null;
  }

  return null;
}
