// Chooses a semantic view-transition direction (`data-vt` on <html>) based on
// the relationship between the previous and next routes.

const SIBLING_GROUPS: string[][] = [
  [
    "/cve/overview",
    "/cve/list",
    "/cve/pivot-table",
    "/cve/reward_per_components",
    "/cve/money-tree",
  ],
  ["/repositories", "/pulse", "/accretion"],
  ["/organizations/commits", "/organizations/emails"],
];

const SECTION_ORDER = [
  "/",
  "/individuals",
  "/communities",
  "/treemap",
  "/repositories",
  "/pulse",
  "/accretion",
  "/organizations",
  "/cve",
  "/developer-output",
  "/security",
  "/leaderboard",
  "/badges",
  "/fuzz-test",
  "/usernames",
  "/api",
  "/repo-info",
  "/page-view",
];

function sectionIndex(path: string): number {
  if (path === "/") return 0;
  for (let i = 1; i < SECTION_ORDER.length; i++) {
    const prefix = SECTION_ORDER[i];
    if (path === prefix || path.startsWith(prefix + "/")) return i;
  }
  return -1;
}

function classifyTransition(fromPath: string, toPath: string): string {
  if (fromPath === toPath) return "crossfade";

  // 1. Developer Year in Review: chronological stepping (2024 <-> 2025).
  const fromYear = fromPath.match(/^\/developers\/([^/]+)\/(\d{4})$/);
  const toYear = toPath.match(/^\/developers\/([^/]+)\/(\d{4})$/);
  if (fromYear && toYear && fromYear[1] === toYear[1]) {
    return Number(toYear[2]) > Number(fromYear[2]) ? "slide-left" : "slide-right";
  }

  // 2. Drill-in / drill-out between parent and detail views.
  const isDevProfile = (p: string) => /^\/developers\/[^/]+$/.test(p);
  const isDevYear = (p: string) => /^\/developers\/[^/]+\/\d{4}$/.test(p);

  if (fromPath === "/") return "drill-in";
  if (toPath === "/") return "drill-out";

  if (isDevProfile(fromPath) && isDevYear(toPath)) return "drill-in";
  if (isDevYear(fromPath) && isDevProfile(toPath)) return "drill-out";

  if (fromPath === "/badges/list" && toPath === "/badges/details") return "drill-in";
  if (fromPath === "/badges/details" && toPath === "/badges/list") return "drill-out";

  if (
    (fromPath === "/individuals" || fromPath === "/leaderboard" || fromPath === "/communities") &&
    isDevProfile(toPath)
  ) {
    return "drill-in";
  }
  if (
    isDevProfile(fromPath) &&
    (toPath === "/individuals" || toPath === "/leaderboard" || toPath === "/communities")
  ) {
    return "drill-out";
  }

  // 3. Sibling tabs within a section (CVE tabs, Repositories, Organizations).
  for (const group of SIBLING_GROUPS) {
    const fi = group.indexOf(fromPath);
    const ti = group.indexOf(toPath);
    if (fi !== -1 && ti !== -1) {
      return ti > fi ? "slide-left" : "slide-right";
    }
  }

  // 4. Top-level navbar spatial order.
  const fs = sectionIndex(fromPath);
  const ts = sectionIndex(toPath);
  if (fs !== -1 && ts !== -1 && fs !== ts) {
    return ts > fs ? "slide-left" : "slide-right";
  }

  return "crossfade";
}

export default defineNuxtPlugin(() => {
  const router = useRouter();
  router.beforeEach((to, from) => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.vt = classifyTransition(from.path, to.path);
  });
});
