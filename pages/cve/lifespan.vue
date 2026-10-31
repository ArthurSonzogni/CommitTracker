<template>
  <div>
    <CveSubnav />

    <section class="section pb-4">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">CVE lifespan &amp; security SLA</h1>
            <p class="subtitle-text">
              How long vulnerabilities silently live in shipping Chrome before discovery
              (<code>Found In → Fixed</code>), where wall-clock turnaround goes between engineering
              fix commits and release-train soak, and how security SLOs perform by subsystem.
            </p>
          </div>
        </div>

        <AboutData class="mt-3">
          <p>
            Computed from <strong>{{ data ? fmtInt(data.summary.totalCves) : '7,092' }}</strong>
            public Chromium CVEs in <code>/cve/data.json</code> joined with Chrome milestone release
            dates (<code>chrome-releases.json</code>).
          </p>
          <ul>
            <li>
              <strong>Silent vulnerability dwell time:</strong> shipped Chrome milestones elapsed
              between <code>found_in</code> (earliest affected milestone identified by bisection /
              ClusterFuzz) and <code>version_fixed</code> across
              <strong>{{ data ? fmtInt(data.summary.withDwellCount) : '3,980' }}</strong> CVEs.
            </li>
            <li>
              <strong>Decomposed fix pipeline:</strong> splits bug turnaround into
              <em>Discovery → Trunk Fix CL</em> (<code>bug_date</code> to earliest non-revert fix
              commit), <em>Trunk Fix → Branch Merge CL</em>, and
              <em>Final Fix CL → Stable Release</em> (<code>version_dates.stable</code>) across
              <strong>{{ data ? fmtInt(data.summary.withPipelineCount) : '5,298' }}</strong> CVEs.
            </li>
            <li>
              <strong>Security SLA &amp; fix stability:</strong> surfaces Buganizer/Monorail labels
              (<code>Deadline-Exceeded</code>, <code>Security-CodeYellow</code>,
              <code>LTS-Merge-*</code>, <code>v8-postmortem</code>) and fix commits reverted on
              trunk.
            </li>
          </ul>
        </AboutData>

        <!-- KPI Strip -->
        <div v-if="data" class="kpi-grid mt-4">
          <div class="kpi-card">
            <div class="kpi-eyebrow">Median Silent Dwell Time</div>
            <div class="kpi-value">
              {{ data.summary.medianDwellMilestones }}
              <span class="kpi-unit">milestones ({{ data.summary.medianDwellDays }}d)</span>
            </div>
            <p class="kpi-detail">
              P90: <strong>{{ data.summary.p90DwellMilestones }} milestones</strong>
              ({{ fmtInt(data.summary.p90DwellDays) }}d) ·
              <strong>{{ data.summary.over1YrDwellPct }}%</strong> live ≥1 year in Stable
            </p>
          </div>

          <div class="kpi-card">
            <div class="kpi-eyebrow">Engineering Trunk Fix (P50)</div>
            <div class="kpi-value">
              {{ data.summary.medianEngFixDays }}d
              <span class="kpi-unit">discovery → trunk CL</span>
            </div>
            <p class="kpi-detail">
              Mean <strong>{{ data.summary.meanEngFixDays }}d</strong> · P90
              <strong>{{ data.summary.p90EngFixDays }}d</strong> across
              {{ fmtInt(data.summary.withPipelineCount) }} CVEs
            </p>
          </div>

          <div class="kpi-card">
            <div class="kpi-eyebrow">Release Soak &amp; Rollout Lag</div>
            <div class="kpi-value">
              {{ data.summary.medianCommitToStableDays }}d
              <span class="kpi-unit">trunk CL → Stable</span>
            </div>
            <p class="kpi-detail">
              Total Bug → Stable median <strong>{{ data.summary.medianBugToStableDays }}d</strong>
              (~70% is soak &amp; release train) · Extended
              <strong>{{ data.summary.medianCommitToExtendedDays }}d</strong>
            </p>
          </div>

          <div class="kpi-card">
            <div class="kpi-eyebrow">SLA Breaches &amp; Fix Reverts</div>
            <div class="kpi-value">
              {{ fmtInt(data.summary.deadlineExceededCount) }}
              <span class="kpi-unit">Deadline-Exceeded</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtInt(data.summary.fixRevertsCount) }}</strong> CVEs had a fix CL
              reverted · <strong>{{ fmtInt(data.summary.ltsMergedCount) }}</strong> LTS backports
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Row 1: Dwell Distribution + Dwell Trend -->
    <section class="section pt-2 pb-5">
      <div class="container">
        <div class="two-col-grid">
          <!-- Left: Milestone Dwell Histogram -->
          <div class="chart-card">
            <div class="card-head">
              <div>
                <h2 class="title is-5 mb-1">Silent lifespan distribution (Found In → Fixed)</h2>
                <p class="muted-note">
                  Milestones shipped before discovery, stacked by CVE severity (n =
                  {{ data ? fmtInt(data.summary.withDwellCount) : '…' }}).
                </p>
              </div>
            </div>

            <div class="sev-legend">
              <span><i class="dot" style="background: var(--severity-critical)" /> Critical</span>
              <span><i class="dot" style="background: var(--severity-high)" /> High</span>
              <span><i class="dot" style="background: var(--series-4)" /> Medium</span>
              <span><i class="dot" style="background: var(--series-1)" /> Low</span>
            </div>

            <div ref="histWrap" class="svg-box">
              <svg ref="histSvg" />
              <div v-if="histHover" class="floating-tt" :style="histTtStyle">
                <div class="tt-title">{{ histHover.label }}</div>
                <div class="tt-line">
                  <span>Total CVEs:</span>
                  <strong>{{ fmtInt(histHover.total) }} ({{ histHover.sharePct }}%)</strong>
                </div>
                <div class="tt-line">
                  <span>Critical / High:</span>
                  <strong>{{ histHover.bySeverity.Critical }} / {{ histHover.bySeverity.High }}</strong>
                </div>
                <div class="tt-line">
                  <span>Medium / Low:</span>
                  <strong>{{ histHover.bySeverity.Medium }} / {{ histHover.bySeverity.Low }}</strong>
                </div>
                <div class="tt-line">
                  <span>VRP Bounties:</span>
                  <strong>{{ fmtUsd(histHover.vrpUsd) }}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Yearly Dwell Trend (Median & P90) -->
          <div class="chart-card">
            <div class="card-head">
              <div>
                <h2 class="title is-5 mb-1">Dwell-time trend over years (Median &amp; P90)</h2>
                <p class="muted-note">
                  Are fuzzers and audits catching bugs closer to introduction, or unearthing
                  multi-year debt?
                </p>
              </div>
              <div class="inline-controls">
                <UiSegmented
                  v-model="dwellUnit"
                  aria-label="Dwell unit"
                  :options="[
                    { value: 'milestones', label: 'Milestones' },
                    { value: 'days', label: 'Days' },
                  ]" />
                <UiSegmented
                  v-model="dwellCohort"
                  aria-label="CVE cohort"
                  :options="[
                    { value: 'vrp', label: 'VRP' },
                    { value: 'all', label: 'All' },
                  ]" />
              </div>
            </div>

            <div class="sev-legend">
              <span>
                <i class="line-key" style="border-color: var(--series-1)" />
                Median (P50)
              </span>
              <span>
                <i class="line-key is-dashed" style="border-color: var(--series-2)" />
                90th Percentile (P90)
              </span>
            </div>

            <div ref="trendWrap" class="svg-box">
              <svg ref="trendSvg" />
              <div v-if="trendHover" class="floating-tt" :style="trendTtStyle">
                <div class="tt-title">{{ trendHover.year }} ({{ fmtInt(trendHover.n) }} CVEs)</div>
                <div class="tt-line">
                  <span>Median dwell:</span>
                  <strong>{{ trendHover.p50Text }}</strong>
                </div>
                <div class="tt-line">
                  <span>P90 dwell:</span>
                  <strong>{{ trendHover.p90Text }}</strong>
                </div>
                <div class="tt-line" v-if="trendHover.samePct !== null">
                  <span>Caught in 0 milestones:</span>
                  <strong>{{ trendHover.samePct }}%</strong>
                </div>
                <div class="tt-line" v-if="trendHover.ancientPct !== null">
                  <span>25+ milestones (~2+ yrs):</span>
                  <strong>{{ trendHover.ancientPct }}%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Row 2: Decomposed Fix Pipeline Latency -->
    <section class="section pt-2 pb-5">
      <div class="container">
        <div class="section-toolbar">
          <div>
            <h2 class="title is-4 mb-1">
              Decomposed fix turnaround: Engineering CL vs Branch Merge vs Release Rollout
            </h2>
            <p class="muted-note">
              Separates engineering root-cause &amp; trunk landing time from release-branch cherry-picks
              and Stable rollout cadence.
            </p>
          </div>
          <div class="inline-controls">
            <UiSegmented
              v-model="pipelineGroup"
              aria-label="Group pipeline by"
              :options="[
                { value: 'severity', label: 'By Severity' },
                { value: 'year', label: 'By Year' },
                { value: 'component', label: 'Top Components' },
              ]" />
            <UiSegmented
              v-model="pipelineStat"
              aria-label="Pipeline statistic"
              :options="[
                { value: 'median', label: 'Median (P50)' },
                { value: 'mean', label: 'Mean (Additive)' },
              ]" />
          </div>
        </div>

        <div class="chart-card">
          <div class="sev-legend mb-2">
            <span>
              <i class="dot" style="background: var(--series-1)" />
              Discovery → Trunk Fix CL (Engineering)
            </span>
            <span>
              <i class="dot" style="background: var(--series-4)" />
              Trunk Fix → Final Branch Merge CL
            </span>
            <span>
              <i class="dot" style="background: var(--series-3)" />
              Final Fix CL → Stable Release (Rollout soak)
            </span>
          </div>

          <div ref="pipeWrap" class="pipe-svg-box">
            <svg ref="pipeSvg" />
            <div v-if="pipeHover" class="floating-tt" :style="pipeTtStyle">
              <div class="tt-title">{{ pipeHover.label }} ({{ fmtInt(pipeHover.n) }} CVEs)</div>
              <div class="tt-line">
                <span>1. Discovery → Trunk Fix:</span>
                <strong>{{ pipeHover.eng }}d</strong>
              </div>
              <div class="tt-line">
                <span>2. Trunk → Branch Merge:</span>
                <strong>{{ pipeHover.merge }}d</strong>
              </div>
              <div class="tt-line">
                <span>3. Final Fix → Stable:</span>
                <strong>{{ pipeHover.rollout }}d</strong>
              </div>
              <div class="tt-line" v-if="pipeHover.totalP50 !== null">
                <span>Overall Bug → Stable P50 / P90:</span>
                <strong>{{ pipeHover.totalP50 }}d / {{ pipeHover.totalP90 }}d</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Row 3: Component Dwell-Time & Security SLA Table -->
    <section class="section pt-2 pb-5">
      <div class="container">
        <div class="section-toolbar">
          <div>
            <h2 class="title is-4 mb-1">Component dwell-time &amp; SLA scorecard</h2>
            <p class="muted-note">
              Subsystem breakdown of vulnerability lifespan, trunk fix turnaround,
              <code>Deadline-Exceeded</code> breaches, and reverted security fixes.
            </p>
          </div>
          <div class="comp-filter-box">
            <input
              v-model="compFilter"
              type="search"
              class="input is-small"
              placeholder="Filter component (e.g. Blink, GPU, Network)..." />
          </div>
        </div>

        <div v-if="data" class="card-table-wrap">
          <UiTable
            :data="filteredComponents"
            row-key="component"
            striped
            hoverable
            paginated
            :per-page="15">
            <UiTableColumn field="component" label="Component" sortable>
              <template #default="{ row }">
                <NuxtLink :to="`/cve/list?component=${encodeURIComponent(row.component)}`" class="comp-link">
                  <code>{{ row.component }}</code>
                </NuxtLink>
              </template>
            </UiTableColumn>
            <UiTableColumn field="count" label="CVEs" numeric sortable />
            <UiTableColumn
              field="vrpUsd"
              label="VRP $"
              numeric
              sortable
              :formatter="(v: number) => fmtUsd(v)" />
            <UiTableColumn
              field="medianMilestones"
              label="Median Dwell"
              numeric
              sortable
              hint="Shipped Chrome milestones between Found In and Version Fixed">
              <template #default="{ row }">
                <span v-if="row.medianMilestones !== null">
                  <strong>{{ row.medianMilestones }}</strong> M
                  <span class="sub-muted">({{ row.medianDwellDays }}d)</span>
                </span>
                <span v-else class="sub-muted">—</span>
              </template>
            </UiTableColumn>
            <UiTableColumn
              field="p90Milestones"
              label="P90 Dwell"
              numeric
              sortable
              :formatter="(v: number | null) => (v !== null ? `${v} M` : '—')" />
            <UiTableColumn
              field="medianEngFixDays"
              label="Eng Fix (P50)"
              numeric
              sortable
              hint="Median days from bug filing to earliest trunk fix commit"
              :formatter="(v: number | null) => (v !== null ? `${v}d` : '—')" />
            <UiTableColumn
              field="medianCommitToStableDays"
              label="Release Lag (P50)"
              numeric
              sortable
              hint="Median days from trunk fix commit to Stable channel release"
              :formatter="(v: number | null) => (v !== null ? `${v}d` : '—')" />
            <UiTableColumn
              field="deadlineExceeded"
              label="Deadline-Exceeded"
              numeric
              sortable>
              <template #default="{ row }">
                <span v-if="row.deadlineExceeded > 0" class="sla-pill is-danger">
                  {{ row.deadlineExceeded }} ({{ row.deadlineExceededPct }}%)
                </span>
                <span v-else class="sub-muted">0</span>
              </template>
            </UiTableColumn>
            <UiTableColumn
              field="fixReverts"
              label="Fix Reverts"
              numeric
              sortable>
              <template #default="{ row }">
                <span v-if="row.fixReverts > 0" class="sla-pill is-warn">
                  {{ row.fixReverts }} ({{ row.fixRevertPct }}%)
                </span>
                <span v-else class="sub-muted">0</span>
              </template>
            </UiTableColumn>
            <UiTableColumn field="ltsMerged" label="LTS Merges" numeric sortable />
          </UiTable>
        </div>
      </div>
    </section>

    <!-- Row 4: Security Operational Labels + Longest-Lived High/Critical CVEs -->
    <section class="section pt-2">
      <div class="container">
        <div class="two-col-grid">
          <!-- Operational Labels -->
          <div class="chart-card">
            <h2 class="title is-5 mb-1">Security SLA &amp; operational telemetry</h2>
            <p class="muted-note mb-3">
              Escalations, LTS backport outcomes, postmortems, and fix-revert rates across all CVEs.
            </p>
            <div v-if="data" class="table-container">
              <table class="table is-fullwidth is-narrow sla-table">
                <thead>
                  <tr>
                    <th>Signal / Label</th>
                    <th class="has-text-right">CVEs</th>
                    <th class="has-text-right">Bug→Stable P50</th>
                    <th>Sample CVEs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tag in data.slaLabels" :key="tag.id">
                    <td>
                      <div class="tag-title">{{ tag.label }}</div>
                      <div class="tag-desc">{{ tag.description }}</div>
                    </td>
                    <td class="has-text-right num-cell">
                      <strong>{{ fmtInt(tag.count) }}</strong>
                      <span class="sub-block">{{ tag.shareOfTotalPct }}%</span>
                    </td>
                    <td class="has-text-right num-cell">
                      {{ tag.medianBugToStableDays !== null ? `${tag.medianBugToStableDays}d` : '—' }}
                    </td>
                    <td>
                      <div class="cve-pills">
                        <NuxtLink
                          v-for="ex in tag.examples.slice(0, 2)"
                          :key="ex"
                          :to="`/cve?id=${ex}`"
                          class="cve-mini-pill">
                          {{ ex }}
                        </NuxtLink>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Longest-lived High/Critical CVEs -->
          <div class="chart-card">
            <h2 class="title is-5 mb-1">Longest-lived High &amp; Critical vulnerabilities</h2>
            <p class="muted-note mb-3">
              Vulnerabilities that survived across the most Chrome milestones before discovery.
            </p>
            <div v-if="data" class="table-container">
              <table class="table is-fullwidth is-narrow sla-table">
                <thead>
                  <tr>
                    <th>CVE</th>
                    <th>Component</th>
                    <th class="has-text-right">Span</th>
                    <th class="has-text-right">Dwell</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in data.longestLivedCves.slice(0, 10)" :key="c.id">
                    <td>
                      <NuxtLink :to="`/cve?id=${c.id}`" class="cve-id-link">
                        CVE-{{ c.id }}
                      </NuxtLink>
                      <span
                        class="sev-dot"
                        :class="c.severity === 'Critical' ? 'is-crit' : 'is-high'"
                        :title="c.severity" />
                    </td>
                    <td>
                      <code class="comp-mini">{{ c.component }}</code>
                    </td>
                    <td class="has-text-right num-cell">
                      <code>{{ c.foundIn }} → M{{ String(c.versionFixed).split('.')[0] }}</code>
                    </td>
                    <td class="has-text-right num-cell">
                      <strong>{{ c.milestones }} M</strong>
                      <span v-if="c.dwellDays !== null" class="sub-block">
                        {{ (c.dwellDays / 365.25).toFixed(1) }} yrs
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from 'd3-format';
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { select } from 'd3-selection';
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape';
import { useUrlState, urlCodecs } from '~/composables/useUrlState';

