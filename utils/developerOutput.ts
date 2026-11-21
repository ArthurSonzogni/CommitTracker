// Shared types and window-slicing logic for /developer-output.

import type { CohortRow } from "~/components/ReportCohortChart.vue";
import type { CohortMonthly } from "~/components/ReportCohortMonthlyChart.vue";

export interface GroupTraits {
  revert: (number | null)[];
  reland: (number | null)[];
  ai: (number | null)[];
  bypass: (number | null)[];
  no_try: (number | null)[];
  bot_commit: (number | null)[];
  bug: (number | null)[];
  fix: (number | null)[];
  commits_per_bug: (number | null)[];
  bugs_per_author: (number | null)[];
}

export interface Group {
  id: string;
  label: string;
  commits: number[];
  authors: number[];
  reviews: number[];
  reviewers: number[];
  lines: (number | null)[];
  msg: (number | null)[];
  msg_mean: (number | null)[];
  msg_p95: (number | null)[];
  msg_window: Record<string, { p50: number; mean: number; p95: number }>;
  traits: GroupTraits;
  cohort: CohortRow[];
  cohort_monthly: CohortMonthly;
  commit_size: Record<string, { q: number[]; tiny: number; files: number; added: number }>;
  percentiles: Record<string, number[]>;
  size_by_activity: Record<string, number[]>;
  kpi: {
    commits: [number, number];
    person_months: [number, number];
    authors: [number, number];
    lines: [number | null, number | null];
    msg: [number | null, number | null];
    msg_mean: [number | null, number | null];
    msg_p95: [number | null, number | null];
  };
}

export interface Repository {
  dirname: string;
  name: string;
  parent: string | null;
  github_logins: boolean;
  data_from: string;
  last_month: string | null;
  reviews_from: string | null;
  has_msg: boolean;
  has_bypass: boolean;
  groups: Group[];
  organizations: Organization[];
}

export interface Organization {
  label: string;
  authors: [number, number];
  per_author: [number, number];
  people: number;
  same: number | null;
  lines: [number | null, number | null];
  msg: [number | null, number | null];
  usual: { per_author: number[]; same: number[]; lines: number[]; msg: number[] };
}

export interface Report {
  size_quantiles: number[];
  tiny_commit: number;
  months: string[];
  window: string[];
  min_window: number;
  quantiles: number[];
  usual_years: [number, number];
  repositories: Repository[];
}

export type Column = (number | null)[];
export interface RawGroup {
  id: string;
  label: string;
  commits: number[];
  authors: number[];
  reviews: number[];
  reviewers: number[];
  lines: Column;
  msg?: Column;
  msg_mean?: Column;
  msg_p95?: Column;
  msg_window?: { p50: Column; mean: Column; p95: Column };
  traits?: Partial<GroupTraits>;
  cohort: Record<"n" | "p25" | "p50" | "p75" | "mean" | "up", Column>;
  size: { q: (number[] | null)[]; tiny: Column; files: Column; added: Column };
  percentiles: (number[] | null)[];
  size_by_activity: (number[] | null)[];
}
export interface RawOrganization {
  label: string;
  commits: number[];
  authors: number[];
  people: Column;
  same: Column;
  lines: Column;
  msg?: Column;
}
export interface RawRepository {
  dirname: string;
  name: string;
  parent: string | null;
  github_logins: boolean;
  data_from: string;
  last_month?: string | null;
  reviews_from: string | null;
  has_msg?: boolean;
  has_bypass?: boolean;
  groups: RawGroup[];
  organizations: RawOrganization[];
}
export interface RawReport {
  months: string[];
  window: number;
  min_window: number;
  quantiles: number[];
  size_quantiles: number[];
  tiny_commit: number;
  repositories: RawRepository[];
}

// The years compared with the one of the end month: the 5 before it.
export const USUAL_SPAN = 5;
// Below this many people active in both years, an organization is too small
// to measure: one person moves its figures by hundreds of percent.
export const MIN_COMPARED = 10;

