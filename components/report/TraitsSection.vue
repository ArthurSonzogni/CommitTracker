<template>
  <section v-if="repository.has_msg && traitOptions.length" class="panel">
    <div>
      <h2 class="panel-title">{{ traitPanelTitle }}</h2>
      <p class="panel-text">{{ traitPanelText }}</p>
    </div>
    <dl v-if="traitFacts.length" class="trait-facts">
      <div v-for="fact in traitFacts" :key="fact.label">
        <dt>{{ fact.label }}</dt>
        <dd>
          <span class="fact-value">{{ fact.previous }} → {{ fact.current }}</span>
          <span class="fact-detail">{{ fact.detail }}</span>
        </dd>
      </div>
    </dl>
    <div class="switches">
      <UiSegmented v-model="traitView" :options="traitOptions" aria-label="Commit trait" />
    </div>
    <div class="legend">
      <span v-for="s in traitSeries" :key="s.label">
        <span class="legend-line" :style="{ background: s.color }" />{{ s.label }}
      </span>
    </div>
    <ReportTraitChart
      :months="months"
      :series="traitSeries"
      :from="indexFrom"
      :highlight-from="`${lastYear}-01`"
      :format="traitFormat"
      :axis-format="traitAxisFormat"
      :aria-label="traitPanelTitle" />
    <ReportDataTable
      :columns="['Month', ...traitSeries.map(s => s.label)]"
      :rows="traitTable" />
  </section>
</template>

<script setup lang="ts">
import type { TraitSeries } from "~/components/ReportTraitChart.vue";
import type { Group, Repository } from "~/utils/developerOutput";

export type TraitView = "msg" | "reverts" | "bypasses" | "bugs" | "bugs_per_author" | "bug_churn";

const props = defineProps<{
  group: Group;
  repository: Repository;
  months: string[];
  windowLength: number;
  endIndex: number;
  lastYear: number;
  indexFrom: string;
}>();

const traitView = defineModel<TraitView>("traitView", { required: true });

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct1 = (v: number | null) => v === null ? "—" : `${(v * 100).toFixed(1)}%`;

