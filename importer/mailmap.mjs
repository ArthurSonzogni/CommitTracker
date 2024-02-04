import * as filesystem from "fs";
import JSON5 from "json5";
const fs = filesystem.promises;

const data_json = await fs.readFile("../mailmap.json5", "utf8");
const data = JSON5.parse(data_json)

const map = new Map();
for (const entry of data) {
  map.set(entry.old, entry.new);
}

export function mailMap(username) {
  username = username.toLowerCase();

  // Check if the username contains invalid characters:
  if (username.match(/[^@a-z0-9!#$%&'*+\-=?^_`{|}~.]/)) {
    username = "deleted";
  }

  // Remove the (<number>+)<username> prefix from the username:
  const match = username.match(/^(?:\d+\+)?(.*)$/);
  if (match) {
    username = match[1];
  }

  // Remove the parts after the second '@':
  const parts = username.split("@");
  if (parts.length > 2) {
    username = parts.slice(0, 2).join("@");
  }

  if (map.has(username)) {
    return map.get(username);
  }
  return username;
}
