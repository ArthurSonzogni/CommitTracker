<template>
  <div>
    <CveSubnav />

    <section class="section pb-3">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">CVE lifespan &amp; security SLA</h1>
            <p class="subtitle-text">
              How fix turnaround (<code>Bug → Trunk CL → Stable</code>), silent vulnerability dwell
              time (<code>Found In → Fixed</code>), and security SLO breaches evolve over time —
              stratified by severity and discovery source rather than pooled across a decade.
            </p>
          </div>
          <span v-if="latestDateStr" class="snapshot-badge">
            <UiIcon name="timer-sand" size="small" />
            Through {{ latestDateStr }} · {{ fmtInt(parsedCves.length) }} CVEs
          </span>
        </div>

        <AboutData class="mt-3">
          <p>
            Computed live in the browser from <code>/cve/data.json</code> joined with Chrome
            milestone release dates (<code>chrome-releases.json</code>). Summary cards and
            component tables default to <strong>High + Critical</strong> over the
            <strong>Last 12 months</strong> (with prior-period deltas) so lower-urgency SLOs and
            pre-2021 6-week release cycles do not distort current numbers.
          </p>
          <ul>
            <li>
              <strong>Fix turnaround stages:</strong> decomposes wall-clock latency from
              <code>bug_date</code> to earliest non-revert fix commit (<em>Engineering Trunk CL</em>),
              optional cherry-pick merges, and <code>version_dates.beta</code> /
              <code>version_dates.stable</code> rollout soak.
            </li>
            <li>
              <strong>Silent vulnerability dwell time:</strong> shipped Chrome milestones elapsed
              between <code>found_in</code> (earliest affected milestone from bisection /
              ClusterFuzz) and <code>version_fixed</code>.
            </li>
            <li>
              <strong>2026 CNA note:</strong> in 2026 Chrome expanded CVE assignment to internally
              discovered/fuzzed bugs (<code>$0</code> VRP). Use the <strong>Source</strong> toggle
              (<em>External VRP</em> vs <em>Internal / $0</em>) for apples-to-apples multi-year
              comparisons.
            </li>
          </ul>
        </AboutData>
      </div>
    </section>

    <!-- Sticky Filter & Cohort Control Bar -->
    <section class="filter-bar-sticky">
      <div class="container">
        <div class="filter-bar-inner">
          <div class="filter-group">
            <span class="filter-label">Severity</span>
            <div class="chips">
              <UiToggle v-model="severities" value="Critical">
                <span class="sev-dot is-critical" />
                Critical
              </UiToggle>
              <UiToggle v-model="severities" value="High">
                <span class="sev-dot is-high" />
                High
              </UiToggle>
              <UiToggle v-model="severities" value="Medium">
                <span class="sev-dot is-medium" />
                Medium
              </UiToggle>
              <UiToggle v-model="severities" value="Low">
                <span class="sev-dot is-low" />
                Low
              </UiToggle>
              <button
                type="button"
                class="preset-link"
                :class="{ 'is-current': isCritHighPreset }"
                @click="setSeverityPreset(['High', 'Critical'])">
                Crit+High
              </button>
              <button
                type="button"
                class="preset-link"
                :class="{ 'is-current': severities.length === 4 }"
                @click="setSeverityPreset(['Critical', 'High', 'Medium', 'Low'])">
                All 4
              </button>
            </div>
          </div>

          <div class="filter-group">
            <span class="filter-label">Source</span>
            <UiSegmented
              v-model="source"
              aria-label="Discovery source"
              :options="[
                { value: 'all', label: 'All' },
                { value: 'vrp', label: 'External VRP' },
                { value: 'internal', label: 'Internal / $0' },
              ]" />
          </div>

          <div class="filter-group">
            <span class="filter-label">Time axis</span>
            <UiSegmented
              v-model="granularity"
              aria-label="Time series granularity"
              :options="[
                { value: 'year', label: 'Yearly' },
                { value: 'quarter', label: 'Quarterly' },
              ]" />
          </div>

          <div class="filter-group">
            <span class="filter-label">Curves</span>
            <UiSegmented
              v-model="compareMode"
              aria-label="Severity comparison mode"
              :options="[
                { value: 'cohort', label: 'P50 / IQR / P90' },
                { value: 'severities', label: 'Compare Severities' },
              ]" />
          </div>

          <div class="filter-group">
            <span class="filter-label">KPI &amp; Table Window</span>
            <UiSegmented
              v-model="period"
              aria-label="Summary time window"
              :options="[
                { value: '12m', label: 'Last 12m' },
                { value: '3y', label: 'Last 3y' },
                { value: '2021', label: '2021+ (4-wk)' },
                { value: 'all', label: 'All' },
              ]" />
          </div>
        </div>
      </div>
    </section>

    <!-- Loading / Empty Guard -->
    <section v-if="loading" class="section">
      <div class="container">
        <div class="skeleton kpi-skeleton" aria-hidden="true" />
      </div>
    </section>

    <section v-else-if="severities.length === 0" class="section">
      <div class="container">
        <div class="empty-cohort-box">
          <p class="mb-3">No severity level is selected. Select at least one severity to compute metrics.</p>
          <button
            type="button"
            class="button is-small"
            @click="setSeverityPreset(['High', 'Critical'])">
            <UiIcon name="restart" size="small" />
            <span>Reset to Critical + High</span>
          </button>
        </div>
      </div>
    </section>

    <template v-else>
      <!-- Dynamic KPI Strip (Scoped to Severities + Source + Active Window, with YoY Delta) -->
      <section class="section pt-4 pb-4">
        <div class="container">
          <div class="cohort-banner mb-3">
            <span class="cohort-pill">
              <UiIcon name="filter-variant" size="small" />
              <strong>{{ activeSeverityLabel }}</strong> · {{ activeSourceLabel }} ·
              <strong>{{ activePeriodLabel }}</strong>
              (n = {{ fmtInt(windowStats.count) }} CVEs)
            </span>
            <span v-if="priorWindowStats && priorWindowStats.count >= 10" class="cohort-sub">
              Deltas compare against the immediately preceding {{ period === '12m' ? '12 months' : '3 years' }}
              (n = {{ fmtInt(priorWindowStats.count) }})
            </span>
          </div>

          <div class="kpi-grid">
            <!-- Card 1: Total Bug -> Stable -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-eyebrow">End-to-End Fix → Stable (P50)</span>
                <span
                  v-if="deltas.bugToStable !== null"
                  class="delta-chip"
                  :class="deltas.bugToStable <= 0 ? 'is-good' : 'is-warn'">
                  <UiIcon :name="deltas.bugToStable <= 0 ? 'trending-down' : 'trending-up'" size="small" />
                  {{ fmtSigned1(deltas.bugToStable) }}d {{ deltaSuffix }}
                </span>
              </div>
              <div class="kpi-value">
                {{ fmtVal(windowStats.bugToStableP50, 'd') }}
                <span class="kpi-unit">bug → Stable</span>
              </div>
              <p class="kpi-detail">
                IQR <strong>{{ fmtVal(windowStats.bugToStableP25, '') }}–{{ fmtVal(windowStats.bugToStableP75, 'd') }}</strong>
                · P90 <strong>{{ fmtVal(windowStats.bugToStableP90, 'd') }}</strong>
                (n = {{ fmtInt(windowStats.bugToStableN) }})
              </p>
            </div>

            <!-- Card 2: Engineering Discovery -> Trunk Fix CL -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-eyebrow">Engineering Trunk Fix (P50)</span>
                <span
                  v-if="deltas.bugToFix !== null"
                  class="delta-chip"
                  :class="deltas.bugToFix <= 0 ? 'is-good' : 'is-warn'">
                  <UiIcon :name="deltas.bugToFix <= 0 ? 'trending-down' : 'trending-up'" size="small" />
                  {{ fmtSigned1(deltas.bugToFix) }}d {{ deltaSuffix }}
                </span>
              </div>
              <div class="kpi-value">
                {{ fmtVal(windowStats.bugToFixP50, 'd') }}
                <span class="kpi-unit">bug → trunk CL</span>
              </div>
              <p class="kpi-detail">
                P90 <strong>{{ fmtVal(windowStats.bugToFixP90, 'd') }}</strong> · Release soak P50
                <strong>{{ fmtVal(windowStats.fixToStableP50, 'd') }}</strong>
                <span v-if="windowStats.soakSharePct !== null">
                  ({{ windowStats.soakSharePct }}% of total)
                </span>
              </p>
            </div>

            <!-- Card 3: Silent Vulnerability Dwell Time -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-eyebrow">Silent Dwell Time (P50)</span>
                <span
                  v-if="deltas.dwellM !== null"
                  class="delta-chip"
                  :class="deltas.dwellM <= 0 ? 'is-good' : 'is-neutral'">
                  {{ fmtSigned1(deltas.dwellM) }} M {{ deltaSuffix }}
                </span>
              </div>
              <div class="kpi-value">
                {{ fmtVal(windowStats.dwellMP50, ' M', 1) }}
                <span class="kpi-unit">
                  ({{ windowStats.dwellDP50 !== null ? `${Math.round(windowStats.dwellDP50)}d` : '—' }})
                </span>
              </div>
              <p class="kpi-detail">
                P90 <strong>{{ fmtVal(windowStats.dwellMP90, ' M', 1) }}</strong> ·
                <strong>{{ windowStats.over1YrPct ?? '—' }}%</strong> lived ≥1 yr (13+ M) in Stable
              </p>
            </div>

            <!-- Card 4: Security SLA Miss & Fix Stability -->
            <div class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-eyebrow">SLA Breaches &amp; Fix Reverts</span>
                <span
                  v-if="deltas.slaPct !== null"
                  class="delta-chip"
                  :class="deltas.slaPct <= 0 ? 'is-good' : 'is-warn'">
                  {{ fmtSigned1(deltas.slaPct) }}pp {{ deltaSuffix }}
                </span>
              </div>
              <div class="kpi-value">
                {{ windowStats.slaPct }}%
                <span class="kpi-unit">Deadline-Exceeded ({{ fmtInt(windowStats.slaCount) }})</span>
              </div>
              <p class="kpi-detail">
                <strong>{{ windowStats.revertPct }}%</strong> ({{ fmtInt(windowStats.revertCount) }})
                had a fix CL reverted · <strong>{{ fmtInt(windowStats.ltsCount) }}</strong> LTS merges
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- CHART 1 (HERO): Fix Turnaround Evolution Over Time -->
      <section class="section pt-2 pb-5">
        <div class="container">
          <div class="chart-card">
            <div class="card-head is-wrap">
              <div>
                <h2 class="title is-4 mb-1">
                  Fix turnaround evolution over time ({{ granularity === 'year' ? '2018–2026' : 'Quarterly' }})
                </h2>
                <p class="muted-note">
                  <template v-if="compareMode === 'severities'">
                    Comparing median latency across <strong>Critical, High, Medium, and Low</strong>
                    severities ({{ activeSourceLabel }}).
                  </template>
                  <template v-else-if="turnaroundStyle === 'stacked'">
                    Decomposes median stage latency into <strong>Engineering Trunk CL</strong>,
                    <strong>Branch Merge</strong>, and <strong>Stable Release Rollout</strong>
                    ({{ activeSeverityLabel }} · {{ activeSourceLabel }}).
                  </template>
                  <template v-else>
                    Median (P50), interquartile range (P25–P75), and 90th percentile (P90) for
                    <strong>{{ turnaroundMetricLabel }}</strong>
                    ({{ activeSeverityLabel }} · {{ activeSourceLabel }}).
                  </template>
                </p>
              </div>

              <div class="inline-controls">
                <UiSegmented
                  v-if="compareMode === 'cohort'"
                  v-model="turnaroundStyle"
                  aria-label="Turnaround chart style"
                  :options="[
                    { value: 'band', label: 'P50 / IQR / P90' },
                    { value: 'stacked', label: 'Stacked Stages' },
                  ]" />
                <UiSegmented
                  v-if="compareMode === 'severities' || turnaroundStyle === 'band'"
                  v-model="turnaroundMetric"
                  aria-label="Pipeline metric"
                  :options="[
                    { value: 'bugToStable', label: 'Bug → Stable' },
                    { value: 'bugToFix', label: 'Bug → Fix CL' },
                    { value: 'fixToStable', label: 'Fix → Stable' },
                    { value: 'fixToBeta', label: 'Fix → Beta' },
                  ]" />
              </div>
            </div>

            <!-- Dynamic Legend -->
            <div class="sev-legend mb-2">
              <template v-if="compareMode === 'severities'">
                <span><i class="line-key" style="border-color: var(--severity-critical)" /> Critical (P50)</span>
                <span><i class="line-key" style="border-color: var(--severity-high)" /> High (P50)</span>
                <span><i class="line-key" style="border-color: var(--series-4)" /> Medium (P50)</span>
                <span><i class="line-key" style="border-color: var(--series-1)" /> Low (P50)</span>
              </template>
              <template v-else-if="turnaroundStyle === 'stacked'">
                <span><i class="dot" style="background: var(--series-1)" /> 1. Discovery → Trunk Fix CL (P50)</span>
                <span><i class="dot" style="background: var(--series-4)" /> 2. Trunk → Branch Merge CL (P50)</span>
                <span><i class="dot" style="background: var(--series-3)" /> 3. Final Fix CL → Stable Release (P50)</span>
                <span><i class="line-key is-dashed" style="border-color: var(--severity-critical)" /> Total Bug → Stable P50</span>
              </template>
              <template v-else>
                <span><i class="line-key" style="border-color: var(--series-1)" /> Median (P50)</span>
                <span><i class="band-swatch" /> Interquartile Range (P25–P75)</span>
                <span><i class="line-key is-dashed" style="border-color: var(--series-2)" /> 90th Percentile (P90)</span>
              </template>
            </div>

            <div ref="turnWrap" class="hero-svg-box">
              <svg ref="turnSvg" />
              <div v-if="turnHover" class="floating-tt" :style="turnTtStyle">
                <div class="tt-title">{{ turnHover.bucket }} ({{ fmtInt(turnHover.n) }} CVEs)</div>
                <template v-if="turnHover.mode === 'severities'">
                  <div v-for="row in turnHover.sevRows" :key="row.sev" class="tt-line">
                    <span>{{ row.sev }} (n={{ row.n }}):</span>
                    <strong>{{ row.val !== null ? `${row.val.toFixed(1)}d` : '—' }}</strong>
                  </div>
                </template>
                <template v-else-if="turnHover.mode === 'stacked'">
                  <div class="tt-line">
                    <span>1. Bug → Trunk Fix P50:</span>
                    <strong>{{ fmtVal(turnHover.eng, 'd') }}</strong>
                  </div>
                  <div class="tt-line">
                    <span>2. Branch Merge P50:</span>
                    <strong>{{ fmtVal(turnHover.merge, 'd') }}</strong>
                  </div>
                  <div class="tt-line">
                    <span>3. Final Fix → Stable P50:</span>
                    <strong>{{ fmtVal(turnHover.rollout, 'd') }}</strong>
                  </div>
                  <div class="tt-line tt-sep">
                    <span>Overall Bug → Stable P50 / P90:</span>
                    <strong>{{ fmtVal(turnHover.totalP50, 'd') }} / {{ fmtVal(turnHover.totalP90, 'd') }}</strong>
                  </div>
                </template>
                <template v-else>
                  <div class="tt-line">
                    <span>Median (P50):</span>
                    <strong>{{ fmtVal(turnHover.p50, 'd') }}</strong>
                  </div>
                  <div class="tt-line">
                    <span>IQR (P25 – P75):</span>
                    <strong>{{ fmtVal(turnHover.p25, '') }} – {{ fmtVal(turnHover.p75, 'd') }}</strong>
                  </div>
                  <div class="tt-line">
                    <span>90th Percentile (P90):</span>
                    <strong>{{ fmtVal(turnHover.p90, 'd') }}</strong>
                  </div>
                  <div class="tt-line tt-sep">
                    <span>Eng Fix P50 / Soak P50:</span>
                    <strong>{{ fmtVal(turnHover.engP50, 'd') }} / {{ fmtVal(turnHover.soakP50, 'd') }}</strong>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- CHARTS 2 & 3: Dwell Time Evolution + Security SLA / Revert Rate Evolution -->
      <section class="section pt-0 pb-5">
        <div class="container">
          <div class="two-col-grid">
            <!-- Chart 2: Silent Vulnerability Dwell Time Over Time -->
            <div class="chart-card">
              <div class="card-head is-wrap">
                <div>
                  <h2 class="title is-5 mb-1">Silent vulnerability dwell time over time</h2>
                  <p class="muted-note">
                    <code>Found In → Fixed</code> lifespan before discovery
                    <template v-if="compareMode === 'severities'">(median by severity)</template>
                    <template v-else>({{ activeSeverityLabel }} · P50, IQR &amp; P90)</template>.
                  </p>
                </div>
                <div class="inline-controls">
                  <UiSegmented
                    v-model="dwellUnit"
                    aria-label="Dwell time unit"
                    :options="[
                      { value: 'milestones', label: 'Milestones' },
                      { value: 'days', label: 'Days' },
                    ]" />
                </div>
              </div>

              <div class="sev-legend mb-1">
                <template v-if="compareMode === 'severities'">
                  <span><i class="line-key" style="border-color: var(--severity-critical)" /> Critical</span>
                  <span><i class="line-key" style="border-color: var(--severity-high)" /> High</span>
                  <span><i class="line-key" style="border-color: var(--series-4)" /> Medium</span>
                  <span><i class="line-key" style="border-color: var(--series-1)" /> Low</span>
                </template>
                <template v-else>
                  <span><i class="line-key" style="border-color: var(--series-7)" /> Median (P50)</span>
                  <span><i class="band-swatch is-purple" /> IQR (P25–P75)</span>
                  <span><i class="line-key is-dashed" style="border-color: var(--series-2)" /> P90</span>
                </template>
              </div>

              <div ref="dwellWrap" class="svg-box">
                <svg ref="dwellSvg" />
                <div v-if="dwellHover" class="floating-tt" :style="dwellTtStyle">
                  <div class="tt-title">{{ dwellHover.bucket }} (n = {{ fmtInt(dwellHover.n) }})</div>
                  <template v-if="dwellHover.mode === 'severities'">
                    <div v-for="row in dwellHover.sevRows" :key="row.sev" class="tt-line">
                      <span>{{ row.sev }} (n={{ row.n }}):</span>
                      <strong>{{ row.text }}</strong>
                    </div>
                  </template>
                  <template v-else>
                    <div class="tt-line">
                      <span>Median (P50):</span>
                      <strong>{{ dwellHover.p50Text }}</strong>
                    </div>
                    <div class="tt-line">
                      <span>IQR (P25 – P75):</span>
                      <strong>{{ dwellHover.iqrText }}</strong>
                    </div>
                    <div class="tt-line">
                      <span>90th Percentile (P90):</span>
                      <strong>{{ dwellHover.p90Text }}</strong>
                    </div>
                    <div class="tt-line tt-sep">
                      <span>Lived ≥1 yr (13+ M):</span>
                      <strong>{{ dwellHover.over1YrPct }}%</strong>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Chart 3: Security SLA Miss & Fix-Revert Rate Over Time -->
            <div class="chart-card">
              <div class="card-head">
                <div>
                  <h2 class="title is-5 mb-1">SLA breach &amp; fix-revert rate over time</h2>
                  <p class="muted-note">
                    <template v-if="compareMode === 'severities'">
                      <code>Deadline-Exceeded</code> % by severity over time ({{ activeSourceLabel }}).
                    </template>
                    <template v-else>
                      <code>Deadline-Exceeded</code> % and reverted security fix CLs % over background
                      CVE volume ({{ activeSeverityLabel }}).
                    </template>
                  </p>
                </div>
              </div>

              <div class="sev-legend mb-1">
                <template v-if="compareMode === 'severities'">
                  <span><i class="line-key" style="border-color: var(--severity-critical)" /> Critical SLA %</span>
                  <span><i class="line-key" style="border-color: var(--severity-high)" /> High SLA %</span>
                  <span><i class="line-key" style="border-color: var(--series-4)" /> Medium SLA %</span>
                  <span><i class="line-key" style="border-color: var(--series-1)" /> Low SLA %</span>
                </template>
                <template v-else>
                  <span><i class="line-key" style="border-color: var(--series-8)" /> Deadline-Exceeded %</span>
                  <span><i class="line-key is-dashed" style="border-color: var(--series-4)" /> Fix CL Reverted %</span>
                  <span><i class="dot" style="background: var(--line-strong)" /> CVE Volume (bars)</span>
                </template>
              </div>

              <div ref="slaWrap" class="svg-box">
                <svg ref="slaSvg" />
                <div v-if="slaHover" class="floating-tt" :style="slaTtStyle">
                  <div class="tt-title">{{ slaHover.bucket }} ({{ fmtInt(slaHover.n) }} CVEs)</div>
                  <template v-if="slaHover.mode === 'severities'">
                    <div v-for="row in slaHover.sevRows" :key="row.sev" class="tt-line">
                      <span>{{ row.sev }} (n={{ row.n }}):</span>
                      <strong>{{ row.val !== null ? `${row.val.toFixed(1)}%` : '—' }}</strong>
                    </div>
                  </template>
                  <template v-else>
                    <div class="tt-line">
                      <span>Deadline-Exceeded:</span>
                      <strong>{{ slaHover.slaPct }}% ({{ slaHover.slaCount }})</strong>
                    </div>
                    <div class="tt-line">
                      <span>Fix CL Reverted:</span>
                      <strong>{{ slaHover.revPct }}% ({{ slaHover.revCount }})</strong>
                    </div>
                    <div class="tt-line">
                      <span>LTS Backported:</span>
                      <strong>{{ slaHover.ltsCount }} CVEs</strong>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ROW 3: Side-by-Side Severity Stratification + Dwell Histogram (Active Period) -->
      <section class="section pt-0 pb-5">
        <div class="container">
          <div class="two-col-grid">
            <!-- Left: Direct Severity Stratification Table/Bars in Active Period -->
            <div class="chart-card">
              <div class="card-head">
                <div>
                  <h2 class="title is-5 mb-1">
                    Severity stratification ({{ activePeriodLabel }} · {{ activeSourceLabel }})
                  </h2>
                  <p class="muted-note">
                    Direct comparison across severity tiers — why pooling Low/Medium with
                    Critical/High masks urgent engineering response times.
                  </p>
                </div>
              </div>

              <div class="table-container mt-2">
                <table class="table is-fullwidth is-narrow strat-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th class="has-text-right">CVEs</th>
                      <th class="has-text-right">Bug→Fix P50</th>
                      <th class="has-text-right">Fix→Stable P50</th>
                      <th>Bug → Stable (IQR &amp; P50)</th>
                      <th class="has-text-right">Dwell P50</th>
                      <th class="has-text-right">SLA Miss</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in severityStratification"
                      :key="row.severity"
                      :class="{ 'is-dimmed': !severities.includes(row.severity) }">
                      <td>
                        <span class="sev-cell">
                          <span class="sev-dot" :class="`is-${row.severity.toLowerCase()}`" />
                          <strong>{{ row.severity }}</strong>
                        </span>
                      </td>
                      <td class="has-text-right num-cell">{{ fmtInt(row.count) }}</td>
                      <td class="has-text-right num-cell">
                        <strong>{{ fmtVal(row.bugToFixP50, 'd') }}</strong>
                      </td>
                      <td class="has-text-right num-cell">{{ fmtVal(row.fixToStableP50, 'd') }}</td>
                      <td class="iqr-bar-cell">
                        <div v-if="row.bugToStableP50 !== null" class="iqr-inline">
                          <div class="iqr-track">
                            <div
                              class="iqr-range"
                              :style="{
                                left: `${Math.min(100, ((row.bugToStableP25 || 0) / maxStratDays) * 100)}%`,
                                width: `${Math.max(3, Math.min(100, (((row.bugToStableP75 || 0) - (row.bugToStableP25 || 0)) / maxStratDays) * 100))}%`,
                              }" />
                            <div
                              class="iqr-median-tick"
                              :style="{
                                left: `${Math.min(98, (row.bugToStableP50 / maxStratDays) * 100)}%`,
                              }" />
                          </div>
                          <span class="iqr-label">
                            <strong>{{ row.bugToStableP50.toFixed(1) }}d</strong>
                            <span class="sub-muted"> (P90 {{ fmtVal(row.bugToStableP90, 'd', 0) }})</span>
                          </span>
                        </div>
                        <span v-else class="sub-muted">—</span>
                      </td>
                      <td class="has-text-right num-cell">{{ fmtVal(row.dwellMP50, ' M', 1) }}</td>
                      <td class="has-text-right num-cell">
                        <span v-if="row.slaCount > 0" class="sla-pill is-danger">
                          {{ row.slaPct }}%
                        </span>
                        <span v-else class="sub-muted">0%</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Right: Silent Lifespan Distribution in Active Window -->
            <div class="chart-card">
              <div class="card-head">
                <div>
                  <h2 class="title is-5 mb-1">
                    Silent lifespan distribution ({{ activePeriodLabel }})
                  </h2>
                  <p class="muted-note">
                    Milestones shipped before discovery for
                    <strong>{{ activeSeverityLabel }}</strong> · {{ activeSourceLabel }}
                    (n = {{ fmtInt(windowStats.dwellMN) }}).
                  </p>
                </div>
              </div>

              <div class="sev-legend mb-1">
                <span v-if="severities.includes('Critical')">
                  <i class="dot" style="background: var(--severity-critical)" /> Critical
                </span>
                <span v-if="severities.includes('High')">
                  <i class="dot" style="background: var(--severity-high)" /> High
                </span>
                <span v-if="severities.includes('Medium')">
                  <i class="dot" style="background: var(--series-4)" /> Medium
                </span>
                <span v-if="severities.includes('Low')">
                  <i class="dot" style="background: var(--series-1)" /> Low
                </span>
              </div>

              <div ref="histWrap" class="svg-box is-compact">
                <svg ref="histSvg" />
                <div v-if="histHover" class="floating-tt" :style="histTtStyle">
                  <div class="tt-title">{{ histHover.label }}</div>
                  <div class="tt-line">
                    <span>Matching CVEs:</span>
                    <strong>{{ fmtInt(histHover.total) }} ({{ histHover.sharePct }}%)</strong>
                  </div>
                  <div class="tt-line">
                    <span>Crit / High:</span>
                    <strong>{{ histHover.bySeverity.Critical }} / {{ histHover.bySeverity.High }}</strong>
                  </div>
                  <div class="tt-line">
                    <span>Med / Low:</span>
                    <strong>{{ histHover.bySeverity.Medium }} / {{ histHover.bySeverity.Low }}</strong>
                  </div>
                  <div class="tt-line">
                    <span>VRP Bounties:</span>
                    <strong>{{ fmtUsd(histHover.vrpUsd) }}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ROW 4: Dynamic Component Dwell-Time & Security SLA Table -->
      <section class="section pt-0 pb-5">
        <div class="container">
          <div class="section-toolbar">
            <div>
              <h2 class="title is-4 mb-1">
                Component velocity &amp; SLA scorecard ({{ activeSeverityLabel }} · {{ activePeriodLabel }})
              </h2>
              <p class="muted-note">
                Subsystem breakdown recomputed dynamically for the active severity, discovery
                source, and time window ({{ filteredComponents.length }} components with ≥3 CVEs).
              </p>
            </div>
            <div class="comp-filter-box">
              <input
                v-model="compFilter"
                type="search"
                class="input is-small"
                placeholder="Filter component (e.g. Blink, GPU, V8, Network)..." />
            </div>
          </div>

          <div class="card-table-wrap">
            <UiTable
              :data="filteredComponents"
              row-key="component"
              striped
              hoverable
              paginated
              :per-page="15">
              <UiTableColumn field="component" label="Component" sortable>
                <template #default="{ row }">
                  <NuxtLink
                    :to="`/cve/list?component=${encodeURIComponent(row.component)}`"
                    class="comp-link">
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
                field="bugToFixP50"
                label="Bug→Fix (P50)"
                numeric
                sortable
                hint="Median days from bug_date to earliest non-revert fix commit"
                :formatter="(v: number | null) => fmtVal(v, 'd')" />
              <UiTableColumn
                field="fixToStableP50"
                label="Fix→Stable (P50)"
                numeric
                sortable
                hint="Median days from trunk fix commit to Stable release"
                :formatter="(v: number | null) => fmtVal(v, 'd')" />
              <UiTableColumn
                field="bugToStableP50"
                label="Bug→Stable (P50 / P90)"
                numeric
                sortable>
                <template #default="{ row }">
                  <span v-if="row.bugToStableP50 !== null">
                    <strong>{{ row.bugToStableP50.toFixed(1) }}d</strong>
                    <span class="sub-muted"> / {{ fmtVal(row.bugToStableP90, 'd', 0) }}</span>
                  </span>
                  <span v-else class="sub-muted">—</span>
                </template>
              </UiTableColumn>
              <UiTableColumn
                field="dwellMP50"
                label="Silent Dwell (P50 / P90)"
                numeric
                sortable>
                <template #default="{ row }">
                  <span v-if="row.dwellMP50 !== null">
                    <strong>{{ row.dwellMP50 }} M</strong>
                    <span class="sub-muted"> / {{ row.dwellMP90 }} M</span>
                  </span>
                  <span v-else class="sub-muted">—</span>
                </template>
              </UiTableColumn>
              <UiTableColumn field="slaPct" label="Deadline-Exceeded" numeric sortable>
                <template #default="{ row }">
                  <span v-if="row.slaCount > 0" class="sla-pill is-danger">
                    {{ row.slaCount }} ({{ row.slaPct }}%)
                  </span>
                  <span v-else class="sub-muted">0</span>
                </template>
              </UiTableColumn>
              <UiTableColumn field="revertPct" label="Fix Reverts" numeric sortable>
                <template #default="{ row }">
                  <span v-if="row.revertCount > 0" class="sla-pill is-warn">
                    {{ row.revertCount }} ({{ row.revertPct }}%)
                  </span>
                  <span v-else class="sub-muted">0</span>
                </template>
              </UiTableColumn>
            </UiTable>
          </div>
        </div>
      </section>

      <!-- ROW 5: Operational Telemetry + Longest-Lived CVEs in Active Filter -->
      <section class="section pt-0">
        <div class="container">
          <div class="two-col-grid">
            <div class="chart-card">
              <h2 class="title is-5 mb-1">
                Operational SLA signals ({{ activeSeverityLabel }} · {{ activePeriodLabel }})
              </h2>
              <p class="muted-note mb-3">
                Escalations, LTS backport outcomes, postmortems, and fix-revert counts in the
                selected slice.
              </p>
              <div class="table-container">
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
                    <tr v-for="tag in activeSlaSignals" :key="tag.id">
                      <td>
                        <div class="tag-title">{{ tag.label }}</div>
                        <div class="tag-desc">{{ tag.description }}</div>
                      </td>
                      <td class="has-text-right num-cell">
                        <strong>{{ fmtInt(tag.count) }}</strong>
                        <span class="sub-muted"> ({{ tag.pct }}%)</span>
                      </td>
                      <td class="has-text-right num-cell">{{ fmtVal(tag.bugToStableP50, 'd') }}</td>
                      <td>
                        <div class="sample-cves">
                          <NuxtLink
                            v-for="id in tag.examples"
                            :key="id"
                            :to="`/cve?id=${id}`"
                            class="cve-chip">
                            {{ id }}
                          </NuxtLink>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="chart-card">
              <h2 class="title is-5 mb-1">
                Longest-lived vulnerabilities ({{ activeSeverityLabel }} · {{ activePeriodLabel }})
              </h2>
              <p class="muted-note mb-3">
                Matching CVEs that survived the most shipped Stable milestones before discovery.
              </p>
              <div class="table-container">
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
                    <tr v-for="c in longestLivedList" :key="c.id">
                      <td>
                        <NuxtLink :to="`/cve?id=${c.id}`" class="cve-chip is-bold">
                          {{ c.id }}
                        </NuxtLink>
                        <span
                          class="sev-dot ml-1"
                          :class="`is-${c.severity.toLowerCase()}`"
                          :title="c.severity" />
                      </td>
                      <td>
                        <code class="comp-mini">{{ c.primaryComponent }}</code>
                      </td>
                      <td class="has-text-right num-cell">
                        <code>M{{ c.foundIn }} → M{{ c.fixedMilestone }}</code>
                      </td>
                      <td class="has-text-right num-cell">
                        <strong>{{ c.dwellM }} M</strong>
                        <span v-if="c.dwellD !== null" class="sub-block">
                          {{ (c.dwellD / 365.25).toFixed(1) }} yrs
                        </span>
                      </td>
                    </tr>
                    <tr v-if="!longestLivedList.length">
                      <td colspan="4" class="has-text-centered sub-muted py-4">
                        No CVEs with milestone dwell metadata in this slice.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { format } from 'd3-format';