const fmtInt = format(',d');
const fmtUsd = (v: number) =>
  '$' + (v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M' : fmtInt(Math.round(v || 0)));

const { dwellUnit, dwellCohort, pipelineGroup, pipelineStat, compFilter } = useUrlState({
  dwellUnit: urlCodecs.enum(['milestones', 'days'] as const, 'milestones'),
  dwellCohort: urlCodecs.enum(['vrp', 'all'] as const, 'vrp'),
  pipelineGroup: urlCodecs.enum(['severity', 'year', 'component'] as const, 'severity'),
  pipelineStat: urlCodecs.enum(['median', 'mean'] as const, 'mean'),
  compFilter: urlCodecs.string(''),
});

const data = shallowRef<any>(null);

const filteredComponents = computed(() => {
  if (!data.value?.byComponent) return [];
  const q = compFilter.value.trim().toLowerCase();
  if (!q) return data.value.byComponent;
  return data.value.byComponent.filter((r: any) => r.component.toLowerCase().includes(q));
});

// Chart 1: Dwell Histogram
const histWrap = ref<HTMLElement | null>(null);
const histSvg = ref<SVGSVGElement | null>(null);
const histHover = ref<any>(null);
const histTtPos = ref({ x: 0, y: 0 });
const histTtStyle = computed(() => ({ left: `${histTtPos.value.x}px`, top: `${histTtPos.value.y}px` }));

const renderHistogram = () => {
  if (!data.value || !histSvg.value || !histWrap.value) return;
  const buckets = data.value.dwellHistogram || [];
  const totalAll = data.value.summary.withDwellCount || 1;
  const width = histWrap.value.clientWidth || 500;
  const height = 285;
  const margin = { top: 14, right: 20, bottom: 52, left: 48 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);

  const svg = select(histSvg.value);
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = scaleBand<string>()
    .domain(buckets.map((b: any) => b.key))
    .range([0, innerW])
    .padding(0.24);
  const yMax = (max(buckets, (b: any) => Number(b.total)) || 10) * 1.08;
  const y = scaleLinear().domain([0, yMax]).range([innerH, 0]);

  g.append('g')
    .selectAll('line')
    .data(y.ticks(5))
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', (d) => y(d))
    .attr('y2', (d) => y(d))
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 3');

  const sevColors = [
    { key: 'Critical', color: 'var(--severity-critical)' },
    { key: 'High', color: 'var(--severity-high)' },
    { key: 'Medium', color: 'var(--series-4)' },
    { key: 'Low', color: 'var(--series-1)' },
  ];

  const stacked = buckets.map((b: any) => {
    let y0 = 0;
    const rects = sevColors.map((sc) => {
      const val = b.bySeverity[sc.key] || 0;
      const r = { ...sc, val, y0, y1: y0 + val };
      y0 += val;
      return r;
    });
    return { ...b, rects };
  });

  const cols = g
    .selectAll('.hcol')
    .data(stacked)
    .join('g')
    .attr('class', 'hcol')
    .attr('transform', (d: any) => `translate(${x(d.key) || 0},0)`);

  cols
    .selectAll('rect.seg')
    .data((d: any) => d.rects)
    .join('rect')
    .attr('class', 'seg')
    .attr('x', 0)
    .attr('width', x.bandwidth())
    .attr('y', (s: any) => y(s.y1))
    .attr('height', (s: any) => Math.max(0, y(s.y0) - y(s.y1)))
    .attr('fill', (s: any) => s.color)
    .attr('rx', 1.5);

  cols
    .append('rect')
    .attr('x', -4)
    .attr('width', x.bandwidth() + 8)
    .attr('y', 0)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .on('pointerenter pointermove', (event, d: any) => {
      histHover.value = {
        ...d,
        sharePct: ((d.total / totalAll) * 100).toFixed(1),
      };
      histTtPos.value = {
        x: Math.min(width - 210, Math.max(8, event.offsetX + 12)),
        y: Math.max(8, event.offsetY - 24),
      };
    })
    .on('pointerleave', () => {
      histHover.value = null;
    });

  const shortLabels: Record<string, string> = {
    '0': '0 M',
    '1-2': '1–2 M',
    '3-6': '3–6 M',
    '7-12': '7–12 M',
    '13-24': '13–24 M',
    '25-48': '25–48 M',
    '49+': '49+ M',
  };

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickFormat((k) => shortLabels[k] || k))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  g.append('g')
    .call(axisLeft(y).ticks(5))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));
};

