<template>
  <div class="security-page">
    <!-- Hero & 5-Pillar Executive Summary -->
    <section class="section pb-4">
      <div class="container">
        <div class="page-head">
          <div>
            <h1 class="title mb-2">Security hardening</h1>
            <p class="subtitle-text">
              Spanification, MiraclePtr, dangling pointers, first-party Rust adoption, and
              <code>CHECK</code> invariant hardening across Chrome, ANGLE, PDFium, Dawn, Skia, and
              WebRTC.
            </p>
          </div>
          <span v-if="payload" class="snapshot-badge">
            <UiIcon name="clock-outline" size="small" />
            Snapshot {{ payload.latestDate }}
          </span>
        </div>

        <AboutData class="mt-3">
          <p>
            Derived from weekly git-tree snapshots across
            <strong>Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC</strong>
            (<NuxtLink to="/treemap">Treemap</NuxtLink>) joined with
            <NuxtLink to="/cve/overview">Chromium's CVE database</NuxtLink>.
          </p>
          <ul>
            <li>
              <strong>Spanification coverage:</strong>
              <code>(total_cpp_lines − lines_unsafe_buffer_usage) ÷ total_cpp_lines</code>, matching
              each repository's <code>unsafe_buffers_paths.txt</code> and
              <code>#pragma allow_unsafe_buffers</code> exemptions.
            </li>
            <li>
              <strong>First-party scope:</strong> excludes vendored <code>third_party/</code>
              subtrees while retaining Blink (<code>third_party/blink</code>). Toggle
              <em>First-party</em> vs <em>All code</em> in Spanification to inspect full-tree
              coverage including third-party libraries.
            </li>
          </ul>
        </AboutData>

        <!-- 5-Pillar Jump KPI Cards -->
        <div v-if="payload" class="pillar-kpi-grid mt-4">
          <a href="#spanification" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="code-brackets" size="small" />
              1. Spanification
            </div>
            <div class="kpi-value">
              {{ formatCovPct(chromeSpan1p?.coveragePct ?? 0) }}%
              <span class="kpi-unit">Chrome 1P</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtInt(payload.spanification.unsafeTodo.totals.current) }}</strong>
              <code>UNSAFE_TODO</code> left · ETA
              <strong>{{ todoProjection90d?.etaDate ?? payload.spanification.unsafeTodo.totals.etaDate ?? '—' }}</strong>
            </p>
          </a>

          <a href="#miracleptr" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="memory" size="small" />
              2. MiraclePtr
            </div>
            <div class="kpi-value">
              {{ fmtInt(payload.miraclePtr.adoption.totals.total) }}
              <span class="kpi-unit">smart ptrs</span>
            </div>
            <p class="kpi-detail">
              Browser VRP UAF share
              <strong>{{ payload.miraclePtr.uafRoi.highlights.browserUafShare2022Pct }}%</strong>
              → <strong>{{ payload.miraclePtr.uafRoi.highlights.browserUafShare2026Pct }}%</strong>
              · <strong>{{ fmtInt(payload.miraclePtr.exclusion.totals.current) }}</strong> exclusions
            </p>
          </a>

          <a href="#dangling" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="link-variant-off" size="small" />
              3. Dangling Pointers
            </div>
            <div class="kpi-value">
              {{ fmtInt(payload.danglingPointers.totals.current) }}
              <span class="kpi-unit">untriaged</span>
            </div>
            <p class="kpi-detail">
              Down <strong>{{ payload.danglingPointers.totals.burnPct }}%</strong> from
              {{ fmtInt(payload.danglingPointers.totals.peak) }} peak · 1y ETA
              <strong>{{ danglingProjection1y?.etaDate?.slice(0, 7) ?? '—' }}</strong>
            </p>
          </a>

          <a href="#rust" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="language-rust" size="small" />
              4. Rust Adoption
            </div>
            <div class="kpi-value">
              {{ fmtInt(payload.rust.totals.current) }}
              <span class="kpi-unit">1P .rs files</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtSigned(payload.rust.totals.delta90d) }}</strong> in 90d ·
              <strong>{{ fmtSigned(payload.rust.totals.delta365d) }}</strong> in 1y
            </p>
          </a>

          <a href="#checks" class="kpi-card">
            <div class="kpi-eyebrow">
              <UiIcon name="check-decagram" size="small" />
              5. Invariant Hardening
            </div>
            <div class="kpi-value">
              {{ payload.invariantHardening.totals.checkSharePct.toFixed(1) }}%
              <span class="kpi-unit">CHECK share</span>
            </div>
            <p class="kpi-detail">
              <strong>{{ fmtCompact(payload.invariantHardening.totals.checkCurrent) }}</strong>
              <code>CHECK</code> vs
              <strong>{{ fmtCompact(payload.invariantHardening.totals.dcheckCurrent) }}</strong>
              <code>DCHECK</code>
            </p>
          </a>
        </div>
      </div>
    </section>

    <div v-if="!payload" class="section pt-2">
      <div class="container">
        <div class="skeleton table-skeleton" aria-hidden="true" />
      </div>
    </div>

    <template v-else>
      <!-- =================================================================== -->
      <!-- SECTION 1: SPANIFICATION (-Wunsafe-buffer-usage + UNSAFE_TODO)      -->
      <!-- =================================================================== -->
      <section id="spanification" class="section pt-3 pb-5 pillar-section">
        <div class="container">
          <div class="section-toolbar">
            <div>
              <div class="pillar-kicker">Pillar 1</div>
              <h2 class="title is-4 mb-1">Spanification (<code>-Wunsafe-buffer-usage</code>)</h2>
              <p class="muted-note">
                Compile-time bounds-safety enforcement and <code>UNSAFE_TODO</code> burn-down across
                Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC.
              </p>
            </div>
            <UiSegmented
              v-model="spanScope"
              aria-label="Spanification code scope"
              :options="[
                { value: 'first_party', label: 'First-party' },
                { value: 'all', label: 'All code (incl. third_party)' },
              ]" />
          </div>

          <!-- 1A. Multi-Repo Spanification Coverage Table -->
          <div class="scorecard-wrap mb-4">
            <table class="table is-fullwidth is-hoverable scorecard-table span-repo-table">
              <thead>
                <tr>
                  <th class="detail-col" aria-label="Expand uncovered directories"></th>
                  <th>Repository</th>
                  <th>Coverage</th>
                  <th class="has-text-right">Covered / Total C++ lines</th>
                  <th class="has-text-right">Uncovered lines</th>
                  <th class="has-text-right"><code>allow_unsafe_buffers</code></th>
                  <th class="has-text-right"><code>UNSAFE_TODO</code></th>
                  <th class="has-text-right">90d Δ</th>
                  <th class="has-text-right">Treemap</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in activeSpanScope.repos" :key="row.repo">
                  <tr :class="{ 'is-expanded': expandedSpanRepos.has(row.repo) }">
                    <td class="detail-col">
                      <button
                        v-if="row.topUncoveredDirs.length"
                        type="button"
                        class="expand-btn"
                        :aria-expanded="expandedSpanRepos.has(row.repo)"
                        :aria-label="`Toggle uncovered directories for ${row.label}`"
                        @click="toggleSpanExpand(row.repo)">
                        <UiIcon
                          :name="
                            expandedSpanRepos.has(row.repo) ? 'chevron-down' : 'chevron-right'
                          "
                          size="small" />
                      </button>
                    </td>

                    <td>
                      <div class="repo-cell">
                        <span class="repo-dot" :style="{ background: row.color }" />
                        <strong :style="{ color: row.color }">{{ row.label }}</strong>
                      </div>
                    </td>

                    <td class="progress-col">
                      <div class="progress-cell">
                        <div class="progress-bar-track">
                          <div
                            class="progress-bar-fill"
                            :class="covTone(row.coveragePct)"
                            :style="{
                              width: `${Math.min(100, Math.max(0, row.coveragePct))}%`,
                            }" />
                        </div>
                        <span class="progress-pct">{{ formatCovPct(row.coveragePct) }}%</span>
                      </div>
                    </td>

                    <td class="has-text-right num-cell">
                      <strong>{{ fmtCompact(row.coveredLines) }}</strong>
                      <span class="unit-inline"> / {{ fmtCompact(row.totalLines) }}</span>
                    </td>

                    <td class="has-text-right num-cell">
                      <strong>{{ fmtInt(row.uncoveredLines) }}</strong>
                    </td>

                    <td class="has-text-right num-cell">
                      <NuxtLink
                        v-if="row.allowTreemapUrl && row.allowUnsafeBuffersFiles > 0"
                        :to="row.allowTreemapUrl"
                        class="metric-link">
                        {{ fmtInt(row.allowUnsafeBuffersFiles) }} files
                      </NuxtLink>
                      <span v-else class="muted-dash">{{ fmtInt(row.allowUnsafeBuffersFiles) }}</span>
                    </td>

                    <td class="has-text-right num-cell">
                      <NuxtLink
                        v-if="row.todoTreemapUrl && row.unsafeTodoCount > 0"
                        :to="row.todoTreemapUrl"
                        class="metric-link">
                        {{ fmtInt(row.unsafeTodoCount) }}
                      </NuxtLink>
                      <span v-else class="muted-dash">{{ fmtInt(row.unsafeTodoCount) }}</span>
                    </td>

                    <td class="has-text-right num-cell">
                      <span
                        class="delta-badge"
                        :class="
                          row.coverageDelta90dPct > 0
                            ? 'is-good'
                            : row.coverageDelta90dPct < 0
                              ? 'is-warn'
                              : 'is-neutral'
                        ">
                        {{ row.coverageDelta90dPct > 0 ? '+' : ''
                        }}{{ row.coverageDelta90dPct.toFixed(2) }} pp
                      </span>
                    </td>

                    <td class="has-text-right">
                      <NuxtLink
                        :to="row.treemapUrl"
                        class="treemap-pill-link"
                        :title="`Explore ${row.label} in Treemap`">
                        <UiIcon name="chart-tree" size="small" />
                        <span>Explore</span>
                      </NuxtLink>
                    </td>
                  </tr>

                  <!-- Expandable Uncovered Directories Drawer -->
                  <tr
                    v-if="expandedSpanRepos.has(row.repo) && row.topUncoveredDirs.length"
                    class="blocker-detail-row">
                    <td colspan="9">
                      <div class="blocker-drawer">
                        <div class="blocker-drawer-head">
                          <strong>
                            Top uncovered directories in {{ row.label }} ({{
                              spanScope === 'first_party' ? 'first-party' : 'all code'
                            }})
                          </strong>
                          <NuxtLink :to="row.treemapUrl" class="drawer-treemap-cta">
                            Open {{ row.label }} treemap
                            <UiIcon name="arrow-right" size="small" />
                          </NuxtLink>
                        </div>
                        <div class="blocker-list">
                          <div
                            v-for="(d, idx) in row.topUncoveredDirs"
                            :key="`${d.repo}:${d.path}`"
                            class="blocker-item">
                            <span class="blocker-rank">#{{ idx + 1 }}</span>
                            <NuxtLink :to="d.treemapUrl" class="blocker-path">
                              <code>{{ d.path }}/</code>
                              <UiIcon name="open-in-new" size="small" />
                            </NuxtLink>
                            <div class="blocker-bar-track">
                              <div
                                class="blocker-bar-fill"
                                :style="{ width: `${Math.min(100, d.sharePct)}%` }" />
                            </div>
                            <span class="blocker-stats">
                              <strong>{{ fmtInt(d.uncoveredLines) }}</strong> lines
                              <span class="blocker-share">({{ d.sharePct }}%)</span>
                            </span>
                            <span
                              class="blocker-delta"
                              :class="
                                d.delta90d < 0 ? 'is-good' : d.delta90d > 0 ? 'is-warn' : ''
                              ">
                              90d: {{ fmtSigned(d.delta90d) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot>
                <tr class="totals-row">
                  <td></td>
                  <td>
                    <strong>Total ({{ activeSpanScope.repos.length }} repositories)</strong>
                  </td>
                  <td class="progress-col">
                    <div class="progress-cell">
                      <div class="progress-bar-track">
                        <div
                          class="progress-bar-fill"
                          :class="covTone(activeSpanScope.totals.coveragePct)"
                          :style="{
                            width: `${Math.min(100, Math.max(0, activeSpanScope.totals.coveragePct))}%`,
                          }" />
                      </div>
                      <span class="progress-pct">
                        {{ formatCovPct(activeSpanScope.totals.coveragePct) }}%
                      </span>
                    </div>
                  </td>
                  <td class="has-text-right num-cell">
                    <strong>{{ fmtCompact(activeSpanScope.totals.coveredLines) }}</strong>
                    <span class="unit-inline">
                      / {{ fmtCompact(activeSpanScope.totals.totalLines) }}
                    </span>
                  </td>
                  <td class="has-text-right num-cell">
                    <strong>{{ fmtInt(activeSpanScope.totals.uncoveredLines) }}</strong>
                  </td>
                  <td class="has-text-right num-cell">
                    <strong>{{ fmtInt(activeSpanScope.totals.allowUnsafeBuffersFiles) }}</strong>
                    files
                  </td>
                  <td class="has-text-right num-cell">
                    <strong>{{ fmtInt(activeSpanScope.totals.unsafeTodoCount) }}</strong>
                  </td>
                  <td class="has-text-right num-cell">
                    <span
                      class="delta-badge"
                      :class="
                        activeSpanScope.totals.coverageDelta90dPct > 0
                          ? 'is-good'
                          : activeSpanScope.totals.coverageDelta90dPct < 0
                            ? 'is-warn'
                            : 'is-neutral'
                      ">
                      {{ activeSpanScope.totals.coverageDelta90dPct > 0 ? '+' : ''
                      }}{{ activeSpanScope.totals.coverageDelta90dPct.toFixed(2) }} pp
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Historical Spanification Coverage % Chart -->
          <div class="chart-card mb-5">
            <div class="sub-head">
              <div>
                <h3 class="sub-title">Spanification coverage % over time</h3>
                <p class="muted-note">
                  Share of C++ lines compiled with <code>-Wunsafe-buffer-usage</code> enabled across
                  all 6 repositories.
                </p>
              </div>
              <div class="chips">
                <button
                  v-for="r in activeSpanScope.repos"
                  :key="r.repo"
                  type="button"
                  class="chip repo-filter-chip"
                  :class="{ 'is-active': spanReposSelected.includes(r.repo) }"
                  :style="repoChipStyle(r.color, spanReposSelected.includes(r.repo))"
                  @click="
                    toggleRepoSelection(
                      spanReposSelected,
                      (v) => (spanReposSelected = v),
                      r.repo,
                    )
                  ">
                  <span class="repo-dot" :style="{ background: r.color }" />
                  <span>{{ r.label }}</span>
                </button>
              </div>
            </div>
            <div class="line-chart-box">
              <ClientOnly>
                <LineChart
                  :data="spanCoverageChartData"
                  :formatter="pctFormatter"
                  :milestones="spanMilestones" />
              </ClientOnly>
            </div>
          </div>

          <!-- 1B. UNSAFE_TODO Fixes -->
          <div class="sub-section-head">
            <div>
              <h3 class="title is-5 mb-1"><code>UNSAFE_TODO</code> fixes &amp; completion trend</h3>
              <p class="muted-note">
                Granular pointer-arithmetic call sites wrapped in <code>UNSAFE_TODO(...)</code>
                (plus <code>ANGLE_UNSAFE_TODO</code>, <code>DAWN_UNSAFE_TODO</code>, and
                <code>SK_UNSAFE_TODO</code>) with linear burn-down projection to zero.
              </p>
            </div>
            <div class="roi-controls">
              <UiSegmented
                v-model="todoChartMode"
                aria-label="UNSAFE_TODO chart view"
                :options="[
                  { value: 'by_repo', label: 'By repository' },
                  { value: 'subrepos', label: 'Exclude Chrome' },
                  { value: 'vs_span', label: 'vs base::span<T>' },
                ]" />
              <UiSegmented
                v-model="todoTrendBasis"
                aria-label="UNSAFE_TODO projection basis"
                :options="[
                  { value: '90d', label: '90d rate' },
                  { value: 'peak', label: 'Since peak' },
                  { value: '1y', label: '1y rate' },
                ]" />
            </div>
          </div>

          <div class="stat-strip mb-3">
            <div class="stat-pill">
              <span class="stat-label">
                {{ todoChartMode === 'subrepos' ? 'Sub-repos remaining' : 'Remaining' }}
              </span>
              <strong>{{ fmtInt(activeTodoProjection.curVal) }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-label">Fixed from peak</span>
              <strong class="is-good-text">
                {{ fmtInt(activeTodoProjection.fixedFromPeak) }}
              </strong>
              <span class="stat-sub">
                ({{ activeTodoProjection.burnPct }}% of {{ fmtInt(activeTodoProjection.peakVal) }}
                peak on {{ activeTodoProjection.peakDate }})
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label">{{ basisLabel(todoTrendBasis) }} slope</span>
              <span
                class="delta-badge"
                :class="activeTodoProjection.slopePerDay < -0.01 ? 'is-good' : 'is-warn'">
                {{ fmtSlope(activeTodoProjection.slopePerDay) }}/d
              </span>
              <span class="stat-sub">
                ({{ fmtSigned(activeTodoProjection.delta) }} over
                {{ Math.round(activeTodoProjection.days) }}d)
              </span>
            </div>
            <div class="stat-pill eta-pill">
              <span class="stat-label">Estimated completion (ETA to 0)</span>
              <template v-if="activeTodoProjection.etaDate">
                <code class="eta-code">{{ activeTodoProjection.etaDate }}</code>
                <span class="stat-sub">
                  (~{{ fmtEtaDuration(activeTodoProjection.etaDays) }})
                </span>
              </template>
              <span v-else class="delta-badge is-warn">
                Rising over {{ basisLabel(todoTrendBasis) }} — select 90d or Since peak
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label"><code>base::span&lt;T&gt;</code></span>
              <strong :style="{ color: 'var(--series-3)' }">
                {{ fmtInt(payload.spanification.unsafeTodo.totals.baseSpanCurrent) }}
              </strong>
              <span class="stat-sub">
                ({{ fmtSigned(payload.spanification.unsafeTodo.totals.baseSpanDelta90d) }} in 90d)
              </span>
            </div>
          </div>

          <div class="split-grid">
            <div class="chart-card">
              <div class="repo-mini-pills mb-2">
                <span
                  v-for="r in activeTodoRepos"
                  :key="r.repo"
                  class="repo-mini-pill">
                  <span class="repo-dot" :style="{ background: r.color }" />
                  <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
                  <strong>{{ fmtInt(r.current) }}</strong>
                  <span v-if="r.delta90d !== 0" class="mini-delta">
                    ({{ fmtSigned(r.delta90d) }})
                  </span>
                </span>
              </div>
              <div class="line-chart-box is-compact">
                <ClientOnly>
                  <LineChart
                    :data="unsafeTodoChartData"
                    :formatter="intFormatter"
                    :milestones="todoMilestones" />
                </ClientOnly>
              </div>
            </div>

            <div class="dirs-card">
              <div class="dirs-card-head">
                <strong>
                  Top remaining <code>UNSAFE_TODO</code> directories
                  <span v-if="todoChartMode === 'subrepos'" class="muted-note">(excl. Chrome)</span>
                </strong>
                <span class="muted-note">90d Δ</span>
              </div>
              <div class="dir-rows">
                <div
                  v-for="d in activeTodoDirs"
                  :key="`${d.repo}:${d.path}`"
                  class="dir-row">
                  <div class="dir-main">
                    <span class="repo-tag" :style="{ borderColor: d.repoColor }">
                      <span class="repo-dot" :style="{ background: d.repoColor }" />
                      <span :style="{ color: d.repoColor }">{{ d.repoLabel }}</span>
                    </span>
                    <NuxtLink :to="d.treemapUrl" class="dir-link">
                      <code>{{ d.path }}/</code>
                      <UiIcon name="open-in-new" size="small" />
                    </NuxtLink>
                  </div>
                  <div class="dir-nums">
                    <strong>{{ fmtInt(d.count) }}</strong>
                    <span
                      class="delta-badge"
                      :class="
                        d.delta90d < 0 ? 'is-good' : d.delta90d > 0 ? 'is-warn' : 'is-neutral'
                      ">
                      {{ fmtSigned(d.delta90d) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- =================================================================== -->
      <!-- SECTION 2: MIRACLEPTR (UAF share, raw_ptr/raw_ref, EXCLUSION)       -->
      <!-- =================================================================== -->
      <section id="miracleptr" class="section pt-4 pb-5 pillar-section">
        <div class="container">
          <div class="section-toolbar">
            <div>
              <div class="pillar-kicker">Pillar 2</div>
              <h2 class="title is-4 mb-1">MiraclePtr (BackupRefPtr)</h2>
              <p class="muted-note">
                Use-After-Free (<code>CWE-416</code>) vulnerability share over time,
                <code>raw_ptr</code> / <code>raw_ref</code> rollout across all 6 repositories, and
                <code>RAW_PTR_EXCLUSION</code> burn-down.
              </p>
            </div>
            <div class="roi-controls">
              <UiSegmented
                v-model="uafMetric"
                aria-label="UAF metric"
                :options="uafMetricOptions" />
              <UiSegmented
                v-model="uafGranularity"
                aria-label="Time granularity"
                :options="[
                  { value: 'yearly', label: 'Yearly' },
                  { value: 'quarterly', label: 'Quarterly' },
                ]" />
            </div>
          </div>

          <!-- 2A. UAF Share Over Time -->
          <div class="cna-callout mb-3">
            <UiIcon name="shield-check" size="small" />
            <span>
              <strong>MiraclePtr impact:</strong> Browser / Non-Renderer Use-After-Free share of
              externally reported VRP CVEs dropped <strong>~3×</strong> from
              <strong>{{ payload.miraclePtr.uafRoi.highlights.browserUafShare2022Pct }}%</strong>
              ({{ payload.miraclePtr.uafRoi.highlights.browserUafCount2022 }} CVEs,
              {{ fmtUsd(payload.miraclePtr.uafRoi.highlights.browserUafUsd2022) }}) in 2022 to
              <strong>{{ payload.miraclePtr.uafRoi.highlights.browserUafShare2026Pct }}%</strong> in
              2026. {{ payload.miraclePtr.uafRoi.note }}
            </span>
          </div>

          <div class="chart-card mb-5">
            <div class="roi-legend">
              <span class="legend-item" style="color: var(--series-8)">
                <span class="swatch" style="background: var(--series-8)" />
                <strong>Browser / Non-Renderer UAF (MiraclePtr target)</strong>
              </span>
              <span class="legend-item" style="color: var(--series-2)">
                <span class="swatch" style="background: var(--series-2)" />
                <strong>Blink / V8 / Renderer UAF</strong>
              </span>
              <span v-if="uafMetric === 'count' || uafMetric === 'usd'" class="legend-item">
                <span class="swatch" style="background: var(--line-strong)" />
                Non-UAF CVEs
              </span>
              <span class="legend-item is-line" style="color: var(--series-1)">
                <span class="line-swatch" style="border-color: var(--series-1)" />
                <strong><code>raw_ptr + raw_ref</code> across 6 repos (right axis)</strong>
              </span>
            </div>

            <div ref="uafChartWrap" class="roi-svg-wrap">
              <svg ref="uafSvg" />
              <div v-if="uafHover" class="roi-tooltip" :style="uafTooltipStyle">
                <div class="roi-tt-head">{{ uafHover.period }}</div>
                <div class="roi-tt-row">
                  <span style="color: var(--series-8)">Browser / Non-Renderer UAF:</span>
                  <strong style="color: var(--series-8)">{{ uafHover.browserText }}</strong>
                </div>
                <div class="roi-tt-row">
                  <span style="color: var(--series-2)">Blink / V8 / Renderer UAF:</span>
                  <strong style="color: var(--series-2)">{{ uafHover.rendererText }}</strong>
                </div>
                <div class="roi-tt-row">
                  <span>Combined UAF share:</span>
                  <strong>{{ uafHover.totalUafShare }}</strong>
                </div>
                <hr class="roi-tt-sep" />
                <div class="roi-tt-row">
                  <span style="color: var(--series-1)">raw_ptr + raw_ref:</span>
                  <strong style="color: var(--series-1)">{{ fmtInt(uafHover.rawPtrTotal) }}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- 2B. raw_ptr & raw_ref Across All 6 Repositories -->
          <div class="sub-section-head">
            <div>
              <h3 class="title is-5 mb-1">
                <code>raw_ptr</code> &amp; <code>raw_ref</code> across repositories
              </h3>
              <p class="muted-note">
                Smart pointer field counts, mass-rewrite campaigns, and density per 10,000
                first-party C++ lines across Chrome, ANGLE, PDFium, Dawn, Skia, and WebRTC.
              </p>
            </div>
            <div class="roi-controls">
              <UiSegmented
                v-model="rawPtrField"
                aria-label="Pointer type"
                :options="[
                  { value: 'total', label: 'raw_ptr + raw_ref' },
                  { value: 'raw_ptr', label: 'raw_ptr' },
                  { value: 'raw_ref', label: 'raw_ref' },
                ]" />
              <UiSegmented
                v-model="rawPtrScope"
                aria-label="Repository scale"
                :options="[
                  { value: 'all', label: 'All 6 repos' },
                  { value: 'subrepos', label: 'Exclude Chrome' },
                ]" />
            </div>
          </div>

          <div class="split-grid mb-5">
            <div class="chart-card">
              <div class="line-chart-box is-compact">
                <ClientOnly>
                  <LineChart
                    :data="rawPtrChartData"
                    :formatter="intFormatter"
                    :milestones="miracleMilestones" />
                </ClientOnly>
              </div>
            </div>

            <div class="scorecard-wrap">
              <table class="table is-fullwidth is-hoverable compact-repo-table">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th class="has-text-right"><code>raw_ptr</code></th>
                    <th class="has-text-right"><code>raw_ref</code></th>
                    <th class="has-text-right">Total</th>
                    <th class="has-text-right">/ 10k LoC</th>
                    <th class="has-text-right">90d Δ</th>
                    <th class="has-text-right">Treemap</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in payload.miraclePtr.adoption.repos" :key="r.repo">
                    <td>
                      <div class="repo-cell">
                        <span class="repo-dot" :style="{ background: r.color }" />
                        <strong :style="{ color: r.color }">{{ r.label }}</strong>
                      </div>
                    </td>
                    <td class="has-text-right num-cell">{{ fmtInt(r.rawPtr) }}</td>
                    <td class="has-text-right num-cell">{{ fmtInt(r.rawRef) }}</td>
                    <td class="has-text-right num-cell">
                      <strong>{{ fmtInt(r.total) }}</strong>
                    </td>
                    <td class="has-text-right num-cell">{{ r.densityPer10kLines.toFixed(1) }}</td>
                    <td class="has-text-right num-cell">
                      <span
                        class="delta-badge"
                        :class="
                          r.delta90d > 0 ? 'is-good' : r.delta90d < 0 ? 'is-warn' : 'is-neutral'
                        ">
                        {{ fmtSigned(r.delta90d) }}
                      </span>
                    </td>
                    <td class="has-text-right">
                      <NuxtLink
                        v-if="r.treemapUrl"
                        :to="r.treemapUrl"
                        class="treemap-icon-link"
                        :title="`Open ${r.label} MiraclePtr treemap`">
                        <UiIcon name="chart-tree" size="small" />
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="totals-row">
                    <td><strong>Total</strong></td>
                    <td class="has-text-right num-cell">
                      <strong>{{ fmtInt(payload.miraclePtr.adoption.totals.rawPtr) }}</strong>
                    </td>
                    <td class="has-text-right num-cell">
                      <strong>{{ fmtInt(payload.miraclePtr.adoption.totals.rawRef) }}</strong>
                    </td>
                    <td class="has-text-right num-cell">
                      <strong>{{ fmtInt(payload.miraclePtr.adoption.totals.total) }}</strong>
                    </td>
                    <td class="has-text-right num-cell">
                      {{ payload.miraclePtr.adoption.totals.densityPer10kLines.toFixed(1) }}
                    </td>
                    <td class="has-text-right num-cell">
                      <span
                        class="delta-badge"
                        :class="
                          payload.miraclePtr.adoption.totals.delta90d > 0
                            ? 'is-good'
                            : 'is-neutral'
                        ">
                        {{ fmtSigned(payload.miraclePtr.adoption.totals.delta90d) }}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- 2C. RAW_PTR_EXCLUSION -->
          <div class="sub-section-head">
            <div>
              <h3 class="title is-5 mb-1"><code>RAW_PTR_EXCLUSION</code></h3>
              <p class="muted-note">
                Pointer fields explicitly exempted from MiraclePtr protection (performance,
                constexpr/union layout, or FFI boundaries).
              </p>
            </div>
            <UiSegmented
              v-model="exclusionScope"
              aria-label="RAW_PTR_EXCLUSION repository scope"
              :options="[
                { value: 'all', label: 'All 6 repos' },
                { value: 'subrepos', label: 'Exclude Chrome' },
              ]" />
          </div>

          <div class="stat-strip mb-3">
            <div class="stat-pill">
              <span class="stat-label">
                {{ exclusionScope === 'subrepos' ? 'Sub-repos remaining' : 'Remaining' }}
              </span>
              <strong>{{ fmtInt(activeExclusionStats.current) }}</strong>
            </div>
            <div v-if="exclusionScope === 'all'" class="stat-pill">
              <span class="stat-label">Burned from peak</span>
              <strong class="is-good-text">
                {{ payload.miraclePtr.exclusion.totals.burnPct }}%
              </strong>
              <span class="stat-sub">
                (peak {{ fmtInt(payload.miraclePtr.exclusion.totals.peak) }} on
                {{ payload.miraclePtr.exclusion.totals.peakDate }})
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label">90d Δ</span>
              <span
                class="delta-badge"
                :class="
                  activeExclusionStats.delta90d < 0
                    ? 'is-good'
                    : activeExclusionStats.delta90d > 0
                      ? 'is-warn'
                      : 'is-neutral'
                ">
                {{ fmtSigned(activeExclusionStats.delta90d) }}
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label">365d Δ</span>
              <span
                class="delta-badge"
                :class="
                  activeExclusionStats.delta365d < 0
                    ? 'is-good'
                    : activeExclusionStats.delta365d > 0
                      ? 'is-warn'
                      : 'is-neutral'
                ">
                {{ fmtSigned(activeExclusionStats.delta365d) }}
              </span>
            </div>
          </div>

          <div class="split-grid">
            <div class="chart-card">
              <div class="repo-mini-pills mb-2">
                <span
                  v-for="r in activeExclusionRepos"
                  :key="r.repo"
                  class="repo-mini-pill">
                  <span class="repo-dot" :style="{ background: r.color }" />
                  <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
                  <strong>{{ fmtInt(r.current) }}</strong>
                  <span v-if="r.delta90d !== 0" class="mini-delta">
                    ({{ fmtSigned(r.delta90d) }})
                  </span>
                </span>
              </div>
              <div class="line-chart-box is-compact">
                <ClientOnly>
                  <LineChart
                    :data="exclusionChartData"
                    :formatter="intFormatter"
                    :milestones="exclusionMilestones" />
                </ClientOnly>
              </div>
            </div>

            <div class="dirs-card">
              <div class="dirs-card-head">
                <strong>
                  Top <code>RAW_PTR_EXCLUSION</code> directories
                  <span v-if="exclusionScope === 'subrepos'" class="muted-note">(excl. Chrome)</span>
                </strong>
                <span class="muted-note">90d Δ</span>
              </div>
              <div class="dir-rows">
                <div
                  v-for="d in activeExclusionDirs"
                  :key="`${d.repo}:${d.path}`"
                  class="dir-row">
                  <div class="dir-main">
                    <span class="repo-tag" :style="{ borderColor: d.repoColor }">
                      <span class="repo-dot" :style="{ background: d.repoColor }" />
                      <span :style="{ color: d.repoColor }">{{ d.repoLabel }}</span>
                    </span>
                    <NuxtLink :to="d.treemapUrl" class="dir-link">
                      <code>{{ d.path }}/</code>
                      <UiIcon name="open-in-new" size="small" />
                    </NuxtLink>
                  </div>
                  <div class="dir-nums">
                    <strong>{{ fmtInt(d.count) }}</strong>
                    <span
                      class="delta-badge"
                      :class="
                        d.delta90d < 0 ? 'is-good' : d.delta90d > 0 ? 'is-warn' : 'is-neutral'
                      ">
                      {{ fmtSigned(d.delta90d) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- =================================================================== -->
      <!-- SECTION 3: DANGLING POINTERS (DanglingUntriaged over time)          -->
      <!-- =================================================================== -->
      <section id="dangling" class="section pt-4 pb-5 pillar-section">
        <div class="container">
          <div class="section-toolbar">
            <div>
              <div class="pillar-kicker">Pillar 3</div>
              <h2 class="title is-4 mb-1">
                Dangling pointers (<code>DanglingUntriaged</code>) &amp; completion trend
              </h2>
              <p class="muted-note">
                Pre-existing <code>raw_ptr&lt;T, DanglingUntriaged&gt;</code> annotations awaiting
                lifetime / ownership cleanup, with linear burn-down projection to zero.
              </p>
            </div>
            <UiSegmented
              v-model="danglingTrendBasis"
              aria-label="DanglingUntriaged projection basis"
              :options="[
                { value: '1y', label: '1y rate' },
                { value: 'peak', label: 'Since peak' },
                { value: '90d', label: '90d rate' },
              ]" />
          </div>

          <div class="stat-strip mb-3">
            <div class="stat-pill">
              <span class="stat-label">Remaining</span>
              <strong>{{ fmtInt(payload.danglingPointers.totals.current) }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-label">Eliminated from peak</span>
              <strong class="is-good-text">
                {{ fmtInt(payload.danglingPointers.totals.fixedFromPeak) }}
              </strong>
              <span class="stat-sub">
                ({{ payload.danglingPointers.totals.burnPct }}% of
                {{ fmtInt(payload.danglingPointers.totals.peak) }} peak on
                {{ payload.danglingPointers.totals.peakDate }})
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label">{{ basisLabel(danglingTrendBasis) }} slope</span>
              <span
                class="delta-badge"
                :class="activeDanglingProjection.slopePerDay < -0.01 ? 'is-good' : 'is-warn'">
                {{ fmtSlope(activeDanglingProjection.slopePerDay) }}/d
              </span>
              <span class="stat-sub">
                ({{ fmtSigned(activeDanglingProjection.delta) }} over
                {{ Math.round(activeDanglingProjection.days) }}d)
              </span>
            </div>
            <div class="stat-pill eta-pill">
              <span class="stat-label">Estimated completion (ETA to 0)</span>
              <template v-if="activeDanglingProjection.etaDate">
                <code class="eta-code">{{ activeDanglingProjection.etaDate }}</code>
                <span class="stat-sub">
                  (~{{ fmtEtaDuration(activeDanglingProjection.etaDays) }})
                </span>
              </template>
              <span v-else class="delta-badge is-warn">
                90d slightly rising ({{ fmtSigned(activeDanglingProjection.delta) }}) — switch to 1y
                or Since peak
              </span>
            </div>
          </div>

          <div class="split-grid">
            <div class="chart-card">
              <div class="repo-mini-pills mb-2">
                <span
                  v-for="r in payload.danglingPointers.repos"
                  :key="r.repo"
                  class="repo-mini-pill">
                  <span class="repo-dot" :style="{ background: r.color }" />
                  <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
                  <strong>{{ fmtInt(r.current) }}</strong>
                </span>
              </div>
              <div class="line-chart-box is-compact">
                <ClientOnly>
                  <LineChart
                    :data="danglingChartData"
                    :formatter="intFormatter"
                    :milestones="danglingMilestones" />
                </ClientOnly>
              </div>
            </div>

            <div class="dirs-card">
              <div class="dirs-card-head">
                <strong>Top remaining <code>DanglingUntriaged</code> directories</strong>
                <span class="muted-note">90d Δ</span>
              </div>
              <div class="dir-rows">
                <div
                  v-for="d in payload.danglingPointers.topDirs.slice(0, 8)"
                  :key="`${d.repo}:${d.path}`"
                  class="dir-row">
                  <div class="dir-main">
                    <span class="repo-tag" :style="{ borderColor: d.repoColor }">
                      <span class="repo-dot" :style="{ background: d.repoColor }" />
                      <span :style="{ color: d.repoColor }">{{ d.repoLabel }}</span>
                    </span>
                    <NuxtLink :to="d.treemapUrl" class="dir-link">
                      <code>{{ d.path }}/</code>
                      <UiIcon name="open-in-new" size="small" />
                    </NuxtLink>
                  </div>
                  <div class="dir-nums">
                    <strong>{{ fmtInt(d.count) }}</strong>
                    <span class="unit-inline">({{ d.sharePct }}%)</span>
                    <span
                      class="delta-badge"
                      :class="
                        d.delta90d < 0 ? 'is-good' : d.delta90d > 0 ? 'is-warn' : 'is-neutral'
                      ">
                      {{ fmtSigned(d.delta90d) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- =================================================================== -->
      <!-- SECTION 4: RUST ADOPTION                                            -->
      <!-- =================================================================== -->
      <section id="rust" class="section pt-4 pb-5 pillar-section">
        <div class="container">
          <div class="section-toolbar">
            <div>
              <div class="pillar-kicker">Pillar 4</div>
              <h2 class="title is-4 mb-1">First-party Rust adoption</h2>
              <p class="muted-note">
                First-party <code>*.rs</code> source files across repositories (excluding vendored
                <code>third_party/rust</code> crates).
              </p>
            </div>
            <UiSegmented
              v-if="hasNonChromeRust"
              v-model="rustScope"
              aria-label="Rust repository view"
              :options="[
                { value: 'all', label: 'All 6 repos' },
                { value: 'subrepos', label: 'Exclude Chrome' },
              ]" />
          </div>

          <div class="stat-strip mb-3">
            <div class="stat-pill">
              <span class="stat-label">First-party .rs files</span>
              <strong>{{ fmtInt(payload.rust.totals.current) }}</strong>
            </div>
            <div class="stat-pill">
              <span class="stat-label">90d growth</span>
              <span
                class="delta-badge"
                :class="payload.rust.totals.delta90d > 0 ? 'is-good' : 'is-neutral'">
                {{ fmtSigned(payload.rust.totals.delta90d) }}
              </span>
              <span class="stat-sub">(~{{ payload.rust.totals.velocityPerWeek90d }}/wk)</span>
            </div>
            <div class="stat-pill">
              <span class="stat-label">365d growth</span>
              <span
                class="delta-badge"
                :class="payload.rust.totals.delta365d > 0 ? 'is-good' : 'is-neutral'">
                {{ fmtSigned(payload.rust.totals.delta365d) }}
              </span>
            </div>
          </div>

          <div class="split-grid">
            <div class="chart-card">
              <div class="repo-mini-pills mb-2">
                <span v-for="r in activeRustRepos" :key="r.repo" class="repo-mini-pill">
                  <span class="repo-dot" :style="{ background: r.color }" />
                  <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
                  <strong>{{ fmtInt(r.current) }}</strong>
                  <span v-if="r.delta90d !== 0" class="mini-delta">
                    ({{ fmtSigned(r.delta90d) }})
                  </span>
                </span>
              </div>
              <div class="line-chart-box is-compact">
                <ClientOnly>
                  <LineChart
                    :data="rustChartData"
                    :formatter="intFormatter"
                    :milestones="rustMilestones" />
                </ClientOnly>
              </div>
            </div>

            <div class="dirs-card">
              <div class="dirs-card-head">
                <strong>
                  Top first-party Rust subsystems
                  <span v-if="rustScope === 'subrepos'" class="muted-note">(excl. Chrome)</span>
                </strong>
                <span class="muted-note">90d Δ</span>
              </div>
              <div class="dir-rows">
                <div
                  v-for="d in activeRustDirs"
                  :key="`${d.repo}:${d.path}`"
                  class="dir-row">
                  <div class="dir-main">
                    <span class="repo-tag" :style="{ borderColor: d.repoColor }">
                      <span class="repo-dot" :style="{ background: d.repoColor }" />
                      <span :style="{ color: d.repoColor }">{{ d.repoLabel }}</span>
                    </span>
                    <NuxtLink :to="d.treemapUrl" class="dir-link">
                      <code>{{ d.path }}/</code>
                      <UiIcon name="open-in-new" size="small" />
                    </NuxtLink>
                  </div>
                  <div class="dir-nums">
                    <strong>{{ fmtInt(d.count) }}</strong>
                    <span class="unit-inline">({{ d.sharePct }}%)</span>
                    <span
                      class="delta-badge"
                      :class="
                        d.delta90d > 0 ? 'is-good' : d.delta90d < 0 ? 'is-warn' : 'is-neutral'
                      ">
                      {{ fmtSigned(d.delta90d) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- =================================================================== -->
      <!-- SECTION 5: INVARIANT HARDENING (DCHECK vs CHECK)                    -->
      <!-- =================================================================== -->
      <section id="checks" class="section pt-4 pb-6 pillar-section">
        <div class="container">
          <div class="section-toolbar">
            <div>
              <div class="pillar-kicker">Pillar 5</div>
              <h2 class="title is-4 mb-1">
                Invariant hardening (<code>DCHECK</code> vs <code>CHECK</code>)
              </h2>
              <p class="muted-note">
                Production-enforced <code>CHECK(...)</code> assertions turning security-relevant
                invariant violations into deterministic crashes instead of debug-only
                <code>DCHECK(...)</code> UB.
              </p>
            </div>
            <div class="roi-controls">
              <UiSegmented
                v-model="checksChartMode"
                aria-label="Checks chart mode"
                :options="[
                  { value: 'counts', label: 'CHECK vs DCHECK counts' },
                  { value: 'share', label: 'CHECK hardening %' },
                ]" />
              <UiSegmented
                v-model="checksRange"
                aria-label="Checks history window"
                :options="[
                  { value: '2022', label: 'Since 2022' },
                  { value: '2025', label: '2025–2026' },
                  { value: 'all', label: 'All history' },
                ]" />
            </div>
          </div>

          <div class="stat-strip mb-3">
            <div class="stat-pill">
              <span class="stat-label"><code>CHECK</code> share</span>
              <strong class="is-good-text">
                {{ payload.invariantHardening.totals.checkSharePct.toFixed(1) }}%
              </strong>
              <span class="stat-sub">
                (up from {{ payload.invariantHardening.totals.checkShare2022Pct }}% in 2022)
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label" style="color: var(--series-3)">
                <strong><code>CHECK(...)</code></strong>
              </span>
              <strong style="color: var(--series-3)">
                {{ fmtInt(payload.invariantHardening.totals.checkCurrent) }}
              </strong>
              <span
                class="delta-badge"
                :class="
                  payload.invariantHardening.totals.checkDelta90d > 0 ? 'is-good' : 'is-neutral'
                ">
                {{ fmtSigned(payload.invariantHardening.totals.checkDelta90d) }} in 90d
              </span>
            </div>
            <div class="stat-pill">
              <span class="stat-label" style="color: var(--series-2)">
                <strong><code>DCHECK(...)</code></strong>
              </span>
              <strong style="color: var(--series-2)">
                {{ fmtInt(payload.invariantHardening.totals.dcheckCurrent) }}
              </strong>
              <span
                class="delta-badge"
                :class="
                  payload.invariantHardening.totals.dcheckDelta90d < 0 ? 'is-good' : 'is-warn'
                ">
                {{ fmtSigned(payload.invariantHardening.totals.dcheckDelta90d) }} in 90d
              </span>
            </div>
          </div>

          <div class="split-grid">
            <div class="chart-card">
              <div class="repo-mini-pills mb-2">
                <span
                  v-for="r in payload.invariantHardening.repos"
                  :key="r.repo"
                  class="repo-mini-pill">
                  <span class="repo-dot" :style="{ background: r.color }" />
                  <span class="repo-pill-label" :style="{ color: r.color }">{{ r.label }}:</span>
                  <strong>{{ r.checkSharePct.toFixed(0) }}%</strong>
                  <span class="mini-delta">
                    ({{ fmtCompact(r.checkCurrent) }} C / {{ fmtCompact(r.dcheckCurrent) }} D)
                  </span>
                </span>
              </div>
              <div class="line-chart-box is-compact">
                <ClientOnly>
                  <LineChart
                    :data="checksChartData"
                    :formatter="checksChartMode === 'share' ? pctFormatter : intFormatter"
                    :milestones="checksMilestones" />
                </ClientOnly>
              </div>
            </div>

            <div class="dirs-card">
              <div class="dirs-card-head">
                <strong>Subsystems by assertion balance</strong>
                <UiSegmented
                  v-model="checksDirSort"
                  aria-label="Directory sort"
                  :options="[
                    { value: 'dcheck', label: 'Most DCHECKs' },
                    { value: 'check', label: 'Most CHECKs' },
                  ]" />
              </div>
              <div class="dir-rows">
                <div
                  v-for="d in activeCheckDirs"
                  :key="`${d.repo}:${d.path}`"
                  class="dir-row">
                  <div class="dir-main">
                    <span class="repo-tag" :style="{ borderColor: d.repoColor }">
                      <span class="repo-dot" :style="{ background: d.repoColor }" />
                      <span :style="{ color: d.repoColor }">{{ d.repoLabel }}</span>
                    </span>
                    <NuxtLink :to="d.treemapUrl" class="dir-link">
                      <code>{{ d.path }}/</code>
                      <UiIcon name="open-in-new" size="small" />
                    </NuxtLink>
                  </div>
                  <div class="dir-nums">
                    <span class="unit-inline">
                      {{ fmtCompact(d.checkCount) }} C / {{ fmtCompact(d.dcheckCount) }} D
                    </span>
                    <span
                      class="delta-badge"
                      :class="
                        d.checkSharePct >= 65
                          ? 'is-good'
                          : d.checkSharePct < 30
                            ? 'is-warn'
                            : 'is-neutral'
                      ">
                      {{ d.checkSharePct }}% CHECK
                    </span>
                  </div>
                </div>
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
import { line as d3Line, curveMonotoneX } from 'd3-shape';
import { useUrlState, urlCodecs } from '~/composables/useUrlState';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SpanDirEntry {
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

interface SpanRepoRow {
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

interface SpanScopeBlock {
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

interface CountDirEntry {
  repo: string;
  repoLabel: string;
  repoColor: string;
  path: string;
  count: number;
  sharePct: number;
  delta90d: number;
  treemapUrl: string;
}

interface UafBucket {
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

interface UafRow {
  period: string;
  vrp: UafBucket;
  all: UafBucket;
  rawPtrTotal: number;
}

interface SecurityPayload {
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

type TrendBasis = '90d' | '1y' | 'peak';

const fmtInt = format(',d');
const fmtCompact = format('.3~s');
const intFormatter = format(',.0f');
const pctFormatter = (d: number) => `${Number(d).toFixed(0)}%`;
const fmtUsd = (v: number) =>
  '$' + (v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M' : fmtInt(Math.round(v)));
const fmtSigned = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));
const fmtSlope = (v: number) => {
  const abs = Math.abs(v);
  const str = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return v > 0 ? `+${str}` : v < 0 ? `−${str}` : '0.0';
};
const formatCovPct = (v: number) =>
  v >= 99.9 && v < 100 ? v.toFixed(2) : v > 0 && v < 1 ? v.toFixed(2) : v.toFixed(1);

const fmtEtaDuration = (days: number | null) => {
  if (days === null) return '';
  if (days < 45) return `${days}d`;
  if (days < 540) return `${Math.round(days / 30.4)} mos`;
  return `${(days / 365.25).toFixed(1)} yrs`;
};

const basisLabel = (b: TrendBasis) => (b === '90d' ? '90d' : b === '1y' ? '1y' : 'Since peak');

const repoChipStyle = (color: string, active: boolean) =>
  active
    ? {
        color,
        borderColor: `color-mix(in srgb, ${color} 55%, var(--line))`,
        background: `color-mix(in srgb, ${color} 10%, var(--surface))`,
      }
    : undefined;

// Linear burn-down fit & forward projection to y = 0 for a [date, count] series.
function computeLinearProjection(
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

const {
  spanScope,
  spanReposSelected,
  todoChartMode,
  todoTrendBasis,
  uafMetric,
  uafGranularity,
  rawPtrField,
  rawPtrScope,
  exclusionScope,
  danglingTrendBasis,
  rustScope,
  checksChartMode,
  checksRange,
  checksDirSort,
} = useUrlState({
  spanScope: urlCodecs.enum(['first_party', 'all'] as const, 'first_party'),
  spanReposSelected: urlCodecs.csv(['chromium', 'angle', 'pdfium', 'dawn', 'skia', 'webrtc']),
  todoChartMode: urlCodecs.enum(['by_repo', 'subrepos', 'vs_span'] as const, 'by_repo'),
  todoTrendBasis: urlCodecs.enum(['90d', 'peak', '1y'] as const, '90d'),
  uafMetric: urlCodecs.enum(['vrp_share', 'count', 'usd', 'all_share'] as const, 'vrp_share'),
  uafGranularity: urlCodecs.enum(['yearly', 'quarterly'] as const, 'yearly'),
  rawPtrField: urlCodecs.enum(['total', 'raw_ptr', 'raw_ref'] as const, 'total'),
  rawPtrScope: urlCodecs.enum(['all', 'subrepos'] as const, 'all'),
  exclusionScope: urlCodecs.enum(['all', 'subrepos'] as const, 'all'),
  danglingTrendBasis: urlCodecs.enum(['1y', 'peak', '90d'] as const, '1y'),
  rustScope: urlCodecs.enum(['all', 'subrepos'] as const, 'all'),
  checksChartMode: urlCodecs.enum(['counts', 'share'] as const, 'counts'),
  checksRange: urlCodecs.enum(['2022', '2025', 'all'] as const, '2022'),
  checksDirSort: urlCodecs.enum(['dcheck', 'check'] as const, 'dcheck'),
});

const uafMetricOptions = [
  { value: 'vrp_share', label: 'VRP UAF %' },
  { value: 'count', label: 'VRP CVEs' },
  { value: 'usd', label: 'VRP $' },
  { value: 'all_share', label: 'All CVEs %' },
];

const payload = shallowRef<SecurityPayload | null>(null);
const expandedSpanRepos = ref<Set<string>>(new Set());

const toggleSpanExpand = (repo: string) => {
  const next = new Set(expandedSpanRepos.value);
  if (next.has(repo)) next.delete(repo);
  else next.add(repo);
  expandedSpanRepos.value = next;
};

const toggleRepoSelection = (
  current: string[],
  setter: (v: string[]) => void,
  repoId: string,
) => {
  const next = new Set(current);
  if (next.has(repoId)) {
    if (next.size > 1) next.delete(repoId);
  } else {
    next.add(repoId);
  }
  setter([...next]);
};

const covTone = (pct: number) => {
  if (pct >= 95) return 'is-complete';
  if (pct >= 50) return 'is-good';
  if (pct > 0) return 'is-early';
  return 'is-zero';
};

const activeSpanScope = computed(() => {
  if (!payload.value) {
    return {
      scope: 'first_party',
      totals: {
        totalLines: 0,
        coveredLines: 0,
        uncoveredLines: 0,
        coveragePct: 0,
        coverageDelta90dPct: 0,
        allowUnsafeBuffersFiles: 0,
        allowDelta90d: 0,
        unsafeBuffersCalls: 0,
        unsafeTodoCount: 0,
        unsafeTodoDelta90d: 0,
      },
      repos: [],
      topUncoveredDirs: [],
    } as SpanScopeBlock;
  }
  return payload.value.spanification.scopes[spanScope.value];
});

const chromeSpan1p = computed(() =>
  payload.value?.spanification.scopes.first_party.repos.find((r) => r.repo === 'chromium'),
);

// -----------------------------------------------------------------------------
// Milestones (with exact series stroke colors & overlap-safe anchors)
// -----------------------------------------------------------------------------
const spanMilestones = [
  {
    date: '2024-04-01',
    label: '-Wunsafe-buffer-usage rollout',
    color: 'var(--series-1)',
    anchor: 'end' as const,
  },
  { date: '2024-08-15', label: 'UNSAFE_TODO macro introduced', color: 'var(--series-1)' },
];

const todoMilestones = computed(() => {
  const c =
    todoChartMode.value === 'vs_span'
      ? 'var(--series-8)'
      : todoChartMode.value === 'subrepos'
        ? 'var(--series-7)'
        : 'var(--series-1)';
  return [{ date: '2024-08-15', label: 'UNSAFE_TODO macro introduced', color: c }];
});

// Verified mass-rewrite commits across Chromium, Dawn, Skia, and ANGLE.
const miracleMilestones = computed(() => {
  if (rawPtrScope.value === 'subrepos') {
    return [
      { date: '2024-01-18', label: 'Dawn MiraclePtr rewrite (+255)', color: 'var(--series-3)' },
      {
        date: '2026-06-08',
        label: 'Skia raw_ptr definitions (+81)',
        color: 'var(--series-8)',
        anchor: 'end' as const,
      },
      {
        date: '2026-09-24',
        label: 'ANGLE raw_ptr/ref (+143)',
        color: 'var(--series-7)',
        anchor: 'end' as const,
      },
      {
        date: '2026-10-21',
        label: 'Skia Graphite & SkSL (+91)',
        color: 'var(--series-8)',
        anchor: 'end' as const,
      },
    ];
  }
  if (rawPtrField.value === 'raw_ref') {
    return [
      { date: '2022-06-30', label: 'raw_ref<T> introduced (+231)', color: 'var(--series-1)' },
      { date: '2022-11-09', label: 'T& → raw_ref rewrite (+426)', color: 'var(--series-1)' },
      { date: '2023-04-27', label: 'Win/Android/Ash check (+59)', color: 'var(--series-1)' },
      { date: '2023-10-01', label: 'Renderer rewrite (+87)', color: 'var(--series-1)' },
    ];
  }
  return [
    { date: '2021-11-27', label: 'Big Rewrite (+14.3k)', color: 'var(--series-1)' },
    { date: '2022-06-21', label: 'Linux/Mac/CrOS (+2.0k)', color: 'var(--series-1)' },
    { date: '2022-09-01', label: 'MiraclePtr on Stable', color: 'var(--series-1)' },
    { date: '2023-04-21', label: 'Win, Android & Ash (+7.6k)', color: 'var(--series-1)' },
    { date: '2023-10-01', label: 'Renderer rewrite (+1.0k)', color: 'var(--series-1)' },
    { date: '2023-12-20', label: 'vector<raw_ptr> (+2.6k)', color: 'var(--series-1)' },
  ];
});

const exclusionMilestones = computed(() =>
  exclusionScope.value === 'subrepos'
    ? [
        { date: '2024-01-18', label: 'Dawn exclusions', color: 'var(--series-3)' },
        {
          date: '2026-06-15',
          label: 'Skia C ABI exclusions',
          color: 'var(--series-8)',
          anchor: 'end' as const,
        },
        {
          date: '2026-10-26',
          label: 'Skia SkSL hot-path exclusions',
          color: 'var(--series-8)',
          anchor: 'end' as const,
        },
      ]
    : [
        { date: '2022-09-01', label: 'MiraclePtr on Stable', color: 'var(--series-1)' },
        { date: '2023-04-18', label: 'Win/Android/Ash peak (912)', color: 'var(--series-1)' },
      ],
);

const danglingMilestones = [
  { date: '2022-10-01', label: 'DanglingPtr detector rollout', color: 'var(--series-1)' },
  { date: '2023-08-31', label: 'Peak DanglingUntriaged (6,010)', color: 'var(--series-1)' },
];

const rustMilestones = computed(() =>
  rustScope.value === 'subrepos'
    ? [
        {
          date: '2026-01-15',
          label: 'ANGLE & Skia Rust crates',
          color: 'var(--series-7)',
          anchor: 'end' as const,
        },
      ]
    : [{ date: '2023-01-12', label: 'Production Rust allowed in Chromium', color: 'var(--series-1)' }],
);

const checksMilestones = computed(() => {
  const c = checksChartMode.value === 'share' ? 'var(--series-1)' : 'var(--series-3)';
  const items: any[] = [
    {
      date: '2026-04-01',
      label: 'Apr 1, 2026: Systematic CHECK() conversion',
      color: c,
      anchor: 'end' as const,
      pill: true,
      yRatio: checksChartMode.value === 'share' ? 0.30 : 0.42,
    },
  ];
  if (checksRange.value !== '2025') {
    items.unshift({
      date: '2023-02-01',
      label: 'Prefer CHECK() over DCHECK() guideline',
      color: c,
    });
  }
  return items;
});

// -----------------------------------------------------------------------------
// 1A. Spanification Coverage % LineChart
// -----------------------------------------------------------------------------
const spanCoverageChartData = computed(() => {
  const chosen = activeSpanScope.value.repos.filter((r) =>
    spanReposSelected.value.includes(r.repo),
  );
  return chosen.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series
      .filter(([d]) => d >= '2023-09-01')
      .map(([d, pct]) => ({ x: new Date(d), y: pct })),
  }));
});

// -----------------------------------------------------------------------------
// 1B. UNSAFE_TODO LineChart + Completion Projection
// -----------------------------------------------------------------------------
const subrepoTodoTotalSeries = computed<Array<[string, number]>>(() => {
  if (!payload.value) return [];
  const block = payload.value.spanification.unsafeTodo;
  const chromeRepo = block.repos.find((r) => r.repo === 'chromium');
  if (!chromeRepo) return block.totalSeries.map(([d, tot]) => [d, tot]);
  const chromeMs = chromeRepo.series.map(([d, v]) => [new Date(d).getTime(), v] as const);
  const sampleChrome = (ms: number) => {
    let lo = 0;
    let hi = chromeMs.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (chromeMs[mid][0] <= ms) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return chromeMs.length ? chromeMs[ans][1] : 0;
  };
  return block.totalSeries.map(([d, tot]) => [
    d,
    Math.max(0, tot - sampleChrome(new Date(d).getTime())),
  ]);
});

const todoProjection90d = computed(() => {
  if (!payload.value) return null;
  const pts: Array<[string, number]> = payload.value.spanification.unsafeTodo.totalSeries.map(
    ([d, tot]) => [d, tot],
  );
  return computeLinearProjection(pts, '90d', '2024-06-01');
});

const activeTodoProjection = computed(() => {
  if (!payload.value) return computeLinearProjection([], '90d');
  const pts: Array<[string, number]> =
    todoChartMode.value === 'subrepos'
      ? subrepoTodoTotalSeries.value
      : payload.value.spanification.unsafeTodo.totalSeries.map(([d, tot]) => [d, tot]);
  return computeLinearProjection(pts, todoTrendBasis.value, '2024-06-01');
});

const activeTodoRepos = computed(() => {
  if (!payload.value) return [];
  const all = payload.value.spanification.unsafeTodo.repos;
  return todoChartMode.value === 'subrepos' ? all.filter((r) => r.repo !== 'chromium') : all;
});

const activeTodoDirs = computed(() => {
  if (!payload.value) return [];
  const block = payload.value.spanification.unsafeTodo;
  if (todoChartMode.value === 'subrepos') {
    return (block.subrepoTopDirs || block.topDirs.filter((d) => d.repo !== 'chromium')).slice(0, 8);
  }
  return block.topDirs.slice(0, 8);
});

const unsafeTodoChartData = computed(() => {
  if (!payload.value) return [];
  const block = payload.value.spanification.unsafeTodo;
  const proj = activeTodoProjection.value;
  const endTag = proj.etaDate
    ? `ETA ${proj.etaDate} (${fmtSlope(proj.slopePerDay)}/d)`
    : `${fmtSlope(proj.slopePerDay)}/d (${basisLabel(todoTrendBasis.value)} rising)`;

  if (todoChartMode.value === 'vs_span') {
    const out: any[] = [
      {
        label: 'UNSAFE_TODO remaining',
        color: 'var(--series-8)',
        values: block.totalSeries.map(([d, todo]) => ({ x: new Date(d), y: todo })),
      },
      {
        label: 'base::span<T> uses',
        color: 'var(--series-3)',
        values: block.totalSeries.map(([d, , span]) => ({ x: new Date(d), y: span })),
      },
    ];
    if (proj.trendPoints.length) {
      out.push({
        label: `UNSAFE_TODO ${basisLabel(todoTrendBasis.value)} trend`,
        color: 'var(--series-8)',
        dashed: true,
        endLabel: endTag,
        values: proj.trendPoints,
      });
    }
    return out;
  }

  if (todoChartMode.value === 'subrepos') {
    const repos = block.repos.filter(
      (r) => r.repo !== 'chromium' && (r.peak > 0 || r.current > 0),
    );
    const out: any[] = [
      {
        label: 'Sub-repos total',
        color: 'var(--ink)',
        strokeWidth: 2,
        values: subrepoTodoTotalSeries.value.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
      },
      ...repos.map((r) => ({
        label: r.label,
        color: r.color,
        values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
      })),
    ];
    if (proj.trendPoints.length) {
      out.push({
        label: `Sub-repos ${basisLabel(todoTrendBasis.value)} trend`,
        color: 'var(--ink)',
        dashed: true,
        endLabel: endTag,
        values: proj.trendPoints,
      });
    }
    return out;
  }

  const repos = block.repos.filter((r) => r.peak > 0 || r.current > 0 || r.repo === 'chromium');
  const out: any[] = [
    {
      label: 'All 6 repos',
      color: 'var(--ink)',
      strokeWidth: 2,
      values: block.totalSeries.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
    },
    ...repos.map((r) => ({
      label: r.label,
      color: r.color,
      values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
    })),
  ];
  if (proj.trendPoints.length) {
    out.push({
      label: `Projected (${basisLabel(todoTrendBasis.value)} rate)`,
      color: 'var(--ink)',
      dashed: true,
      endLabel: endTag,
      values: proj.trendPoints,
    });
  }
  return out;
});

// -----------------------------------------------------------------------------
// 2B. raw_ptr / raw_ref LineChart
// -----------------------------------------------------------------------------
const rawPtrChartData = computed(() => {
  if (!payload.value) return [];
  const allRepos = payload.value.miraclePtr.adoption.repos;
  const filtered =
    rawPtrScope.value === 'subrepos' ? allRepos.filter((r) => r.repo !== 'chromium') : allRepos;
  return filtered.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, rp, rr, tot]) => ({
      x: new Date(d),
      y: rawPtrField.value === 'raw_ptr' ? rp : rawPtrField.value === 'raw_ref' ? rr : tot,
    })),
  }));
});

