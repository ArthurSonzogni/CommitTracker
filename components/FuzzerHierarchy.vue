<script setup lang="ts">

const props = defineProps({
  name: { type: String },
  path: { type: String },
  count: { type: Number },
  children: { type: Array },
  collapsed_default: { type: Boolean, default: true },
});

let collapsed = ref(props.collapsed_default);

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
        :style="{
          width: '4em',
          'margin-right': '1em',
          background: 'hsv(' + (count * 30) + ', 100%, 100%) !important',
        }"
      >{{count}}</b-tag>
      {{name}}
    </div>
    <TransitionGroup name="fade">
      <FuzzerHierarchy
        v-if="children && !collapsed"
        class="recursive-list"
        v-for="child in children"
        :key="child.name"
        :name="child.name"
        :count="child.count"
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