// Chart 2: Yearly Dwell Trend (Median & P90)
const trendWrap = ref<HTMLElement | null>(null);
const trendSvg = ref<SVGSVGElement | null>(null);
const trendHover = ref<any>(null);
const trendTtPos = ref({ x: 0, y: 0 });
const trendTtStyle = computed(() => ({ left: `${trendTtPos.value.x}px`, top: `${trendTtPos.value.y}px` }));

const renderTrend = () => {
  if (!data.value || !trendSvg.value || !trendWrap.value) return;
  const rawRows = dwellCohort.value === 'vrp' ? data.value.yearlyVrp : data.value.yearlyAll;
  const rows = (rawRows || []).filter((r: any) => r.withDwellCount >= 5);
  if (!rows.length) return;

  const isM = dwellUnit.value === 'milestones';
  const getP50 = (r: any) => (isM ? r.medianMilestones : r.medianDwellDays) ?? 0;
  const getP90 = (r: any) => (isM ? r.p90Milestones : r.p90DwellDays) ?? 0;

  const width = trendWrap.value.clientWidth || 500;
  const height = 285;
  const margin = { top: 14, right: 20, bottom: 52, left: 52 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);

  const svg = select(trendSvg.value);
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const years = rows.map((r: any) => r.year);
  const x = scaleBand<string>().domain(years).range([0, innerW]).padding(0.2);
  const cx = (yr: string) => (x(yr) || 0) + x.bandwidth() / 2;

  const yMax = (max(rows, (r: any) => getP90(r)) || 10) * 1.1;
  const y = scaleLinear().domain([0, yMax]).range([innerH, 0]);

  g.append('g')
    .selectAll('line')
    .data(y.ticks(5))
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', (d) => y(d))
    .attr('y2', (d) => y(d))
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 3');

  const bandArea = d3Area<any>()
    .x((r) => cx(r.year))
    .y0((r) => y(getP50(r)))
    .y1((r) => y(getP90(r)))
    .curve(curveMonotoneX);

  g.append('path')
    .datum(rows)
    .attr('fill', 'var(--accent-soft)')
    .attr('opacity', 0.75)
    .attr('d', bandArea);

  const p90Line = d3Line<any>()
    .x((r) => cx(r.year))
    .y((r) => y(getP90(r)))
    .curve(curveMonotoneX);

  const p50Line = d3Line<any>()
    .x((r) => cx(r.year))
    .y((r) => y(getP50(r)))
    .curve(curveMonotoneX);

  g.append('path')
    .datum(rows)
    .attr('fill', 'none')
    .attr('stroke', 'var(--series-2)')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5 4')
    .attr('d', p90Line);

  g.append('path')
    .datum(rows)
    .attr('fill', 'none')
    .attr('stroke', 'var(--series-1)')
    .attr('stroke-width', 2.5)
    .attr('d', p50Line);

  g.selectAll('circle.p50-pt')
    .data(rows)
    .join('circle')
    .attr('class', 'p50-pt')
    .attr('cx', (r: any) => cx(r.year))
    .attr('cy', (r: any) => y(getP50(r)))
    .attr('r', 3.5)
    .attr('fill', 'var(--series-1)');

  g.selectAll('rect.hover-slot')
    .data(rows)
    .join('rect')
    .attr('class', 'hover-slot')
    .attr('x', (r: any) => x(r.year) || 0)
    .attr('width', x.bandwidth())
    .attr('y', 0)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .on('pointerenter pointermove', (event, r: any) => {
      const unitSuffix = isM ? ' milestones' : ' days';
      trendHover.value = {
        year: r.year,
        n: r.withDwellCount,
        p50Text: `${getP50(r)}${unitSuffix}`,
        p90Text: `${getP90(r)}${unitSuffix}`,
        samePct: r.sameMilestonePct,
        ancientPct: r.ancient2YrPct,
      };
      trendTtPos.value = {
        x: Math.min(width - 215, Math.max(8, event.offsetX + 12)),
        y: Math.max(8, event.offsetY - 24),
      };
    })
    .on('pointerleave', () => {
      trendHover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  g.append('g')
    .call(axisLeft(y).ticks(5).tickFormat((v) => (isM ? `${v}M` : `${v}d`)))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));
};

