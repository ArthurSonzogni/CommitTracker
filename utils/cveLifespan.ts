// Pure types, statistical helpers, and CVE record parsing for /cve/lifespan.

import chromeReleasesRaw from '~/utils/chrome-releases.json';
import type { CveRecord } from '~/utils/cve';

const chromeReleases = chromeReleasesRaw as Record<string, string>;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'] as const;
export type SeverityName = (typeof SEVERITY_ORDER)[number];

export const SEV_COLOR: Record<SeverityName, string> = {
  Critical: 'var(--severity-critical)',
  High: 'var(--severity-high)',
  Medium: 'var(--series-4)',
  Low: 'var(--series-1)',
};

export interface QuantileSummary {
  n: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface LifespanTimeSeriesBucket {
  key: string;
  n: number;
  allN: number;
  metricQ: QuantileSummary;
  engP50: number | null;
  mergeP50: number | null;
  rolloutP50: number | null;
  btsP50: number | null;
  btsP90: number | null;
  dwellQ: QuantileSummary;
  over1YrPct: number;
  slaCount: number;
  slaPct: number | null;
  revCount: number;
  revPct: number | null;
  ltsCount: number;
  perSeverity: Record<
    SeverityName,
    { n: number; turnP50: number | null; dwellN: number; dwellP50: number | null; slaPct: number | null }
  >;
}

export interface LifespanHistogramBucket {
  key: string;
  label: string;
  total: number;
  sharePct: string;
  vrpUsd: number;
  bySeverity: Record<SeverityName, number>;
}

export function styleLifespanAxes(svg: any) {
  svg.selectAll('.domain').attr('stroke', 'var(--line-strong)');
  svg.selectAll('.tick line').attr('stroke', 'var(--line)');
  svg
    .selectAll('.tick text')
    .attr('fill', 'var(--muted)')
    .style('font-size', '11px')
    .style('font-family', 'var(--font-sans)');
}

export function sparseLifespanTicks(keys: string[]): string[] {
  if (keys.length <= 12) return keys;
  return keys.filter((k, idx) => k.endsWith('Q1') || idx === keys.length - 1);
}

export interface ParsedCve {
  id: string;
  pubMs: number;
  pubIso: string;
  year: number;
  quarter: string;
  severity: SeverityName | 'Other';
  isVrp: boolean;
  reward: number;
  components: string[];
  primaryComponent: string;
  foundIn: number | null;
  fixedMilestone: number | null;
  dwellM: number | null;
  dwellD: number | null;
  bugToFix: number | null;
  branchMerge: number | null;
  rolloutToStable: number | null;
  fixToBeta: number | null;
  fixToStable: number | null;
  bugToStable: number | null;
  slaMiss: boolean;
  hasRevert: boolean;
  ltsMerged: boolean;
  ltsFriction: boolean;
  codeYellow: boolean;
  v8Postmortem: boolean;
  nag: boolean;
}

export const fmtVal = (v: number | null | undefined, suffix = '', decimals = 1): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const rounded = decimals === 0 ? Math.round(v) : Number(v.toFixed(decimals));
  return `${rounded}${suffix}`;
};

export const fmtSigned1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
};

export function quantileSorted(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

export function quantiles(values: number[]) {
  if (!values.length) {
    return {
      n: 0,
      p25: null as number | null,
      p50: null as number | null,
      p75: null as number | null,
      p90: null as number | null,
    };
  }
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    p25: quantileSorted(s, 0.25),
    p50: quantileSorted(s, 0.5),
    p75: quantileSorted(s, 0.75),
    p90: quantileSorted(s, 0.9),
  };
}

export function countShippedMilestones(fi: number, vf: number): number {
  if (vf <= fi) return 0;
  let c = 0;
  for (let m = fi; m < vf; m++) {
    if (chromeReleases[String(m)]) c++;
  }
  return c || vf - fi;
}

