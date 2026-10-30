<template>
  <div>
    <Navbar />
    <section class="section">
      <div class="container">
        <h1 class="title">Code accretion</h1>
        <FilterPanel :summary="filterSummary">
          <RepositorySelector v-model="selection" size="is-medium"
            :allowMultiple="false" :allowAll="false" />
          <div v-if="languageOptions.length > 1" class="language-bar mt-3">
            <UiSegmented v-model="language" aria-label="Language" :options="languageOptions" />
          </div>
        </FilterPanel>
        <p class="mb-4">
          The lines of code of {{ name }} alive over time, per year they were
          written in. Each year adds a new layer on top, which slowly erodes as
          its lines are rewritten.
        </p>

        <div class="mb-4">
        <AboutData modal :title="`How is this computed for ${directory || name}?`">
          <p>
            Each line belongs to the commit that last changed it, like
            <code>git blame --first-parent</code>, replaying the first-parent
            history of the default branch of
            <a v-if="repoMeta" :href="`https://github.com/${repoMeta.owner}/${repoMeta.repository}`"
              target="_blank" rel="noopener"><code>{{ repoMeta.owner }}/{{ repoMeta.repository }}</code></a>
            <code v-else>{{ name }}</code><template v-if="directory">
              (scoped to <code>{{ directory }}/</code>)</template>.
            A line is dated by the author timestamp (<code>%at</code>) of its
            commit. Repository cohorts are sampled every Monday (weekly);
            directories and developer series are sampled every 4 weeks.
          </p>
          <ul>
            <li>
              <strong>Moves &amp; renames:</strong> renamed and moved files keep
              their line ownership using git rename detection
              (<code>git log -M -l5000</code>).
            </li>
            <li>
              <strong>Mechanical changes:</strong> commits listed in
              <code>.git-blame-ignore-revs</code>, commits whose subject starts
              with <em>Ruff: reformat</em>, <em>Update copyright header(s)</em>,
              <em>Reformat(ting)</em>, <em>(Run|Apply) clang-format</em>,
              <em>(Mass-)(reformat|autoformat)</em> or <em>git cl format</em><template v-if="repository === 'chromium'">,
              commits by <code>blink-reformat@</code>,</template> and commits
              touching at least 1,000 files with at most 3 added lines per file
              on average do not take ownership of the lines they touch—their
              added lines keep the commits of the lines they replace
              proportionally.
            </li>
            <li>
              <strong>Imported histories:</strong> merges bringing in an
              unrelated root commit<template v-if="repository === 'chromium'">
              (such as Blink merged into Chromium in 2015, or
              <code>third_party/WebKit</code> renamed to
              <code>third_party/blink</code>)</template> are replayed on their
              own first so their files keep their original line dates once
              merged.
            </li>
          </ul>
          <p>
            <strong>Excluded files and commits ({{ name }}):</strong> lines not
            written by hand count nowhere—not in the total lines, years,
            directories, activity, or developers:
          </p>
          <ul>
            <li>
              <strong>Pathspecs &amp; non-text entries:</strong> binary files,
              symlinks, submodules, and translations (<code>**/*.xtb</code><template v-if="repository !== 'chromium'">,
              <code>**/locales/**</code></template>) are excluded at git-log
              time.
              <template v-if="repository === 'chromium'">
                In Chromium, all of <code>third_party/</code> is excluded except
                <code>third_party/blink</code> (and formerly
                <code>third_party/WebKit</code>). The broken git-svn commit
                <code>5d4451ebf298</code> (<em>Roll ANGLE r704:r705</em>) is
                skipped.
              </template>
              <template v-else>
                All of <code>third_party/</code> is excluded.
              </template>
            </li>
            <li>
              <strong>Generated files &amp; baselines:</strong> files whose
              first 40 lines match <code>@generated</code>,
              <em>DO NOT EDIT</em>, or <em>This file/code/header is
              (automatically) generated</em> (hand-written templates
              <code>*.tmpl</code>, <code>*.in</code>, <code>*.j2</code>,
              <code>*.jinja*</code>, <code>*.hbs</code>, <code>*.mako</code>,
              <code>templates/</code> aside); paths in <code>gen/</code>,
              <code>generated/</code>, <code>generated_*/</code> or matching
              <code>*autogen*</code>; lockfiles (<code>package-lock.json</code>,
              <code>yarn.lock</code>, <code>pnpm-lock.yaml</code>,
              <code>Cargo.lock</code>, <code>go.sum</code>,
              <code>poetry.lock</code>, <code>Gemfile.lock</code>); minified
              assets and protobuf outputs (<code>*.min.js</code>,
              <code>*.min.css</code>, <code>*.js.map</code>,
              <code>*.pb.{go,h,cc}</code>, <code>*_pb2*.py*</code>); and test
              baselines (<code>*-expected.{txt,png,wav,pdf}</code>,
              <code>*.expected.*</code>, <code>bytecode_expectations/</code>;
              hand-written <code>-expected.html</code> reftests are kept).
            </li>
            <li>
              <strong>Vendored directories:</strong>
              <code>third_party/</code>, <code>ThirdParty/</code>,
              <code>third-party/</code>, <code>vendor/</code>,
              <code>vendored/</code>, and <code>node_modules/</code> at any
              depth<template v-if="repository === 'chromium'"> (except
              <code>third_party/blink</code>)</template><template v-if="repository === 'firefox'">,
              plus any directory containing a <code>moz.yaml</code> file</template>.
            </li>
            <li v-if="repoSpecificExclusions">
              <strong>{{ name }}-specific exclusions:</strong>
              {{ repoSpecificExclusions }}
            </li>
            <li>
              <strong>Import bots &amp; test syncs:</strong> commits by automated
              import bots (<code>github-actions[bot]</code>,
              <code>wptsync</code>, <code>release+treescript</code>,
              <code>servo-wpt-sync</code>, <code>servo-ops</code>,
              <code>swiftshader.regress</code>,
              <code>devtools-ci-autoroll-builder</code>)<template v-if="repository === 'chromium' || repository === 'servo'">,
              as well as commits titled <em>Import …</em>,
              <em>Manual import …</em>, or <em>Sync/Update WPT/CTS …</em>
              touching
              <code v-if="repository === 'chromium'">third_party/blink/web_tests/external/</code>
              <code v-else>tests/wpt/</code> even when landed by a developer</template>.
            </li>
          </ul>
          <p><strong>Metrics &amp; definitions:</strong></p>
          <ul>
            <li>
              <strong>Fresh code &amp; Median line age:</strong> fresh code is
              the share of lines alive written within the last 365 days. Median
              line age is computed in days at repository level (and from monthly
              buckets at directory level).
            </li>
            <li>
              <strong>Yearly reduction &amp; Half-life:</strong> for each cohort
              year, the share of its lines removed or rewritten between the
              samples closest to consecutive January 1sts (within 21 days). The
              <strong>half-life</strong> compounds the median reduction rate at
              each age until 50% of a cohort remains.
            </li>
            <li>
              <strong>Development vs refactoring:</strong> lines changed per
              year. <em>New code</em> (net additions in a hunk) and
              <em>Iteration</em> (rewriting or removing lines &lt; 365 days old)
              count as development; <em>Rework</em> (rewriting or removing lines
              ≥ 365 days old) and <em>Mechanical</em> commits count as
              refactoring. A scope's 12-month status label is
              <strong>Growing</strong> (&gt; +5% lines alive),
              <strong>Shrinking</strong> (&lt; −5%),
              <strong>Dormant</strong> (&lt; 2% of lines changed),
              <strong>Refactored</strong> (refactoring &gt; development), or
              <strong>Maintained</strong> otherwise.
            </li>
            <li>
              <strong>Contributors, Organizations &amp; Bus factor:</strong>
              developer emails are canonicalized via <code>mailmap.json5</code>
              (bots excluded) and mapped to organizations via Chromium's
              <code>org-list.txt</code> and dated
              <code>affiliations.json5</code>, attributing each surviving line to
              the author's organization at the commit date.
              <strong>Core</strong> authors have ≥ 12 commits in the period,
              <strong>Regular</strong> 3–11, and <strong>Drive-by</strong> 1–2.
              The <strong>bus factor</strong> is the fewest authors whose
              currently alive lines sum to at least 50% of the scope.
            </li>
            <li>
              <strong>Reviewers ({{ name }}):</strong>
              <template v-if="hasReviewers">
                <code>Reviewed-by</code> commit trailers are recorded in
                {{ name }} starting <strong>{{ reviewedSince }}</strong> (the
                first month with ≥ 10 commits where at least half have
                reviewers). A line from that era is considered known by its
                author and its reviewers; the <em>with reviewers</em> bus factor
                (greedy truck-factor removal) is reported when at least 50% of
                the scope's lines alive were written since {{ reviewedSince }}.
              </template>
              <template v-else>
                {{ name }} does not record Gerrit <code>Reviewed-by</code>
                trailers on at least half of its commits, so reviewer ownership
                and the <em>with reviewers</em> bus factor are not computed for
                this repository.
              </template>
            </li>
            <li>
              <strong>Directories, Breadth &amp; Markers:</strong> directories
              are tracked up to 3 levels deep<template v-if="repository === 'chromium'">
              (with <code>third_party/blink</code> counted as level 1)</template>
              and listed when they have at least 1,000 lines alive today (and at
              least 10 lines for a developer's treemap). Developer
              <strong>breadth</strong> is the effective number of depth-2
              components (e<sup>Shannon entropy</sup> of their commits
              {{ breadthPeriod }}). Chart <strong>markers</strong> highlight up
              to 6 commits changing at least 10,000 lines and 0.5% of the
              repository at once.
            </li>
            <li>
              <strong>Languages:</strong> the language filter scopes every chart,
              cohort history, directory, treemap, and developer or organization
              metric to files matching the selected extension group (C/C++,
              HTML/JS/TS, Java, Python, Rust).
            </li>
          </ul>
        </AboutData>
        </div>

        <p v-if="missing" class="mb-4">
          No data yet for {{ name }}.
        </p>

        <!-- The selected directory and developers, staying in view: at their
             place, or at the top once scrolled past. -->
        <div ref="scopeSentinel" />
        <div class="scope-bar mb-4" :class="{ 'is-stuck': scopeStuck }">
          <nav class="breadcrumb mb-0" aria-label="breadcrumbs">
            <ul>
              <li :class="{ 'is-active': !directory }">
                <a href="#" @click.prevent="directory = ''">{{ name }}</a>
              </li>
              <li v-for="part in breadcrumb" :key="part.path"
                :class="{ 'is-active': part.path === directory }">
                <a href="#" @click.prevent="directory = part.path">{{ part.name }}</a>
              </li>
            </ul>
          </nav>
          <div v-if="languageLabel || selectedOwners.length" class="scope-developers">
            <span v-if="languageLabel" class="developer-chip language-chip">
              {{ languageLabel }}
              <button type="button" :aria-label="`Remove ${languageLabel} filter`"
                @click="language = ''">×</button>
            </span>
            <span v-for="owner in selectedOwners" :key="owner.key" class="developer-chip"
              :style="{ '--chip': $color(owner.name) }">
              {{ owner.name }}
              <button type="button" :aria-label="`Remove ${owner.name}`"
                @click="removeOwner(owner)">×</button>
            </span>
          </div>
        </div>

        <p v-if="untrackedBelow" class="hint mb-4">
          The directories are tracked 3 levels deep: the subdirectories of
          {{ directory }} have no data of their own.
        </p>

        <div class="figures mb-5">
          <div v-for="figure in figures" :key="figure.label" class="figure">
            <div class="figure-label">
                <UiTooltip v-if="figure.hint" :text="figure.hint" multiline dashed position="bottom">
                  {{ figure.label }}
                </UiTooltip>
                <template v-else>{{ figure.label }}</template>
              </div>
            <div class="figure-value">{{ figure.value }}</div>
            <div class="figure-detail">{{ figure.detail }}</div>
          </div>
        </div>

        <CollapsibleSection title="Lines per year written" id="chart" :collapsed="isHidden('c')"
          @toggle="toggleHidden('c')">
          <p v-if="directory && !scope && !directoryLoading" class="hint">
            No {{ languageLabel ? `${languageLabel} ` : "" }}lines tracked in {{ directory }}.
          </p>
          <template v-else-if="scope && !hasHistory">
            <template v-if="fallbackCohortYears.length">
              <p class="mb-3">
                {{ languageLabel }} lines alive today in {{ directory || name }}, by year written:
              </p>
              <StackedBars :years="fallbackCohortYears" :series="fallbackCohortSeries" />
            </template>
            <p v-else class="hint">
              No {{ languageLabel }} lines alive in {{ directory || name }}.
            </p>
          </template>
          <template v-else>
            <div class="chart-toolbar mb-3">
              <UiSegmented v-model="chartView" :options="[
                { value: 'lines', label: 'Lines' },
                { value: 'share', label: 'Share' },
                { value: 'fresh', label: 'Fresh (< 1 year)', title: 'The share of the lines written in the last 365 days' },
              ]" />
            </div>

            <div class="chart">
              <LineChart v-if="chartView === 'fresh'" :data="freshness" :formatter="percent"
                :milestones="directory ? [] : repositoryMilestones" />
              <AccretionChart v-else :data="scope" :share="chartView === 'share'"
                :milestones="directory ? [] : repositoryMilestones" />
            </div>
          </template>
        </CollapsibleSection>

        <CollapsibleSection v-if="children.length" title="Directories"
          id="directories" :collapsed="isHidden('d')" @toggle="toggleHidden('d')">
          <div v-if="children.length > 10" class="directory-toolbar mb-3">
            <input v-model="directoryFilter" type="search" class="input is-small directory-filter"
              placeholder="Filter directories…" aria-label="Filter directories" />
          </div>
          <UiTable :data="filteredChildren" hoverable striped :paginated="filteredChildren.length > 25"
            :per-page="25">
            <UiTableColumn field="name" label="Directory" v-slot="props" sortable>
              <a href="#" @click.prevent="directory = props.row.path">{{ props.row.name }}</a>
            </UiTableColumn>
            <UiTableColumn field="lines" label="Lines" v-slot="props" numeric sortable
              hint="The lines alive in the directory today.">
              {{ compact(props.row.lines) }}
            </UiTableColumn>
            <UiTableColumn field="growth" label="Growth" v-slot="props" numeric sortable
              hint="The change of the lines alive over the last 12 months, files moved in or out included."
              :visible="hasHistory">
              {{ signedPercent(props.row.growth) }}
            </UiTableColumn>
            <UiTableColumn field="fresh" label="Fresh" v-slot="props" numeric sortable
              hint="The share of the lines alive written in the last 12 months.">
              {{ percent(props.row.fresh) }}
            </UiTableColumn>
            <UiTableColumn field="median_age" label="Median age" v-slot="props" numeric sortable
              hint="Half of the lines alive are older than this.">
              {{ years(props.row.median_age) }}
            </UiTableColumn>
            <UiTableColumn field="rewritten" label="Rewritten" v-slot="props" numeric sortable
              hint="Of the lines a year ago, the share of those a year old or more removed or rewritten in place since. Moved files and mechanical changes don't count."
              :visible="hasHistory">
              {{ percent(props.row.rewritten) }}
            </UiTableColumn>
            <UiTableColumn field="label" label="Last 12 months" v-slot="props" sortable
              :hint="labelHint"
              :visible="children.some(row => row.label)">
              <span v-if="props.row.label" class="status-pill"
                :class="`is-${props.row.label.toLowerCase()}`">
                {{ props.row.label }}
              </span>
            </UiTableColumn>
            <UiTableColumn field="authors" label="Authors (core)" v-slot="props" numeric sortable
              :hint="`The developers with at least one commit in the directory ${contributorsPeriod} (and in parentheses, the core authors with 12 commits or more), bots aside.`"
              :visible="children.some(row => row.authors !== undefined)">
              <template v-if="props.row.authors !== undefined">
                {{ props.row.authors }}
                <span v-if="props.row.core !== undefined" class="muted-cell">({{ props.row.core }})</span>
              </template>
            </UiTableColumn>
            <UiTableColumn field="bus_factor" label="Bus factor" v-slot="props" numeric sortable
              :hint="busFactorHint"
              :visible="children.some(row => row.bus_factor !== undefined)">
              <template v-if="props.row.bus_factor !== undefined">
                {{ props.row.bus_factor }}
                <span v-if="props.row.bus_factor_reviewed !== undefined" class="muted-cell"
                  :title="`With reviewers: ${props.row.bus_factor_reviewed}`">
                  ({{ props.row.bus_factor_reviewed }})
                </span>
              </template>
            </UiTableColumn>
            <UiTableColumn v-for="(owner, i) in selectedOwners" :key="owner.key"
              :field="`owned_${i}`" :label="owner.name" v-slot="props" numeric sortable
              :hint="reviewed
                ? `The share of the directory's reviewed lines alive that ${owner.name} reviewed.`
                : `The share of the directory's lines alive that ${owner.name} authored.`"
              :td-attrs="row => paint(row[`owned_${i}`], owner.name)">
              {{ props.row[`owned_${i}`] ? ownedShare(props.row[`owned_${i}`]) : "" }}
            </UiTableColumn>
          </UiTable>
        </CollapsibleSection>

        <CollapsibleSection v-if="hasHistory && reductionYears.length" title="Yearly reduction" id="yearly-reduction" :collapsed="isHidden('y')"
          @toggle="toggleHidden('y')">
          <p class="mb-4">
            The share of the lines of a year removed or rewritten during each of
            the following years, from January to January.
            <template v-if="halfLife">
              With the median rates, half of the lines of a year are gone
              <strong>{{ halfLife.toFixed(1) }} years</strong> after it ends.
            </template>
            Negative when lines were added to an old year, like when Blink was
            merged.
          </p>
          <HexReduction v-model="crossed" :years="reductionYears" />
          <p class="crossed-detail">
            <template v-if="crossed">
              Lines written in <strong>{{ crossed.written }}</strong>, removed or
              rewritten during <strong>{{ crossed.removed }}</strong>, at
              <strong>{{ crossed.age }} year{{ crossed.age > 1 ? "s" : "" }}</strong>
              old: <strong>{{ percent(crossed.value) }}</strong><template
                v-if="medianForAge(crossed.age) !== null">
                (median at {{ crossed.age }}y: {{ percent(medianForAge(crossed.age)) }})</template>.
            </template>
            <span v-else class="hint">
              Point at a hexagon to see the year its lines were written in, the
              year they were removed in, and their age.
            </span>
          </p>
        </CollapsibleSection>

        <div v-if="activitySeries.length || contributorSeries.length" class="yearly-bars-grid">
          <CollapsibleSection v-if="activitySeries.length" title="Development vs refactoring"
            id="activity" :collapsed="isHidden('a')" @toggle="toggleHidden('a')">
            <p class="mb-3">
              Lines changed per year in {{ directory || name }}<template v-if="activitySummary">
                ({{ activitySummary }})</template>.
            </p>
            <StackedBars :years="scope.activity.years" :series="activitySeries" />
          </CollapsibleSection>

          <CollapsibleSection v-if="contributorSeries.length" title="Contributors"
            id="contributors" :collapsed="isHidden('o')" @toggle="toggleHidden('o')">
            <p class="mb-3">
              Developers committing each year in {{ directory || name }}, by
              commit frequency.
            </p>
            <StackedBars :years="scope.contributors.years" :series="contributorSeries" />
          </CollapsibleSection>
        </div>

        <CollapsibleSection title="Developers & organizations" id="developers" :collapsed="isHidden('v')"
          @toggle="toggleHidden('v')">
          <p class="disclaimer">
            <UiIcon name="information-outline" size="small" />
            The lines still alive don't measure anyone's work. Removing code,
            reviewing, refactoring, or iterating on a directory are meaningful
            work leaving few lines behind, and the last one to touch a line
            isn't always the one who designed it.
          </p>
          <div class="developer-controls mb-4">
            <UiSegmented v-model="ownerKind" aria-label="Group by" :options="[
              { value: 'developers', label: 'Developers' },
              { value: 'organizations', label: 'Organizations' },
            ]" />
            <div class="developer-input">
              <OrganizationsInput v-if="isOrganizations" v-model="organizations"
                :options="organizationNames" />
              <DevelopersInput v-else v-model="developers" />
            </div>
            <UiSegmented v-if="hasReviewers" v-model="knowledge" aria-label="Lines" :options="[
              { value: 'authored', label: 'Authored', title: 'The lines they wrote' },
              { value: 'reviewed', label: 'Reviewed', title: isOrganizations
                ? `The lines since ${reviewedSince} reviewed by another author from this organization`
                : `The lines others wrote since ${reviewedSince}, that they reviewed` },
            ]" />
          </div>

          <div v-if="activeCards.length" class="ownership mb-4">
            <div v-for="entry in activeCards" :key="entry.name" class="developer-card">
              <p>
                <span class="swatch" :style="{ background: $color(entry.name) }" />
                <NuxtLink :to="ownerLink(entry.name)"><strong>{{ entry.name }}</strong></NuxtLink>
                {{ knowledgeVerb }} {{ compact(entry.owned) }}
                {{ languageLabel ? `${languageLabel} ` : "" }}lines alive<template v-if="reviewed">{{ isOrganizations ? " since " : " written by others since " }}{{ reviewedSince }},
                {{ ownedShare(entry.share) || "0%" }} of {{ directory || name }}'s reviewed {{ languageLabel ? `${languageLabel} ` : "" }}lines
                ({{ ownedShare(entry.allShare) || "0%" }} of all {{ languageLabel ? `${languageLabel} ` : "" }}lines).</template><template v-else>,
                {{ ownedShare(entry.share) || "0%" }} of {{ directory || name }}<template v-if="languageLabel">'s {{ languageLabel }}</template>.</template>
              </p>
              <p v-if="entry.breadth" class="developer-card-meta">
                <span v-if="wholeRepository" class="scope-tag">{{ wholeRepository }}</span>
                {{ lines(entry.commits || 0) }} commits<template v-if="entry.authors">
                  by {{ lines(entry.authors) }} author{{ entry.authors > 1 ? "s" : "" }}</template>
                {{ breadthPeriod }}, across about
                {{ entry.breadth.effective >= 10 ? Math.round(entry.breadth.effective) : entry.breadth.effective }}
                <UiTooltip :text="componentsHint" multiline dashed>components</UiTooltip>
                ({{ percent(entry.breadth.share) }} in <code>{{ entry.breadth.components[0][0] }}</code>).
              </p>
              <p v-if="entry.removals && entry.removals.total" class="developer-card-meta">
                {{ percent(entry.removals.self / entry.removals.total) }} of their rewritten lines were by themselves<template
                  v-if="peersOf(entry.removals.by, entry.name).length">;
                  by others:
                  <template v-for="([peer, count], idx) in peersOf(entry.removals.by, entry.name)" :key="`by-${peer}`">
                    <template v-if="idx > 0">, </template>
                    <button type="button" class="peer-link" @click="toggleActiveOwner(peer)">{{ peer }}</button>
                    ({{ compact(count) }})</template></template>.
                <template v-if="peersOf(entry.removals.of, entry.name).length">
                  Rewrote lines of:
                  <template v-for="([peer, count], idx) in peersOf(entry.removals.of, entry.name)" :key="`of-${peer}`">
                    <template v-if="idx > 0">, </template>
                    <button type="button" class="peer-link" @click="toggleActiveOwner(peer)">{{ peer }}</button>
                    ({{ compact(count) }})</template>.
                </template>
              </p>
            </div>
          </div>

          <div v-if="activeTrees.length" class="ownership-treemaps mb-5">
            <div v-for="entry in activeTrees" :key="entry.name">
              <p class="mb-2">
                <span class="swatch" :style="{ background: $color(entry.name) }" />
                Where <strong>{{ entry.name }}</strong>'s {{ knowledgeVerb }}
                {{ languageLabel ? `${languageLabel} ` : "" }}lines
                are in {{ directory || name }} (click to open):
              </p>
              <OwnershipTreemap :tree="entry.tree" :color="$color(entry.name)"
                :verb="knowledgeVerb" @select="path => directory = path" />
            </div>
          </div>

          <div v-if="activeLineData.length" class="mb-5">
            <p class="mb-2">
              <span v-if="wholeRepository" class="scope-tag">{{ wholeRepository }}</span>
              {{ languageLabel ? `${languageLabel} lines` : "Lines" }} alive over time:
            </p>
            <div class="chart">
              <LineChart :data="activeLineData" :formatter="lines" />
            </div>
          </div>

          <div class="leaderboard-header mt-4 mb-3">
            <h3 class="title is-6 mb-0">
              <span v-if="wholeRepository && leaderboardRepoWide" class="scope-tag">{{ wholeRepository }}</span>
              <template v-if="leaderboardView === 'commits'">
                Most {{ languageLabel ? `${languageLabel} ` : "" }}commits {{ breadthPeriod }} in {{ directory || name }}
              </template>
              <template v-else-if="leaderboardView === 'scatter'">
                Specialists vs generalists<template v-if="languageLabel"> ({{ languageLabel }})</template>
              </template>
              <template v-else-if="isOrganizations && directory">
                Most {{ languageLabel ? `${languageLabel} ` : "" }}lines {{ reviewed ? "reviewed" : "alive" }} in {{ directory }}
              </template>
              <template v-else>
                Most {{ languageLabel ? `${languageLabel} ` : "" }}lines {{ leaderboardShowsReviewed ? "reviewed" : "alive" }}
              </template>
            </h3>
            <UiSegmented v-if="leaderboardOptions.length > 1" v-model="leaderboardView" :options="leaderboardOptions" />
          </div>

          <template v-if="leaderboardView === 'scatter' && activeScatterPoints.length">
            <p class="mb-2">
              The {{ isOrganizations ? "organizations" : "100 developers with the most lines alive" }},
              by their commits {{ breadthPeriod }}, and how many
              <UiTooltip :text="componentsHint" multiline dashed>components</UiTooltip>
              they spread over: specialists on the left, generalists on the
              right. Click one to select it.
            </p>
            <BreadthScatter :developers="activeScatterPoints" :selected="activeSelected"
              @select="toggleActiveOwner" />
          </template>
          <UiTable v-else-if="leaderboardView === 'commits' && activeTopCommits.length"
            :data="activeTopCommits" hoverable striped>
            <UiTableColumn field="name" :label="ownerLabel" v-slot="props">
              <NuxtLink :to="ownerLink(props.row.name)">{{ props.row.name }}</NuxtLink>
            </UiTableColumn>
            <UiTableColumn field="commits" label="Commits" v-slot="props" numeric>
              {{ lines(props.row.commits) }}
            </UiTableColumn>
            <UiTableColumn label="Chart" v-slot="props">
              <button type="button" class="button is-small"
                @click="toggleActiveOwner(props.row.name)">
                {{ activeSelected.includes(props.row.name) ? "Hide" : "Show" }}
              </button>
            </UiTableColumn>
          </UiTable>
          <UiTable v-else :data="activeLeaderboard" hoverable striped :paginated="activeLeaderboard.length > 20" :per-page="20">
            <UiTableColumn field="rank" label="#" v-slot="props" numeric>
              {{ props.row.rank }}
            </UiTableColumn>
            <UiTableColumn field="name" :label="ownerLabel" v-slot="props">
              <NuxtLink :to="ownerLink(props.row.name)">
                {{ props.row.name }}
              </NuxtLink>
            </UiTableColumn>
            <UiTableColumn field="lines" :label="leaderboardShowsReviewed ? 'Lines reviewed' : 'Lines alive'" v-slot="props" numeric sortable>
              {{ lines(props.row.lines) }}
            </UiTableColumn>
            <UiTableColumn field="share" label="Share" v-slot="props" numeric sortable
              :visible="activeLeaderboard.some(row => row.share !== undefined)"
              :td-attrs="row => row.share ? paint(row.share, row.name) : {}">
              {{ props.row.share ? ownedShare(props.row.share) : "" }}
            </UiTableColumn>
            <UiTableColumn field="peak" label="Peak" v-slot="props" numeric sortable
              :visible="activeLeaderboard.some(row => row.peak !== undefined)">
              {{ props.row.peak !== undefined ? lines(props.row.peak) : "" }}
            </UiTableColumn>
            <UiTableColumn label="Chart" v-slot="props">
              <button type="button" class="button is-small"
                @click="toggleActiveOwner(props.row.name)">
                {{ activeSelected.includes(props.row.name) ? "Hide" : "Show" }}
              </button>
            </UiTableColumn>
          </UiTable>
        </CollapsibleSection>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { format } from "d3-format";