// Chart 3: Horizontal Stacked Pipeline Latency
const pipeWrap = ref<HTMLElement | null>(null);
const pipeSvg = ref<SVGSVGElement | null>(null);
const pipeHover = ref<any>(null);
const pipeTtPos = ref({ x: 0, y: 0 });
const pipeTtStyle = computed(() => ({ left: `${pipeTtPos.value.x}px`, top: `${pipeTtPos.value.y}px` }));

const renderPipeline = () => {
  if (!data.value || !pipeSvg.value || !pipeWrap.value) return;

  let sourceRows: any[] = [];
  let labelKey = 'severity';
  if (pipelineGroup.value === 'severity') {
    sourceRows = (data.value.bySeverity || []).filter((r: any) => r.withPipelineCount > 0);
    labelKey = 'severity';
  } else if (pipelineGroup.value === 'year') {
    sourceRows = (data.value.yearlyAll || []).filter((r: any) => r.withPipelineCount >= 10);
    labelKey = 'year';
  } else {
    sourceRows = (data.value.byComponent || [])
      .filter((r: any) => r.withPipelineCount >= 10)
      .slice(0, 12);
    labelKey = 'component';
  }
  if (!sourceRows.length) return;

  const isMean = pipelineStat.value === 'mean';
  const rows = sourceRows.map((r) => {
    const eng = (isMean ? r.meanEngFixDays : r.medianEngFixDays) ?? 0;
    const merge = (isMean ? r.meanBranchMergeDays : r.medianBranchMergeDays) ?? 0;
    const rollout = (isMean ? r.meanReleaseRolloutDays : r.medianReleaseRolloutDays) ?? 0;
    return {
      label: r[labelKey],
      n: r.withPipelineCount,
      eng,
      merge,
      rollout,
      sum: Math.round((eng + merge + rollout) * 10) / 10,
      totalP50: r.medianTotalBugToStableDays,
      totalP90: r.p90TotalBugToStableDays,
    };
  });

  const width = pipeWrap.value.clientWidth || 880;
  const rowH = 32;
  const margin = {
    top: 10,
    right: 68,
    bottom: 32,
    left: pipelineGroup.value === 'component' ? 168 : 84,
  };
  const innerH = rows.length * rowH;
  const height = innerH + margin.top + margin.bottom;
  const innerW = Math.max(120, width - margin.left - margin.right);

  const svg = select(pipeSvg.value);
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const y = scaleBand<string>()
    .domain(rows.map((r) => r.label))
    .range([0, innerH])
    .padding(0.28);

  const xMax = (max(rows, (r) => r.sum) || 30) * 1.12;
  const x = scaleLinear().domain([0, xMax]).range([0, innerW]);

  g.append('g')
    .selectAll('line')
    .data(x.ticks(6))
    .join('line')
    .attr('x1', (d) => x(d))
    .attr('x2', (d) => x(d))
    .attr('y1', 0)
    .attr('y2', innerH)
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 3');

  const barRows = g
    .selectAll('.prow')
    .data(rows)
    .join('g')
    .attr('class', 'prow')
    .attr('transform', (d) => `translate(0,${y(d.label) || 0})`);

  barRows.each(function (d) {
    const grp = select(this);
    const stages = [
      { x0: 0, x1: d.eng, color: 'var(--series-1)' },
      { x0: d.eng, x1: d.eng + d.merge, color: 'var(--series-4)' },
      { x0: d.eng + d.merge, x1: d.sum, color: 'var(--series-3)' },
    ];
    grp
      .selectAll('rect.stage')
      .data(stages)
      .join('rect')
      .attr('class', 'stage')
      .attr('x', (s) => x(s.x0))
      .attr('width', (s) => Math.max(0, x(s.x1) - x(s.x0)))
      .attr('y', 0)
      .attr('height', y.bandwidth())
      .attr('fill', (s) => s.color)
      .attr('rx', 2);

    grp
      .append('text')
      .attr('x', x(d.sum) + 6)
      .attr('y', y.bandwidth() / 2 + 4)
      .attr('font-size', '11px')
      .style('fill', 'var(--ink-2)')
      .style('font-family', 'var(--font-mono)')
      .text(`${d.sum}d`);
  });

  barRows
    .append('rect')
    .attr('x', 0)
    .attr('width', innerW)
    .attr('y', -2)
    .attr('height', y.bandwidth() + 4)
    .attr('fill', 'transparent')
    .on('pointerenter pointermove', (event, d) => {
      pipeHover.value = d;
      pipeTtPos.value = {
        x: Math.min(width - 235, Math.max(12, event.offsetX + 14)),
        y: Math.max(8, event.offsetY - 20),
      };
    })
    .on('pointerleave', () => {
      pipeHover.value = null;
    });

  g.append('g')
    .call(axisLeft(y))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--ink)').attr('font-size', '11.5px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).ticks(6).tickFormat((v) => `${v}d`))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));
};

