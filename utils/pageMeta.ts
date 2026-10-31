import sitePagesJson from "./site-pages.json";

export interface SitePageMeta {
  path: string;
  label: string;
  icon: string;
  hint?: string;
  title?: string;
  description: string;
}

export const SITE_URL = "https://chrome-commit-tracker.arthursonzogni.com";
export const SITE_NAME = "CommitTracker";
export const SITE_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const SITE_TWITTER = "@arthursonzogni";

export const sitePages: SitePageMeta[] = sitePagesJson;

const pageByPath = new Map<string, SitePageMeta>(
  sitePages.map(page => [page.path, page]),
);

const numberFormat = new Intl.NumberFormat("en");

const plural = (count: number, word: string, words = `${word}s`) =>
  `${numberFormat.format(count)} ${count === 1 ? word : words}`;

export const findSitePage = (routePath: string): SitePageMeta | undefined => {
  const normalized = routePath.replace(/\/$/, "") || "/";
  return pageByPath.get(normalized);
};

export const formatPageTitle = (page?: SitePageMeta): string =>
  page?.title ?? (page ? `${page.label} · ${SITE_NAME}` : SITE_NAME);

export const formatPageDescription = (page?: SitePageMeta): string =>
  page?.description ?? sitePages[0]?.description ?? "";

export const formatPageUrl = (routePath: string): string =>
  `${SITE_URL}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;

export const formatDeveloperTitle = (name: string): string =>
  `${name} · ${SITE_NAME}`;

export const formatDeveloperDescription = (
  name: string,
  author: number,
  review: number,
  repoCount: number,
  firstYear: number,
): string =>
  `${name}: ${numberFormat.format(author)} commits and ${numberFormat.format(review)} reviews across ${repoCount} web platform repositories, since ${firstYear}.`;

export const formatDeveloperYearTitle = (name: string, year: number | string): string =>
  `${name} in ${year} · ${SITE_NAME}`;

export const formatDeveloperYearDescription = (
  name: string,
  year: number | string,
  author: number,
  review: number,
  repoCount: number,
): string =>
  `${name} in ${year}: ${plural(author, "commit")} and ${plural(review, "review")} across ${plural(repoCount, "web platform repository", "web platform repositories")}.`;
