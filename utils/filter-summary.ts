import repositories_json from '../public/data/repositories.json'

// "Chromium", "Chromium, V8", or "5 repositories".
export function listSummary(items: string[], noun: string, max = 2) {
  if (items.length == 0) {
    return `No ${noun}`;
  }
  if (items.length <= max) {
    return items.join(", ");
  }
  return `${items.length} ${noun}`;
}

// The display name of repositories, from their dirname.
export function repositoryNames(dirnames: string[]) {
  return dirnames.map(dirname =>
    repositories_json.find(repo => repo.dirname == dirname)?.name ?? dirname);
}