import { max } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft, axisRight } from 'd3-axis';
import { select } from 'd3-selection';
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape';
import chromeReleasesRaw from '~/utils/chrome-releases.json';
import { fetchCveData } from '~/utils/cve';
import { useUrlState, urlCodecs } from '~/composables/useUrlState';

const chromeReleases = chromeReleasesRaw as Record<string, string>;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low'] as const;
type SeverityName = (typeof SEVERITY_ORDER)[number];

interface ParsedCve {
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

const fmtInt = format(',d');
const fmtUsd = (v: number) =>
  '$' + (v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M' : fmtInt(Math.round(v || 0)));

const fmtVal = (v: number | null | undefined, suffix = '', decimals = 1): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const rounded = decimals === 0 ? Math.round(v) : Number(v.toFixed(decimals));
  return `${rounded}${suffix}`;
};

const fmtSigned1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
};

function quantileSorted(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function quantiles(values: number[]) {
  if (!values.length) {
    return { n: 0, p25: null as number | null, p50: null as number | null, p75: null as number | null, p90: null as number | null };
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

function countShippedMilestones(fi: number, vf: number): number {
  if (vf <= fi) return 0;
  let c = 0;
  for (let m = fi; m < vf; m++) {
    if (chromeReleases[String(m)]) c++;
  }
  return c || vf - fi;
}

// URL-synchronized state
const {
  severities,
  source,
  granularity,
  compareMode,
  period,
  turnaroundStyle,
  turnaroundMetric,
  dwellUnit,
  compFilter,
} = useUrlState({
  severities: urlCodecs.csv(['High', 'Critical']),
  source: urlCodecs.enum(['all', 'vrp', 'internal'] as const, 'all'),
  granularity: urlCodecs.enum(['year', 'quarter'] as const, 'year'),
  compareMode: urlCodecs.enum(['cohort', 'severities'] as const, 'cohort'),
  period: urlCodecs.enum(['12m', '3y', '2021', 'all'] as const, '12m'),
  turnaroundStyle: urlCodecs.enum(['band', 'stacked'] as const, 'band'),
  turnaroundMetric: urlCodecs.enum(
    ['bugToStable', 'bugToFix', 'fixToStable', 'fixToBeta'] as const,
    'bugToStable',
  ),
  dwellUnit: urlCodecs.enum(['milestones', 'days'] as const, 'milestones'),
  compFilter: urlCodecs.string(''),
});

const isCritHighPreset = computed(
  () =>
    severities.value.length === 2 &&
    severities.value.includes('Critical') &&
    severities.value.includes('High'),
);

const setSeverityPreset = (next: string[]) => {
  severities.value = [...next];
};

const loading = ref(true);
const parsedCves = shallowRef<ParsedCve[]>([]);
const maxPubMs = ref<number>(0);

const latestDateStr = computed(() =>
  maxPubMs.value ? new Date(maxPubMs.value).toISOString().slice(0, 10) : '',
);

const activeSeverityLabel = computed(() => {
  const ordered = SEVERITY_ORDER.filter((s) => severities.value.includes(s));
  if (ordered.length === 4) return 'All Severities';
  if (ordered.length === 0) return 'None';
  return ordered.join(' + ');
});

const activeSourceLabel = computed(() => {
  if (source.value === 'vrp') return 'External VRP';
  if (source.value === 'internal') return 'Internal / $0';
  return 'All Sources';
});

const activePeriodLabel = computed(() => {
  if (period.value === '12m') return 'Last 12 months';
  if (period.value === '3y') return 'Last 3 years';
  if (period.value === '2021') return '2021+ (4-wk cycle)';
  return 'All history';
});

const turnaroundMetricLabel = computed(() => {
  if (turnaroundMetric.value === 'bugToFix') return 'Discovery → Trunk Fix CL';
  if (turnaroundMetric.value === 'fixToStable') return 'Trunk Fix CL → Stable Release';
  if (turnaroundMetric.value === 'fixToBeta') return 'Trunk Fix CL → Beta Release';
  return 'Total Bug → Stable Release';
});

function matchesSource(c: ParsedCve): boolean {
  if (source.value === 'vrp') return c.isVrp;
  if (source.value === 'internal') return !c.isVrp;
  return true;
}

const selectedSevSet = computed(() => new Set(severities.value));

// Window bounds for KPI & Tables
const periodBounds = computed(() => {
  const end = maxPubMs.value || Date.now();
  if (period.value === '12m') {
    return {
      minMs: end - 365 * DAY_MS,
      priorMinMs: end - 730 * DAY_MS,
      priorMaxMs: end - 365 * DAY_MS,
    };
  }
  if (period.value === '3y') {
    return {
      minMs: end - 3 * 365.25 * DAY_MS,
      priorMinMs: end - 6 * 365.25 * DAY_MS,
      priorMaxMs: end - 3 * 365.25 * DAY_MS,
    };
  }
  if (period.value === '2021') {
    return { minMs: Date.UTC(2021, 0, 1), priorMinMs: null, priorMaxMs: null };
  }
  return { minMs: 0, priorMinMs: null, priorMaxMs: null };
});

// CVEs matching Source + Period (across all severities, for the stratification table)
const sourceAndPeriodCves = computed(() => {
  const minMs = periodBounds.value.minMs;
  return parsedCves.value.filter((c) => c.pubMs >= minMs && matchesSource(c));
});

// CVEs matching Severities + Source + Period
const activeWindowCves = computed(() => {
  const set = selectedSevSet.value;
  return sourceAndPeriodCves.value.filter((c) => set.has(c.severity));
});

const priorWindowCves = computed(() => {
  const { priorMinMs, priorMaxMs } = periodBounds.value;
  if (priorMinMs === null || priorMaxMs === null) return null;
  const set = selectedSevSet.value;
  return parsedCves.value.filter(
    (c) => c.pubMs >= priorMinMs && c.pubMs < priorMaxMs && set.has(c.severity) && matchesSource(c),
  );
});

function summarizeSlice(rows: ParsedCve[]) {
  const count = rows.length;
  const bts = quantiles(rows.map((r) => r.bugToStable).filter((x): x is number => x !== null));
  const btf = quantiles(rows.map((r) => r.bugToFix).filter((x): x is number => x !== null));
  const fts = quantiles(rows.map((r) => r.fixToStable).filter((x): x is number => x !== null));
  const dmVals = rows.map((r) => r.dwellM).filter((x): x is number => x !== null);
  const ddVals = rows.map((r) => r.dwellD).filter((x): x is number => x !== null);
  const dm = quantiles(dmVals);
  const dd = quantiles(ddVals);
  const over1Yr = dmVals.filter((m) => m >= 13).length;
  const slaCount = rows.filter((r) => r.slaMiss).length;
  const revertCount = rows.filter((r) => r.hasRevert).length;
  const ltsCount = rows.filter((r) => r.ltsMerged).length;
  const vrpUsd = rows.reduce((s, r) => s + r.reward, 0);

  const soakSharePct =
    bts.p50 && bts.p50 > 0 && fts.p50 !== null
      ? Math.min(100, Math.round((fts.p50 / bts.p50) * 100))
      : null;

  return {
    count,
    vrpUsd,
    bugToStableN: bts.n,
    bugToStableP25: bts.p25,
    bugToStableP50: bts.p50,
    bugToStableP75: bts.p75,
    bugToStableP90: bts.p90,
    bugToFixP50: btf.p50,
    bugToFixP90: btf.p90,
    fixToStableP50: fts.p50,
    soakSharePct,
    dwellMN: dm.n,
    dwellMP25: dm.p25,
    dwellMP50: dm.p50,
    dwellMP75: dm.p75,
    dwellMP90: dm.p90,
    dwellDP50: dd.p50,
    dwellDP90: dd.p90,
    over1YrPct: dm.n ? Number(((over1Yr / dm.n) * 100).toFixed(1)) : null,
    slaCount,
    slaPct: count ? Number(((slaCount / count) * 100).toFixed(1)) : 0,
    revertCount,
    revertPct: count ? Number(((revertCount / count) * 100).toFixed(1)) : 0,
    ltsCount,
  };
}

const windowStats = computed(() => summarizeSlice(activeWindowCves.value));
const priorWindowStats = computed(() =>
  priorWindowCves.value ? summarizeSlice(priorWindowCves.value) : null,
);

const deltaSuffix = computed(() => (period.value === '12m' ? 'YoY' : 'vs prior 3y'));

const deltas = computed(() => {
  const cur = windowStats.value;
  const prev = priorWindowStats.value;
  if (!prev || prev.count < 10) {
    return { bugToStable: null, bugToFix: null, dwellM: null, slaPct: null };
  }
  return {
    bugToStable:
      cur.bugToStableP50 !== null && prev.bugToStableP50 !== null
        ? cur.bugToStableP50 - prev.bugToStableP50
        : null,
    bugToFix:
      cur.bugToFixP50 !== null && prev.bugToFixP50 !== null
        ? cur.bugToFixP50 - prev.bugToFixP50
        : null,
    dwellM:
      cur.dwellMP50 !== null && prev.dwellMP50 !== null ? cur.dwellMP50 - prev.dwellMP50 : null,
    slaPct: cur.count >= 10 ? cur.slaPct - prev.slaPct : null,
  };
});

// Side-by-side severity stratification in active period
const severityStratification = computed(() =>
  SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    ...summarizeSlice(sourceAndPeriodCves.value.filter((c) => c.severity === sev)),
  })),
);

