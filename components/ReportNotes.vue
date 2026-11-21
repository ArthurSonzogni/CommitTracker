<template>
  <section class="notes">
    <h2 class="panel-title">Notes</h2>
    <ul>
      <li>
        Source: the commits of the {{ repositoryName }} repository. The commits of the bots
        are not counted. Each author is identified by
        <template v-if="githubLogins">their GitHub login,</template>
        <template v-else>the part of their email address before the <code>@</code>,</template>
        so the same person is counted once and followed from one year to the next.
      </li>
      <li>
        Organizations: each commit counts for the organization of its author at the time,
        from the email domain and the
        <NuxtLink to="/organizations/emails">known affiliations</NuxtLink>.
        <em>Everyone else</em> is all the organizations other than {{ topOrganization }},
        the individuals, and the unknown email domains.
      </li>
      <li>
        The period: {{ windowLength }} months, against the same months a year
        earlier. A single month can be unusual; three months are steadier. By default, the
        period ends with the last complete month. Another period can be picked on the side,
        and is kept in the link. Figures can shift slightly when identities are corrected.
      </li>
      <li>
        The same people: the people with at least {{ minWindow }} commits in both
        periods, each counted in the organization of most of their commits. By year, the
        median of their changes. Month by month, the average change instead (a geometric
        mean, where doubling and halving cancel out): commit counts are small whole numbers,
        and a monthly median sits at exactly 0% for long stretches. Months with fewer than
        10 such people are left blank.
      </li>
      <li>
        The developers ranked by commits: each person and month with at least one commit,
        ranked by their commits that month. At each percentile, the commit size is the
        median of the median commit of the people ranked around it.
      </li>
      <li>
        Commit size is the number of lines added plus deleted, as a median: a few very large
        commits don't move it.
        <template v-if="reviewsFrom">
          Reviews come from the commit message trailers, compared from
          {{ reviewsFrom.slice(0, 4) }}, once they are recorded steadily.
        </template>
        <template v-else>
          Reviews aren't shown: this repository doesn't record them consistently over time.
        </template>
      </li>
      <li>
        Commit message length counts the characters of the headline and body with trailing
        footers and trailers removed, excluding reverts and rolls. Reverts, check bypasses
        (<code>No-Try</code>, <code>No-Presubmit</code>, <code>Owners-Override</code>,
        <code>Bypass-*</code>, <code>Low-Coverage-Reason</code>), and bug links are parsed
        directly from commit messages.
      </li>
      <li>
        This shows when and how much output changed, not why: the commit history doesn't
        say how a change was written. Commits and lines measure output, not value.
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  repositoryName: string;
  githubLogins?: boolean;
  topOrganization: string;
  windowLength: number;
  minWindow: number;
  reviewsFrom?: string | null;
}>();
</script>

<style scoped>
.panel-title {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 640;
  margin-bottom: 0.15rem;
  text-wrap: balance;
}

.notes {
  color: var(--ink-2);
  font-size: 0.88rem;
  max-width: 85ch;
}

.notes ul {
  list-style: disc;
  margin: 0.5rem 0 0 1.2rem;
}

.notes li + li {
  margin-top: 0.3rem;
}
</style>