let resizeObs: ResizeObserver | null = null;
const renderAllCharts = () => {
  renderHistogram();
  renderTrend();
  renderPipeline();
};

onMounted(async () => {
  const res = await fetch('/cve/lifespan.json');
  if (res.ok) {
    data.value = await res.json();
    await nextTick();
    renderAllCharts();
  }
  resizeObs = new ResizeObserver(() => renderAllCharts());
  if (histWrap.value) resizeObs.observe(histWrap.value);
  if (pipeWrap.value) resizeObs.observe(pipeWrap.value);
});

onBeforeUnmount(() => {
  resizeObs?.disconnect();
});

watch([dwellUnit, dwellCohort], () => nextTick(renderTrend));
watch([pipelineGroup, pipelineStat], () => nextTick(renderPipeline));
</script>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.subtitle-text {
  color: var(--muted);
  max-width: 68ch;
}

.kpi-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 769px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1120px) {
  .kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1rem 1.15rem;
}

.kpi-eyebrow {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 560;
  margin-bottom: 0.25rem;
}

.kpi-value {
  color: var(--ink);
  font-size: 1.55rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.kpi-unit {
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 500;
}

.kpi-detail {
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.45;
  margin-top: 0.45rem;
}

.two-col-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 980px) {
  .two-col-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.chart-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1rem 1.15rem;
}