// -----------------------------------------------------------------------------
// 2C. RAW_PTR_EXCLUSION LineChart (with Exclude Chrome toggle)
// -----------------------------------------------------------------------------
const activeExclusionRepos = computed(() => {
  if (!payload.value) return [];
  const all = payload.value.miraclePtr.exclusion.repos;
  return exclusionScope.value === 'subrepos' ? all.filter((r) => r.repo !== 'chromium') : all;
});

const activeExclusionStats = computed(() => {
  if (!payload.value) return { current: 0, delta90d: 0, delta365d: 0 };
  if (exclusionScope.value === 'all') {
    const t = payload.value.miraclePtr.exclusion.totals;
    return { current: t.current, delta90d: t.delta90d, delta365d: t.delta365d };
  }
  const subs = payload.value.miraclePtr.exclusion.repos.filter((r) => r.repo !== 'chromium');
  return {
    current: subs.reduce((s, r) => s + r.current, 0),
    delta90d: subs.reduce((s, r) => s + r.delta90d, 0),
    delta365d: subs.reduce((s, r) => s + r.delta365d, 0),
  };
});

const activeExclusionDirs = computed(() => {
  if (!payload.value) return [];
  const ex = payload.value.miraclePtr.exclusion;
  if (exclusionScope.value === 'subrepos') {
    return (ex.subrepoTopDirs || ex.topDirs.filter((d) => d.repo !== 'chromium')).slice(0, 8);
  }
  return ex.topDirs.slice(0, 8);
});