const maxStratDays = computed(() => {
  const m = max(severityStratification.value, (r) => r.bugToStableP75 ?? r.bugToStableP50 ?? 0);
  return Math.max(40, m || 80);
});

// Dwell histogram in active window
const DWELL_BUCKETS = [
  { key: '0 M', label: '0 milestones (Same release)', min: 0, max: 0 },
  { key: '1–2 M', label: '1–2 milestones (~1–2 mos)', min: 1, max: 2 },
  { key: '3–6 M', label: '3–6 milestones (~3–6 mos)', min: 3, max: 6 },
  { key: '7–12 M', label: '7–12 milestones (~6–12 mos)', min: 7, max: 12 },
  { key: '13–24 M', label: '13–24 milestones (1–2 yrs)', min: 13, max: 24 },
  { key: '25–48 M', label: '25–48 milestones (2–4 yrs)', min: 25, max: 48 },
  { key: '49+ M', label: '49+ milestones (4+ yrs)', min: 49, max: Infinity },
];

const activeHistogram = computed(() => {
  const rows = activeWindowCves.value.filter((c) => c.dwellM !== null);
  const totalWithDwell = rows.length || 1;
  return DWELL_BUCKETS.map((b) => {
    const bySeverity: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let total = 0;
    let vrpUsd = 0;
    for (const c of rows) {
      const m = c.dwellM!;
      if (m >= b.min && m <= b.max) {
        total++;
        vrpUsd += c.reward;
        if (bySeverity[c.severity] !== undefined) bySeverity[c.severity]++;
      }
    }
    return {
      key: b.key,
      label: b.label,
      total,
      sharePct: ((total / totalWithDwell) * 100).toFixed(1),
      vrpUsd,
      bySeverity,
    };
  });
});

