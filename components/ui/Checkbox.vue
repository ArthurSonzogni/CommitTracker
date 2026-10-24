<template>
  <label class="ui-checkbox" :class="{ 'is-disabled': disabled }">
    <input
      v-model="model"
      type="checkbox"
      :value="value"
      :name="name"
      :disabled="disabled" />
    <span class="check" />
    <span class="control-label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
// A checkbox. Its v-model is a boolean, or an array containing `value` when
// checked.

defineProps<{
  value?: any;
  name?: string;
  disabled?: boolean;
}>();

const model = defineModel<any>();
</script>

<style scoped>
.ui-checkbox {
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
.check::after {
  border: solid #fff;
  border-width: 0 2px 2px 0;
  content: "";
  height: 0.55em;
  margin-top: -0.12em;
  opacity: 0;
  transform: rotate(45deg);
  width: 0.3em;
}

input:checked + .check {
  background: var(--accent);
  border-color: var(--accent);
}

input:checked + .check::after {
  opacity: 1;
}

input:focus-visible + .check {
  box-shadow: var(--ring);
}

.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

</style>