const exclusionChartData = computed(() => {
  const nonZero = activeExclusionRepos.value.filter((r) => r.peak > 0 || r.current > 0);
  return nonZero.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
  }));
});

// -----------------------------------------------------------------------------
// 3. DanglingUntriaged LineChart + Completion Projection
// -----------------------------------------------------------------------------
const danglingProjection1y = computed(() => {
  if (!payload.value) return null;
  return computeLinearProjection(payload.value.danglingPointers.totalSeries, '1y', '2022-01-01');
});

const activeDanglingProjection = computed(() => {
  if (!payload.value) return computeLinearProjection([], '1y');
  return computeLinearProjection(
    payload.value.danglingPointers.totalSeries,
    danglingTrendBasis.value,
    '2022-01-01',
  );
});

const danglingChartData = computed(() => {
  if (!payload.value) return [];
  const nonZero = payload.value.danglingPointers.repos.filter((r) => r.peak > 0 || r.current > 0);
  const out: any[] = nonZero.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
  }));

  const proj = activeDanglingProjection.value;
  if (proj.trendPoints.length) {
    const endTag = proj.etaDate
      ? `ETA ${proj.etaDate} (${fmtSlope(proj.slopePerDay)}/d)`
      : `${fmtSlope(proj.slopePerDay)}/d (${basisLabel(danglingTrendBasis.value)} rising)`;
    out.push({
      label: `Projected (${basisLabel(danglingTrendBasis.value)} rate)`,
      color: 'var(--ink)',
      dashed: true,
      endLabel: endTag,
      values: proj.trendPoints,
    });
  }
  return out;
});

