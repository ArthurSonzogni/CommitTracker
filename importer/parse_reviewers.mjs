import {IsEmailValid} from './is_email_valid.mjs';
import {mailMap} from './mailmap.mjs';

const ParseReviewers = (description) => {
  const reviewers = [];
  for (const line of description.split('\n')) {
    if (!line.startsWith('Reviewed-by:')) {
      continue;
    }
    const a = line.indexOf('<');
    const b = line.indexOf('>');
    if (a == -1 || b == -1) {
      continue;
    }
    const reviewer = mailMap(line.substring(a + 1, b));
    if (!IsEmailValid(reviewer)) {
      continue;
    }

    reviewers.push(reviewer);
  }
  return reviewers;
}

// The "Reviewed By: handle1, handle2" line added by Phabricator, e.g. in LLVM
// before it moved to the GitHub pull requests. The handles are often the
// GitHub logins: they are stored as <handle>@users.noreply.github.com, like
// the GitHub reviewers, to be resolved with the logins.json of the repository.
// The project tags (#libc) are not people.
const ParsePhabricatorReviewers = (description) => {
  const reviewers = [];
  for (const line of description.split('\n')) {
    if (!line.startsWith('Reviewed By:')) {
      continue;
    }
    for (let handle of line.slice('Reviewed By:'.length).split(',')) {
      handle = handle.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(handle)) {
        continue;
      }
      const reviewer = mailMap(`${handle}@users.noreply.github.com`);
      if (IsEmailValid(reviewer)) {
        reviewers.push(reviewer);
      }
    }
  }
  return reviewers;
}

export {ParseReviewers, ParsePhabricatorReviewers};
