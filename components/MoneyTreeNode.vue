<template>
  <div
    class="tree-node"
    :class="{ 'is-open': isOpen || showCves }"
    :style="{ '--node-depth': Math.min(depth, 6) }">
    <div
      class="node-row"
      :class="{ 'is-file': !hasChildren, 'is-open': isOpen || showCves }"
      @click="toggle">
      <span class="node-count">{{ displayCount.toFixed(0) }}</span>
      <span class="node-reward">{{ formatter(displayValue) }}</span>

      <span class="icon-wrapper ml-2">
        <UiIcon v-if="hasChildren" :name="isOpen ? 'chevron-down' : 'chevron-right'" size="small" />
        <UiIcon v-else name="file-document-outline" size="small" />
      </span>
      <span class="node-name">{{ node.name }}</span>
    </div>

    <div v-if="showCves && node.cveIds && node.cveIds.length > 0" class="cve-list">
      <div v-for="cve in node.cves" :key="cve.id" class="cve-item">
        <span class="cve-reward">[{{ formatter(cve.vrp_reward) }}]</span>
        <a :href="'/cve?id=' + cve.id" target="_blank" class="cve-link" @click.stop>
          {{ cve.id }}: {{ cve.title || cve.description }}
        </a>
      </div>
    </div>

    <div v-if="isOpen && hasChildren" class="node-children">
      <MoneyTreeNode
        v-for="child in node.children"
        :key="child.name"
        :node="child"
        :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, type Ref } from "vue";
import { format } from "d3-format";
import { interpolate } from "d3-interpolate";

const formatter = format("$,.0f");

const props = defineProps({
  node: {
    type: Object,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
});

const displayValue = ref<number>(props.node.value);
const displayCount = ref<number>(props.node.count);

const rafIds = new Map<Ref<number>, number>();

const cancelAnim = (refVar: Ref<number>) => {
  const existing = rafIds.get(refVar);
  if (existing !== undefined) {
    cancelAnimationFrame(existing);
    rafIds.delete(refVar);
  }
};

const animateValue = (refVar: Ref<number>, targetValue: number) => {
  cancelAnim(refVar);
  const interp = interpolate(refVar.value, targetValue);
  const duration = 500;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    refVar.value = interp(t);
    if (t < 1) {
      rafIds.set(refVar, requestAnimationFrame(step));
    } else {
      rafIds.delete(refVar);
    }
  };
  rafIds.set(refVar, requestAnimationFrame(step));
};

watch(
  () => props.node.value,
  (newVal) => {
    animateValue(displayValue, newVal);
  },
);

watch(
  () => props.node.count,
  (newVal) => {
    animateValue(displayCount, newVal);
  },
);

onBeforeUnmount(() => {
  for (const id of rafIds.values()) {
    cancelAnimationFrame(id);
  }
  rafIds.clear();
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
  font-family: var(--font-mono);
  font-size: 14px;
  border: 1px solid transparent;
  border-radius: 4px;
  margin: 2px 0;
  transition: border-color 0.2s, background-color 0.2s;
}

.tree-node:hover {
  border-color: var(--line-strong);
}

.tree-node.is-open {
  background-color: color-mix(
    in srgb,
    var(--surface-sunken) calc(35% + var(--node-depth, 0) * 10%),
    var(--surface)
  );
  border-color: var(--line);
}

.node-row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
}

.node-row:hover {
  background-color: var(--surface-sunken);
}

.icon-wrapper {
  width: 24px;
  display: inline-flex;
  justify-content: center;
  color: var(--muted);
}

.node-name {
  margin-left: 4px;
  white-space: nowrap;
}

.is-file .node-name {
  color: var(--accent);
}

.node-reward {
  margin-left: 10px;
  color: var(--tag-success-ink, #28a745);
  font-weight: bold;
  width: 100px;
  text-align: right;
}

.node-count {
  color: var(--tag-danger-ink, #dc3545);
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
  color: var(--ink);
  font-weight: bold;
  margin-right: 8px;
}

.cve-link {
  color: var(--accent);
}

.cve-link:hover {
  text-decoration: underline;
}

.node-children {
  margin-left: 18px;
  padding-left: 4px;
}
</style>