// -----------------------------------------------------------------------------
// 4. First-party Rust LineChart
// -----------------------------------------------------------------------------
const hasNonChromeRust = computed(() =>
  Boolean(payload.value?.rust.repos.some((r) => r.repo !== 'chromium' && r.current > 0)),
);

const activeRustRepos = computed(() => {
  if (!payload.value) return [];
  const all = payload.value.rust.repos;
  return rustScope.value === 'subrepos' ? all.filter((r) => r.repo !== 'chromium') : all;
});

const activeRustDirs = computed(() => {
  if (!payload.value) return [];
  const rs = payload.value.rust;
  if (rustScope.value === 'subrepos') {
    return (rs.subrepoTopDirs || rs.topDirs.filter((d) => d.repo !== 'chromium')).slice(0, 8);
  }
  return rs.topDirs.slice(0, 8);
});

const rustChartData = computed(() => {
  if (!payload.value) return [];
  const base =
    rustScope.value === 'subrepos'
      ? payload.value.rust.repos.filter((r) => r.repo !== 'chromium')
      : payload.value.rust.repos.filter((r) => r.current > 0 || r.repo === 'chromium');
  return base.map((r) => ({
    label: r.label,
    color: r.color,
    values: r.series.map(([d, cnt]) => ({ x: new Date(d), y: cnt })),
  }));
});

