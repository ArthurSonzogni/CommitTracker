// Shared types, formatters, and linear burn-down projection helpers for /security.

import { format } from 'd3-format';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SpanDirEntry {
  repo: string;
  repoLabel: string;
  repoColor: string;
  path: string;
  uncoveredLines: number;
  totalLines: number;
  sharePct: number;
  delta90d: number;
  treemapUrl: string;
}

export interface SpanRepoRow {
  repo: string;
  label: string;
  fullName: string;
  color: string;
  latestDate: string;
  hasMetric: boolean;
  totalLines: number;
  coveredLines: number;
  uncoveredLines: number;
  coveragePct: number;
  coverageDelta90dPct: number;
  coverageDelta365dPct: number;
  uncoveredDelta90d: number;
  allowUnsafeBuffersFiles: number;
  allowDelta90d: number;
  unsafeBuffersCalls: number;
  unsafeTodoCount: number;
  unsafeTodoDelta90d: number;
  treemapUrl: string;
  allowTreemapUrl: string | null;
  todoTreemapUrl: string | null;
  topUncoveredDirs: SpanDirEntry[];
  series: Array<[string, number, number, number]>;
}

export interface SpanScopeBlock {
  scope: string;
  totals: {
    totalLines: number;
    coveredLines: number;
    uncoveredLines: number;
    coveragePct: number;
    coverageDelta90dPct: number;
    allowUnsafeBuffersFiles: number;
    allowDelta90d: number;
    unsafeBuffersCalls: number;
    unsafeTodoCount: number;
    unsafeTodoDelta90d: number;
  };
  repos: SpanRepoRow[];
  topUncoveredDirs: SpanDirEntry[];
}

export interface CountDirEntry {
  repo: string;
  repoLabel: string;
  repoColor: string;
  path: string;
  count: number;
  sharePct: number;
  delta90d: number;
  treemapUrl: string;
}

export interface UafBucket {
  total: number;
  uaf: number;
  uafBrowser: number;
  uafRenderer: number;
  oob: number;
  typeConfusion: number;
  other: number;
  vrpUsd: number;
  uafUsd: number;
  uafBrowserUsd: number;
  uafRendererUsd: number;
  oobUsd: number;
}

export interface UafRow {
  period: string;
  vrp: UafBucket;
  all: UafBucket;
  rawPtrTotal: number;
}