import repositories_json from '../public/data/repositories.json'
// Short explanations of the largest events, by commit hash prefix.
import eventLabels from '../utils/accretion-events.json'

const route = useRoute();
const { $color } = useNuxtApp();
const router = useRouter();


const lines = format(",");
const compact = format(".3~s");
const percent = value => value === null || isNaN(value) ? "" : format(".1%")(value);
const signedCompact = format("+.2~s");
const truncate = (text, length) => text.length > length ? `${text.slice(0, length - 1)}…` : text;
// A share authored: most developers write less than 1% of a directory, shown
// with two decimals, and never as 0.00% when there is something.
const ownedShare = value => !value ? "" : value < 0.00005 ? "<0.01%"
  : format(value < 0.01 ? ".2%" : ".1%")(value);
const signedPercent = value => value === null || isNaN(value) ? "" : format("+.1%")(value);
const years = value => value === null ? "" : `${value.toFixed(1)} y`;

const chartView = ref(route.query.share === "fresh"
  ? "fresh"
  : route.query.share === "true" ? "share" : "lines");
const leaderboardView = ref("table");
const repository = ref(route.query.repository || "chromium");
const directory = ref(route.query.dir || "");
const language = ref((route.query.lang as string) || "");
// The folded sections, one letter each: c(hart), d(irectories),
// y(early reduction), a(ctivity), (c)o(ntributors), (de)v(elopers).
const hidden = ref(route.query.hide || "");
const isHidden = code => hidden.value.includes(code);
const toggleHidden = code => {
  hidden.value = (isHidden(code)
    ? hidden.value.replace(code, "")
    : hidden.value + code).split("").sort().join("");
};
const developers = ref(route.query.developers
  ? (route.query.developers as string).split(",")
  : []);
