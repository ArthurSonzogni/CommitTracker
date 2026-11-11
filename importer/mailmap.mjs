import * as filesystem from "fs";
import JSON5 from "json5";
const fs = filesystem.promises;

export function normalizeEmail(username) {
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

export function buildMailMap(entries) {
  const direct = new Map();
  for (const entry of entries) {
    const oldEmail = normalizeEmail(entry.old);
    const newEmail = normalizeEmail(entry.new);
    if (oldEmail !== newEmail) {
      direct.set(oldEmail, newEmail);
    }
  }

  // Resolve transitive chains (A -> B -> C) upfront and fail on cycles.
  const resolved = new Map();
  for (const start of direct.keys()) {
    let current = start;
    const seen = new Set([start]);
    while (direct.has(current)) {
      const next = direct.get(current);
      if (seen.has(next)) {
        throw new Error(`Cycle in mailmap.json5 involving ${next}`);
      }
      seen.add(next);
      current = next;
    }
    resolved.set(start, current);
  }
  return resolved;
}

const data_json = await fs.readFile("../mailmap.json5", "utf8");
const map = buildMailMap(JSON5.parse(data_json));

export function mailMap(username) {
  username = normalizeEmail(username);
  return map.get(username) ?? username;
}