export interface SecurityPayload {
  generatedAt: string;
  latestDate: string;
  windowDays: { d90: number; d365: number };
  repositories: Array<{
    id: string;
    label: string;
    fullName: string;
    color: string;
    latestDate: string;
  }>;
  spanification: {
    scopes: {
      first_party: SpanScopeBlock;
      all: SpanScopeBlock;
    };
    unsafeTodo: {
      totals: {
        current: number;
        peak: number;
        peakDate: string;
        fixedFromPeak: number;
        burnPct: number;
        delta90d: number;
        delta365d: number;
        velocityPerDay90d: number;
        etaDate: string | null;
        etaDays: number | null;
        baseSpanCurrent: number;
        baseSpanDelta90d: number;
      };
      totalSeries: Array<[string, number, number]>;
      repos: Array<{
        repo: string;
        label: string;
        color: string;
        hasMetric: boolean;
        current: number;
        peak: number;
        peakDate: string;
        fixedFromPeak: number;
        burnPct: number;
        delta90d: number;
        delta365d: number;
        velocityPerDay90d: number;
        etaDate: string | null;
        etaDays: number | null;
        treemapUrl: string | null;
        series: Array<[string, number]>;
      }>;
      topDirs: CountDirEntry[];
      subrepoTopDirs?: CountDirEntry[];
    };
  };
  miraclePtr: {
    uafRoi: {
      note: string;
      highlights: {
        browserUafShare2022Pct: number;
        browserUafShare2025Pct: number;
        browserUafShare2026Pct: number;
        totalUafShare2022Pct: number;
        totalUafShare2026Pct: number;
        browserUafCount2022: number;
        browserUafCount2025: number;
        browserUafUsd2022: number;
      };
      yearly: UafRow[];
      quarterly: UafRow[];
    };
    adoption: {
      totals: {
        rawPtr: number;
        rawRef: number;
        total: number;
        cppLines: number;
        densityPer10kLines: number;
        delta90d: number;
        delta365d: number;
      };
      repos: Array<{
        repo: string;
        label: string;
        fullName: string;
        color: string;
        hasMetric: boolean;
        rawPtr: number;
        rawRef: number;
        total: number;
        cppLines: number;
        densityPer10kLines: number;
        rawPtrDelta90d: number;
        rawRefDelta90d: number;
        delta90d: number;
        delta365d: number;
        rawPtrExclusion: number;
        treemapUrl: string | null;
        series: Array<[string, number, number, number]>;
      }>;
      topDirs: CountDirEntry[];
    };
    exclusion: {
      totals: {
        current: number;
        peak: number;
        peakDate: string;
        fixedFromPeak: number;
        burnPct: number;
        delta90d: number;
        delta365d: number;
        etaDate: string | null;
        etaDays: number | null;
      };
      totalSeries: Array<[string, number]>;
      repos: Array<{
        repo: string;
        label: string;
        color: string;
        hasMetric: boolean;
        current: number;
        peak: number;
        peakDate: string;
        burnPct: number;
        delta90d: number;
        delta365d: number;
        treemapUrl: string | null;
        series: Array<[string, number]>;
      }>;
      topDirs: CountDirEntry[];
      subrepoTopDirs?: CountDirEntry[];
    };
  };
  danglingPointers: {
    totals: {
      current: number;
      peak: number;
      peakDate: string;
      fixedFromPeak: number;
      burnPct: number;
      delta90d: number;
      delta365d: number;
      velocityPerDay90d: number;
      etaDate: string | null;
      etaDays: number | null;
    };
    totalSeries: Array<[string, number]>;
    repos: Array<{
      repo: string;
      label: string;
      color: string;
      hasMetric: boolean;
      current: number;
      peak: number;
      peakDate: string;
      fixedFromPeak: number;
      burnPct: number;
      delta90d: number;
      delta365d: number;
      treemapUrl: string | null;
      series: Array<[string, number]>;
    }>;
    topDirs: CountDirEntry[];
  };
  rust: {
    totals: {
      current: number;
      delta90d: number;
      delta365d: number;
      velocityPerWeek90d: number;
    };
    totalSeries: Array<[string, number]>;
    repos: Array<{
      repo: string;
      label: string;
      color: string;
      hasMetric: boolean;
      current: number;
      delta90d: number;
      delta365d: number;
      treemapUrl: string | null;
      series: Array<[string, number]>;
    }>;
    topDirs: CountDirEntry[];
    subrepoTopDirs?: CountDirEntry[];
  };
  invariantHardening: {
    totals: {
      checkCurrent: number;
      dcheckCurrent: number;
      totalAssertions: number;
      checkSharePct: number;
      checkShare2022Pct: number;
      dcheckPeak: number;
      dcheckPeakDate: string;
      dcheckBurnPct: number;
      checkDelta90d: number;
      dcheckDelta90d: number;
      checkDelta365d: number;
      dcheckDelta365d: number;
    };
    totalSeries: Array<[string, number, number, number]>;
    repos: Array<{
      repo: string;
      label: string;
      color: string;
      checkCurrent: number;
      dcheckCurrent: number;
      totalAssertions: number;
      checkSharePct: number;
      dcheckPeak: number;
      dcheckPeakDate: string;
      checkDelta90d: number;
      dcheckDelta90d: number;
      checkDelta365d: number;
      dcheckDelta365d: number;
      treemapUrl: string;
      series: Array<[string, number, number, number]>;
    }>;
    topDcheckDirs: Array<{
      repo: string;
      repoLabel: string;
      repoColor: string;
      path: string;
      checkCount: number;
      dcheckCount: number;
      checkSharePct: number;
      checkDelta90d: number;
      dcheckDelta90d: number;
      treemapUrl: string;
    }>;
    topCheckDirs: Array<{
      repo: string;
      repoLabel: string;
      repoColor: string;
      path: string;
      checkCount: number;
      dcheckCount: number;
      checkSharePct: number;
      checkDelta90d: number;
      dcheckDelta90d: number;
      treemapUrl: string;
    }>;
  };
}

export type TrendBasis = '90d' | '1y' | 'peak';

export const fmtInt = format(',d');
export const fmtCompact = format('.3~s');
export const intFormatter = format(',.0f');
export const pctFormatter = (d: number) => `${Number(d).toFixed(0)}%`;
export const fmtUsd = (v: number) =>
  '$' + (v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M' : fmtInt(Math.round(v)));
export const fmtSigned = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));
export const fmtSlope = (v: number) => {
  const abs = Math.abs(v);
  const str = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return v > 0 ? `+${str}` : v < 0 ? `−${str}` : '0.0';
};
export const formatCovPct = (v: number) =>
  v >= 99.9 && v < 100 ? v.toFixed(2) : v > 0 && v < 1 ? v.toFixed(2) : v.toFixed(1);

