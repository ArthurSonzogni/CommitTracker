<template>
  <div class="page-container">
    <section class="section pb-2">
      <div class="container is-fluid">
        <h1 class="title">CVE money tree</h1>

        <AboutData>
          <p>
            This site maps Chromium VRP (bug bounty) rewards to changes (fixes) in specific files.
            <br>
            The bug bounty reward gets divided between files, eg if a fix to a $1000 bug changed 5 files, each file gets $200
          </p>
          <p>
            This is inspired by the famous
            <a href="https://lyra.horse/misc/chromium_vrp_tree.html">money tree from Lyra Rebane</a>,
            but compatible after the Bugganizer migration.
          </p>
          <article class="message is-warning is-small mt-2">
            <div class="message-body">
              <strong>Disclaimer:</strong> This tool is a best-effort mapping and relies on heuristics. There are known bugs and inaccuracies. Please do not treat these numbers as authoritative.
            </div>
          </article>

        </AboutData>

        <div class="mb-4">
          <p class="is-size-6" v-if="treeData">
            Currently displaying <strong>{{ displayCvesCount.toFixed(0) }} CVEs</strong>
            over a period of <strong>{{ displayDuration }}</strong>,
            for a total reward of <strong>{{ formatter(displayTotalReward) }}</strong>.
          </p>
          <p class="is-size-7 mt-1 has-text-grey">
            Global dataset excludes:
            <strong>{{ missingBugLinkCount }}</strong> missing bug links,
            <strong>{{ legacyIgnoredCount }}</strong> legacy pre-2021 bugs, and
            <strong>{{ restrictedCvesCount.length }}</strong> unparsable/restricted CVEs
            (<strong>{{ restrictedRecentCount }}</strong> recent / <strong>{{ restrictedOldCount }}</strong> permanent).
          </p>
        </div>

        <UiField label="Group by">
          <UiSegmented
            v-model="groupBy"
            :options="[
            { value: 'none', label: 'None' },
            { value: 'cwe', label: 'CWE' },
            { value: 'component', label: 'Component' },
            { value: 'fixed-by', label: 'Fixed By' },
            { value: 'reviewer', label: 'Reviewer' },
          ]" />
        </UiField>

        <UiLoading v-model="loading" :is-full-page="false"></UiLoading>

        <div v-if="!loading && treeData">
          <div class="tree-container">
            <div class="tree-header">
              <span class="header-count">Bugs</span>
              <span class="header-reward">VRP Reward</span>
              <span class="header-name">Path</span>
            </div>
            <MoneyTreeNode
              v-for="child in treeData.children"
              :key="child.name"
              :node="child"
              :depth="0"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="timeline">
      <div class="container">
        <Timeline v-model="dates" :minDate="new Date('2008-01-01')"/>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { fetchCveData } from '~/utils/cve';
import { ref, onMounted, onBeforeUnmount, computed, watch, shallowRef, type Ref } from 'vue';
import { format } from 'd3-format';
import { interpolate } from 'd3-interpolate';
import humanizeDuration from 'humanize-duration';
import { useUrlState, urlCodecs } from '~/composables/useUrlState';
import MoneyTreeNode from '~/components/MoneyTreeNode.vue';
import Timeline from '~/components/Timeline.vue';
import cweTitle from '~/utils/cwe.json';

// --- Static Helpers & Constants (Module Scope) ---

