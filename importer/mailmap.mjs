import * as filesystem from "fs";
import JSON5 from "json5";
const fs = filesystem.promises;

function normalizeEmail(username) {
  username = username.toLowerCase();

  // Check if the username contains invalid characters:
  if (/[^@a-z0-9!#$%&'*+\-=?^_`{|}~.]/.test(username)) {
    return "deleted";
  }

  // Remove the (<number>+)<username> prefix from the username:
  username = username.replace(/^\d+\+/, "");

  // Remove the parts after the second '@':
  const parts = username.split("@");
  if (parts.length > 2) {
    username = parts.slice(0, 2).join("@");
  }

  return username;
}

const data_json = await fs.readFile("../mailmap.json5", "utf8");
const data = JSON5.parse(data_json);

const map = new Map();
for (const entry of data) {
  map.set(normalizeEmail(entry.old), normalizeEmail(entry.new));
}

export function mailMap(username) {
  username = normalizeEmail(username);
  return map.get(username) ?? username;
}
