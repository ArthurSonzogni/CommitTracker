import JSON5 from "json5";
import fs from "fs/promises";

const repositories_file = await fs.readFile("../repositories.json5", "utf-8");
const repositories = JSON5.parse(repositories_file);
for (const repository of repositories) {
  // Clean up the `organizations/` directory if it exists
  const repository_dir = `../public/data/${repository.dirname}/organizations`;
  try {
    await fs.rm(repository_dir, { recursive: true });
    console.log(`Deleted ${repository_dir}`);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`No such directory: ${repository_dir}`);
    } else {
      throw error;
    }
  }
}
