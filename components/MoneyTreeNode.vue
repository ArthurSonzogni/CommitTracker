<template>
  <div class="tree-node" :class="{ 'is-open': isOpen || showCves }" :style="(isOpen || showCves) ? { backgroundColor: `hsl(0, 0%, ${95 - depth * 2}%)` } : {}">
    <div class="node-row" @click="toggle" :class="{ 'is-file': !hasChildren, 'is-open': isOpen || showCves }">
      <span class="node-count">{{ displayCount.toFixed(0) }}</span>
      <span class="node-reward">{{ formatter(displayValue) }}</span>

      <span class="icon-wrapper ml-2">
        <b-icon v-if="hasChildren" :icon="isOpen ? 'chevron-down' : 'chevron-right'" size="is-small"></b-icon>
        <b-icon v-else icon="file-document-outline" size="is-small"></b-icon>
      </span>
      <span class="node-name">{{ node.name }}</span>
    </div>

    <div v-if="showCves && node.cveIds && node.cveIds.length > 0" class="cve-list">
      <div v-for="cve in node.cves" :key="cve.id" class="cve-item">
        <span class="cve-reward">[{{ formatter(cve.vrp_reward) }}]</span>
        <a :href="'/cve?id=' + cve.id" target="_blank" @click.stop class="cve-link">
          {{ cve.id }}: {{ cve.title || cve.description }}
        </a>
      </div>
    </div>

    <div v-if="isOpen && hasChildren" class="node-children">
      <MoneyTreeNode v-for="child in node.children" :key="child.name" :node="child" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { format } from 'd3-format';
import { interpolate } from 'd3-interpolate';

const formatter = format("$,.0f");

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  }
});

const displayValue = ref(props.node.value);
const displayCount = ref(props.node.count);

const animateValue = (refVar: any, targetValue: number) => {
  const i = interpolate(refVar.value, targetValue);
  const duration = 500;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    refVar.value = i(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

watch(() => props.node.value, (newVal) => {
  animateValue(displayValue, newVal);
});

watch(() => props.node.count, (newVal) => {
  animateValue(displayCount, newVal);
});

const hasChildren = computed(() => props.node.children && props.node.children.length > 0);
const isOpen = ref(false);
const showCves = ref(false);

const toggle = () => {
  if (hasChildren.value) {
    isOpen.value = !isOpen.value;
  } else {
    showCves.value = !showCves.value;
  }
};
</script>

<style scoped>
.tree-node {
  font-family: monospace;
  font-size: 14px;
  border: 1px solid transparent;
  border-radius: 4px;
  margin: 2px 0;
  transition: border-color 0.2s, background-color 0.2s;
}
.tree-node:hover {
  border-color: rgba(0,0,0,0.1);
}
.tree-node.is-open {
  border-color: rgba(0,0,0,0.1);
}
.node-row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
}
.node-row:hover {
  background-color: #f5f5f5;
}
.node-row.is-open {
}
.icon-wrapper {
  width: 24px;
  display: inline-flex;
  justify-content: center;
  color: #555;
}
.node-name {
  margin-left: 4px;
  white-space: nowrap;
}
.is-file .node-name {
  color: #0056b3;
}
.node-reward {
  margin-left: 10px;
  color: #28a745;
  font-weight: bold;
  width: 100px;
  text-align: right;
}
.node-count {
  color: #dc3545;
  width: 40px;
  text-align: right;
}
.cve-list {
  margin-left: 174px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}
.cve-item {
  font-size: 12px;
}
.cve-reward {
  color: black;
  font-weight: bold;
  margin-right: 8px;
}
.cve-link {
  color: blue;
}
.cve-link:hover {
  text-decoration: underline;
}
.node-children {
  margin-left: 18px;
  padding-left: 4px;
}
</style>