// -----------------------------------------------------------------------------
// 5. CHECK vs DCHECK LineChart (with 2026-04-01 marker & history window)
// -----------------------------------------------------------------------------
const checksStartDate = computed(() =>
  checksRange.value === '2025'
    ? '2025-01-01'
    : checksRange.value === '2022'
      ? '2022-01-01'
      : '2019-01-01',
);

const checksChartData = computed(() => {
  if (!payload.value) return [];
  const minD = checksStartDate.value;
  const ts = payload.value.invariantHardening.totalSeries.filter(([d]) => d >= minD);
  if (checksChartMode.value === 'share') {
    return payload.value.invariantHardening.repos.map((r) => ({
      label: `${r.label} CHECK %`,
      color: r.color,
      values: r.series
        .filter(([d]) => d >= minD)
        .map(([d, , , sh]) => ({ x: new Date(d), y: sh })),
    }));
  }
  return [
    {
      label: 'CHECK(...) — production enforced',
      color: 'var(--series-3)',
      values: ts.map(([d, ck]) => ({ x: new Date(d), y: ck })),
    },
    {
      label: 'DCHECK(...) — debug only',
      color: 'var(--series-2)',
      values: ts.map(([d, , dc]) => ({ x: new Date(d), y: dc })),
    },
  ];
});

