// The CVE database. Component names used to be stored HTML-escaped by the
// importer, e.g. "Blink&gt;JavaScript". Decode them for the data that hasn't
// been re-imported yet.

export interface CveCommit {
  type?: string;
  repo?: string;
  author?: string;
  reviewers?: string[];
  files?: string[];
  [key: string]: any;
}

export interface CveRecord {
  id: string;
  cweId?: string;
  problem?: string;
  bug?: string;
  bug_date?: string;
  description?: string;
  published: string;
  year: string;
  severity: string;
  components?: string[];
  vrp_reward?: string | number | null;
  commits?: Record<string, CveCommit>;
  repos: string[];
  [key: string]: any;
}

const decodeHtmlEntities = (text: string): string => text
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'");

let cveDataPromise: Promise<CveRecord[]> | null = null;

export const fetchCveData = (): Promise<CveRecord[]> => {
  if (!cveDataPromise) {
    cveDataPromise = (async () => {
      const response = await fetch("/cve/data.json");
      if (!response.ok) {
        throw new Error(`Failed to fetch /cve/data.json: ${response.status}`);
      }
      const raw = await response.json();
      const data: CveRecord[] = (Array.isArray(raw) ? raw : []).filter((cve: any) => cve?.id);
      for (const cve of data) {
        cve.components = cve.components?.map(decodeHtmlEntities);
        cve.severity ||= "unknown";
        cve.year = typeof cve.published === "string" ? cve.published.split("-")[0] : "";

        const repos = new Set<string>();
        if (cve.commits) {
          for (const sha in cve.commits) {
            const commit = cve.commits[sha];
            if (commit?.type === "commit" && commit.repo) {
              repos.add(commit.repo);
            }
          }
        }
        cve.repos = Array.from(repos);
      }
      return data;
    })().catch((err) => {
      cveDataPromise = null;
      throw err;
    });
  }
  return cveDataPromise;
};
