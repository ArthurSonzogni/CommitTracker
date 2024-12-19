// Skip sbots and automated commit:
const g_bot_patterns = [
  '+robot',
  '-bot',
  'autoroll',
  'buildbot',
  'chrome-',
  'commit-queue',
  'github-actions',
  'gserviceaccount',
  'mdb.',
  'rebaseline',
  'release',
  'roller',
  'wptsync',
  'none@none',
  'css21testsuite',
  'dependabot',
];

const IsEmailValid = email => {
  if (g_bot_patterns.some(pattern => email.includes(pattern))) {
    return false;
  }

  // Skip authors with no emails.
  if (email.indexOf('@') == -1) {
    return false
  }

  return true;
};

export {IsEmailValid};
