<template>
  <label
    :class="[
      variant === 'switch' ? 'ui-switch' : 'ui-checkbox',
      { 'is-disabled': disabled },
    ]">
    <input
      v-model="model"
      type="checkbox"
      :role="variant === 'switch' ? 'switch' : undefined"
      :value="value"
      :name="name"
      :disabled="disabled" />
    <span class="check" />
    <span class="control-label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
// A checkbox or switch. Its v-model is a boolean, or an array containing
// `value` when checked.

withDefaults(defineProps<{
  value?: any;
  name?: string;
  disabled?: boolean;
  variant?: "checkbox" | "switch";
}>(), {
  variant: "checkbox",
});

const model = defineModel<any>();
</script>

<style scoped>
.ui-checkbox,
.ui-switch {
  align-items: center;
  cursor: pointer;
  display: inline-flex;
  gap: 0.5em;
  margin-right: 0.5em;
  position: relative;
  user-select: none;
}

input {
  height: 1px;
  left: 0;
  opacity: 0;
  position: absolute;
  width: 1px;
}

.ui-checkbox .check {
  align-items: center;
  background: var(--surface);
  border: 1.5px solid var(--line-strong);
  border-radius: 5px;
  box-shadow: var(--shadow-xs);
  display: inline-flex;
  flex-shrink: 0;
  height: 1.15em;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
  width: 1.15em;
}

/* The check mark. */
.ui-checkbox .check::after {
  border: solid #fff;
  border-width: 0 2px 2px 0;
  content: "";
  height: 0.55em;
  margin-top: -0.12em;
  opacity: 0;
  transform: rotate(45deg);
  width: 0.3em;
}

.ui-checkbox input:checked + .check {
  background: var(--accent);
  border-color: var(--accent);
}

.ui-checkbox input:checked + .check::after {
  opacity: 1;
}

.ui-switch .check {
  background: var(--line-strong);
  border-radius: 999px;
  flex-shrink: 0;
  height: 1.25em;
  position: relative;
  transition: background 0.15s;
  width: 2.25em;
}

/* The knob. */
.ui-switch .check::before {
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  content: "";
  height: 1em;
  left: 0.125em;
  position: absolute;
  top: 0.125em;
  transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1);
  width: 1em;
}

.ui-switch input:checked + .check {
  background: var(--accent);
}

.ui-switch input:checked + .check::before {
  transform: translateX(1em);
}

input:focus-visible + .check {
  box-shadow: var(--ring);
}

.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