export const fmtEtaDuration = (days: number | null) => {
  if (days === null) return '';
  if (days < 45) return `${days}d`;
  if (days < 540) return `${Math.round(days / 30.4)} mos`;
  return `${(days / 365.25).toFixed(1)} yrs`;
};

export const basisLabel = (b: TrendBasis) => (b === '90d' ? '90d' : b === '1y' ? '1y' : 'Since peak');

export const repoChipStyle = (color: string, active: boolean) =>
  active
    ? {
        color,
        borderColor: `color-mix(in srgb, ${color} 55%, var(--line))`,
        background: `color-mix(in srgb, ${color} 10%, var(--surface))`,
      }
    : undefined;

// Linear burn-down fit & forward projection to y = 0 for a [date, count] series.
export function computeLinearProjection(
  pts: Array<[string, number]>,
  basis: TrendBasis,
  minPeakDate = '2019-01-01',
) {
  if (!pts.length) {
    return {
      curDate: '',
      curVal: 0,
      peakDate: '',
      peakVal: 0,
      fixedFromPeak: 0,
      burnPct: 0,
      startDate: '',
      startVal: 0,
      days: 1,
      delta: 0,
      slopePerDay: 0,
      etaDays: null as number | null,
      etaDate: null as string | null,
      trendPoints: [] as Array<{ x: Date; y: number }>,
    };
  }

  const last = pts[pts.length - 1];
  const curDate = last[0];
  const curVal = last[1];
  const curMs = new Date(curDate).getTime();

  let peakPt = pts[0];
  for (const p of pts) {
    if (p[0] >= minPeakDate && p[1] >= peakPt[1]) {
      peakPt = p;
    }
  }
  const peakVal = peakPt[1];
  const peakDate = peakPt[0];
  const fixedFromPeak = Math.max(0, peakVal - curVal);
  const burnPct = peakVal > 0 ? Math.round(((peakVal - curVal) / peakVal) * 1000) / 10 : 0;

  const findClosest = (targetMs: number) =>
    pts.reduce(
      (best, p) =>
        Math.abs(new Date(p[0]).getTime() - targetMs) <
        Math.abs(new Date(best[0]).getTime() - targetMs)
          ? p
          : best,
      pts[0],
    );

  const startPt =
    basis === '90d'
      ? findClosest(curMs - 90 * DAY_MS)
      : basis === '1y'
        ? findClosest(curMs - 365 * DAY_MS)
        : peakPt;

  const startDate = startPt[0];
  const startVal = startPt[1];
  const startMs = new Date(startDate).getTime();
  const days = Math.max(1, (curMs - startMs) / DAY_MS);
  const delta = curVal - startVal;
  const slopePerDay = delta / days;

  let etaDays: number | null = null;
  let etaDate: string | null = null;
  const trendPoints: Array<{ x: Date; y: number }> = [];

  if (slopePerDay < -0.01 && curVal > 0) {
    etaDays = Math.ceil(curVal / -slopePerDay);
    const endMs = curMs + etaDays * DAY_MS;
    etaDate = new Date(endMs).toISOString().slice(0, 10);

    // Sample weekly/monthly points along the exact line from startMs -> curMs -> endMs
    // so LineChart scrubbing tracks smoothly along the entire projection.
    const spanMs = endMs - startMs;
    const steps = 48;
    for (let s = 0; s <= steps; s++) {
      const t = startMs + (spanMs * s) / steps;
      const val = Math.max(0, startVal + slopePerDay * ((t - startMs) / DAY_MS));
      trendPoints.push({ x: new Date(t), y: Math.round(val) });
    }
    trendPoints[trendPoints.length - 1] = { x: new Date(endMs), y: 0 };
  } else if (curVal > 0) {
    // Rising or flat over the chosen window: show the fitted window + 120d forward preview.
    const endMs = curMs + 120 * DAY_MS;
    const spanMs = endMs - startMs;
    const steps = 20;
    for (let s = 0; s <= steps; s++) {
      const t = startMs + (spanMs * s) / steps;
      const val = Math.max(0, startVal + slopePerDay * ((t - startMs) / DAY_MS));
      trendPoints.push({ x: new Date(t), y: Math.round(val) });
    }
  }

  return {
    curDate,
    curVal,
    peakDate,
    peakVal,
    fixedFromPeak,
    burnPct,
    startDate,
    startVal,
    days,
    delta,
    slopePerDay,
    etaDays,
    etaDate,
    trendPoints,
  };
}
