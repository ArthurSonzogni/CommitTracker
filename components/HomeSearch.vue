<template>
  <div class="home-search" :class="{ 'is-open': focused }">
    <div class="home-search-field">
      <b-icon icon="magnify" class="home-search-icon"></b-icon>
      <input
        ref="input"
        v-model="query"
        type="search"
        role="combobox"
        :aria-expanded="focused"
        aria-controls="home-search-results"
        :aria-activedescendant="focused && results.length ? `home-search-results-${active}` : undefined"
        aria-label="Search pages, repositories, developers and CVE ids"
        placeholder="Search developers, repositories, CVEs…"
        autocomplete="off"
        spellcheck="false"
        @focus="onFocus"
        @blur="focused = false"
        @keydown="onSearchKeydown"
      />
      <button
        v-if="query"
        class="home-search-clear"
        aria-label="Clear the search"
        @mousedown.prevent
        @click="query = ''; input?.focus()">
        <b-icon icon="close-circle" size="is-small"></b-icon>
      </button>
    </div>
    <div v-if="focused" class="home-search-panel">
      <SearchResults
        id="home-search-results"
        :results="results"
        :active="active"
        @hover="active = $event"
        @select="select"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);

const { query, active, results, loadUsernames, select, onKeydown } =
  useSiteSearch({ emptyResults: 6 });

const onFocus = () => {
  focused.value = true;
  loadUsernames();
};

const onSearchKeydown = (event: KeyboardEvent) => {
  if (onKeydown(event)) {
    return;
  }
  if (event.key === "Escape") {
    input.value?.blur();
  }
};
</script>

<style scoped>
.home-search {
  max-width: 40rem;
  position: relative;
}

.home-search-field {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px -12px rgba(18, 18, 22, 0.18), var(--shadow-xs);
  display: flex;
  gap: 0.5rem;
  padding: 0 1rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.is-open .home-search-field {
  border-color: var(--accent);
  box-shadow: var(--ring), 0 8px 24px -12px rgba(18, 18, 22, 0.18);
}

.home-search-icon {
  color: var(--faint);
}

.home-search-field input {
  background: transparent;
  border: none;
  color: var(--ink);
  flex: 1;
  font-size: 1.05rem;
  height: 3.4rem;
  min-width: 0;
  outline: none;
}

/* Replaced by .home-search-clear. */
.home-search-field input::-webkit-search-cancel-button {
  appearance: none;
}

.home-search-clear {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--faint);
  cursor: pointer;
  display: flex;
  height: 2rem;
  justify-content: center;
  width: 2rem;
}

.home-search-clear:hover {
  background: var(--surface-sunken);
  color: var(--ink-2);
}

.home-search-field input::placeholder {
  color: var(--faint);
}

.home-search-panel {
  animation: pop-in 140ms cubic-bezier(0.2, 0, 0, 1);
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  left: 0;
  max-height: min(24rem, 60vh);
  overflow: hidden;
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  z-index: 30;
  display: flex;
  flex-direction: column;
}

@keyframes pop-in {
  from { opacity: 0; transform: translateY(-4px); }
}
</style>