const activeCheckDirs = computed(() => {
  if (!payload.value) return [];
  return checksDirSort.value === 'check'
    ? payload.value.invariantHardening.topCheckDirs.slice(0, 8)
    : payload.value.invariantHardening.topDcheckDirs.slice(0, 8);
});

// -----------------------------------------------------------------------------
// Custom D3 UAF Share Over Time + MiraclePtr Overlay Chart
// -----------------------------------------------------------------------------
const uafChartWrap = ref<HTMLElement | null>(null);
const uafSvg = ref<SVGSVGElement | null>(null);
const uafHover = ref<any>(null);
const uafTooltipPos = ref({ x: 0, y: 0 });
const uafTooltipStyle = computed(() => ({
  left: `${uafTooltipPos.value.x}px`,
  top: `${uafTooltipPos.value.y}px`,
}));

const renderUafChart = () => {
  if (!payload.value || !uafSvg.value || !uafChartWrap.value) return;
  const rows =
    uafGranularity.value === 'yearly'
      ? payload.value.miraclePtr.uafRoi.yearly
      : payload.value.miraclePtr.uafRoi.quarterly;
  if (!rows.length) return;

  const width = uafChartWrap.value.clientWidth || 900;
  const height = 320;
  const margin = { top: 20, right: 68, bottom: 38, left: 56 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = Math.max(100, height - margin.top - margin.bottom);

  const svg = select(uafSvg.value);
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  svg.selectAll('*').remove();

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const periods = rows.map((r) => r.period);
  const x = scaleBand<string>().domain(periods).range([0, innerW]).padding(0.26);

  const isShare = uafMetric.value === 'vrp_share' || uafMetric.value === 'all_share';

  const extractSegments = (r: UafRow) => {
    const src = uafMetric.value === 'all_share' ? r.all : r.vrp;
    if (isShare) {
      const tot = src.total || 1;
      return [
        { key: 'browser', val: (src.uafBrowser / tot) * 100, color: 'var(--series-8)' },
        { key: 'renderer', val: (src.uafRenderer / tot) * 100, color: 'var(--series-2)' },
      ];
    }
    if (uafMetric.value === 'usd') {
      const nonUafUsd = Math.max(0, src.vrpUsd - src.uafUsd);
      return [
        { key: 'browser', val: src.uafBrowserUsd, color: 'var(--series-8)' },
        { key: 'renderer', val: src.uafRendererUsd, color: 'var(--series-2)' },
        { key: 'other', val: nonUafUsd, color: 'var(--line-strong)' },
      ];
    }
    const nonUaf = Math.max(0, src.total - src.uaf);
    return [
      { key: 'browser', val: src.uafBrowser, color: 'var(--series-8)' },
      { key: 'renderer', val: src.uafRenderer, color: 'var(--series-2)' },
      { key: 'other', val: nonUaf, color: 'var(--line-strong)' },
    ];
  };

  const stackedData = rows.map((r) => {
    const segs = extractSegments(r);
    let y0 = 0;
    const rects = segs.map((s) => {
      const item = { ...s, y0, y1: y0 + s.val };
      y0 += s.val;
      return item;
    });
    return { period: r.period, row: r, total: y0, rects };
  });

  const maxLeft = isShare
    ? Math.min(100, Math.max(50, (max(stackedData, (d) => d.total) || 50) * 1.15))
    : (max(stackedData, (d) => d.total) || 10) * 1.08;
  const yLeft = scaleLinear().domain([0, maxLeft]).range([innerH, 0]);

  const maxRight = (max(rows, (r) => r.rawPtrTotal) || 1000) * 1.1;
  const yRight = scaleLinear().domain([0, maxRight]).range([innerH, 0]);

  g.append('g')
    .selectAll('line')
    .data(yLeft.ticks(5))
    .join('line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', (d) => yLeft(d))
    .attr('y2', (d) => yLeft(d))
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 3');

  const barGroups = g
    .selectAll('.bar-col')
    .data(stackedData)
    .join('g')
    .attr('class', 'bar-col')
    .attr('transform', (d) => `translate(${x(d.period) || 0},0)`);

  barGroups
    .selectAll('rect')
    .data((d) => d.rects)
    .join('rect')
    .attr('x', 0)
    .attr('width', x.bandwidth())
    .attr('y', (s) => yLeft(s.y1))
    .attr('height', (s) => Math.max(0, yLeft(s.y0) - yLeft(s.y1)))
    .attr('fill', (s) => s.color)
    .attr('rx', 1.5);

  barGroups
    .append('rect')
    .attr('x', -x.step() * 0.1)
    .attr('width', x.step())
    .attr('y', 0)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('pointerenter pointermove', (event, d) => {
      const src = uafMetric.value === 'all_share' ? d.row.all : d.row.vrp;
      const tot = src.total || 1;
      const fmtEntry = (cnt: number, usd: number) => {
        if (uafMetric.value === 'usd') return `${fmtUsd(usd)} (${cnt})`;
        const pct = ((cnt / tot) * 100).toFixed(1);
        return `${pct}% (${fmtInt(cnt)})`;
      };
      uafHover.value = {
        period: d.period,
        browserText: fmtEntry(src.uafBrowser, src.uafBrowserUsd),
        rendererText: fmtEntry(src.uafRenderer, src.uafRendererUsd),
        totalUafShare: `${((src.uaf / tot) * 100).toFixed(1)}% (${fmtInt(src.uaf)} / ${fmtInt(src.total)})`,
        rawPtrTotal: d.row.rawPtrTotal,
      };
      const [px, py] = [event.offsetX, event.offsetY];
      uafTooltipPos.value = {
        x: Math.min(width - 250, Math.max(12, px + 14)),
        y: Math.max(10, py - 24),
      };
    })
    .on('pointerleave', () => {
      uafHover.value = null;
    });

  const centerX = (period: string) => (x(period) || 0) + x.bandwidth() / 2;
  const rawPtrLine = d3Line<UafRow>()
    .x((r) => centerX(r.period))
    .y((r) => yRight(r.rawPtrTotal))
    .curve(curveMonotoneX);

  g.append('path')
    .datum(rows)
    .attr('fill', 'none')
    .attr('stroke', 'var(--series-1)')
    .attr('stroke-width', 2.4)
    .attr('d', rawPtrLine);

  // Direct color-matched endpoint dot & label on the raw_ptr + raw_ref line.
  const lastRow = rows[rows.length - 1];
  const lastX = centerX(lastRow.period);
  const lastY = yRight(lastRow.rawPtrTotal);
  g.append('circle')
    .attr('cx', lastX)
    .attr('cy', lastY)
    .attr('r', 3.5)
    .style('fill', 'var(--series-1)');
  g.append('text')
    .attr('x', lastX - 7)
    .attr('y', Math.max(12, lastY - 6))
    .attr('text-anchor', 'end')
    .attr('font-size', '11px')
    .attr('font-weight', '650')
    .style('fill', 'var(--series-1)')
    .style('paint-order', 'stroke')
    .style('stroke', 'var(--surface)')
    .style('stroke-width', '3px')
    .text(`raw_ptr + raw_ref: ${fmtCompact(lastRow.rawPtrTotal)}`);

  const xTickValues =
    uafGranularity.value === 'quarterly'
      ? periods.filter((p) => p.endsWith('Q1') || p === periods[periods.length - 1])
      : periods;

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(x).tickValues(xTickValues))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  const leftFmt =
    uafMetric.value === 'usd'
      ? (v: any) => '$' + format('.2~s')(Number(v))
      : isShare
        ? (v: any) => `${v}%`
        : format(',d');

  g.append('g')
    .call(axisLeft(yLeft).ticks(5).tickFormat(leftFmt as any))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--muted)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));

  g.append('g')
    .attr('transform', `translate(${innerW},0)`)
    .call(axisRight(yRight).ticks(5).tickFormat(format('.2~s') as any))
    .call((ax) => ax.selectAll('text').style('fill', 'var(--series-1)').attr('font-size', '11px'))
    .call((ax) => ax.selectAll('line,path').style('stroke', 'var(--line-strong)'));
};