// Time-series buckets (Yearly 2018..2026 or Quarterly 2020Q1..2026Q4)
const timeSeriesBuckets = computed(() => {
  const isYear = granularity.value === 'year';
  const keys: string[] = [];
  if (isYear) {
    for (let y = 2018; y <= 2026; y++) keys.push(String(y));
  } else {
    for (let y = 2020; y <= 2026; y++) {
      for (let q = 1; q <= 4; q++) keys.push(`${y}Q${q}`);
    }
  }

  const byKeyAllSev = new Map<string, ParsedCve[]>(keys.map((k) => [k, []]));
  for (const c of parsedCves.value) {
    if (!matchesSource(c)) continue;
    const k = isYear ? String(c.year) : c.quarter;
    const arr = byKeyAllSev.get(k);
    if (arr) arr.push(c);
  }

  const activeSet = selectedSevSet.value;
  return keys
    .map((key) => {
      const allSevRows = byKeyAllSev.get(key) || [];
      const cohortRows = allSevRows.filter((c) => activeSet.has(c.severity));

      const metricVals = cohortRows
        .map((c) => c[turnaroundMetric.value])
        .filter((x): x is number => x !== null);
      const metricQ = quantiles(metricVals);

      const engQ = quantiles(cohortRows.map((c) => c.bugToFix).filter((x): x is number => x !== null));
      const mergeQ = quantiles(
        cohortRows.map((c) => c.branchMerge).filter((x): x is number => x !== null),
      );
      const rolloutQ = quantiles(
        cohortRows.map((c) => c.rolloutToStable).filter((x): x is number => x !== null),
      );
      const btsQ = quantiles(
        cohortRows.map((c) => c.bugToStable).filter((x): x is number => x !== null),
      );

      const dwellVals = cohortRows
        .map((c) => (dwellUnit.value === 'milestones' ? c.dwellM : c.dwellD))
        .filter((x): x is number => x !== null);
      const dwellQ = quantiles(dwellVals);
      const dmRaw = cohortRows.map((c) => c.dwellM).filter((x): x is number => x !== null);
      const over1YrPct = dmRaw.length
        ? Number(((dmRaw.filter((m) => m >= 13).length / dmRaw.length) * 100).toFixed(1))
        : 0;

      const n = cohortRows.length;
      const slaCount = cohortRows.filter((c) => c.slaMiss).length;
      const revCount = cohortRows.filter((c) => c.hasRevert).length;
      const ltsCount = cohortRows.filter((c) => c.ltsMerged).length;

      // Per-severity medians for "Compare Severities" mode (require n >= 3 to avoid single-bug noise)
      const perSeverity = Object.fromEntries(
        SEVERITY_ORDER.map((sev) => {
          const sr = allSevRows.filter((c) => c.severity === sev);
          const mVals = sr
            .map((c) => c[turnaroundMetric.value])
            .filter((x): x is number => x !== null);
          const dVals = sr
            .map((c) => (dwellUnit.value === 'milestones' ? c.dwellM : c.dwellD))
            .filter((x): x is number => x !== null);
          const slaPct =
            sr.length >= 3
              ? Number(((sr.filter((c) => c.slaMiss).length / sr.length) * 100).toFixed(1))
              : null;
          return [
            sev,
            {
              n: sr.length,
              turnP50: mVals.length >= 3 ? quantileSorted([...mVals].sort((a, b) => a - b), 0.5) : null,
              dwellN: dVals.length,
              dwellP50: dVals.length >= 3 ? quantileSorted([...dVals].sort((a, b) => a - b), 0.5) : null,
              slaPct,
            },
          ];
        }),
      ) as Record<
        SeverityName,
        { n: number; turnP50: number | null; dwellN: number; dwellP50: number | null; slaPct: number | null }
      >;

      return {
        key,
        n,
        allN: allSevRows.length,
        metricQ,
        engP50: engQ.p50,
        mergeP50: mergeQ.p50,
        rolloutP50: rolloutQ.p50,
        btsP50: btsQ.p50,
        btsP90: btsQ.p90,
        dwellQ,
        over1YrPct,
        slaCount,
        slaPct: n >= 3 ? Number(((slaCount / n) * 100).toFixed(1)) : null,
        revCount,
        revPct: n >= 3 ? Number(((revCount / n) * 100).toFixed(1)) : null,
        ltsCount,
        perSeverity,
      };
    })
    .filter((b) => b.allN > 0);
});

