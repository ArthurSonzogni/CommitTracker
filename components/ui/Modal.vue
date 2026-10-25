<template>
  <Teleport to="body">
    <dialog ref="dialog" class="ui-modal" @mousedown.self="active = false" @close="active = false">
      <div class="modal-content" tabindex="-1" autofocus :style="{ width: typeof width === 'number' ? `${width}px` : width }">
        <slot />
      </div>
      <button type="button" class="modal-close is-large" aria-label="Close" @click="active = false" />
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
// A modal dialog, closed with Escape or by clicking outside. As a native
// <dialog>, the page behind is inert, and the focus returns to where it was.

defineProps<{ width?: number | string }>();

const active = defineModel<boolean>({ default: false });
const dialog = ref<HTMLDialogElement | null>(null);

watchEffect(() => {
  if (!dialog.value || active.value === dialog.value.open) {
    return;
  }
  if (active.value) {
    dialog.value.showModal();
  } else {
    dialog.value.close();
  }
});
</script>

<style scoped>
/* The dialog covers the viewport, so that a click outside of the content
 * lands on it. */
.ui-modal {
  background: transparent;
  border: none;
  color: inherit;
  height: 100%;
  margin: 0;
  max-height: none;
  max-width: none;
  opacity: 0;
  overflow: hidden;
  padding: 0;
  transition: opacity 0.15s, display 0.15s allow-discrete, overlay 0.15s allow-discrete;
  width: 100%;
}

.ui-modal[open] {
  align-items: center;
  display: flex;
  justify-content: center;
  opacity: 1;
}

@starting-style {
  .ui-modal[open] {
    opacity: 0;
  }
}

.ui-modal::backdrop {
  backdrop-filter: blur(3px);
  background: rgba(18, 18, 22, 0.35);
  opacity: 0;
  transition: opacity 0.15s, display 0.15s allow-discrete, overlay 0.15s allow-discrete;
}

.ui-modal[open]::backdrop {
  opacity: 1;
}

@starting-style {
  .ui-modal[open]::backdrop {
    opacity: 0;
  }
}

.modal-content {
  max-width: calc(100vw - 2rem);
}

/* It takes the focus on open, as a whole. */
.modal-content:focus {
  outline: none;
}
</style>