const identifyRepo = (path: string, currentRepo: string, cve: any) => {
  if (currentRepo && currentRepo !== 'unknown') return currentRepo;

  const p = path.toLowerCase();
  if (p.startsWith('v8/') || p.includes('/v8/')) return 'v8';
  if (p.startsWith('skia/')) return 'skia';
  if (p.startsWith('third_party/blink/') ||
      p.startsWith('third_party/webkit/source/') ||
      p.startsWith('core/') ||
      p.startsWith('modules/') ||
      p.startsWith('bindings/') ||
      p.startsWith('platform/') ||
      p.startsWith('content/') ||
      p.startsWith('chrome/') ||
      p.startsWith('ios/') ||
      p.startsWith('net/') ||
      p.startsWith('base/') ||
      p.startsWith('components/') ||
      p.startsWith('gpu/') ||
      p.startsWith('media/') ||
      p.startsWith('browser/') ||
      p.startsWith('extensions/')
  ) return 'chromium';
  if (p.startsWith('third_party/dawn/') || p.startsWith('dawn/')) return 'dawn';
  if (p.startsWith('third_party/angle/') || p.startsWith('angle/')) return 'angle';
  if (p.startsWith('third_party/pdfium/') || p.startsWith('pdfium/')) return 'pdfium';
  if (p.startsWith('third_party/swiftshader/') || p.startsWith('swiftshader/')) return 'swiftshader';
  if (p.startsWith('third_party/webrtc/') || p.startsWith('webrtc/')) return 'webrtc';

  if (p.startsWith('compiler/') ||
      p.startsWith('wasm/') ||
      p.startsWith('heap/') ||
      p.startsWith('ic/') ||
      p.startsWith('builtins/') ||
      p.startsWith('parsing/') ||
      p.startsWith('objects/')
  ) return 'v8';

  if (cve.components) {
    for (const c of cve.components) {
      const cl = c.toLowerCase();
      if (cl.includes('blink')) return 'chromium';
      if (cl.includes('v8')) return 'v8';
      if (cl.includes('skia')) return 'skia';
      if (cl.includes('dawn')) return 'dawn';
      if (cl.includes('pdfium')) return 'pdfium';
      if (cl.includes('angle')) return 'angle';
    }
  }

  if (cve.oses && cve.oses.some(o => o.toLowerCase().includes('chromeos'))) return 'chromeos';

  return 'unknown';
};

const normalizePath = (path: string, repo: string) => {
  let p = path;
  const lower = p.toLowerCase();

  if (repo === 'chromium') {
    if (lower.startsWith('core/') ||
        lower.startsWith('modules/') ||
        lower.startsWith('bindings/') ||
        lower.startsWith('platform/')) {
      return 'third_party/blink/renderer/' + p;
    }
    if (lower.startsWith('webkit/')) {
      return 'third_party/blink/renderer/' + p.substring(7);
    }
    if (lower.startsWith('third_party/webkit/source/')) {
      return 'third_party/blink/renderer/' + p.substring(26);
    }
    if (lower.startsWith('wpt/')) {
      return 'third_party/blink/web_tests/external/wpt/' + p.substring(4);
    }
  }

  if (repo === 'v8') {
    if (lower.startsWith('compiler/') ||
        lower.startsWith('wasm/') ||
        lower.startsWith('heap/') ||
        lower.startsWith('ic/') ||
        lower.startsWith('builtins/') ||
        lower.startsWith('parsing/') ||
        lower.startsWith('objects/')) {
      return 'src/' + p;
    }
    if (lower.startsWith('v8/')) {
      return p.substring(3);
    }
  }

  return p;
};

const isIgnoredFile = (file: string) => {
  const lower = file.toLowerCase();
  return lower.includes('test') ||
         lower.includes('.gn') ||
         lower.includes('.gni') ||
         lower.includes('author') ||
         lower.includes('.html') ||
         lower.includes('.css') ||
         lower.includes('.md') ||
         lower.includes('.xml') ||
         lower.includes('deps') ||
         lower.includes('expectation');
};

const isIgnoredRepo = (repo: string) => {
  const lower = repo.toLowerCase();
  return lower === 'chromeos' || lower === 'chromiumos-platform2';
};

// --- Setup ---

const formatter = format("$,.0f");

const loading = ref(true);
const rawData = shallowRef<any[]>([]);
const treeData = shallowRef<any>(null);
const cvesCount = ref(0);

const minDataDate = ref<Date>(new Date('2008-01-01'));
const defaultEndDate = new Date();