// Dynamic Component Table
const componentRows = computed(() => {
  const map = new Map<string, ParsedCve[]>();
  for (const c of activeWindowCves.value) {
    const comps = c.components.length ? c.components : ['Unassigned'];
    for (const comp of comps) {
      let arr = map.get(comp);
      if (!arr) {
        arr = [];
        map.set(comp, arr);
      }
      arr.push(c);
    }
  }

  const out: any[] = [];
  for (const [component, rows] of map.entries()) {
    if (rows.length < 3) continue;
    const s = summarizeSlice(rows);
    out.push({
      component,
      count: s.count,
      vrpUsd: Math.round(s.vrpUsd),
      bugToFixP50: s.bugToFixP50 !== null ? Number(s.bugToFixP50.toFixed(1)) : null,
      fixToStableP50: s.fixToStableP50 !== null ? Number(s.fixToStableP50.toFixed(1)) : null,
      bugToStableP50: s.bugToStableP50 !== null ? Number(s.bugToStableP50.toFixed(1)) : null,
      bugToStableP90: s.bugToStableP90 !== null ? Number(s.bugToStableP90.toFixed(1)) : null,
      dwellMP50: s.dwellMP50 !== null ? Number(s.dwellMP50.toFixed(1)) : null,
      dwellMP90: s.dwellMP90 !== null ? Number(s.dwellMP90.toFixed(1)) : null,
      slaCount: s.slaCount,
      slaPct: s.slaPct,
      revertCount: s.revertCount,
      revertPct: s.revertPct,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
});

const filteredComponents = computed(() => {
  const q = compFilter.value.trim().toLowerCase();
  if (!q) return componentRows.value;
  return componentRows.value.filter((c) => c.component.toLowerCase().includes(q));
});

// Dynamic Operational SLA Signals & Longest-Lived CVEs
const activeSlaSignals = computed(() => {
  const rows = activeWindowCves.value;
  const total = rows.length || 1;
  const defs = [
    {
      id: 'Deadline-Exceeded',
      label: 'Deadline-Exceeded',
      description: 'Security fix or merge exceeded Chrome severity SLO deadline.',
      pred: (c: ParsedCve) => c.slaMiss,
    },
    {
      id: 'Fix-Reverted',
      label: 'Security Fix Reverted',
      description: 'At least one landed security fix CL was reverted before relanding.',
      pred: (c: ParsedCve) => c.hasRevert,
    },
    {
      id: 'LTS-Merged',
      label: 'LTS-Merge-Merged',
      description: 'Vulnerability backported to ChromeOS / Enterprise Long-Term Support.',
      pred: (c: ParsedCve) => c.ltsMerged,
    },
    {
      id: 'LTS-Friction',
      label: 'LTS Merge Delayed / Rejected',
      description: 'Backport to LTS hit merge conflict, stability rejection, or delay.',
      pred: (c: ParsedCve) => c.ltsFriction,
    },
    {
      id: 'Nag',
      label: 'SLA Sheriffbot Nag',
      description: 'Automated sheriffbot escalation triggered on approaching/overdue SLO.',
      pred: (c: ParsedCve) => c.nag,
    },
    {
      id: 'v8-postmortem',
      label: 'v8-postmortem',
      description: 'Flagged for V8 security postmortem & systemic fuzzer/invariant follow-up.',
      pred: (c: ParsedCve) => c.v8Postmortem,
    },
    {
      id: 'CodeYellow',
      label: 'Security-CodeYellow',
      description: 'Subsystem placed under executive Security Code Yellow remediation.',
      pred: (c: ParsedCve) => c.codeYellow,
    },
  ];

  return defs
    .map((d) => {
      const matched = rows.filter(d.pred);
      const bts = quantiles(
        matched.map((c) => c.bugToStable).filter((x): x is number => x !== null),
      );
      return {
        id: d.id,
        label: d.label,
        description: d.description,
        count: matched.length,
        pct: ((matched.length / total) * 100).toFixed(1),
        bugToStableP50: bts.p50,
        examples: matched.slice(0, 3).map((c) => c.id),
      };
    })
    .filter((d) => d.count > 0 || d.id === 'Deadline-Exceeded' || d.id === 'Fix-Reverted');
});

const longestLivedList = computed(() =>
  [...activeWindowCves.value]
    .filter((c) => c.dwellM !== null && c.foundIn !== null && c.fixedMilestone !== null)
    .sort((a, b) => (b.dwellM! - a.dwellM!) || (b.reward - a.reward))
    .slice(0, 10),
);

// -----------------------------------------------------------------------------
// D3 Charts (Hero Turnaround, Dwell Over Time, SLA Rate Over Time, Histogram)
// -----------------------------------------------------------------------------
const turnWrap = ref<HTMLElement | null>(null);
const turnSvg = ref<SVGSVGElement | null>(null);
const turnHover = ref<any>(null);
const turnTtStyle = ref<Record<string, string>>({});

const dwellWrap = ref<HTMLElement | null>(null);
const dwellSvg = ref<SVGSVGElement | null>(null);
const dwellHover = ref<any>(null);
const dwellTtStyle = ref<Record<string, string>>({});

const slaWrap = ref<HTMLElement | null>(null);
const slaSvg = ref<SVGSVGElement | null>(null);
const slaHover = ref<any>(null);
const slaTtStyle = ref<Record<string, string>>({});

const histWrap = ref<HTMLElement | null>(null);
const histSvg = ref<SVGSVGElement | null>(null);
const histHover = ref<any>(null);
const histTtStyle = ref<Record<string, string>>({});

const SEV_COLOR: Record<SeverityName, string> = {
  Critical: 'var(--severity-critical)',
  High: 'var(--severity-high)',
  Medium: 'var(--series-4)',
  Low: 'var(--series-1)',
};

function styleAxes(svg: any) {
  svg.selectAll('.domain').attr('stroke', 'var(--line-strong)');
  svg.selectAll('.tick line').attr('stroke', 'var(--line)');
  svg
    .selectAll('.tick text')
    .attr('fill', 'var(--muted)')
    .style('font-size', '11px')
    .style('font-family', 'var(--font-sans)');
}

function sparseTicks(keys: string[]): string[] {
  if (keys.length <= 12) return keys;
  return keys.filter((k, idx) => k.endsWith('Q1') || idx === keys.length - 1);
}

// Chart 1: Fix Turnaround Evolution
function drawTurnaroundChart() {
  if (!turnSvg.value || !turnWrap.value) return;
  const buckets = timeSeriesBuckets.value;
  const svg = select(turnSvg.value);
  svg.selectAll('*').remove();
  if (!buckets.length) return;

  const width = Math.max(360, turnWrap.value.clientWidth);
  const height = 300;
  const margin = { top: 22, right: 24, bottom: 34, left: 48 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const keys = buckets.map((b) => b.key);
  const x = scaleBand<string>().domain(keys).range([0, innerW]).padding(0.24);
  const cx = (k: string) => (x(k) || 0) + x.bandwidth() / 2;

  let yMax = 60;
  if (compareMode.value === 'severities') {
    yMax =
      max(buckets, (b) =>
        max(SEVERITY_ORDER, (s) => b.perSeverity[s].turnP50 ?? 0),
      ) || 80;
  } else if (turnaroundStyle.value === 'stacked') {
    yMax =
      max(buckets, (b) => {
        const sum = (b.engP50 || 0) + (b.mergeP50 || 0) + (b.rolloutP50 || 0);
        return Math.max(sum, b.btsP50 || 0);
      }) || 60;
  } else {
    yMax = max(buckets, (b) => b.metricQ.p90 ?? b.metricQ.p50 ?? 0) || 80;
  }

  const y = scaleLinear()
    .domain([0, yMax * 1.14])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.75));

  // Release-cadence milestone reference lines
  const annotations =
    granularity.value === 'year'
      ? [
          { key: '2021', label: 'M94: 4-wk Stable' },
          { key: '2023', label: 'M116: Weekly security updates' },
          { key: '2026', label: 'CNA expansion' },
        ]
      : [
          { key: '2021Q3', label: 'M94: 4-wk Stable' },
          { key: '2023Q3', label: 'M116: Weekly updates' },
          { key: '2026Q1', label: 'CNA expansion' },
        ];

  for (const ann of annotations) {
    if (!keys.includes(ann.key)) continue;
    const ax = cx(ann.key);
    g.append('line')
      .attr('x1', ax)
      .attr('x2', ax)
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'var(--line-strong)')
      .attr('stroke-dasharray', '3,3');
    g.append('text')
      .attr('x', Math.min(innerW - 4, ax + 4))
      .attr('y', 10)
      .attr('text-anchor', ax > innerW - 110 ? 'end' : 'start')
      .attr('fill', 'var(--muted)')
      .style('font-size', '10px')
      .text(ann.label);
  }

  if (compareMode.value === 'severities') {
    for (const sev of SEVERITY_ORDER) {
      const pts = buckets.filter((b) => b.perSeverity[sev].turnP50 !== null);
      if (!pts.length) continue;
      const lineGen = d3Line<(typeof pts)[number]>()
        .x((d) => cx(d.key))
        .y((d) => y(d.perSeverity[sev].turnP50!))
        .curve(curveMonotoneX);
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', SEV_COLOR[sev])
        .attr('stroke-width', 2.4)
        .attr('d', lineGen);
      g.selectAll(`.dot-${sev}`)
        .data(pts)
        .join('circle')
        .attr('cx', (d) => cx(d.key))
        .attr('cy', (d) => y(d.perSeverity[sev].turnP50!))
        .attr('r', granularity.value === 'year' ? 3.5 : 2.5)
        .attr('fill', SEV_COLOR[sev]);
    }
  } else if (turnaroundStyle.value === 'stacked') {
    const stages = [
      { key: 'engP50', color: 'var(--series-1)' },
      { key: 'mergeP50', color: 'var(--series-4)' },
      { key: 'rolloutP50', color: 'var(--series-3)' },
    ] as const;

    for (const b of buckets) {
      let acc = 0;
      const bx = x(b.key) || 0;
      for (const st of stages) {
        const v = (b as any)[st.key] || 0;
        if (v <= 0) continue;
        const y0 = y(acc);
        const y1 = y(acc + v);
        g.append('rect')
          .attr('x', bx)
          .attr('y', y1)
          .attr('width', x.bandwidth())
          .attr('height', Math.max(1, y0 - y1))
          .attr('rx', 2)
          .attr('fill', st.color)
          .attr('opacity', 0.9);
        acc += v;
      }
    }

    const totalPts = buckets.filter((b) => b.btsP50 !== null);
    const totalLine = d3Line<(typeof totalPts)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.btsP50!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(totalPts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--severity-critical)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,3')
      .attr('d', totalLine);
  } else {
    const valid = buckets.filter((b) => b.metricQ.p50 !== null);
    const iqrValid = valid.filter((b) => b.metricQ.p25 !== null && b.metricQ.p75 !== null);
    const p90Valid = valid.filter((b) => b.metricQ.p90 !== null);

    const areaIqr = d3Area<(typeof iqrValid)[number]>()
      .x((d) => cx(d.key))
      .y0((d) => y(d.metricQ.p25!))
      .y1((d) => y(d.metricQ.p75!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(iqrValid)
      .attr('fill', 'var(--series-1)')
      .attr('opacity', 0.14)
      .attr('d', areaIqr);

    const lineP90 = d3Line<(typeof p90Valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.metricQ.p90!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(p90Valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-2)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,4')
      .attr('d', lineP90);

    const lineP50 = d3Line<(typeof valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.metricQ.p50!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-1)')
      .attr('stroke-width', 2.6)
      .attr('d', lineP50);

    g.selectAll('.p50-dot')
      .data(valid)
      .join('circle')
      .attr('cx', (d) => cx(d.key))
      .attr('cy', (d) => y(d.metricQ.p50!))
      .attr('r', granularity.value === 'year' ? 3.8 : 2.6)
      .attr('fill', 'var(--series-1)');
  }

  // Hover hit columns
  const step = innerW / Math.max(1, buckets.length);
  g.selectAll('.hit-col')
    .data(buckets)
    .join('rect')
    .attr('x', (d) => cx(d.key) - step / 2)
    .attr('y', 0)
    .attr('width', step)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('mouseenter mousemove', (event: MouseEvent, b) => {
      const rect = turnWrap.value!.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      turnTtStyle.value = {
        left: `${Math.min(Math.max(12, relX + 14), width - 255)}px`,
        top: '14px',
      };
      if (compareMode.value === 'severities') {
        turnHover.value = {
          mode: 'severities',
          bucket: b.key,
          n: b.allN,
          sevRows: SEVERITY_ORDER.map((s) => ({
            sev: s,
            n: b.perSeverity[s].n,
            val: b.perSeverity[s].turnP50,
          })),
        };
      } else if (turnaroundStyle.value === 'stacked') {
        turnHover.value = {
          mode: 'stacked',
          bucket: b.key,
          n: b.n,
          eng: b.engP50,
          merge: b.mergeP50,
          rollout: b.rolloutP50,
          totalP50: b.btsP50,
          totalP90: b.btsP90,
        };
      } else {
        turnHover.value = {
          mode: 'band',
          bucket: b.key,
          n: b.metricQ.n,
          p25: b.metricQ.p25,
          p50: b.metricQ.p50,
          p75: b.metricQ.p75,
          p90: b.metricQ.p90,
          engP50: b.engP50,
          soakP50: b.rolloutP50,
        };
      }
    })
    .on('mouseleave', () => {
      turnHover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(sparseTicks(keys)).tickSizeOuter(0));
  g.append('g').call(axisLeft(y).ticks(5).tickFormat((d) => `${d}d`));
  styleAxes(svg);
}

// Chart 2: Silent Vulnerability Dwell Time Over Time
function drawDwellChart() {
  if (!dwellSvg.value || !dwellWrap.value) return;
  const buckets = timeSeriesBuckets.value;
  const svg = select(dwellSvg.value);
  svg.selectAll('*').remove();
  if (!buckets.length) return;

  const isM = dwellUnit.value === 'milestones';
  const unitSuffix = isM ? ' M' : 'd';

  const width = Math.max(320, dwellWrap.value.clientWidth);
  const height = 250;
  const margin = { top: 14, right: 16, bottom: 32, left: 46 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const keys = buckets.map((b) => b.key);
  const x = scaleBand<string>().domain(keys).range([0, innerW]).padding(0.24);
  const cx = (k: string) => (x(k) || 0) + x.bandwidth() / 2;

  const yMax =
    compareMode.value === 'severities'
      ? max(buckets, (b) => max(SEVERITY_ORDER, (s) => b.perSeverity[s].dwellP50 ?? 0)) || 10
      : max(buckets, (b) => b.dwellQ.p90 ?? b.dwellQ.p50 ?? 0) || 12;

  const y = scaleLinear()
    .domain([0, Math.max(4, yMax * 1.14)])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.7));

  if (compareMode.value === 'severities') {
    for (const sev of SEVERITY_ORDER) {
      const pts = buckets.filter((b) => b.perSeverity[sev].dwellP50 !== null);
      if (!pts.length) continue;
      const lineGen = d3Line<(typeof pts)[number]>()
        .x((d) => cx(d.key))
        .y((d) => y(d.perSeverity[sev].dwellP50!))
        .curve(curveMonotoneX);
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', SEV_COLOR[sev])
        .attr('stroke-width', 2.2)
        .attr('d', lineGen);
      g.selectAll(`.ddot-${sev}`)
        .data(pts)
        .join('circle')
        .attr('cx', (d) => cx(d.key))
        .attr('cy', (d) => y(d.perSeverity[sev].dwellP50!))
        .attr('r', granularity.value === 'year' ? 3.2 : 2.2)
        .attr('fill', SEV_COLOR[sev]);
    }
  } else {
    const valid = buckets.filter((b) => b.dwellQ.p50 !== null);
    const iqrValid = valid.filter((b) => b.dwellQ.p25 !== null && b.dwellQ.p75 !== null);
    const p90Valid = valid.filter((b) => b.dwellQ.p90 !== null);

    const areaIqr = d3Area<(typeof iqrValid)[number]>()
      .x((d) => cx(d.key))
      .y0((d) => y(d.dwellQ.p25!))
      .y1((d) => y(d.dwellQ.p75!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(iqrValid)
      .attr('fill', 'var(--series-7)')
      .attr('opacity', 0.14)
      .attr('d', areaIqr);

    const lineP90 = d3Line<(typeof p90Valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.dwellQ.p90!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(p90Valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-2)')
      .attr('stroke-width', 1.9)
      .attr('stroke-dasharray', '5,4')
      .attr('d', lineP90);

    const lineP50 = d3Line<(typeof valid)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.dwellQ.p50!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(valid)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-7)')
      .attr('stroke-width', 2.4)
      .attr('d', lineP50);

    g.selectAll('.dw-dot')
      .data(valid)
      .join('circle')
      .attr('cx', (d) => cx(d.key))
      .attr('cy', (d) => y(d.dwellQ.p50!))
      .attr('r', granularity.value === 'year' ? 3.5 : 2.3)
      .attr('fill', 'var(--series-7)');
  }

  const step = innerW / Math.max(1, buckets.length);
  g.selectAll('.hit-dw')
    .data(buckets)
    .join('rect')
    .attr('x', (d) => cx(d.key) - step / 2)
    .attr('y', 0)
    .attr('width', step)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('mouseenter mousemove', (event: MouseEvent, b) => {
      const rect = dwellWrap.value!.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      dwellTtStyle.value = {
        left: `${Math.min(Math.max(8, relX + 12), width - 225)}px`,
        top: '10px',
      };
      if (compareMode.value === 'severities') {
        dwellHover.value = {
          mode: 'severities',
          bucket: b.key,
          n: b.allN,
          sevRows: SEVERITY_ORDER.map((s) => ({
            sev: s,
            n: b.perSeverity[s].dwellN,
            text: fmtVal(b.perSeverity[s].dwellP50, unitSuffix, isM ? 1 : 0),
          })),
        };
      } else {
        dwellHover.value = {
          mode: 'cohort',
          bucket: b.key,
          n: b.dwellQ.n,
          p50Text: fmtVal(b.dwellQ.p50, unitSuffix, isM ? 1 : 0),
          iqrText: `${fmtVal(b.dwellQ.p25, '', isM ? 1 : 0)} – ${fmtVal(b.dwellQ.p75, unitSuffix, isM ? 1 : 0)}`,
          p90Text: fmtVal(b.dwellQ.p90, unitSuffix, isM ? 1 : 0),
          over1YrPct: b.over1YrPct,
        };
      }
    })
    .on('mouseleave', () => {
      dwellHover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(sparseTicks(keys)).tickSizeOuter(0));
  g.append('g').call(
    axisLeft(y)
      .ticks(5)
      .tickFormat((d) => (isM ? `${d}M` : `${d}d`)),
  );
  styleAxes(svg);
}

// Chart 3: Security SLA Miss & Fix-Revert Rate Over Time
function drawSlaChart() {
  if (!slaSvg.value || !slaWrap.value) return;
  const buckets = timeSeriesBuckets.value;
  const svg = select(slaSvg.value);
  svg.selectAll('*').remove();
  if (!buckets.length) return;

  const width = Math.max(320, slaWrap.value.clientWidth);
  const height = 250;
  const margin = { top: 14, right: 38, bottom: 32, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const keys = buckets.map((b) => b.key);
  const x = scaleBand<string>().domain(keys).range([0, innerW]).padding(0.26);
  const cx = (k: string) => (x(k) || 0) + x.bandwidth() / 2;

  const yMaxPct =
    compareMode.value === 'severities'
      ? max(buckets, (b) => max(SEVERITY_ORDER, (s) => b.perSeverity[s].slaPct ?? 0)) || 15
      : max(buckets, (b) => Math.max(b.slaPct ?? 0, b.revPct ?? 0)) || 15;

  const y = scaleLinear()
    .domain([0, Math.max(10, yMaxPct * 1.18)])
    .nice()
    .range([innerH, 0]);

  const yVol = scaleLinear()
    .domain([0, (max(buckets, (b) => b.n) || 100) * 1.2])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.7));

  if (compareMode.value === 'cohort') {
    g.selectAll('.vol-bar')
      .data(buckets)
      .join('rect')
      .attr('x', (d) => x(d.key) || 0)
      .attr('y', (d) => yVol(d.n))
      .attr('width', x.bandwidth())
      .attr('height', (d) => innerH - yVol(d.n))
      .attr('rx', 2)
      .attr('fill', 'var(--line-strong)')
      .attr('opacity', 0.35);

    const revPts = buckets.filter((b) => b.revPct !== null);
    const revLine = d3Line<(typeof revPts)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.revPct!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(revPts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-4)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,3')
      .attr('d', revLine);

    const slaPts = buckets.filter((b) => b.slaPct !== null);
    const slaLine = d3Line<(typeof slaPts)[number]>()
      .x((d) => cx(d.key))
      .y((d) => y(d.slaPct!))
      .curve(curveMonotoneX);
    g.append('path')
      .datum(slaPts)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-8)')
      .attr('stroke-width', 2.4)
      .attr('d', slaLine);

    g.selectAll('.sla-dot')
      .data(slaPts)
      .join('circle')
      .attr('cx', (d) => cx(d.key))
      .attr('cy', (d) => y(d.slaPct!))
      .attr('r', granularity.value === 'year' ? 3.5 : 2.3)
      .attr('fill', 'var(--series-8)');

    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(axisRight(yVol).ticks(4).tickFormat(format('~s')));
  } else {
    for (const sev of SEVERITY_ORDER) {
      const pts = buckets.filter((b) => b.perSeverity[sev].slaPct !== null);
      if (!pts.length) continue;
      const lineGen = d3Line<(typeof pts)[number]>()
        .x((d) => cx(d.key))
        .y((d) => y(d.perSeverity[sev].slaPct!))
        .curve(curveMonotoneX);
      g.append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', SEV_COLOR[sev])
        .attr('stroke-width', 2.2)
        .attr('d', lineGen);
    }
  }

  const step = innerW / Math.max(1, buckets.length);
  g.selectAll('.hit-sla')
    .data(buckets)
    .join('rect')
    .attr('x', (d) => cx(d.key) - step / 2)
    .attr('y', 0)
    .attr('width', step)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('mouseenter mousemove', (event: MouseEvent, b) => {
      const rect = slaWrap.value!.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      slaTtStyle.value = {
        left: `${Math.min(Math.max(8, relX + 12), width - 220)}px`,
        top: '10px',
      };
      if (compareMode.value === 'severities') {
        slaHover.value = {
          mode: 'severities',
          bucket: b.key,
          n: b.allN,
          sevRows: SEVERITY_ORDER.map((s) => ({
            sev: s,
            n: b.perSeverity[s].n,
            val: b.perSeverity[s].slaPct,
          })),
        };
      } else {
        slaHover.value = {
          mode: 'cohort',
          bucket: b.key,
          n: b.n,
          slaPct: b.slaPct ?? 0,
          slaCount: b.slaCount,
          revPct: b.revPct ?? 0,
          revCount: b.revCount,
          ltsCount: b.ltsCount,
        };
      }
    })
    .on('mouseleave', () => {
      slaHover.value = null;
    });

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(sparseTicks(keys)).tickSizeOuter(0));
  g.append('g').call(axisLeft(y).ticks(5).tickFormat((d) => `${d}%`));
  styleAxes(svg);
}

// Chart 4: Active Window Lifespan Histogram
function drawHistogram() {
  if (!histSvg.value || !histWrap.value) return;
  const buckets = activeHistogram.value;
  const svg = select(histSvg.value);
  svg.selectAll('*').remove();

  const width = Math.max(320, histWrap.value.clientWidth);
  const height = 220;
  const margin = { top: 12, right: 14, bottom: 30, left: 46 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = scaleBand<string>()
    .domain(buckets.map((b) => b.key))
    .range([0, innerW])
    .padding(0.24);
  const y = scaleLinear()
    .domain([0, Math.max(5, (max(buckets, (b) => b.total) || 10) * 1.12)])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .call(axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => ''))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('line').attr('stroke', 'var(--line)').attr('stroke-opacity', 0.7));

  for (const b of buckets) {
    let acc = 0;
    const bx = x(b.key) || 0;
    for (const sev of SEVERITY_ORDER) {
      const val = b.bySeverity[sev] || 0;
      if (!val) continue;
      const y0 = y(acc);
      const y1 = y(acc + val);
      g.append('rect')
        .attr('x', bx)
        .attr('y', y1)
        .attr('width', x.bandwidth())
        .attr('height', Math.max(1, y0 - y1))
        .attr('rx', 2)
        .attr('fill', SEV_COLOR[sev])
        .attr('opacity', 0.9);
      acc += val;
    }

    g.append('rect')
      .attr('x', bx)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter mousemove', (event: MouseEvent) => {
        const rect = histWrap.value!.getBoundingClientRect();
        const relX = event.clientX - rect.left;
        histTtStyle.value = {
          left: `${Math.min(Math.max(8, relX + 12), width - 220)}px`,
          top: '8px',
        };
        histHover.value = b;
      })
      .on('mouseleave', () => {
        histHover.value = null;
      });
  }

  g.append('g').attr('transform', `translate(0,${innerH})`).call(axisBottom(x).tickSizeOuter(0));
  g.append('g').call(axisLeft(y).ticks(4));
  styleAxes(svg);
}

function redrawAll() {
  if (loading.value || severities.value.length === 0) return;
  drawTurnaroundChart();
  drawDwellChart();
  drawSlaChart();
  drawHistogram();
}

let resizeObs: ResizeObserver | null = null;

onMounted(async () => {
  const rawCves = await fetchCveData();
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

  maxPubMs.value = latestMs;
  parsedCves.value = out;
  loading.value = false;

  await nextTick();
  redrawAll();

  resizeObs = new ResizeObserver(() => redrawAll());
  if (turnWrap.value) resizeObs.observe(turnWrap.value);
  if (dwellWrap.value) resizeObs.observe(dwellWrap.value);
});

onBeforeUnmount(() => resizeObs?.disconnect());

watch(
  [severities, source, granularity, compareMode, period, turnaroundStyle, turnaroundMetric, dwellUnit],
  async () => {
    await nextTick();
    redrawAll();
  },
  { deep: true },
);
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.subtitle-text {
  color: var(--muted);
  max-width: 78ch;
  line-height: 1.55;
  margin: 0;
}

.snapshot-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
}

