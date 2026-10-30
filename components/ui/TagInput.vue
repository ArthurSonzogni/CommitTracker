<template>
  <div ref="root" class="taginput control" :class="{ 'is-expanded': expanded }">
    <div
      class="taginput-container is-focusable"
      :class="{ 'is-focused': focused }"
      @click="input?.focus()">
      <span v-for="(tag, index) in tags" :key="index" class="tag is-primary">
        <span>{{ label(tag) }}</span>
        <a
          role="button"
          class="delete is-small"
          :aria-label="`Remove ${label(tag)}`"
          @click.stop="remove(index)" />
      </span>
      <div class="autocomplete control" :class="{ 'has-icons-left': icon }">
        <input
          ref="input"
          v-model="text"
          class="input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          :placeholder="placeholder"
          autocomplete="off"
          @input="emit('typing', text)"
          @focus="onFocus"
          @blur="focused = false"
          @keydown="onKeydown" />
        <UiIcon v-if="icon" :name="icon" class="is-left" size="small" />
        <div v-if="isOpen" class="dropdown-menu" role="listbox">
          <div class="dropdown-content">
            <div v-if="$slots.header" class="dropdown-header">
              <slot name="header" />
            </div>
            <a
              v-for="(option, index) in options"
              :key="label(option)"
              class="dropdown-item"
              role="option"
              :aria-selected="index === hovered"
              :class="{ 'is-hovered': index === hovered }"
              @mousedown.prevent
              @mouseenter="hovered = index"
              @click="add(option)">
              <slot :option="option" :index="index">{{ label(option) }}</slot>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A list of tags, picked from suggestions while typing. `typing` is emitted
// with the text, to update the suggestions. The default slot renders a
// suggestion.

const props = withDefaults(defineProps<{
  suggestions?: any[];
  // The property of the suggestions to display, or "this".
  field?: string;
  icon?: string;
  placeholder?: string;
  // Also accept the typed text.
  allowNew?: boolean;
  // Show the suggestions on focus, before typing.
  openOnFocus?: boolean;
  expanded?: boolean;
}>(), {
  suggestions: () => [],
  field: "this",
});

const tags = defineModel<any[]>({ default: () => [] });
const emit = defineEmits<{ typing: [text: string] }>();

const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const text = ref("");
const focused = ref(false);
// The suggestion selected with the arrow keys, if any.
const hovered = ref(-1);

const label = (option: any) => props.field === "this" || typeof option !== "object"
  ? option
  : option?.[props.field];

// The suggestions, without the tags already selected.
const options = computed(() => props.suggestions.filter(option =>
  !tags.value.some(tag => label(tag) === label(option))));

const isOpen = computed(() => focused.value &&
  (options.value.length > 0) && (props.openOnFocus || text.value.length > 0));

watch(options, () => { hovered.value = -1; });

const onFocus = () => {
  focused.value = true;
  if (props.openOnFocus) {
    emit("typing", text.value);
  }
};

const add = (option: any) => {
  if (!tags.value.some(tag => label(tag) === label(option))) {
    tags.value = [...tags.value, option];
  }
  text.value = "";
  emit("typing", "");
};

const remove = (index: number) => {
  tags.value = tags.value.filter((_, i) => i !== index);
};

const onKeydown = (event: KeyboardEvent) => {
  const count = options.value.length;
  if (event.key === "ArrowDown" && count) {
    event.preventDefault();
    hovered.value = (hovered.value + 1) % count;
  } else if (event.key === "ArrowUp" && count) {
    event.preventDefault();
    hovered.value = (hovered.value - 1 + count) % count;
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (hovered.value >= 0 && hovered.value < count) {
      add(options.value[hovered.value]);
    } else if (props.allowNew && text.value.trim()) {
      add(text.value.trim());
    }
  } else if (event.key === "Backspace" && !text.value && tags.value.length) {
    remove(tags.value.length - 1);
  } else if (event.key === "Escape") {
    input.value?.blur();
  }
};

</script>

<style scoped>
.taginput-container {
  align-items: center;
  cursor: text;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  min-height: 2.25rem;
  padding: 0.2rem 0.4rem;
}


.taginput-container .tag {
  gap: 0.25rem;
  margin: 0;
}

.autocomplete {
  flex: 1;
  min-width: 4rem;
  position: relative;
}

.autocomplete .input {
  background: transparent;
  border: none;
  box-shadow: none;
  height: 1.7rem;
}

.autocomplete .icon.is-left {
  color: var(--faint);
  height: 1.7rem;
  left: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
}

.has-icons-left .input {
  padding-left: 2em;
}

.dropdown-menu {
  display: block;
  left: 0;
  min-width: 100%;
  position: absolute;
  top: 100%;
  z-index: 20;
}

.dropdown-content {
  max-height: 60vh;
  overflow-y: auto;
}

.dropdown-header {
  padding: 0.5rem 0.75rem;
}

.dropdown-item {
  cursor: pointer;
  white-space: normal;
}

.dropdown-item.is-hovered {
  background: var(--surface-sunken);
}
</style>
