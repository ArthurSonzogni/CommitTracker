<template>
  <section class="emails-panel mt-5">
    <div class="inspector-head">
      <div class="inspector-title-wrap">
        <span
          class="inspector-dot"
          :style="{ background: color }"
        />
        <h2 class="inspector-title">{{ entry.org }}</h2>
      </div>
      <NuxtLink
        :to="commitsLink"
        class="commits-link"
      >
        View commits
        <UiIcon name="arrow-right" size="small" />
      </NuxtLink>
    </div>

    <p class="inspector-meta mt-1">
      <strong>{{ fmtInt(entry.emails.length) }}</strong>
      {{ entry.emails.length === 1 ? "email" : "emails" }}
      · {{ fmtInt(entry.usernameCount) }}
      {{ entry.usernameCount === 1 ? "unique username" : "unique usernames" }}
      · {{ fmtInt(entry.domains.length) }}
      {{ entry.domains.length === 1 ? "domain" : "domains" }}
    </p>

    <!-- Domain Filter Chips -->
    <div v-if="entry.domains.length > 0" class="inspector-section mt-4">
      <div class="inspector-section-head">
        <span>Domains</span>
        <button
          v-if="selectedDomain"
          type="button"
          class="domain-clear"
          @click="emit('update:selectedDomain', null)"
        >
          Show all
        </button>
      </div>
      <div class="domain-strip">
        <button
          v-for="d in entry.domains"
          :key="d.domain"
          type="button"
          class="domain-chip"
          :class="{ 'is-active': selectedDomain === d.domain }"
          @click="emit('toggleDomain', d.domain)"
        >
          <span class="domain-name">@{{ d.domain }}</span>
          <span class="domain-count">{{ fmtInt(d.count) }}</span>
        </button>
      </div>
    </div>

    <!-- Email Grid -->
    <div class="inspector-section mt-4">
      <div class="inspector-section-head">
        <span>
          Emails
          <template v-if="selectedDomain">
            in <code>@{{ selectedDomain }}</code>
          </template>
        </span>
        <span class="muted-text">{{ fmtInt(emailsFiltered.length) }}</span>
      </div>

      <ul class="email-list">
        <li
          v-for="email in emailsFiltered.slice(0, emailLimit)"
          :key="email"
          class="email-item"
        >
          <NuxtLink
            :to="individualLink(email)"
            class="email-pill"
            :title="email"
          >
            {{ email }}
          </NuxtLink>
        </li>
      </ul>

      <div
        v-if="emailsFiltered.length > emailLimit"
        class="drawer-actions mt-3"
      >
        <button
          type="button"
          class="more-btn"
          @click="emit('update:emailLimit', emailLimit + 120)"
        >
          Show 120 more ({{ fmtInt(emailsFiltered.length - emailLimit) }} remaining)
        </button>
        <button
          type="button"
          class="ghost-btn"
          @click="emit('update:emailLimit', emailsFiltered.length)"
        >
          Show all {{ fmtInt(emailsFiltered.length) }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

export interface DomainBucket {
  domain: string;
  count: number;
}

export interface OrgEmailEntry {
  org: string;
  emails: string[];
  usernameCount: number;
  domains: DomainBucket[];
}

defineProps<{
  entry: OrgEmailEntry;
  color: string;
  commitsLink: RouteLocationRaw;
  emailsFiltered: string[];
  selectedDomain: string | null;
  emailLimit: number;
  individualLink: (email: string) => RouteLocationRaw;
}>();

const emit = defineEmits<{
  "update:selectedDomain": [value: string | null];
  "update:emailLimit": [value: number];
  toggleDomain: [domain: string];
}>();

const intFmt = new Intl.NumberFormat("en");
const fmtInt = (n: number) => intFmt.format(n);
</script>

<style scoped>
.emails-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 1.25rem 1.35rem;
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.inspector-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.inspector-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.inspector-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink);
}

.inspector-meta {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.inspector-meta strong {
  color: var(--ink);
}

.commits-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.34rem 0.7rem;
  border-radius: var(--radius-sm);
  font-size: 0.83rem;
  font-weight: 500;
  color: var(--accent-ink);
  background: var(--accent-soft);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.commits-link:hover {
  text-decoration: underline;
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.inspector-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.domain-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.domain-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-sunken);
  color: var(--ink-2);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}

.domain-chip:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.domain-chip.is-active,
.domain-chip.is-match {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.domain-name {
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.domain-count {
  font-variant-numeric: tabular-nums;
  font-size: 0.73rem;
  opacity: 0.75;
}

.domain-clear {
  border: 0;
  background: transparent;
  color: var(--accent-ink);
  font-size: 0.76rem;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
  padding: 0.12rem 0.4rem;
  border-radius: var(--radius-sm);
}

.domain-clear:hover {
  background: var(--accent-soft);
}

.email-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.15rem 1rem;
}

.email-item {
  min-width: 0;
}

.email-pill {
  display: block;
  padding: 0.25rem 0.45rem;
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.email-pill:hover {
  color: var(--accent-ink);
  background: var(--accent-soft);
}

.email-pill.is-match {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.more-btn,
.ghost-btn {
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.35rem 0.75rem;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.more-btn {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
}

.more-btn:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.ghost-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
}

.ghost-btn:hover {
  color: var(--ink);
  background: var(--surface-sunken);
}
</style>