// The report for the window ending at month `end`: the months stop there, the
// yearly rows are the windows ending at end, end - 12, ...
export const reportAt = (raw: RawReport, end: number): Report => {
  const months = raw.months.slice(0, end + 1);
  const W = raw.window;
  const yearOf = (i: number) => +months[i].slice(0, 4);
  const yearly = <T>(f: (i: number) => T | null) => {
    const out: T[] = [];
    for (let i = end; i >= 0; i -= 12) {
      const v = f(i);
      if (v === null) break;
      out.unshift(v);
    }
    return out;
  };
  const median = raw.size_quantiles.indexOf(0.5);
  const sum = (values: number[], last: number) => {
    let total = 0;
    for (let i = Math.max(0, last - W + 1); i <= last; i++) total += values[i];
    return total;
  };
  const organizationAt = (o: RawOrganization, i: number) => {
    const authors = [sum(o.authors, i - 12), sum(o.authors, i)];
    return {
      authors: [authors[0] / W, authors[1] / W] as [number, number],
      per_author: [
        authors[0] ? sum(o.commits, i - 12) / authors[0] : 0,
        authors[1] ? sum(o.commits, i) / authors[1] : 0,
      ] as [number, number],
      people: o.people[i] ?? 0,
      same: o.same[i],
      lines: [o.lines[i - 12], o.lines[i]] as [number | null, number | null],
      msg: [o.msg?.[i - 12] ?? null, o.msg?.[i] ?? null] as [number | null, number | null],
    };
  };
  const organization = (o: RawOrganization, dataFrom: string): Organization => {
    const change = ([before, after]: [number | null, number | null]) =>
      before && after !== null && Number.isFinite(after / before) ? [after / before - 1] : [];
    const usual: Organization["usual"] = { per_author: [], same: [], lines: [], msg: [] };
    for (let back = 1; back <= USUAL_SPAN; back++) {
      const i = end - 12 * back;
      if (i - 12 < 0 || months[i - 12] < dataFrom) break;
      const v = organizationAt(o, i);
      usual.per_author.push(...change(v.per_author));
      if (v.people >= MIN_COMPARED && v.same !== null) usual.same.push(2 ** v.same - 1);
      usual.lines.push(...change(v.lines));
      usual.msg.push(...change(v.msg));
    }
    return { label: o.label, ...organizationAt(o, end), usual };
  };
  const everyone = (g: RawGroup): RawOrganization => ({
    label: g.label,
    commits: g.commits,
    authors: g.authors,
    people: g.cohort.n,
    same: g.cohort.p50,
    lines: g.size.q.map(q => q?.[median] ?? null),
    msg: g.msg_window?.p50,
  });
  const groupAt = (g: RawGroup): Group => {
    const cut = <T>(values: T[]) => values.slice(0, end + 1);
    const emptyCol = () => new Array<number | null>(end + 1).fill(null);
    const cutCol = (values?: Column) => values ? cut(values) : emptyCol();
    const c = g.cohort;
    const personMonths: [number, number] = [sum(g.authors, end - 12), sum(g.authors, end)];
    const mw = g.msg_window;
    const t = g.traits ?? {};
    return {
      id: g.id,
      label: g.label,
      commits: cut(g.commits),
      authors: cut(g.authors),
      reviews: cut(g.reviews),
      reviewers: cut(g.reviewers),
      lines: cut(g.lines),
      msg: cutCol(g.msg),
      msg_mean: cutCol(g.msg_mean),
      msg_p95: cutCol(g.msg_p95),
      msg_window: mw
        ? Object.fromEntries(yearly(i => mw.p50[i] !== null
          ? [yearOf(i), { p50: mw.p50[i]!, mean: mw.mean[i]!, p95: mw.p95[i]! }]
          : null))
        : {},
      traits: {
        revert: cutCol(t.revert),
        reland: cutCol(t.reland),
        ai: cutCol(t.ai),
        bypass: cutCol(t.bypass),
        no_try: cutCol(t.no_try),
        bot_commit: cutCol(t.bot_commit),
        bug: cutCol(t.bug),
        fix: cutCol(t.fix),
        commits_per_bug: cutCol(t.commits_per_bug),
        bugs_per_author: cutCol(t.bugs_per_author),
      },
      cohort: yearly(i => c.n[i] === null ? null : {
        year: yearOf(i), n: c.n[i]!, p25: c.p25[i], p50: c.p50[i], p75: c.p75[i], up: c.up[i] ?? 0,
      }),
      cohort_monthly: { n: cut(c.n), mean: cut(c.mean), up: cut(c.up) },
      commit_size: Object.fromEntries(yearly(i => g.size.q[i]
        ? [yearOf(i), { q: g.size.q[i]!, tiny: g.size.tiny[i]!, files: g.size.files[i]!, added: g.size.added[i]! }]
        : null)),
      percentiles: Object.fromEntries(yearly(i => g.percentiles[i] ? [yearOf(i), g.percentiles[i]!] : null)),
      size_by_activity: Object.fromEntries(yearly(i =>
        g.size_by_activity[i] ? [yearOf(i), g.size_by_activity[i]!] : null)),
      kpi: {
        commits: [sum(g.commits, end - 12), sum(g.commits, end)],
        person_months: personMonths,
        authors: [personMonths[0] / W, personMonths[1] / W],
        lines: [g.size.q[end - 12]?.[median] ?? null, g.size.q[end]?.[median] ?? null],
        msg: [mw?.p50[end - 12] ?? null, mw?.p50[end] ?? null],
        msg_mean: [mw?.mean[end - 12] ?? null, mw?.mean[end] ?? null],
        msg_p95: [mw?.p95[end - 12] ?? null, mw?.p95[end] ?? null],
      },
    };
  };
  const year = yearOf(end);
  return {
    months,
    window: months.slice(end - W + 1),
    min_window: raw.min_window,
    quantiles: raw.quantiles,
    size_quantiles: raw.size_quantiles,
    tiny_commit: raw.tiny_commit,
    usual_years: [year - USUAL_SPAN, year - 1],
    repositories: raw.repositories.map(repository => {
      const groups = repository.groups.map(groupAt);
      const organizations = [everyone(repository.groups[0]), ...repository.organizations]
        .map(o => organization(o, repository.data_from));
      return {
        ...repository,
        last_month: repository.last_month ?? null,
        has_msg: !!repository.has_msg,
        has_bypass: !!repository.has_bypass,
        groups,
        organizations,
      };
    }),
  };
};
