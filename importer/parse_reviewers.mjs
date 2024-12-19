import {IsEmailValid} from './is_email_valid.mjs';

const ParseReviewers = (description) => {
  const reviewers = [];
  for (const line of commit.messageBody.split('\n')) {
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

export {ParseReviewers};