export function parseCveLifespanData(rawCves: CveRecord[]): {
  parsed: ParsedCve[];
  latestMs: number;
} {
  let latestMs = 0;
  const out: ParsedCve[] = [];

  for (const cve of rawCves) {
    const pubMs = cve.published ? Date.parse(cve.published) : NaN;
    if (!Number.isFinite(pubMs)) continue;
    if (pubMs > latestMs) latestMs = pubMs;
    const d = new Date(pubMs);
    const year = d.getUTCFullYear();
    const quarter = `${year}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;

    const reward = Number(cve.vrp_reward) > 0 ? Number(cve.vrp_reward) : 0;
    const sevRaw = String(cve.severity || '').trim();
    const severity: SeverityName | 'Other' = (SEVERITY_ORDER as readonly string[]).includes(sevRaw)
      ? (sevRaw as SeverityName)
      : 'Other';
    const components = Array.isArray(cve.components) ? cve.components.filter(Boolean) : [];

    // Silent Dwell Time: found_in -> version_fixed
    const fiNum = cve.found_in ? parseInt(String(cve.found_in).replace(/^M/i, ''), 10) : NaN;
    const vfNum = cve.version_fixed ? parseInt(String(cve.version_fixed).split('.')[0], 10) : NaN;
    let foundIn: number | null = null;
    let fixedMilestone: number | null = null;
    let dwellM: number | null = null;
    let dwellD: number | null = null;

    if (Number.isFinite(fiNum) && Number.isFinite(vfNum) && fiNum > 0 && vfNum >= fiNum) {
      foundIn = fiNum;
      fixedMilestone = vfNum;
      dwellM = countShippedMilestones(fiNum, vfNum);
      const foundDateMs = chromeReleases[String(fiNum)]
        ? Date.parse(chromeReleases[String(fiNum)])
        : NaN;
      const fixedDateMs = cve.version_dates?.stable
        ? Date.parse(cve.version_dates.stable)
        : chromeReleases[String(vfNum)]
          ? Date.parse(chromeReleases[String(vfNum)])
          : NaN;
      if (Number.isFinite(foundDateMs) && Number.isFinite(fixedDateMs)) {
        dwellD = Math.max(0, Math.round((fixedDateMs - foundDateMs) / DAY_MS));
      }
    }

    // Decomposed Fix Pipeline
    const commitList = cve.commits
      ? Object.values(cve.commits).filter((cm: any) => cm && cm.type === 'commit')
      : [];
    const hasRevert = commitList.some((cm: any) => /^Revert\b/i.test(cm.title || ''));
    const nonRevDates = commitList
      .filter((cm: any) => !/^Revert\b/i.test(cm.title || ''))
      .map((cm: any) => Date.parse(cm.date))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const allDates = commitList
      .map((cm: any) => Date.parse(cm.date))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const effDates = nonRevDates.length ? nonRevDates : allDates;

    const bugMs = cve.bug_date ? Date.parse(cve.bug_date) : NaN;
    const betaMs = cve.version_dates?.beta ? Date.parse(cve.version_dates.beta) : NaN;
    const stableMs = cve.version_dates?.stable ? Date.parse(cve.version_dates.stable) : NaN;

    const postBug = Number.isFinite(bugMs)
      ? effDates.filter((t) => t >= bugMs - 2 * DAY_MS)
      : effDates;
    const firstFixMs = postBug.length ? postBug[0] : NaN;
    const preStable = Number.isFinite(stableMs)
      ? postBug.filter((t) => t <= stableMs + DAY_MS)
      : postBug;
    const finalFixMs = preStable.length ? preStable[preStable.length - 1] : firstFixMs;

    let bugToFix: number | null = null;
    let branchMerge: number | null = null;
    let rolloutToStable: number | null = null;
    let fixToBeta: number | null = null;
    let fixToStable: number | null = null;
    let bugToStable: number | null = null;

    if (Number.isFinite(bugMs) && Number.isFinite(firstFixMs)) {
      const diff = (firstFixMs - bugMs) / DAY_MS;
      if (diff >= -2 && diff <= 3650) bugToFix = Math.max(0, diff);
    }
    if (Number.isFinite(firstFixMs) && Number.isFinite(finalFixMs)) {
      const diff = (finalFixMs - firstFixMs) / DAY_MS;
      if (diff >= 0 && diff <= 365) branchMerge = diff;
    }
    if (Number.isFinite(finalFixMs) && Number.isFinite(stableMs)) {
      const diff = (stableMs - finalFixMs) / DAY_MS;
      if (diff >= -1 && diff <= 730) rolloutToStable = Math.max(0, diff);
    }
    if (Number.isFinite(firstFixMs) && Number.isFinite(betaMs)) {
      const diff = (betaMs - firstFixMs) / DAY_MS;
      if (diff >= -1 && diff <= 365) fixToBeta = Math.max(0, diff);
    }
    if (Number.isFinite(firstFixMs) && Number.isFinite(stableMs)) {
      const diff = (stableMs - firstFixMs) / DAY_MS;
      if (diff >= -1 && diff <= 730) fixToStable = Math.max(0, diff);
    }
    if (Number.isFinite(bugMs) && Number.isFinite(stableMs)) {
      const diff = (stableMs - bugMs) / DAY_MS;
      if (diff >= 0 && diff <= 3650) bugToStable = diff;
    }

    const labels: string[] = Array.isArray(cve.chromium_labels) ? cve.chromium_labels : [];
    out.push({
      id: cve.id,
      pubMs,
      pubIso: cve.published,
      year,
      quarter,
      severity,
      isVrp: reward > 0,
      reward,
      components,
      primaryComponent: components[0] || 'Unassigned',
      foundIn,
      fixedMilestone,
      dwellM,
      dwellD,
      bugToFix,
      branchMerge,
      rolloutToStable,
      fixToBeta,
      fixToStable,
      bugToStable,
      slaMiss: labels.includes('Deadline-Exceeded'),
      hasRevert,
      ltsMerged: labels.some((l) => /^LTS-(Merge-)?Merged/i.test(l)),
      ltsFriction: labels.some((l) => /^LTS-(Merge-(Rejected|Delayed)|Security-Failed)/i.test(l)),
      codeYellow: labels.includes('Security-CodeYellow'),
      v8Postmortem: labels.some((l) => /^v8-postmortem$/i.test(l)),
      nag: labels.includes('Nag'),
    });
  }

  return { parsed: out, latestMs };
}