const organizations = ref(route.query.organizations
  ? (route.query.organizations as string).split(",")
  : []);
const defaultOwnerKind = (devs: string[], orgs: string[]) =>
  orgs.length && !devs.length ? "organizations" : "developers";
const kindFromQuery = (q: Record<string, any>, devs: string[], orgs: string[]) =>
  q.by === "organizations" ? "organizations"
    : q.by === "developers" ? "developers"
    : defaultOwnerKind(devs, orgs);
const ownerKind = ref(kindFromQuery(route.query, developers.value, organizations.value));
const isOrganizations = computed(() => ownerKind.value === "organizations");
const ownerLabel = computed(() => isOrganizations.value ? "Organization" : "Developer");
// The lines of the developers or organizations shown: those they authored, or reviewed.
const knowledge = ref(route.query.lines === "reviewed" ? "reviewed" : "authored");

const repoCohorts = shallowRef(null);   // Root cohorts of the repository (all languages).
const repoDirectories = shallowRef([]); // Root directories summary (all languages).
const cohorts = shallowRef(null);       // Active scope root cohorts (all or selected language).
const directories = shallowRef([]);     // The summary of every directory in active language scope.
const directoryData = shallowRef(null); // The selected directory.
const directoryLoading = ref(false);
const leaderboard = shallowRef([]);
const leaderboardReviewed = shallowRef([]);
const organizationsBundle = shallowRef(null);