const { groupBy, startDateStr, endDateStr } = useUrlState({
  groupBy: {
    ...urlCodecs.enum(
      ['none', 'cwe', 'component', 'fixed-by', 'reviewer'] as const,
      'none',
    ),
    key: 'group_by',
  },
  startDateStr: {
    ...urlCodecs.string(''),
    key: 'start',
  },
  endDateStr: {
    ...urlCodecs.string(''),
    key: 'end',
  },
});

const dates = computed<[Date, Date]>({
  get: () => {
    const d0 = startDateStr.value ? new Date(startDateStr.value) : minDataDate.value;
    const d1 = endDateStr.value ? new Date(endDateStr.value) : defaultEndDate;
    return [
      Number.isNaN(d0.getTime()) ? minDataDate.value : d0,
      Number.isNaN(d1.getTime()) ? defaultEndDate : d1,
    ];
  },
  set: ([d0, d1]) => {
    if (d0 instanceof Date && !Number.isNaN(d0.getTime())) {
      startDateStr.value = d0.toISOString().split('T')[0];
    }
    if (d1 instanceof Date && !Number.isNaN(d1.getTime())) {
      endDateStr.value = d1.toISOString().split('T')[0];
    }
  },
});

const missingBugLinkCount = computed(() => {
  return rawData.value.filter(cve => !cve.bug || cve.bug === 'n/a').length;
});

const displayDuration = computed(() => {
  const ms = dates.value[1].getTime() - dates.value[0].getTime();
  return humanizeDuration(ms, {
    largest: 2,
    units: ["y", "mo", "w", "d"],
    round: true,
  });
});

const legacyIgnoredCount = computed(() => {
  return rawData.value.filter(cve => {
    const hasBug = cve.bug && cve.bug !== 'n/a';
    const hasReward = parseInt(cve.vrp_reward) > 0;
    const hasCommits = cve.commits && Object.keys(cve.commits).length > 0;
    const isLegacy = cve.id.startsWith('201') || cve.id.startsWith('2020');
    return hasBug && !hasReward && !hasCommits && isLegacy;
  }).length;
});

const restrictedCvesCount = computed(() => {
  return rawData.value.filter(cve => {
    const hasBug = cve.bug && cve.bug !== 'n/a';
    const hasReward = parseInt(cve.vrp_reward) > 0;
    const hasCommits = cve.commits && Object.keys(cve.commits).length > 0;
    const isLegacy = cve.id.startsWith('201') || cve.id.startsWith('2020');
    return hasBug && !hasReward && !hasCommits && !isLegacy;
  });
});

const restrictedRecentCount = computed(() => {
  const fourteenWeeksAgo = new Date();
  fourteenWeeksAgo.setDate(fourteenWeeksAgo.getDate() - 98);
  return restrictedCvesCount.value.filter(cve => new Date(cve.published) >= fourteenWeeksAgo).length;
});

const restrictedOldCount = computed(() => {
  return restrictedCvesCount.value.length - restrictedRecentCount.value;
});

const displayCvesCount = ref(0);
const displayTotalReward = ref(0);
const activeRafIds = new Map<Ref<number>, number>();

const animateValue = (refVar: Ref<number>, targetValue: number) => {
  const prevRaf = activeRafIds.get(refVar);
  if (prevRaf !== undefined) {
    cancelAnimationFrame(prevRaf);
    activeRafIds.delete(refVar);
  }
  const interp = interpolate(refVar.value, targetValue);
  const duration = 500;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    refVar.value = interp(t);
    if (t < 1) {
      activeRafIds.set(refVar, requestAnimationFrame(step));
    } else {
      activeRafIds.delete(refVar);
    }
  };
  activeRafIds.set(refVar, requestAnimationFrame(step));
};

onBeforeUnmount(() => {
  for (const rafId of activeRafIds.values()) {
    cancelAnimationFrame(rafId);
  }
  activeRafIds.clear();
});

watch(cvesCount, (val) => animateValue(displayCvesCount, val));
watch(() => treeData.value?.value, (val) => animateValue(displayTotalReward, val || 0));

