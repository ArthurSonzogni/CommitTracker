// Chrome's stable releases, to show milestones next to dates. M1 to M6 are
// from Chrome's release history, the others from Chromium Dash
// (chromiumdash.appspot.com/fetch_milestone_schedule). M82 was skipped.

import RELEASES from "./chrome-releases.json";

export const chromeReleases = Object.entries(RELEASES)
  .map(([milestone, date]) => ({ milestone: Number(milestone), date: new Date(date) }))
  .sort((a, b) => a.milestone - b.milestone);

// The milestone on the stable channel at a date.
export const chromeMilestoneAt = (date: Date) => {
  let milestone: number | null = null;
  for (const release of chromeReleases) {
    if (release.date > date) {
      break;
    }
    milestone = release.milestone;
  }
  return milestone;
};