/* Sticky filter bar */
.filter-bar-sticky {
  position: sticky;
  top: 0;
  z-index: 15;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 0.65rem 1.5rem;
}

.filter-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem 1.15rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.chips {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  flex-wrap: wrap;
}

.preset-link {
  background: transparent;
  border: 1px dashed var(--line-strong);
  border-radius: 999px;
  padding: 0.22rem 0.55rem;
  font-size: 0.74rem;
  color: var(--muted);
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}

.preset-link:hover {
  color: var(--ink);
  border-color: var(--accent);
}

.preset-link.is-current {
  color: var(--accent-ink);
  background: var(--accent-soft);
  border-style: solid;
  border-color: var(--accent-line);
  font-weight: 600;
}

.sev-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sev-dot.is-critical {
  background: var(--severity-critical);
}

.sev-dot.is-high {
  background: var(--severity-high);
}

.sev-dot.is-medium {
  background: var(--series-4);
}

.sev-dot.is-low {
  background: var(--series-1);
}

.cohort-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.cohort-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--ink-2);
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
}

.cohort-sub {
  font-size: 0.76rem;
  color: var(--muted);
}

.kpi-skeleton {
  height: 120px;
  border-radius: var(--radius-lg);
}

.empty-cohort-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 2rem;
  text-align: center;
  color: var(--muted);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
}

