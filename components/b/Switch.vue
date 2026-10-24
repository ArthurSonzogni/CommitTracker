<template>
  <label class="switch" :class="[size, { 'is-disabled': disabled }]">
    <input
      v-model="value"
      type="checkbox"
      role="switch"
      :name="name"
      :disabled="disabled" />
    <span class="check" />
    <span class="control-label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
// An on/off switch. Compatible with Buefy's <b-switch>.

defineProps<{
  type?: string;
  size?: string;
  name?: string;
  disabled?: boolean;
}>();

const value = defineModel<boolean>();
</script>

<style scoped>
.switch {
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

.check {
  background: var(--line-strong);
  border-radius: 999px;
  flex-shrink: 0;
  height: 1.25em;
  position: relative;
  transition: background 0.15s;
  width: 2.25em;
}

/* The knob. */
.check::before {
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

input:checked + .check {
  background: var(--accent);
}

input:checked + .check::before {
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
