<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="palette-dialog"
      aria-label="Search pages, repositories and developers"
      @mousedown.self="close"
      @close="close">
      <div v-if="open" class="palette">
        <div class="palette-input">
          <UiIcon name="magnify" class="palette-input-icon" size="small"></UiIcon>
          <input
            ref="input"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            :aria-activedescendant="results.length ? `palette-results-${active}` : undefined"
            placeholder="Search pages, repositories, developers, CVE ids…"
            autocomplete="off"
            spellcheck="false"
            @keydown="onPaletteKeydown"
          />
          <kbd>Esc</kbd>
        </div>

        <SearchResults
          id="palette-results"
          :results="results"
          :active="active"
          @hover="active = $event"
          @select="select"
        />

        <div class="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
// Shared with the navbar's search button.
const open = useState("command-palette-open", () => false);

const close = () => {
  open.value = false;
};

const { query, active, results, loadUsernames, select, onKeydown } =
  useSiteSearch({ onSelect: close });

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);

// As a native modal <dialog>, the page behind is inert, and the focus returns
// to where it was on close.
watch(open, async (value) => {
  if (!value) {
    dialog.value?.close();
    return;
  }
  query.value = "";
  active.value = 0;
  await nextTick();
  dialog.value?.showModal();
  input.value?.focus();
  loadUsernames();
});

const onPaletteKeydown = (event: KeyboardEvent) => {
  if (onKeydown(event)) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "Tab") {
    // Keep the focus inside the dialog.
    event.preventDefault();
  }
};

const onGlobalKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    open.value = !open.value;
  }
};

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));
</script>

<style scoped>
/* The dialog covers the viewport, so that a click outside of the palette
 * lands on it. */
.palette-dialog {
  background: transparent;
  border: none;
  color: inherit;
  height: 100%;
  margin: 0;
  max-height: none;
  max-width: none;
  padding: 12vh 1rem 1rem;
  width: 100%;
}

.palette-dialog[open] {
  align-items: flex-start;
  display: flex;
  justify-content: center;
}

.palette-dialog::backdrop {
  animation: fade-in 120ms ease-out;
  backdrop-filter: blur(3px);
  background: rgba(18, 18, 22, 0.28);
}

.palette {
  animation: pop-in 160ms cubic-bezier(0.2, 0, 0, 1);
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 64px -16px rgba(18, 18, 22, 0.35), 0 0 0 1px rgba(18, 18, 22, 0.08);
  display: flex;
  flex-direction: column;
  max-height: min(32rem, 76vh);
  overflow: hidden;
  width: min(38rem, 100%);
}

.palette-input {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 0.6rem;
  padding: 0 1rem;
}

.palette-input-icon {
  color: var(--faint);
}

.palette-input input {
  background: transparent;
  border: none;
  color: var(--ink);
  flex: 1;
  font-size: 1rem;
  height: 3.25rem;
  min-width: 0;
  outline: none;
}

.palette-input input::placeholder {
  color: var(--faint);
}

kbd {
  background: var(--surface-sunken);
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 5px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  margin-right: 0.2rem;
  padding: 0.05rem 0.35rem;
}

.palette-footer {
  border-top: 1px solid var(--line);
  color: var(--faint);
  display: flex;
  font-size: 0.75rem;
  gap: 1rem;
  padding: 0.55rem 1rem;
}

@keyframes fade-in {
  from { opacity: 0; }
}

@keyframes pop-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
}
</style>