@media (max-width: 1024px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1rem 1.1rem;
  box-shadow: var(--shadow-xs);
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.kpi-eyebrow {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--muted);
}

.delta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.7rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 0.1rem 0.42rem;
  border-radius: 999px;
  white-space: nowrap;
}

.delta-chip.is-good {
  background: var(--tag-success-bg);
  color: var(--tag-success-ink);
}

.delta-chip.is-warn {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.delta-chip.is-neutral {
  background: var(--surface-sunken);
  color: var(--ink-2);
}

.kpi-value {
  font-size: 1.65rem;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.kpi-unit {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--muted);
  margin-left: 0.2rem;
}

.kpi-detail {
  margin: 0.35rem 0 0;
  font-size: 0.79rem;
  color: var(--muted);
  line-height: 1.45;
}

.two-col-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.1rem;
}

@media (max-width: 980px) {
  .two-col-grid {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1.15rem 1.25rem;
  box-shadow: var(--shadow-xs);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
  margin-bottom: 0.65rem;
}

.card-head.is-wrap {
  flex-wrap: wrap;
}

.muted-note {
  color: var(--muted);
  font-size: 0.84rem;
  margin: 0;
}

.inline-controls {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.sev-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 1rem;
  font-size: 0.78rem;
  color: var(--ink-2);
}

.sev-legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

.line-key {
  display: inline-block;
  width: 16px;
  border-top: 2.5px solid;
}

.line-key.is-dashed {
  border-top-style: dashed;
}

.band-swatch {
  display: inline-block;
  width: 14px;
  height: 9px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--series-1) 24%, transparent);
  border: 1px solid color-mix(in srgb, var(--series-1) 45%, transparent);
}