const missing = ref(false);

const fetchJson = url => fetch(url)
  .then(response => response.ok ? response.json() : null)
  .catch(() => null);
const files = new Map();
const fetchFile = url => {
  if (!files.has(url)) files.set(url, fetchJson(url));
  return files.get(url);
};

const repoMeta = computed(() => repositories_json
  .find(repo => repo.dirname === repository.value));
const name = computed(() => repoMeta.value?.name || repository.value);

const REPO_EXCLUSIONS: Record<string, string> = {
  chromium: "WPT_BASE_MANIFEST*.json, testing/buildbot/*.json (except trybot_analyze_config.json), third_party/blink/perf_tests/{speedometer*,MotionMark}/, and chrome/test/data/dromaeo/.",
  firefox: "intl/icu/, js/src/tests/test262/, js/src/octane/, testing/web-platform/tests/, testing/web-platform/mozilla/tests/webgpu/, dom/webgpu/tests/cts/, security/nss/, modules/freetype2/, gfx/harfbuzz/, media/lib*/, and ipc/chromium/src/{base,third_party}/.",
  webkit: "LayoutTests/{imported,webgl,platform}/, JSTests/{test262,ChakraCore,wasm/spec-tests,es6,mozilla}/, PerformanceTests/{JetStream*,JSBench,Speedometer*,MotionMark*,ARES-6,SunSpider,Octane,Kraken,Dromaeo}/, and Websites/browserbench.org/.",
  servo: "tests/wpt/{tests,webgl,webgpu,meta,meta-legacy}/ (while Servo's own tests in tests/wpt/mozilla/ are kept) and tests/blink_perf_tests/.",
  ladybird: "wpt-import/ directories.",
  v8: "test/webkit/ and test/unittests/gay-*.cc.",
  skia: "modules/canvaskit/npm_build/ and resources/skottie/.",
  swiftshader: "Khronos and system headers in include/{vulkan,vk_video,KHR,EGL,GLES*,Wayland,xcb}/ and tests/regres/testlists/.",
  angle: "Khronos headers in include/{GLES*,EGL,KHR,CL,vulkan,vk_video}/ and src/tests/gl_tests/media/.",
  webrtc: "rtc_tools/rtc_event_log_visualizer/conversational_speech_en.h.",
  llvm: "libc/test/src/math/exhaustive/*.wc (plus LLVM test files whose assertions are auto-generated in their first 40 lines).",
  chromeos: "TPM specification files in trunks/generator/raw_*.",
};
const repoSpecificExclusions = computed(() => REPO_EXCLUSIONS[repository.value] || "");

