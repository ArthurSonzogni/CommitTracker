<template>
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
        HTML/JS/TS, Java, Python, Rust, Carbon, Markdown).
      </li>
    </ul>
  </AboutData>
</template>

<script setup lang="ts">
defineProps<{
  directory: string;
  name: string;
  repository: string;
  repoMeta?: { owner: string; repository: string } | null;
  repoSpecificExclusions: string;
  hasReviewers: boolean;
  reviewedSince: string;
  breadthPeriod: string;
}>();
</script>