.card-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.section-toolbar {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.inline-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.muted-note {
  color: var(--muted);
  font-size: 0.86rem;
}

.sev-legend {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.78rem;
  gap: 0.5rem 1rem;
  margin-bottom: 0.45rem;
}

.sev-legend span {
  align-items: center;
  color: var(--ink-2);
  display: inline-flex;
  gap: 0.35rem;
}

.dot {
  border-radius: 3px;
  display: inline-block;
  height: 10px;
  width: 10px;
}

.line-key {
  border-top: 2.5px solid;
  display: inline-block;
  width: 18px;
}

.line-key.is-dashed {
  border-top-style: dashed;
}

.svg-box {
  min-height: 285px;
  position: relative;
  width: 100%;
}

.pipe-svg-box {
  min-height: 180px;
  position: relative;
  width: 100%;
}

.floating-tt {
  background: var(--tooltip-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  color: var(--tooltip-ink);
  font-size: 0.76rem;
  min-width: 200px;
  padding: 0.55rem 0.75rem;
  pointer-events: none;
  position: absolute;
  z-index: 15;
}

.floating-tt strong {
  color: var(--tooltip-ink);
  font-family: var(--font-mono);
}

.tt-title {
  font-size: 0.82rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.tt-line {
  display: flex;
  gap: 0.7rem;
  justify-content: space-between;
  line-height: 1.45;
}

.comp-filter-box {
  min-width: 250px;
}

.card-table-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 0.75rem 1rem;
}

.comp-link {
  text-decoration: none;
}

.sub-muted {
  color: var(--muted);
  font-size: 0.76rem;
}

.sub-block {
  color: var(--muted);
  display: block;
  font-size: 0.72rem;
}

.sla-pill {
  border-radius: var(--radius-sm);
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
}

.sla-pill.is-danger {
  background: var(--tag-danger-bg);
  color: var(--tag-danger-ink);
}

.sla-pill.is-warn {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.sla-table {
  font-size: 0.82rem;
  margin-bottom: 0;
}

.tag-title {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
}

.tag-desc {
  color: var(--muted);
  font-size: 0.74rem;
  line-height: 1.35;
}

.num-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cve-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.cve-mini-pill {
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.71rem;
  padding: 0.1rem 0.38rem;
  text-decoration: none;
}

.cve-mini-pill:hover {
  border-color: var(--accent);
}

.cve-id-link {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}

.sev-dot {
  border-radius: 50%;
  display: inline-block;
  height: 8px;
  margin-left: 0.35rem;
  width: 8px;
}

.sev-dot.is-crit {
  background: var(--severity-critical);
}

.sev-dot.is-high {
  background: var(--severity-high);
}

.comp-mini {
  font-size: 0.74rem;
}
</style>
