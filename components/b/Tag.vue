<template>
  <div v-if="closable" class="tags has-addons inline-tags">
    <span class="tag" :class="[type, size, { 'is-rounded': rounded }]">
      <span><slot /></span>
    </span>
    <a
      role="button"
      tabindex="0"
      class="tag is-delete"
      :class="[size, { 'is-rounded': rounded }]"
      :aria-label="ariaCloseLabel"
      @click="emit('close', $event)"
      @keyup.delete.prevent="emit('close', $event)" />
  </div>
  <span v-else class="tag" :class="[type, size, { 'is-rounded': rounded }]">
    <span><slot /></span>
  </span>
</template>

<script setup lang="ts">
// A tag. Compatible with Buefy's <b-tag>.

defineProps<{
  type?: string;
  size?: string;
  rounded?: boolean;
  closable?: boolean;
  ariaCloseLabel?: string;
}>();

const emit = defineEmits<{ close: [event: Event] }>();
</script>
