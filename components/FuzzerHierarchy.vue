<script setup lang="ts">

const props = defineProps({
  name: { type: String },
  authors: { type: Array },
  children: { type: Array },
  collapsed_default: { type: Boolean, default: true },
});

let collapsed = ref(props.collapsed_default);

let authors_accu = computed(() => {
  if (!props.authors) return [];

  let authors_map = new Map<string, number>();
  for (let author of props.authors) {
    const old = authors_map.get(author) || 0;
    authors_map.set(author, old + 1);
  }

  return Array
    .from(authors_map)
    .sort((a, b) => b[1] - a[1])
    .map((a) => `${a[0]} (x${a[1]})`);
});

</script>


<template>
  <div>
    <div @click="collapsed = !collapsed" class="clickable_area">
      <span v-if="children && children.length">
        <b-icon icon="chevron-right"
          :style="{
            transform: 'rotate(' + (collapsed ? 0 : 90) + 'deg)',
            transition: 'transform 0.2s',
          }"
        />
      </span>
      <b-icon v-else icon="empty"/>
      <b-tag type="is-primary"
        v-if="children.length"
        :style="{
          width: '4em',
          'margin-right': '1em',
        }"
      >
        {{ authors.length }}
      </b-tag>
      {{name}}
      <Transition name="fade">
      <span v-if="authors_accu && authors_accu.length && (collapsed ||
        children.length == 0)">
        <span class="m-3"/>
          <b-tag
            type="is-warning"
            class="mr-1 mb-1"
            v-for="author in authors_accu.slice(0,5)">
            {{author}}
          </b-tag>
          <b-tag
            v-if="authors_accu.length > 5"
            type="is-warning"
            class="mr-1 mb-1"
            >...</b-tag>
        </span>
      </Transition>
    </div>
    <TransitionGroup name="fade">
      <FuzzerHierarchy
        v-if="children && !collapsed"
        class="recursive-list"
        v-for="child in children"
        :key="child.name"
        :name="child.name"
        :authors="child.authors"
        :children="child.children"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
  .recursive-list {
    margin: 5px 0 0 1em;
    background-color: rgba(0,0,0,0.05);
    border-radius: 15px 0 0 15px;
  }

  .clickable_area {
    display: flex;
    align-items: center;
    padding: 10px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .clickable_area:hover {
    background-color: rgba(152,128,157,0.2);
    border-radius: 15px 0 0 15px;
  }

  .fade-enter-active {
    transition: all 0.4s ease-out;
  }

  .fade-leave-active {
  }

  .fade-enter-from,
  .fade-leave-to {
    transform: translateX(10px);
    opacity: 0;
  }

</style>
