import fs from "fs/promises";
import JSON5 from "json5";
import statusLine from "@alt-jero/status-line";

const REPOSITORIES_URL = new URL("../repositories.json5", import.meta.url);

export async function loadRepositories() {
  return JSON5.parse(await fs.readFile(REPOSITORIES_URL, "utf8"));
}

export { statusLine };