let uafObserver: ResizeObserver | null = null;

onMounted(async () => {
  const res = await fetch('/data/security.json');
  if (res.ok) {
    payload.value = await res.json();
    await nextTick();
    renderUafChart();
    if (uafChartWrap.value) {
      uafObserver = new ResizeObserver(() => renderUafChart());
      uafObserver.observe(uafChartWrap.value);
    }
  }
});

onBeforeUnmount(() => {
  uafObserver?.disconnect();
});

watch([() => payload.value, uafMetric, uafGranularity], () => {
  nextTick(renderUafChart);
});
</script>

<style scoped>
.page-head {
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.subtitle-text {
  color: var(--muted);
  max-width: 68ch;
}

.snapshot-badge {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  white-space: nowrap;
}

.pillar-kpi-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 700px) {
  .pillar-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .pillar-kpi-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  color: inherit;
  display: block;
  padding: 0.9rem 1rem;
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

.kpi-card:hover {
  background: color-mix(in srgb, var(--surface-sunken) 45%, var(--surface));
  border-color: var(--accent);
}

.kpi-eyebrow {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 600;
  gap: 0.3rem;
  margin-bottom: 0.25rem;
}

.kpi-value {
  color: var(--ink);
  font-size: 1.42rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.kpi-unit {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 500;
}

.kpi-detail {
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.4;
  margin-top: 0.4rem;
}

.pillar-section {
  border-top: 1px solid var(--line);
  scroll-margin-top: 3.75rem;
}

.pillar-kicker {
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 640;
  letter-spacing: 0.04em;
  margin-bottom: 0.15rem;
  text-transform: uppercase;
}

.section-toolbar {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.sub-section-head {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.sub-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.sub-title {
  color: var(--ink);
  font-size: 0.98rem;
  font-weight: 640;
}

.muted-note {
  color: var(--muted);
  font-size: 0.86rem;
}

.table-skeleton {
  border-radius: var(--radius-lg);
  height: 24rem;
}

.scorecard-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.scorecard-table,
.compact-repo-table {
  margin-bottom: 0;
}

.compact-repo-table {
  font-size: 0.84rem;
}

.detail-col {
  padding-right: 0 !important;
  width: 2.1rem;
}

.expand-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  height: 1.65rem;
  justify-content: center;
  width: 1.65rem;
}

.expand-btn:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}

.repo-cell {
  align-items: center;
  display: inline-flex;
  gap: 0.45rem;
  white-space: nowrap;
}

.repo-dot {
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  height: 0.55rem;
  width: 0.55rem;
}

.repo-filter-chip {
  font-weight: 620;
}

.repo-pill-label {
  font-weight: 640;
}

.progress-col {
  min-width: 165px;
}

.progress-cell {
  align-items: center;
  display: flex;
  gap: 0.55rem;
}

.progress-bar-track {
  background: var(--surface-sunken);
  border-radius: 999px;
  flex: 1;
  height: 8px;
  min-width: 72px;
  overflow: hidden;
}

.progress-bar-fill {
  border-radius: 999px;
  height: 100%;
  transition: width 0.25s ease;
}

.progress-bar-fill.is-complete {
  background: var(--series-3);
}

.progress-bar-fill.is-good {
  background: var(--accent);
}

.progress-bar-fill.is-early {
  background: var(--series-4);
}

.progress-bar-fill.is-zero {
  background: var(--line-strong);
}

.progress-pct {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  min-width: 3.6rem;
  text-align: right;
}

.num-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.unit-inline {
  color: var(--muted);
  font-size: 0.76rem;
}

.metric-link {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 600;
}

.treemap-pill-link {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.76rem;
  font-weight: 560;
  gap: 0.25rem;
  padding: 0.15rem 0.55rem;
  text-decoration: none;
  white-space: nowrap;
}

.treemap-pill-link:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.treemap-icon-link {
  color: var(--muted);
  display: inline-flex;
}

.treemap-icon-link:hover {
  color: var(--accent);
}

.totals-row td {
  background: color-mix(in srgb, var(--surface-sunken) 55%, var(--surface));
  border-top: 2px solid var(--line-strong);
}

.delta-badge {
  border-radius: var(--radius-sm);
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.1rem 0.42rem;
  white-space: nowrap;
}

.delta-badge.is-good {
  background: var(--tag-success-bg);
  color: var(--tag-success-ink);
}

.delta-badge.is-warn {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-ink);
}

.delta-badge.is-neutral {
  background: var(--surface-sunken);
  color: var(--muted);
}

.is-good-text {
  color: var(--tag-success-ink);
}

.muted-dash {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.stat-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.stat-pill {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: inline-flex;
  flex-wrap: wrap;
  font-size: 0.82rem;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
}

.eta-code {
  color: var(--ink);
  font-weight: 650;
}

.stat-label {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 560;
}

.stat-sub {
  color: var(--muted);
  font-size: 0.75rem;
}

.split-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 1024px) {
  .split-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  }
}

