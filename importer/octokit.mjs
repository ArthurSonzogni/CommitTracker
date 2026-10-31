import statusLine from '@alt-jero/status-line';
import {Octokit} from 'octokit';
import {throttling} from '@octokit/plugin-throttling';
import {promises as fs} from 'fs';

const MyOctokit = Octokit.plugin(throttling);

export const readGithubToken = async () => {
  try {
    const token = (await fs.readFile('.token', 'utf8')).trim();
    if (token) {
      return token;
    }
  } catch {}

  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN.trim();
  }

  if (process.env.TOKEN) {
    return process.env.TOKEN.trim();
  }

  return '';
};

const showRateLimitProgress = async (retryAfter) => {
  let current = retryAfter;
  while (current > 10) {
    statusLine(
      `${current}/${retryAfter} seconds!`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    current -= 1;
  }
};

const token = await readGithubToken();

const octokit = new MyOctokit({
  auth: token || undefined,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      statusLine.error(
        `Request quota exhausted for request ${options.method} ${options.url}`,
      );

      if (retryCount < 10) {
        statusLine.error(
          `Retrying after ${retryAfter} seconds!`);
        showRateLimitProgress(retryAfter);
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      statusLine.error(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
      );
    },
  },
});

export {octokit};