onMounted(() => {
  if (cvesCount.value) animateValue(displayCvesCount, cvesCount.value);
  if (treeData.value?.value) animateValue(displayTotalReward, treeData.value.value);
});

// --- Pre-processing & Reactive Optimization ---

const processedData = shallowRef<any[]>([]);

const processRawData = (data: any[]) => {
  const repoCache = new Map<string, string>();
  const pathCache = new Map<string, string>();

  return data.map(cve => {
    const dateStr = cve.bug_date || cve.published;
    const date = dateStr ? new Date(dateStr) : null;
    const reward = parseInt(cve.vrp_reward) || 0;

    const files = new Map<string, {repo: string, authors: Set<string>, reviewers: Set<string>}>();

    const fixedBy = Array.isArray(cve.fixed_by) ? cve.fixed_by : [];
    const shas = (fixedBy.length > 0)
      ? fixedBy
      : (cve.commits ? Object.keys(cve.commits) : []);

    for (const sha of shas) {
      const commit = cve.commits?.[sha];
      if (commit && commit.files && Array.isArray(commit.files)) {
        for (const file of commit.files) {
          if (isIgnoredFile(file)) continue;

          const repoCacheKey = `${file}|${commit.repo}|${cve.id}`;
          let repo = repoCache.get(repoCacheKey);
          if (!repo) {
            repo = identifyRepo(file, commit.repo, cve);
            repoCache.set(repoCacheKey, repo);
          }

          const pathCacheKey = `${file}|${repo}`;
          let normalizedPath = pathCache.get(pathCacheKey);
          if (!normalizedPath) {
            normalizedPath = normalizePath(file, repo);
            pathCache.set(pathCacheKey, normalizedPath);
          }

          if (!files.has(normalizedPath)) {
            files.set(normalizedPath, { repo, authors: new Set<string>(), reviewers: new Set<string>() });
          }
          const fData = files.get(normalizedPath)!;
          if (commit.author) {
            fData.authors.add(commit.author.split('@')[0]);
          }
          if (commit.reviewers && Array.isArray(commit.reviewers)) {
            for (const reviewer of commit.reviewers) {
              fData.reviewers.add(reviewer.split('@')[0]);
            }
          }
        }
      }
    }

    const leafNodes = Array.from(files.entries())
      .filter(([_, data]) => data.repo !== 'unknown' && !isIgnoredRepo(data.repo))
      .map(([path, data]) => ({
        path,
        parts: path.split('/'),
        repo: data.repo,
        authors: Array.from(data.authors),
        reviewers: Array.from(data.reviewers)
      }));

    return {
      id: cve.id,
      reward,
      date,
      cweId: cve.cweId,
      components: cve.components,
      leafNodes
    };
  });
};

const filteredData = computed(() => {
  const [start, end] = dates.value;
  return processedData.value.filter(cve => {
    return cve.date && cve.date >= start && cve.date <= end && cve.reward > 0 && cve.leafNodes.length > 0;
  });
});

const cveMap = computed(() => {
  const map = new Map();
  for (const cve of rawData.value) {
    map.set(cve.id, cve);
  }
  return map;
});

