import JSON5 from "json5";
import fs from "fs/promises";

const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {
  // Clean up the `organizations/` directory.
  const repository_dir = `../static/data/${repository.dirname}/organizations`;
  await fs.rm(repository_dir, { recursive: true });
}
