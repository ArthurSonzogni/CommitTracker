import fs from "fs/promises";
import { mailMap } from "./mailmap.mjs";

// In the repositories developed on GitHub, the usernames are the GitHub logins:
// they merge the emails of a same user. The logins come from logins.json,
// written by fetch_data.mjs, and the reviewers of the GitHub pull requests are
// stored as <login>@users.noreply.github.com.
// The other repositories keep the email usernames, for now.
export async function canonicalEmails(repository, repository_dir, emails) {
  if (repository.reviewers !== "github") {
    return { canonical: email => email, loginOf: () => undefined };
  }
  const logins = await fs.readFile(`${repository_dir}/logins.json`, "utf8")
    .then(JSON.parse)
    .catch(() => ({}));
  const known = new Set(emails);
  const byLogin = new Map();
  const add = (login, email) => {
    if (!known.has(email)) return;
    let set = byLogin.get(login);
    if (!set) byLogin.set(login, set = new Set());
    set.add(email);
  };
  for (const [email, login] of Object.entries(logins)) add(login, email);
  // The logins of the authors, and of their email local parts when unique.
  // The latter resolve the Phabricator handles of LLVM, e.g. craig.topper for
  // craig.topper@sifive.com.
  const verified = new Set(Object.values(logins));
  const byLocalPart = new Map();
  for (const [email, login] of Object.entries(logins)) {
    const local = email.split("@")[0];
    const previous = byLocalPart.get(local);
    byLocalPart.set(local, previous === undefined || previous === login ? login : null);
  }
  for (const email of emails) {
    const match = email.match(/^(.+)@users\.noreply\.github\.com$/);
    if (!match) continue;
    const handle = match[1];
    // mailmap.json5 resolves the handles imported before its entries.
    const mapped = mailMap(email);
    const mappedLogin = logins[mapped] ?? mapped.match(/^(.+)@users\.noreply\.github\.com$/)?.[1];
    add(mapped !== email && mappedLogin ? mappedLogin
      : verified.has(handle) ? handle
      : (byLocalPart.get(handle) || handle), email);
  }

  const map = new Map();
  for (const [login, set] of byLogin) {
    for (const email of set) map.set(email, `${login}@users.noreply.github.com`);
  }
  // Only the logins seen as commit authors are known to be GitHub accounts:
  // the unresolved Phabricator handles may not be.
  const loginOf = new Map();
  for (const [login, set] of byLogin) {
    if (!verified.has(login)) continue;
    for (const email of set) loginOf.set(email, login);
  }
  return {
    canonical: email => map.get(email) ?? email,
    loginOf: email => loginOf.get(email),
  };
}

// The username of a canonical email: the GitHub login if any. In the GitHub
// repositories, the emails without a GitHub login keep their full email as
// username: the local part alone is ambiguous (richard@...).
export function usernameOfEmail(repository, resolved) {
  const login = resolved.match(/^(.+)@users\.noreply\.github\.com$/)?.[1];
  return login ?? (repository.reviewers === "github" ? resolved : resolved.split("@")[0]);
}