const shortMonth = (ym: string) =>
  new Date(`${ym}-15T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
const monthShort = (ym: string) => `${shortMonth(ym)} ${ym.slice(0, 4)}`;

const hasTracked = (values: (number | null)[]) => {
  const start = Math.max(0, props.months.findIndex(m => m >= props.indexFrom));
  for (let i = start; i < values.length; i++) {
    if (values[i] !== null && values[i]! > 0) return true;
  }
  return false;
};

const trackedTraits = computed(() => {
  const g = props.group;
  if (!props.repository.has_msg) {
    return {
      msg: false,
      revert: false,
      reland: false,
      bypass: false,
      no_try: false,
      bug: false,
      fix: false,
      bugs_per_author: false,
      bug_churn: false,
    };
  }
  const hasBypass = !!props.repository.has_bypass && hasTracked(g.traits.bypass);
  return {
    msg: hasTracked(g.msg),
    revert: hasTracked(g.traits.revert),
    reland: hasTracked(g.traits.reland),
    bypass: hasBypass,
    no_try: hasBypass && hasTracked(g.traits.no_try),
    bug: hasTracked(g.traits.bug),
    fix: hasTracked(g.traits.fix),
    bugs_per_author: hasTracked(g.traits.bugs_per_author),
    bug_churn: hasTracked(g.traits.commits_per_bug),
  };
});

const windowWeightedShare = (values: (number | null)[], weights: number[], last: number) => {
  const w = props.windowLength;
  let num = 0, den = 0;
  for (let i = Math.max(0, last - w + 1); i <= last; i++) {
    if (values[i] === null || !weights[i]) continue;
    num += values[i]! * weights[i];
    den += weights[i];
  }
  return den ? num / den : null;
};

const windowAvg = (values: (number | null)[], last: number) => {
  const w = props.windowLength;
  let sum = 0, n = 0;
  for (let i = Math.max(0, last - w + 1); i <= last; i++) {
    if (values[i] === null) continue;
    sum += values[i]!;
    n++;
  }
  return n ? sum / n : null;
};

const traitFacts = computed(() => {
  const g = props.group;
  const tracked = trackedTraits.value;
  const end = props.endIndex, prev = end - 12;
  if (prev < 0) return [];
  const mwCur = g.msg_window[props.lastYear], mwPrev = g.msg_window[props.lastYear - 1];
  const revPrev = windowWeightedShare(g.traits.revert, g.commits, prev);
  const revCur = windowWeightedShare(g.traits.revert, g.commits, end);
  const bypPrev = windowWeightedShare(g.traits.bypass, g.commits, prev);
  const bypCur = windowWeightedShare(g.traits.bypass, g.commits, end);
  const bugPrev = windowWeightedShare(g.traits.bug, g.commits, prev);
  const bugCur = windowWeightedShare(g.traits.bug, g.commits, end);
  const cpbPrev = windowAvg(g.traits.commits_per_bug, prev);
  const cpbCur = windowAvg(g.traits.commits_per_bug, end);
  const bpaPrev = windowAvg(g.traits.bugs_per_author, prev);
  const bpaCur = windowAvg(g.traits.bugs_per_author, end);

  return [
    ...(tracked.msg && mwCur && mwPrev ? [{
      label: "Message length",
      previous: `${integer.format(mwPrev.p50)}`,
      current: `${integer.format(mwCur.p50)} chars`,
      detail: `median (mean ${integer.format(mwPrev.mean)} → ${integer.format(mwCur.mean)})`,
    }] : []),
    ...(tracked.revert && revPrev !== null && revCur !== null ? [{
      label: "Revert rate",
      previous: pct1(revPrev),
      current: pct1(revCur),
      detail: "of commits revert an earlier change",
    }] : []),
    ...(tracked.bypass && bypPrev !== null && bypCur !== null ? [{
      label: "Check bypasses",
      previous: pct1(bypPrev),
      current: pct1(bypCur),
      detail: "use No-Try, No-Presubmit, Owners-Override, or Bypass-*",
    }] : []),
    ...(tracked.bugs_per_author && bpaPrev !== null && bpaCur !== null ? [{
      label: "Bugs per author",
      previous: decimal.format(bpaPrev),
      current: `${decimal.format(bpaCur)} / mo`,
      detail: cpbCur !== null && cpbPrev !== null
        ? `distinct bugs touched (${decimal.format(cpbPrev)} → ${decimal.format(cpbCur)} commits/bug)`
        : "distinct bugs touched per active author",
    }] : tracked.bug && bugPrev !== null && bugCur !== null ? [{
      label: "Bug-linked",
      previous: pct1(bugPrev),
      current: pct1(bugCur),
      detail: cpbCur !== null && cpbPrev !== null
        ? `reference a bug (${decimal.format(cpbPrev)} → ${decimal.format(cpbCur)} commits/bug)`
        : "reference a numeric bug ID",
    }] : []),
  ];
});

const traitOptions = computed(() => {
  const t = trackedTraits.value;
  return [
    ...(t.msg ? [{ value: "msg", label: "Message length" }] : []),
    ...(t.revert ? [{ value: "reverts", label: "Revert rate" }] : []),
    ...(t.bypass ? [{ value: "bypasses", label: "Check bypasses" }] : []),
    ...(t.bugs_per_author ? [{ value: "bugs_per_author", label: "Bugs per author" }] : []),
    ...(t.bug_churn ? [{ value: "bug_churn", label: "Commits per bug" }] : []),
    ...(t.bug ? [{ value: "bugs", label: "Bug links" }] : []),
  ];
});

watch(traitOptions, opts => {
  if (opts.length && !opts.some(o => o.value === traitView.value)) {
    traitView.value = opts[0].value as TraitView;
  }
});

const traitPanelTitle = computed(() => ({
  msg: "Commit message length over time",
  reverts: "Revert and reland rate",
  bypasses: "Check and review bypasses",
  bugs: "Bug-linked and bug-closing commits",
  bugs_per_author: "Distinct bugs touched per author",
  bug_churn: "Commits per bug",
})[traitView.value]);

const traitPanelText = computed(() => ({
  msg: "Monthly character length (median and mean) of commit descriptions without footers/trailers, excluding reverts and rolls.",
  reverts: "Share of authored commits each month that revert or reland a previous commit.",
  bypasses: "Share of authored commits using No-Try, No-Presubmit, No-Tree-Checks, Owners-Override, Bypass-*, or Low-Coverage-Reason.",
  bugs: "Share of authored commits referencing a numeric bug ID, and share explicitly closing one (Fixed/Fixes/Closes).",
  bugs_per_author: "Distinct numeric bug IDs referenced in a month, divided by the number of active authors that month.",
  bug_churn: "Average authored commits per distinct bug ID touched in each month.",
})[traitView.value]);

const traitSeries = computed<TraitSeries[]>(() => {
  const g = props.group;
  const t = trackedTraits.value;
  switch (traitView.value) {
    case "msg":
      return [
        { label: "Median", color: "var(--series-1)", values: g.msg },
        { label: "Mean", color: "var(--series-2)", values: g.msg_mean },
      ];
    case "reverts":
      return [
        { label: "Reverts", color: "var(--series-8)", values: g.traits.revert },
        ...(t.reland ? [{ label: "Relands", color: "var(--series-4)", values: g.traits.reland }] : []),
      ];
    case "bypasses":
      return [
        { label: "Any bypass", color: "var(--series-2)", values: g.traits.bypass },
        ...(t.no_try ? [{ label: "No-Try", color: "var(--series-1)", values: g.traits.no_try }] : []),
      ];
    case "bugs":
      return [
        { label: "Has bug", color: "var(--series-1)", values: g.traits.bug },
        ...(t.fix ? [{ label: "Closes bug", color: "var(--series-3)", values: g.traits.fix }] : []),
      ];
    case "bugs_per_author":
      return [
        { label: "Bugs / author", color: "var(--series-3)", values: g.traits.bugs_per_author },
      ];
    case "bug_churn":
      return [
        { label: "Commits / bug", color: "var(--series-1)", values: g.traits.commits_per_bug },
      ];
  }
});

const traitFormat = computed(() => {
  if (traitView.value === "msg") {
    return (v: number) => `${integer.format(v)} chars`;
  }
  if (traitView.value === "bug_churn" || traitView.value === "bugs_per_author") {
    return (v: number) => decimal.format(v);
  }
  return (v: number) => pct1(v);
});

const traitAxisFormat = computed(() => {
  if (traitView.value === "msg") {
    return (v: number) => integer.format(v);
  }
  if (traitView.value === "bug_churn" || traitView.value === "bugs_per_author") {
    return (v: number) => decimal.format(v);
  }
  return (v: number) => {
    const p = v * 100;
    return p < 1 && p > 0 ? `${p.toFixed(2)}%` : `${+p.toFixed(1)}%`;
  };
});

const traitTable = computed(() => {
  const months = props.months, series = traitSeries.value, rows: string[][] = [];
  for (let i = months.length - 1; i >= 0 && months[i] >= props.indexFrom; i--) {
    if (series.every(s => s.values[i] === null)) continue;
    rows.push([
      monthShort(months[i]),
      ...series.map(s => s.values[i] === null ? "—" : traitFormat.value(s.values[i]!)),
    ]);
  }
  return rows;
});
</script>

<style scoped>
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  align-content: start;
  border-radius: var(--radius-lg);
  display: grid;
  gap: 0.8rem;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  padding: 1.1rem 1.2rem;
}

.panel-title {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 640;
  margin-bottom: 0.15rem;
  text-wrap: balance;
}

.panel-text {
  color: var(--muted);
  font-size: 0.86rem;
  max-width: 85ch;
}

.trait-facts {
  display: grid;
  gap: 0.75rem 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  margin: 0;
}

.trait-facts dt {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.trait-facts dd {
  display: grid;
  margin: 0;
}

.fact-value {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.fact-detail {
  color: var(--ink-2);
  font-size: 0.8rem;
}

.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.switches > * {
  max-width: 100%;
  min-width: 0;
}

.legend {
  align-items: center;
  color: var(--ink-2);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  gap: 0.35rem 1.1rem;
}

.legend-line {
  border-radius: 2px;
  display: inline-block;
  height: 3px;
  margin-right: 0.4rem;
  vertical-align: middle;
  width: 16px;
}
</style>