// The markers explaining the largest steps of the chart: the commits adding
// or removing the most lines at once. The smaller ones close to a larger one
// are skipped, as they are often part of the same story, like a revert and
// its reland.
const events = shallowRef([]);
const repositoryMilestones = computed(() => {
  const start = cohorts.value?.dates[0];
  if (!start) return [];
  const span = new Date(cohorts.value.dates.at(-1)) - new Date(start);
  const spacing = Math.max(3 * 86400e3, 0.03 * span);
  const picked = [];
  const sorted = events.value
    .filter(event => event.date >= start)
    .sort((a, b) => Math.abs(b.lines) - Math.abs(a.lines));
  for (const event of sorted) {
    if (picked.length === 6) break;
    if (!picked.some(other => Math.abs(new Date(other.date) - new Date(event.date)) < spacing)) {
      picked.push(event);
    }
  }
  return picked
    .map(event => {
      // Without an explanation: where the lines were added or removed.
      const label = eventLabels[event.hash.slice(0, 12)] || (event.path
        ? `${event.lines > 0 ? "Added" : "Removed"} ${event.path}/`
        : truncate(event.subject, 50));
      return {
        date: event.date,
        lines: event.lines,
        label: `${label} (${signedCompact(event.lines)})`,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
});

// The repositories defined as a directory of another one (cone) are shown as
// this directory.
const parentDirname = repo => repositories_json.find(parent =>
  parent.dirname.toLowerCase() === repo.parent.toLowerCase())?.dirname;
const selection = computed({
  get: () => {
    const cone = repositories_json.find(repo => repo.cone &&
      parentDirname(repo) === repository.value && repo.cone === directory.value);
    return [cone ? cone.dirname : repository.value];
  },
  set: value => {
    // After a selection, the chips also send it with the previous one: the
    // current selection is kept.
    const dirname = value.includes(selection.value[0]) ? selection.value[0] : value[0];
    const repo = repositories_json.find(repo => repo.dirname === dirname);
    if (!repo) return;
    const next = repo.cone ? parentDirname(repo) : repo.dirname;
    if (next !== repository.value) developers.value = [];
    repository.value = next;
    directory.value = repo.cone || "";
  },
});

const dataBase = computed(() => language.value
  ? `/accretion/${repository.value}/languages/${language.value}`
  : `/accretion/${repository.value}`);

watch([repository, language], async () => {
  const repo = repository.value;
  const [rootCohorts, rootDirs] = await Promise.all([
    fetchFile(`/accretion/${repo}/cohorts.json`),
    fetchFile(`/accretion/${repo}/directories.json`),
  ]);
  if (repo !== repository.value) return;
  repoCohorts.value = rootCohorts;
  repoDirectories.value = rootDirs || [];
  missing.value = !rootCohorts;
  if (language.value && !(rootCohorts?.languages || []).some(entry => entry.id === language.value)) {
    language.value = "";
    return;
  }
  const base = dataBase.value;
  const [cohortsJson, directoriesJson, leaderboardJson, leaderboardRevJson, eventsJson, organizationsJson] = await Promise.all([
    language.value ? fetchFile(`${base}/cohorts.json`) : Promise.resolve(rootCohorts),
    language.value ? fetchFile(`${base}/directories.json`) : Promise.resolve(rootDirs),
    fetchFile(`${base}/leaderboard.json`),
    fetchFile(`${base}/leaderboard_reviewed.json`),
    fetchFile(`${base}/events.json`),
    fetchFile(`${base}/organizations.json`),
  ]);
  // Another repository or language was selected meanwhile.
  if (base !== dataBase.value) return;
  cohorts.value = cohortsJson;
  events.value = eventsJson || [];
  directories.value = directoriesJson || [];
  leaderboard.value = (leaderboardJson || []).map((entry, i) => ({ ...entry, rank: i + 1 }));
  leaderboardReviewed.value = (leaderboardRevJson || []).map((entry, i) => ({ ...entry, rank: i + 1 }));
  organizationsBundle.value = organizationsJson;
}, { immediate: true });

// A link to a section scrolls to it once the data is loaded: the sections
// aren't all there before.
watch(cohorts, async () => {
  if (!location.hash) return;
  await nextTick();
  document.getElementById(location.hash.slice(1))?.scrollIntoView();
}, { once: true });

// Blink is a top-level directory.
const parentOf = path => path === "third_party/blink" || !path.includes("/")
  ? ""
  : path.slice(0, path.lastIndexOf("/"));

const breadcrumb = computed(() => {
  const parts = [];
  for (let path = directory.value; path; path = parentOf(path)) {
    parts.unshift({ path, name: path.slice(parentOf(path).length).replace(/^\//, "") });
  }
  return parts;
});

// The directories and the developers are grouped in files, like the importer
// does: per top-level directory, and per first letter.
const directoryPack = path => path.startsWith("third_party/blink")
  ? "third_party/blink"
  : path.split("/")[0];
const usernameBucket = username =>
  /^[a-z0-9]/i.test(username) ? username[0].toLowerCase() : "_";

const unpackDirectory = (pack, path) => {
  if (!pack) return null;
  const raw = pack.directories ? pack.directories[path] : pack[path];
  if (!raw) return null;
  if (!pack.directories) return raw;
  const width = raw.years.length;
  return {
    ...raw,
    dates: pack.dates.slice(raw.first),
    lines: raw.lines.map(row => row.length === width
      ? row
      : [...row, ...new Array(width - row.length).fill(0)]),
  };
};

watch([dataBase, directory], async () => {
  const base = dataBase.value;
  const dir = directory.value;
  if (!dir) {
    directoryData.value = null;
    directoryLoading.value = false;
    return;
  }
  directoryLoading.value = true;
  const pack = await fetchFile(`${base}/directories/${directoryPack(dir)}.json`);
  if (base !== dataBase.value || dir !== directory.value) return;
  directoryData.value = unpackDirectory(pack, dir);
  directoryLoading.value = false;
}, { immediate: true });

const availableLanguages = computed(() => repoCohorts.value?.languages || []);
const languageMeta = computed(() =>
  availableLanguages.value.find(entry => entry.id === language.value) || null);
const languageLabel = computed(() => languageMeta.value?.label || "");
const languageOptions = computed(() => [
  { value: "", label: "All languages" },
  ...availableLanguages.value.map(entry => ({
    value: entry.id,
    label: entry.label,
    title: `${entry.hint} — ${compact(entry.lines)} lines`,
  })),
]);
const filterSummary = computed(() => [
  listSummary(repositoryNames(selection.value), "repositories"),
  ...(languageLabel.value ? [languageLabel.value] : []),
].join(" · "));

// The data of the selected scope: the repository, or a directory.
const scope = computed(() => directory.value ? directoryData.value : cohorts.value);
const hasHistory = computed(() => (scope.value?.dates?.length || 0) > 1);
// The summary of the selected scope: its label and bus factor.
const scopeSummary = computed(() => directory.value
  ? directories.value.find(entry => entry.path === directory.value)
  : cohorts.value);

// Single-sample fallback for repositories whose state has not been backfilled
// to v2 language history yet.
const fallbackCohortPairs = computed(() => {
  const data = scope.value;
  if (!data?.years?.length || !data.lines?.length) return [];
  const lastRow = data.lines.at(-1) || [];
  return data.years
    .map((year, i) => [year, lastRow[i] || 0] as const)
    .filter(([year]) => year !== "unknown")
    .map(([year, count]) => [Number(year), count] as const);
});
const fallbackCohortYears = computed(() => fallbackCohortPairs.value.map(([year]) => year));
const fallbackCohortSeries = computed(() => fallbackCohortPairs.value.length ? [{
  key: "alive",
  label: `${languageLabel.value || "Code"} lines alive`,
  color: "var(--series-1)",
  values: fallbackCohortPairs.value.map(([, count]) => count),
}] : []);

// The explanations of the labels and the bus factor, shown on hover.
const labelHint = "What happened during the last 12 months. Growing: the lines alive grew by more than 5%. " +
  "Shrinking: they shrank by more than 5%. Otherwise, Refactored: rewriting older lines and mechanical " +
  "changes outweighed new code and recent iterations. Dormant: under 2% of the lines changed. " +
  "Maintained: the rest.";
const busFactorHint = "The fewest authors who together wrote half of the lines alive, adding the authors " +
  "from the one who wrote the most. 1 means a single person wrote half of the code, which then depends on " +
  "very few people. Writing isn't the only way to know code: reviewers and owners know it too.";
// The month since which the reviewers are known, like "July 2017".
const reviewedSince = computed(() => cohorts.value?.reviewed_since
  ? new Date(cohorts.value.reviewed_since).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  : "");
const reviewedBusFactorHint = computed(() => "How many people must leave for half of the lines alive to " +
  "be known by nobody, a line being known by its author and the reviewers of its commit. They leave from " +
  "the one knowing the most lines. Higher than the bus factor when the code was reviewed by others than its " +
  "authors. From the Reviewed-by lines of the commits, recorded since " + reviewedSince.value + ": the older " +
  "lines aren't counted, and the figure is left out when they are more than half of the lines alive.");

const componentsHint = "A component is a directory two levels deep, like chrome/browser. " +
  "The number is weighted by where the commits went: 100 commits spread evenly over 4 components " +
  "make 4, while 97 in one and 1 in each of 3 others make about 1.2.";

// Of the lines a year ago, the share rewritten or removed in place since: the
// rework of the last 12 months. Without the activity, from the lines older
// than a year, which is wrong when old code was moved in: then unknown.
const oldCodeRewritten = (reworked, old, year_ago) => {
  if (!year_ago) return null;
  if (reworked !== undefined) return reworked / year_ago;
  return old <= year_ago ? 1 - old / year_ago : null;
};

// Shown next to what covers the whole repository, when a directory is
// selected.
const wholeRepository = computed(() => directory.value ? `All of ${name.value}` : undefined);
// The selected directory is as deep as the directories are tracked.
const untrackedBelow = computed(() => directory.value &&
  directory.value.split("/").length -
    (directory.value.startsWith("third_party/blink") ? 1 : 0) >= 3);

// The contributors cover the last 365 days when the data has them, or else
// the last complete year, and the last 3 calendar years for the top authors
// and the breadth of developers.
const recentContributors = computed(() => !!cohorts.value?.recent_contributors);
const contributorsPeriod = computed(() =>
  recentContributors.value ? "in the last 12 months" : `in ${lastYear}`);
const breadthPeriod = computed(() =>
  recentContributors.value ? "in the last 12 months" : `since ${lastYear - 1}`);

// The last complete year, for the activity and the contributors.
const lastYear = new Date().getUTCFullYear() - 1;
const yearIndex = (data, year) => data ? data.years.indexOf(year) : -1;

// The lines changed per year, by kind.
const activitySeries = computed(() => {
  const activity = scope.value?.activity;
  if (!activity) return [];
  return [
    { key: "new", label: "New code", color: "var(--series-3)", values: activity.new },
    { key: "iteration", label: "Iteration (lines < 1 year old)", color: "var(--series-1)", values: activity.iteration },
    { key: "rework", label: "Rework (lines ≥ 1 year old)", color: "var(--series-2)", values: activity.rework },
    { key: "mechanical", label: "Mechanical", color: "var(--faint)", values: activity.mechanical },
    { key: "removed", label: "Removed (net)", color: "var(--series-8)", values: activity.removed, negative: true },
  ];
});
// The activity of the last 365 days, estimated from the yearly counts: the
// current year, and the part of the previous one still in the window, as if
// spread evenly over that year. Like the importer does for the labels.
const recentActivity = activity => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const weight = Math.max(0, 1 - (now - Date.UTC(year, 0, 1)) / (365 * 86400e3));
  const value = (kind, year) => {
    const i = activity.years.indexOf(year);
    return i === -1 ? 0 : activity[kind][i];
  };
  return Object.fromEntries(["new", "iteration", "rework", "mechanical", "removed"]
    .map(kind => [kind, value(kind, year) + weight * value(kind, year - 1)]));
};

const activitySummary = computed(() => {
  const activity = scope.value?.activity;
  if (!activity) return "";
  const recent = recentActivity(activity);
  const development = recent.new + recent.iteration;
  const refactoring = recent.rework + recent.mechanical;
  const changed = development + refactoring;
  if (!changed) return "";
  return `${percent(development / changed)} development, ${percent(refactoring / changed)} refactoring over the last 12 months`;
});

// The authors per year, by number of commits.
const contributorSeries = computed(() => {
  const contributors = scope.value?.contributors;
  if (!contributors) return [];
  return [
    { key: "core", label: "Core (≥ 12 commits)", color: "var(--series-7)", values: contributors.core },
    { key: "regular", label: "Regular (3 to 11)", color: "var(--series-1)", values: contributors.regular },
    { key: "driveby", label: "Drive-by (1 or 2)", color: "var(--series-4)", values: contributors.driveby },
  ];
});
const topAuthors = computed(() => (scope.value?.top || [])
  .map(([username, commits], i) => ({ rank: i + 1, name: username, commits })));
const topOrganizations = computed(() => (scope.value?.top_organizations || [])
  .map(([org, commits], i) => ({ rank: i + 1, name: org, commits })));
const activeTopCommits = computed(() =>
  isOrganizations.value ? topOrganizations.value : topAuthors.value);

const peersOf = (pairs, self) => (pairs || [])
  .filter(([name]) => name !== self)
  .slice(0, 5);

const total = row => row.reduce((a, b) => a + b, 0);

const directoryFilter = ref("");
watch([repository, directory], () => directoryFilter.value = "");

const selectedOwners = computed(() => [
  ...organizations.value.map(name => ({ kind: "organization", key: `org:${name}`, name })),
  ...developers.value.map(name => ({ kind: "developer", key: `dev:${name}`, name })),
]);

const denomOf = entry => reviewed.value ? entry.reviewed_lines : entry.lines;

const children = computed(() => directories.value
  .filter(entry => entry.path !== directory.value && parentOf(entry.path) === directory.value)
  .map(entry => {
    const denom = denomOf(entry);
    return {
      ...entry,
      name: entry.path.slice(directory.value.length).replace(/^\//, ""),
      growth: entry.year_ago ? entry.lines / entry.year_ago - 1 : null,
      fresh: entry.recent / entry.lines,
      rewritten: oldCodeRewritten(entry.reworked, entry.lines - entry.recent, entry.year_ago),
      ...Object.fromEntries(selectedOwners.value.map((owner, i) => [`owned_${i}`,
        denom
          ? ((owner.kind === "organization"
              ? organizationOwnership.value.get(owner.name)
              : ownership.value.get(owner.name))?.get(entry.path) || 0) / denom
          : 0])),
    };
  }));

const filteredChildren = computed(() => {
  const q = directoryFilter.value.trim().toLowerCase();
  return q ? children.value.filter(row => row.name.toLowerCase().includes(q)) : children.value;
});

// For each year, the share of its lines removed during each following year,
// measured at the sample closest to each January 1st.
const reduction = computed(() => {
  const data = scope.value;
  if (!data) return { ages: [], rows: [] };
  const { dates, years, lines } = data;
  const january = {};
  const distance = (i, year) => Math.abs(new Date(dates[i]) - new Date(`${year}-01-01`));
  dates.forEach((date, i) => {
    const year = Number(date.slice(0, 4)) + (date.slice(5) > "07" ? 1 : 0);
    // Within 3 weeks, for the directories sampled every 4 weeks.
    if (distance(i, year) > 21 * 86400e3) return;
    if (january[year] === undefined || distance(i, year) < distance(january[year], year)) {
      january[year] = i;
    }
  });
  const rows = [];
  for (const year of years.filter(year => year !== "unknown")) {
    const column = years.indexOf(year);
    const values = [];
    for (let age = 1; ; age++) {
      const start = january[Number(year) + age];
      const end = january[Number(year) + age + 1];
      if (start === undefined || end === undefined) break;
      const before = lines[start][column];
      values.push(before ? 1 - lines[end][column] / before : null);
    }
    if (values.length) rows.push({ label: year, values });
  }
  const ages = Array.from(
    { length: Math.max(0, ...rows.map(row => row.values.length)) },
    (_, i) => i + 1);
  const median = ages.map((_, i) => {
    const values = rows.map(row => row.values[i])
      .filter(value => value !== null && value !== undefined)
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  });
  return {
    ages,
    rows: [{ label: "Median", values: median }, ...rows.reverse().map(row => ({
      ...row,
      values: ages.map((_, i) => row.values[i] ?? null),
    }))],
  };
});

// The value selected on the hexagonal grid of the reductions.
const crossed = shallowRef(null);
watch(scope, () => crossed.value = null);
const reductionYears = computed(() => reduction.value.rows
  .filter(row => row.label !== "Median")
  .map(row => ({ written: Number(row.label), values: row.values })));
const medianForAge = age => reduction.value.rows[0]?.values?.[age - 1] ?? null;

// The years for half of the lines of a year to be gone, with the median
// reduction of each age.
const halfLife = computed(() => {
  const median = reduction.value.rows[0]?.values || [];
  let alive = 1;
  for (let age = 0; age < median.length; age++) {
    if (median[age] === null) return null;
    const next = alive * (1 - median[age]);
    if (next <= 0.5) return age + (alive - 0.5) / (alive - next);
    alive = next;
  }
  return null;
});

// The headline figures of the selected scope.
const figures = computed(() => {
  const data = scope.value;
  if (!data?.recent) return [];
  const last = data.dates.length - 1;
  const now = new Date(data.dates[last]);
  // The last sample at least a year before.
  let before = last;
  while (before > 0 && now - new Date(data.dates[before]) < 365 * 86400e3) before--;
  const current = total(data.lines[last]);
  const recent = data.recent[last];
  const year_ago = hasHistory.value && before < last ? total(data.lines[before]) : null;
  const entry = directories.value.find(entry => entry.path === directory.value);
  const median_age = directory.value
    ? entry?.median_age ?? null
    : data.median_age !== null && data.median_age !== undefined ? data.median_age / 365.25 : null;
  const allLangLines = language.value
    ? (directory.value
        ? repoDirectories.value.find(item => item.path === directory.value)?.lines || 0
        : (repoCohorts.value ? total(repoCohorts.value.lines.at(-1)) : 0))
    : 0;
  const shareText = allLangLines > 0
    ? `${ownedShare(current / allLangLines) || "0%"} of ${directory.value || name.value}`
    : "";
  const growthText = year_ago ? `${signedPercent(current / year_ago - 1)} in a year` : "";
  const statusLabel = scopeSummary.value?.label;
  const figures = [
    {
      label: "Lines alive",
      hint: languageLabel.value
        ? `The ${languageLabel.value} lines in the repository or the directory today.`
        : "The lines in the repository or the directory today, without the third-party code and the translations. See \"How is this computed?\".",
      value: compact(current),
      detail: [shareText, growthText, statusLabel].filter(Boolean).join(" · "),
    },
    {
      label: "Fresh code",
      hint: "The share of the lines alive written in the last 365 days. High means a young or fast-changing codebase.",
      value: current ? percent(recent / current) : "—",
      detail: "written in the last 365 days",
    },
    {
      label: "Median line age",
      hint: "Half of the lines alive are older than this. It grows by one year per year when nothing is rewritten.",
      value: median_age === null || isNaN(median_age) ? "—" : `${median_age.toFixed(1)} years`,
      detail: halfLife.value ? `${halfLife.value.toFixed(1)} y half-life` : "half of the lines are older",
    },
  ];
  if (hasHistory.value) {
    figures.push({
      label: "Old code rewritten",
      hint: "Of the lines a year ago, the share of those a year old or more removed or rewritten in place since. How fast the existing code is renewed. Moved files and mechanical changes don't count. Estimated from the yearly counts.",
      value: percent(oldCodeRewritten(
        data.activity ? recentActivity(data.activity).rework : undefined,
        current - recent, year_ago)),
      detail: "of the lines a year ago, in 12 months",
    });
  }
  let counts = data.recent_contributors;
  if (!counts && data.contributors) {
    const i = yearIndex(data.contributors, lastYear);
    if (i !== -1) {
      counts = Object.fromEntries(["commits", "core", "regular", "driveby"]
        .map(key => [key, data.contributors[key][i]]));
      counts.authors = counts.core + counts.regular + counts.driveby;
    }
  }
  if (counts) {
    figures.push({
      label: "Authors (12m)",
      hint: `The developers with at least one commit here ${contributorsPeriod.value} (and core authors with 12+ commits), bots aside.`,
      value: lines(counts.authors),
      detail: `${lines(counts.core)} core · ${lines(counts.commits)} commits`,
    });
  }
  if (scopeSummary.value?.bus_factor !== undefined) {
    const reviewedBus = scopeSummary.value.bus_factor_reviewed;
    figures.push({
      label: "Bus factor",
      hint: busFactorHint,
      value: String(scopeSummary.value.bus_factor),
      detail: reviewedBus !== undefined
        ? `${reviewedBus} with reviewers`
        : "fewest authors for 50% of lines",
    });
  }
  return figures;
});

// The first year is skipped: all its lines are less than a year old.
const freshness = computed(() => {
  const series = (label, data) => {
    if (!data?.recent) return null;
    const start = new Date(data.dates[0]).getTime() + 365 * 86400e3;
    return {
      label,
      values: data.dates
        .map((date, i) => ({ x: new Date(date), y: data.recent[i] / total(data.lines[i]) }))
        .filter(point => point.x.getTime() >= start),
    };
  };
  return [
    directory.value ? series(directory.value, directoryData.value) : null,
    series(name.value, cohorts.value),
  ].filter(entry => entry);
});

// The selected developers: { username, dates, user } where user is
// { first, lines, total, directories }.
const developerUsers = shallowRef([]);
watch([developers, dataBase], async () => {
  const base = dataBase.value;
  const devs = developers.value;
  const buckets = await Promise.all(devs.map(username => fetchFile(
    `${base}/usernames/${usernameBucket(username)}.json`)));
  if (base !== dataBase.value) return;
  developerUsers.value = devs
    .map((username, i) => buckets[i]?.users[username] &&
      { username, dates: buckets[i].dates, user: buckets[i].users[username] })
    .filter(entry => entry);
}, { immediate: true });

const developerData = computed(() => developerUsers.value
  .filter(({ user }) => user.lines?.length > 1)
  .map(({ username, dates, user }) => ({
    label: username,
    values: user.lines.map((count, j) => ({ x: new Date(dates[user.first + j]), y: count })),
  })));

// The lines each selected developer or organization authored, or reviewed,
// alive today: name -> Map(path -> lines).
// The directories are referred to by their index in directories.json.
const hasReviewers = computed(() => !!cohorts.value?.reviewed_since);
const reviewed = computed(() => hasReviewers.value && knowledge.value === "reviewed");
const knowledgeVerb = computed(() => reviewed.value ? "reviewed" : "authored");
const directoryMapOf = entry => {
  const owned = new Map();
  const list = (reviewed.value ? entry?.reviewed : entry?.directories) || [];
  for (let i = 0; i < list.length; i += 2) {
    const dir = directories.value[list[i]];
    if (dir) owned.set(dir.path, list[i + 1]);
  }
  return owned;
};
const ownership = computed(() => new Map(developerUsers.value.map(({ username, user }) =>
  [username, directoryMapOf(user)])));

const activeOrgRecords = computed(() => organizationsBundle.value?.organizations || {});

const organizationOwnership = computed(() => {
  const orgs = activeOrgRecords.value;
  return new Map(Object.entries(orgs).map(([org, info]) => [org, directoryMapOf(info)]));
});

const organizationNames = computed(() => {
  const orgs = activeOrgRecords.value;
  return Object.entries(orgs)
    .sort((a, b) => ((b[1] as any).total || 0) - ((a[1] as any).total || 0) || a[0].localeCompare(b[0]))
    .map(([org]) => org);
});

const organizationData = computed(() => {
  const bundle = organizationsBundle.value;
  if (!bundle) return [];
  return organizations.value
    .map(org => {
      const info = bundle.organizations[org];
      if (!info?.lines || info.lines.length <= 1) return null;
      return {
        label: org,
        values: info.lines.map((count, j) => ({ x: new Date(bundle.dates[info.first + j]), y: count })),
      };
    })
    .filter(Boolean);
});

const activeSelected = computed(() => isOrganizations.value ? organizations.value : developers.value);
const activeLineData = computed(() => isOrganizations.value ? organizationData.value : developerData.value);

// The denominator of ownership shares in the selected scope: all lines alive
// when showing authored lines, or the lines with recorded human reviewers when
// showing reviewed lines.
const scopeTotalLines = computed(() => {
  if (directory.value) {
    return scopeSummary.value?.lines ?? (scope.value ? total(scope.value.lines.at(-1)) : 0);
  }
  return languageMeta.value?.lines ?? (scope.value ? total(scope.value.lines.at(-1)) : 0);
});

const scopeDenominator = computed(() => {
  if (!scope.value) return 0;
  return reviewed.value
    ? scopeSummary.value?.reviewed_lines || 0
    : scopeTotalLines.value;
});

// The share of the selected scope each developer or organization authored or
// reviewed, combined with their repo-wide breadth and removals.
const developerCards = computed(() => {
  if (!scope.value) return [];
  const scopeLines = scopeTotalLines.value;
  const denom = scopeDenominator.value;
  return developerUsers.value.map(({ username, user }) => {
    const owned = directory.value
      ? ownership.value.get(username)?.get(directory.value) || 0
      : reviewed.value
        ? user.reviewed_total || 0
        : (user.total ?? user.lines?.at(-1) ?? 0);
    return {
      name: username,
      owned,
      share: denom ? owned / denom : 0,
      allShare: scopeLines ? owned / scopeLines : 0,
      commits: user.commits,
      breadth: user.breadth,
      removals: user.removals,
    };
  });
});

const organizationCards = computed(() => {
  if (!scope.value || !organizationsBundle.value) return [];
  const orgs = activeOrgRecords.value;
  const scopeLines = scopeTotalLines.value;
  const denom = scopeDenominator.value;
  return organizations.value.map(org => {
    const info = orgs[org];
    const owned = directory.value
      ? organizationOwnership.value.get(org)?.get(directory.value) || 0
      : reviewed.value ? info?.reviewed_total || 0 : (info?.total ?? info?.lines?.at(-1) ?? 0);
    return {
      name: org,
      owned,
      share: denom ? owned / denom : 0,
      allShare: scopeLines ? owned / scopeLines : 0,
      commits: info?.commits,
      authors: info?.authors,
      breadth: info?.breadth,
      removals: info?.removals,
    };
  });
});

const activeCards = computed(() => isOrganizations.value ? organizationCards.value : developerCards.value);

// Where the lines each selected owner authored or reviewed are, under the
// selected directory, as a tree for the treemaps. Each directory also holds
// the lines outside of its listed subdirectories ("…").
const activeTrees = computed(() => {
  if (!scope.value) return [];
  const rootLines = scopeDenominator.value || scopeTotalLines.value;
  const mapSource = isOrganizations.value ? organizationOwnership.value : ownership.value;
  return activeCards.value.filter(entry => entry.owned > 0).map(({ name: ownerName, owned }) => {
    const owner = mapSource.get(ownerName) || new Map();
    const build = (path, label, lines, ownedHere) => {
      const sub = directories.value
        .filter(entry => entry.path !== path && parentOf(entry.path) === path &&
          owner.get(entry.path))
        .map(entry => build(entry.path, entry.path.slice(path.length).replace(/^\//, ""),
          denomOf(entry) || entry.lines, owner.get(entry.path)));
      const rest = ownedHere - sub.reduce((sum, child) => sum + child.owned, 0);
      if (sub.length && rest > 0) {
        sub.push({ key: `${path}/…`, name: "…", lines, owned: rest });
      }
      return { key: path || "/", path, name: label, lines, owned: ownedHere, children: sub };
    };
    return { name: ownerName, tree: build(directory.value, directory.value || name.value, rootLines, owned) };
  });
});

const leaderboardShowsReviewed = computed(() =>
  reviewed.value && (isOrganizations.value || leaderboardReviewed.value.length > 0));

const developerLeaderboard = computed(() => {
  const showRev = reviewed.value && leaderboardReviewed.value.length > 0;
  const list = showRev ? leaderboardReviewed.value : leaderboard.value;
  const denom = showRev
    ? cohorts.value?.reviewed_lines || 0
    : (languageMeta.value?.lines ?? (cohorts.value ? total(cohorts.value.lines.at(-1)) : 0));
  return list.map(entry => ({
    ...entry,
    name: entry.username,
    share: denom ? entry.lines / denom : undefined,
  }));
});

const organizationLeaderboard = computed(() => {
  if (!scope.value || !organizationsBundle.value) return [];
  const orgs = activeOrgRecords.value;
  const denom = scopeDenominator.value;
  return Object.entries(orgs)
    .map(([org, info]: [string, any]) => {
      const count = directory.value
        ? organizationOwnership.value.get(org)?.get(directory.value) || 0
        : reviewed.value ? info.reviewed_total || 0 : (info.total ?? info.lines?.at(-1) ?? 0);
      return {
        name: org,
        lines: count,
        share: denom ? count / denom : 0,
        peak: hasHistory.value && !directory.value && !reviewed.value ? info.peak : undefined,
        commits: info.commits,
        breadth: info.breadth?.effective,
      };
    })
    .filter(entry => entry.lines > 0)
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name))
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
});

const activeLeaderboard = computed(() =>
  isOrganizations.value ? organizationLeaderboard.value : developerLeaderboard.value);

const activeScatterPoints = computed(() => {
  if (!isOrganizations.value) return leaderboard.value;
  const orgs = organizationsBundle.value?.organizations || {};
  return Object.entries(orgs)
    .filter(([, info]: [string, any]) => info.breadth?.effective && info.commits)
    .map(([org, info]: [string, any]) => ({
      username: org,
      breadth: info.breadth.effective,
      commits: info.commits,
    }));
});

const leaderboardOptions = computed(() => [
  {
    value: "table",
    label: leaderboardShowsReviewed.value ? "Most lines reviewed" : "Most lines alive",
  },
  ...(activeTopCommits.value.length ? [{ value: "commits", label: "Most commits (12m)" }] : []),
  ...(activeScatterPoints.value.some(entry => entry.breadth && entry.commits) ? [{ value: "scatter", label: "Specialists vs generalists" }] : []),
]);

watch(leaderboardOptions, options => {
  if (!options.some(option => option.value === leaderboardView.value)) {
    leaderboardView.value = "table";
  }
});

// Whether the leaderboard header needs the "All of <repo>" scope tag when a
// subdirectory is selected.
const leaderboardRepoWide = computed(() =>
  leaderboardView.value === "scatter" || (!isOrganizations.value && leaderboardView.value === "table"));

const ownerLink = (ownerName: string) => isOrganizations.value
  ? { path: "/organizations/commits", query: { repositories: repository.value, organizations: ownerName } }
  : `/developers/${ownerName}`;

// Whether the scope bar is stuck at the top: its sentinel, just above it, is
// out of view.
const scopeSentinel = ref<HTMLElement | null>(null);
const scopeStuck = ref(false);
onMounted(() => {
  const observer = new IntersectionObserver(([entry]) =>
    scopeStuck.value = !entry.isIntersecting && entry.boundingClientRect.top < 0);
  observer.observe(scopeSentinel.value);
  onBeforeUnmount(() => observer.disconnect());
});

const toggleDeveloper = username => {
  developers.value = developers.value.includes(username)
    ? developers.value.filter(other => other !== username)
    : [...developers.value, username];
};

const toggleOrganization = org => {
  organizations.value = organizations.value.includes(org)
    ? organizations.value.filter(other => other !== org)
    : [...organizations.value, org];
};

const toggleActiveOwner = name => isOrganizations.value
  ? toggleOrganization(name)
  : toggleDeveloper(name);

const removeOwner = owner => owner.kind === "organization"
  ? toggleOrganization(owner.name)
  : toggleDeveloper(owner.name);

// The background of a cell, painted with the color of a developer or
// organization, darker for a larger share, on a logarithmic scale.
const paint = (share, ownerName) => share > 0
  ? { style: { background: `color-mix(in srgb, ${$color(ownerName)} ${Math.round(shareIntensity(share) * 70)}%, transparent)` } }
  : {};

// The state is in the URL. Selecting a repository or a directory adds an
// entry to the history, for the back and forward buttons. The other changes
// replace it.
const query = () => ({
  repository: repository.value === "chromium" ? undefined : repository.value,
  share: chartView.value === "share" ? "true" : chartView.value === "fresh" ? "fresh" : undefined,
  dir: directory.value || undefined,
  lang: language.value || undefined,
  developers: developers.value.join(",") || undefined,
  organizations: organizations.value.join(",") || undefined,
  by: ownerKind.value !== defaultOwnerKind(developers.value, organizations.value)
    ? ownerKind.value
    : undefined,
  hide: hidden.value || undefined,
  lines: knowledge.value === "reviewed" ? "reviewed" : undefined,
});
const sameQuery = (a, b) => {
  const defined = q => JSON.stringify(Object.entries(q)
    .filter(([, value]) => value !== undefined).sort());
  return defined(a) === defined(b);
};
watch([chartView, repository, directory, language, developers, organizations, ownerKind, hidden, knowledge],
  ([, newRepository, newDirectory], [, oldRepository, oldDirectory]) => {
    if (sameQuery(query(), route.query)) return;
    const navigation = newRepository !== oldRepository || newDirectory !== oldDirectory;
    router[navigation ? "push" : "replace"]({ query: query(), hash: route.hash });
  });

// Back and forward.
watch(() => route.query, value => {
  chartView.value = value.share === "fresh" ? "fresh" : value.share === "true" ? "share" : "lines";
  repository.value = value.repository || "chromium";
  directory.value = value.dir || "";
  language.value = (value.lang as string) || "";
  hidden.value = value.hide || "";
  knowledge.value = value.lines === "reviewed" ? "reviewed" : "authored";
  const devList = value.developers ? (value.developers as string).split(",") : [];
  if (devList.join(",") !== developers.value.join(",")) developers.value = devList;
  const orgList = value.organizations ? (value.organizations as string).split(",") : [];
  if (orgList.join(",") !== organizations.value.join(",")) organizations.value = orgList;
  ownerKind.value = kindFromQuery(value, devList, orgList);
});
</script>

<style scoped>
.chart {
  height: 500px;
}

.chart-toolbar {
  display: flex;
  justify-content: flex-end;
}

.muted-cell {
  color: var(--muted);
  font-size: 0.82em;
  margin-left: 0.15rem;
}

.directory-toolbar {
  display: flex;
  justify-content: flex-end;
}

.directory-filter {
  max-width: 240px;
}

.status-pill {
  background: var(--surface-sunken);
  border-radius: 999px;
  color: var(--ink-2);
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.1rem 0.55rem;
}

.status-pill.is-growing {
  background: color-mix(in srgb, var(--series-3) 18%, var(--surface));
  color: var(--ink);
}

.status-pill.is-shrinking {
  background: color-mix(in srgb, var(--series-8) 18%, var(--surface));
  color: var(--ink);
}

.status-pill.is-refactored {
  background: color-mix(in srgb, var(--series-2) 18%, var(--surface));
  color: var(--ink);
}

.status-pill.is-dormant {
  color: var(--muted);
}

.peer-link {
  background: none;
  border: none;
  color: var(--link, var(--series-1));
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-decoration: underline;
  text-decoration-style: dotted;
}

.peer-link:hover {
  text-decoration-style: solid;
}

.figures {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
}

@media (min-width: 769px) {
  .figures {
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    grid-template-columns: none;
  }
}

.figure {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  margin: 0 -1px -1px 0;
  padding: 0.9rem 1rem;
}

.figure-label {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 540;
}

.figure-value {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
  font-weight: 560;
  letter-spacing: -0.03em;
  margin-top: 0.1rem;
}

.figure-detail {
  color: var(--muted);
  font-size: 0.8rem;
}

.scope-bar {
  align-items: center;
  background: var(--bg);
  border-bottom: 1px solid transparent;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  padding: 0.5rem 0;
  position: sticky;
  top: 0;
  transition: border-color 0.15s, box-shadow 0.15s;
  z-index: 30;
}

.scope-bar.is-stuck {
  border-bottom-color: var(--line);
  box-shadow: 0 6px 8px -8px rgb(0 0 0 / 30%);
}

.scope-developers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.language-bar {
  display: flex;
  flex-wrap: wrap;
}

.language-chip {
  --chip: var(--series-1);
}

.developer-chip {
  align-items: center;
  background: color-mix(in srgb, var(--chip) 18%, var(--bg));
  border: 1px solid var(--chip);
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.85rem;
  gap: 0.25rem;
  padding: 0 0.2rem 0 0.6rem;
}

.developer-chip button {
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0.1rem 0.3rem;
}

.disclaimer {
  align-items: flex-start;
  background: var(--surface-sunken);
  border-radius: var(--radius);
  color: var(--ink-2);
  display: flex;
  font-size: 0.875rem;
  gap: 0.4rem;
  margin-bottom: 1rem;
  padding: 0.6rem 0.8rem;
}

.scope-tag {
  background: var(--surface-sunken);
  border-radius: 999px;
  color: var(--ink-2);
  font-size: 0.75rem;
  font-weight: 600;
  margin-right: 0.4rem;
  padding: 0.1rem 0.55rem;
}

.developer-controls {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.developer-input {
  flex: 1 1 280px;
}

.ownership {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  overflow: hidden;
}

.developer-card {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  margin: 0 -1px -1px 0;
  padding: 0.75rem 1rem;
}

.developer-card-meta {
  color: var(--ink-2);
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.ownership-treemaps {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}

.leaderboard-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  justify-content: space-between;
}

.swatch {
  border-radius: 2px;
  display: inline-block;
  height: 0.7rem;
  margin-right: 0.4rem;
  width: 0.7rem;
}

.hint {
  color: var(--muted);
}

.yearly-bars-grid {
  display: grid;
  gap: 0 2rem;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
}

.crossed-detail {
  color: var(--ink-2);
  font-size: 0.875rem;
  min-height: 1.5rem;
}
</style>
