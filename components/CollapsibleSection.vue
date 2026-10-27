<template>
  <!-- A section whose title folds and unfolds its content, with an anchor
       and a button copying the link to it. -->
  <section :id="id" class="collapsible-section">
    <h2 class="title is-4">
      <button type="button" class="collapsible-toggle" :aria-expanded="!collapsed"
        @click="emit('toggle')">
        <UiIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" size="small" />
        <span>{{ title }}</span>
      </button>
      <a class="section-link" :href="`#${id}`" :title="`Link to ${title}`"
        :aria-label="`Link to ${title}`">
        <UiIcon name="link-variant" size="small" />
      </a>
      <button type="button" class="section-link" :title="`Copy the link to ${title}`"
        :aria-label="`Copy the link to ${title}`" @click="copy">
        <UiIcon :name="copied ? 'check' : 'content-copy'" size="small" />
      </button>
    </h2>
    <div v-if="!collapsed">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  id: string;
  title: string;
  collapsed: boolean;
}>();
const emit = defineEmits(["toggle"]);

// Copies the current page, with its state, scrolled to this section. Like the
// share button of the navbar: shared on touch devices, copied elsewhere.
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
const copy = async () => {
  const url = `${location.origin}${location.pathname}${location.search}#${props.id}`;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: `${props.title} - ${document.title}`, url });
    } catch (e) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => copied.value = false, 1600);
  } catch (e) {
    showToast({ message: "Could not copy the link", type: "is-danger" });
  }
};
</script>

<style scoped>
.collapsible-section {
  margin-top: 3rem;
  scroll-margin-top: 4.5rem;
}

.collapsible-toggle {
  align-items: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: 0.4rem;
  padding: 0;
}

.collapsible-toggle:hover span {
  text-decoration: underline;
}

h2 {
  align-items: center;
  display: flex;
  gap: 0.25rem;
}

.section-link {
  align-items: center;
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  padding: 0.3rem;
}

.section-link:hover {
  background: var(--surface-sunken);
  color: var(--ink);
}
</style>