.chart-card,
.dirs-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 0.95rem 1.05rem;
}

.line-chart-box {
  height: 330px;
  width: 100%;
}

.line-chart-box.is-compact {
  height: 305px;
}

.repo-mini-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
}

.repo-mini-pill {
  align-items: center;
  color: var(--ink-2);
  display: inline-flex;
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  gap: 0.3rem;
}

.mini-delta {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.dirs-card-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.84rem;
  gap: 0.5rem;
  justify-content: space-between;
  margin-bottom: 0.65rem;
}

.dir-rows {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.dir-row {
  align-items: center;
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.36rem 0.6rem;
}

.dir-main {
  align-items: center;
  display: flex;
  gap: 0.45rem;
  min-width: 0;
}

.repo-tag {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  display: inline-flex;
  flex-shrink: 0;
  font-size: 0.69rem;
  font-weight: 600;
  gap: 0.25rem;
  padding: 0.08rem 0.45rem;
}

.dir-link {
  align-items: center;
  display: inline-flex;
  font-size: 0.8rem;
  gap: 0.25rem;
  min-width: 0;
  overflow: hidden;
  text-decoration: none;
}

.dir-link code {
  background: transparent;
  overflow: hidden;
  padding: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-nums {
  align-items: center;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  gap: 0.4rem;
}

.blocker-detail-row td {
  background: var(--surface-sunken);
  padding: 0.8rem 1.15rem 0.95rem !important;
}

.blocker-drawer-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.83rem;
  justify-content: space-between;
  margin-bottom: 0.55rem;
}

.drawer-treemap-cta {
  align-items: center;
  display: inline-flex;
  font-size: 0.8rem;
  font-weight: 560;
  gap: 0.25rem;
}

.blocker-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.blocker-item {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: grid;
  gap: 0.7rem;
  grid-template-columns: 2rem minmax(160px, 1.4fr) minmax(80px, 1fr) auto auto;
  padding: 0.35rem 0.7rem;
}

@media (max-width: 768px) {
  .blocker-item {
    grid-template-columns: 2rem 1fr auto;
  }
  .blocker-bar-track {
    display: none;
  }
}

.blocker-rank {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.blocker-path {
  align-items: center;
  display: inline-flex;
  font-size: 0.8rem;
  gap: 0.25rem;
  text-decoration: none;
}

.blocker-bar-track {
  background: var(--surface-sunken);
  border-radius: 999px;
  height: 6px;
  overflow: hidden;
}

.blocker-bar-fill {
  background: var(--accent);
  border-radius: 999px;
  height: 100%;
}

.blocker-stats {
  font-size: 0.79rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.blocker-share {
  color: var(--muted);
  margin-left: 0.2rem;
}

.blocker-delta {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  min-width: 5.2rem;
  text-align: right;
  white-space: nowrap;
}

.blocker-delta.is-good {
  color: var(--tag-success-ink);
}

.blocker-delta.is-warn {
  color: var(--tag-warning-ink);
}

.roi-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cna-callout {
  align-items: flex-start;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: var(--radius);
  color: var(--ink-2);
  display: flex;
  font-size: 0.83rem;
  gap: 0.55rem;
  line-height: 1.5;
  padding: 0.65rem 0.9rem;
}

.roi-legend {
  display: flex;
  flex-wrap: wrap;
  font-size: 0.78rem;
  gap: 0.55rem 1.05rem;
  margin-bottom: 0.55rem;
}

.legend-item {
  align-items: center;
  color: var(--ink-2);
  display: inline-flex;
  gap: 0.35rem;
}

.swatch {
  border-radius: 3px;
  display: inline-block;
  flex-shrink: 0;
  height: 10px;
  width: 10px;
}

.line-swatch {
  border-top: 2.5px solid;
  display: inline-block;
  flex-shrink: 0;
  width: 18px;
}

.roi-svg-wrap {
  min-height: 320px;
  position: relative;
  width: 100%;
}

.roi-tooltip {
  background: var(--tooltip-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  color: var(--tooltip-ink);
  font-size: 0.76rem;
  min-width: 225px;
  padding: 0.55rem 0.7rem;
  pointer-events: none;
  position: absolute;
  z-index: 20;
}

.roi-tt-head {
  font-family: var(--font-mono);
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.roi-tt-row {
  display: flex;
  gap: 0.65rem;
  justify-content: space-between;
  line-height: 1.45;
}

.roi-tt-sep {
  background: rgba(255, 255, 255, 0.16);
  border: 0;
  height: 1px;
  margin: 0.3rem 0;
}
</style>
