import repositories_json from "../public/data/repositories.json";

export type RepositoryInfo = (typeof repositories_json)[number];

export const repoMap = new Map<string, RepositoryInfo>(
  repositories_json.map(repo => [repo.dirname, repo]),
);

export function getRepo(dirname: string): RepositoryInfo | undefined {
  return repoMap.get(dirname);
}

// "Chromium", "Chromium, V8", or "5 repositories".
export function listSummary(items: string[], noun: string, max = 2): string {
  if (items.length === 0) {
    return `No ${noun}`;
  }
  if (items.length <= max) {
    return items.join(", ");
  }
  return `${items.length} ${noun}`;
}

// The display name of repositories, from their dirname.
export function repositoryNames(dirnames: string[]): string[] {
  return dirnames.map(dirname => repoMap.get(dirname)?.name ?? dirname);
}

// "yearly" -> "Yearly".
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