const buildTree = (cves: any[]) => {
  const root = { name: 'root', children: new Map(), value: 0, cveIds: new Set() };
  let cvesWithReward = 0;

  for (const cve of cves) {
    if (cve.leafNodes.length === 0) continue;
    cvesWithReward++;

    const rewardPerFile = cve.reward / cve.leafNodes.length;

    for (const leaf of cve.leafNodes) {
      let branches: string[][] = [];

      if (groupBy.value === 'component') {
        const component = (cve.components && cve.components.length > 0) ? cve.components[0] : "Unknown Component";
        branches = [[...component.split('>'), leaf.repo, ...leaf.parts]];
      } else if (groupBy.value === 'cwe') {
        const cwe = cve.cweId ? `CWE-${cve.cweId} ${(cweTitle as Record<string, string>)[cve.cweId] || ''}`.trim() : "Unknown CWE";
        branches = [[cwe, leaf.repo, ...leaf.parts]];
      } else if (groupBy.value === 'fixed-by') {
        if (leaf.authors.length > 0) {
          branches = leaf.authors.map(author => [author, leaf.repo, ...leaf.parts]);
        } else {
          branches = [["Unknown Author", leaf.repo, ...leaf.parts]];
        }
      } else if (groupBy.value === 'reviewer') {
        if (leaf.reviewers.length > 0) {
          branches = leaf.reviewers.map(reviewer => [reviewer, leaf.repo, ...leaf.parts]);
        } else {
          branches = [["Unknown Reviewer", leaf.repo, ...leaf.parts]];
        }
      } else {
        branches = [[leaf.repo, ...leaf.parts]];
      }

      const rewardPerBranch = rewardPerFile / branches.length;

      for (const parts of branches) {
        let current = root;
        current.value += rewardPerBranch;
        current.cveIds.add(cve.id);

        for (const part of parts) {
          let next = current.children.get(part);
          if (!next) {
            next = { name: part, children: new Map(), value: 0, cveIds: new Set() };
            current.children.set(part, next);
          }
          current = next;
          current.value += rewardPerBranch;
          current.cveIds.add(cve.id);
        }
      }
    }
  }

  cvesCount.value = cvesWithReward;

  const convertToHierarchy = (node: any) => {
    const nodeCveIds = Array.from(node.cveIds);
    const nodeCves = nodeCveIds
      .map(id => cveMap.value.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const dateA = new Date(a.bug_date || a.published || 0).getTime();
        const dateB = new Date(b.bug_date || b.published || 0).getTime();
        return dateB - dateA;
      });

    const obj: any = {
      name: node.name,
      value: node.value,
      count: nodeCveIds.length,
      cveIds: nodeCveIds,
      cves: nodeCves
    };

    if (node.children && node.children.size > 0) {
      obj.children = Array.from(node.children.values())
        .map(convertToHierarchy)
        .sort((a: any, b: any) => b.value - a.value);
    }
    return obj;
  };

  return convertToHierarchy(root);
};

// --- Watchers ---

watch(groupBy, () => {
  treeData.value = buildTree(filteredData.value);
});

watch(filteredData, (newData) => {
  treeData.value = buildTree(newData);
});

onMounted(async () => {
  try {
    rawData.value = await fetchCveData();
    processedData.value = processRawData(rawData.value);

    // Compute dataset minDate for default unbounded start date.
    if (rawData.value.length > 0) {
      let minDate = new Date();
      const minFloor = new Date('2008-01-01');
      for (const cve of rawData.value) {
        const d = new Date(cve.bug_date || cve.published);
        if (!isNaN(d.getTime()) && d < minDate && d > minFloor) {
          minDate = d;
        }
      }
      minDataDate.value = minDate;
    }

    treeData.value = buildTree(filteredData.value);
    loading.value = false;
  } catch (error) {
    console.error("Failed to load CVE data", error);
    loading.value = false;
  }
});
</script>

<style scoped>
.tree-container {
  max-height: 800px;
  overflow-y: auto;
  border: 1px solid var(--line);
  padding: 10px;
  border-radius: 4px;
}

.tree-header {
  display: flex;
  font-weight: bold;
  padding: 8px;
  background-color: var(--surface-sunken);
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  margin-bottom: 8px;
}
.header-name {
  flex-grow: 1;
  margin-left: 20px;
}
.header-reward {
  width: 100px;
  text-align: right;
  margin-left: 10px;
}
.header-count {
  width: 40px;
  text-align: right;
}

.page-container {
  padding-bottom: 80px; /* Make room for the fixed timeline */
}

.timeline {
  z-index: 10;
  background-color: color-mix(in srgb, var(--surface) 95%, transparent);
  backdrop-filter: blur(5px);
  width: 100%;
  padding-top: 0.75rem;
  padding-bottom: 0.25rem;
  border-top: 1px solid var(--line);
  position: fixed;
  left: 0;
  bottom: 0;
}
</style>