.band-swatch.is-purple {
  background: color-mix(in srgb, var(--series-7) 24%, transparent);
  border-color: color-mix(in srgb, var(--series-7) 45%, transparent);
}

.hero-svg-box {
  position: relative;
  width: 100%;
  min-height: 300px;
}

.svg-box {
  position: relative;
  width: 100%;
  min-height: 250px;
}

.svg-box.is-compact {
  min-height: 220px;
}

.floating-tt {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  background: var(--tooltip-bg);
  color: var(--tooltip-ink);
  border-radius: var(--radius);
  padding: 0.55rem 0.75rem;
  font-size: 0.76rem;
  min-width: 215px;
  box-shadow: var(--shadow-lg);
}

.tt-title {
  font-weight: 700;
  margin-bottom: 0.28rem;
  padding-bottom: 0.22rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.tt-line {
  display: flex;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.1rem 0;
}

.tt-line.tt-sep {
  margin-top: 0.2rem;
  padding-top: 0.22rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

/* Stratification table */
.strat-table {
  font-size: 0.82rem;
}

.strat-table tr.is-dimmed {
  opacity: 0.45;
}

.sev-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.iqr-bar-cell {
  min-width: 165px;
}

.iqr-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.iqr-track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-sunken);
  overflow: hidden;
}

.iqr-range {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--series-1) 35%, transparent);
  border-radius: 999px;
}

.iqr-median-tick {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 3px;
  background: var(--series-1);
  border-radius: 2px;
}

.iqr-label {
  font-size: 0.76rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.section-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}

.comp-filter-box {
  min-width: 260px;
}

.card-table-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.comp-link code {
  color: var(--accent-ink);
  font-weight: 500;
}

.comp-link:hover code {
  text-decoration: underline;
}

.sub-muted {
  color: var(--muted);
  font-size: 0.76rem;
}

.sub-block {
  display: block;
  color: var(--muted);
  font-size: 0.72rem;
}

.sla-pill {
  display: inline-block;
  padding: 0.14rem 0.45rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
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
}

.num-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tag-title {
  font-weight: 600;
  color: var(--ink);
}

.tag-desc {
  font-size: 0.74rem;
  color: var(--muted);
  line-height: 1.35;
}

.sample-cves {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}

.cve-chip {
  font-family: var(--font-mono);
  font-size: 0.73rem;
  padding: 0.12rem 0.4rem;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--accent-ink);
  text-decoration: none;
  white-space: nowrap;
}

.cve-chip.is-bold {
  font-weight: 600;
}

.cve-chip:hover {
  background: var(--accent-soft);
}

.comp-mini {
  font-size: 0.73rem;
}
</style>
