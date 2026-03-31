<template>
  <div>
    <Navbar/>

    <section class="section pb-2">
      <div class="container is-fluid">
        <h1 class="title is-4" style="display: flex; align-items: center;">
          Chromium Money Tree
          <b-button size="is-small" class="ml-3" icon-left="book-open-outline" @click="showReadme = !showReadme">README</b-button>
        </h1>

        <div v-show="showReadme" class="message is-info mb-4">
          <div class="message-body content is-size-6">
            <p>
              This site maps Chromium VRP (bug bounty) rewards to changes (fixes) in specific files.
              <br>
              The bug bounty reward gets divided between files, eg if a fix to a $1000 bug changed 5 files, each file gets $200
              <br>
              <template v-if="treeData">
                Currently displaying <strong>{{ displayCvesCount.toFixed(0) }} CVEs</strong> in range (<strong>{{ dates[0].toLocaleDateString() }}</strong> to <strong>{{ dates[1].toLocaleDateString() }}</strong>) for a total reward of <strong>{{ formatter(displayTotalReward) }}</strong>.
              </template>
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
          </div>
        </div>

        <b-field label="Group by">
          <b-radio-button v-model="groupBy" native-value="none">None</b-radio-button>
          <b-radio-button v-model="groupBy" native-value="cwe">CWE</b-radio-button>
          <b-radio-button v-model="groupBy" native-value="component">Component</b-radio-button>
          <b-radio-button v-model="groupBy" native-value="fixed-by">Fixed By</b-radio-button>
        </b-field>

        <b-loading v-model="loading" :is-full-page="false"></b-loading>

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
        <Timeline v-model="dates" :minDate="new Date('2011-01-01')"/>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { format } from 'd3-format';
import { interpolate } from 'd3-interpolate';
import MoneyTreeNode from '~/components/MoneyTreeNode.vue';
import Timeline from '~/components/Timeline.vue';

const route = useRoute();
const router = useRouter();

const formatter = format("$,.0f");

const loading = ref(true);
const showReadme = ref(false);
const rawData = shallowRef<any[]>([]);
const treeData = shallowRef<any>(null);
const cvesCount = ref(0);

const displayCvesCount = ref(0);
const displayTotalReward = ref(0);

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

watch(cvesCount, (val) => animateValue(displayCvesCount, val));
watch(() => treeData.value?.value, (val) => animateValue(displayTotalReward, val || 0));

onMounted(() => {
  if (cvesCount.value) animateValue(displayCvesCount, cvesCount.value);
  if (treeData.value?.value) animateValue(displayTotalReward, treeData.value.value);
});

const groupBy = ref("none");
if (route.query.group_by) {
  groupBy.value = route.query.group_by as string;
}

const dates = ref([
  new Date(new Date().setDate(new Date().getDate() - 365)),
  new Date(),
]);

if (route.query.start) {
  dates.value[0] = new Date(route.query.start as string);
}
if (route.query.end) {
  dates.value[1] = new Date(route.query.end as string);
}

const updateUrl = () => {
  router.push({
    query: {
      group_by: groupBy.value,
      start: dates.value[0].toISOString().split("T")[0],
      end: dates.value[1].toISOString().split("T")[0],
    }
  });
};

const cweTitle = new Map([
  [119, "Improper Restriction of Operations within the Bounds of a Memory Buffer"],
  [120, "Buffer overflow"],
  [122, "Heap-based Buffer Overflow"],
  [125, "Out-of-bounds Read"],
  [1284, "Improper Validation of Specified Quantity in Input"],
  [1287, "Improper Validation of Specified Type of Input"],
  [1300, "Improper Protection of Physical Side Channels"],
  [190, "Integer Overflow or Wraparound"],
  [194, "Unexpected Sign Extension"],
  [20, "Improper Input Validation"],
  [203, "Observable Discrepancy"],
  [22, "Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')"],
  [269, "Improper Privilege Management"],
  [284, "Improper Access Control"],
  [285, "Improper Authorization"],
  [288, "Authentication Bypass Using an Alternate Path or Channel"],
  [290, "Authentication Bypass by Spoofing"],
  [303, "Incorrect Implementation of Authentication Algorithm"],
  [306, "Missing Authentication for Critical Function"],
  [345, "Insufficient Verification of Data Authenticity"],
  [346, "Origin Validation Error"],
  [358, "Improperly Implemented Security Check for Standard"],
  [362, "Race condition"],
  [366, "Race Condition within a Thread"],
  [374, "Passing Mutable Objects to an Untrusted Method"],
  [416, "Use After Free"],
  [449, "The UI Performs the Wrong Action"],
  [451, "User Interface (UI) Misrepresentation of Critical Information"],
  [457, "Use of Uninitialized Variable"],
  [472, "External Control of Assumed-Immutable Web Parameter"],
  [474, "Use of Function with Inconsistent Implementations"],
  [601, "URL Redirection to Untrusted Site ('Open Redirect')"],
  [691, "Insufficient Control Flow Management"],
  [693, "Protection Mechanism Failure"],
  [732, "Incorrect Permission Assignment for Critical Resource"],
  [787, "Out-of-bounds Write"],
  [79, "Cross-site scripting"],
  [807, "Reliance on Untrusted Inputs in a Security Decision"],
  [843, "Type confusion"],
  [863, "Incorrect Authorization"],
  [94, "Improper Control of Generation of Code (‘Code Injection’)"],
  [1007, "Insufficient Visual Distinction of Homoglyphs Presented to User"],
  [1021, "Improper Restriction of Rendered UI Layers or Frames"],
  [1230, "Exposure of Sensitive Information Through Metadata"],
])

const filteredData = computed(() => {
  return rawData.value.filter(cve => {
    const dateStr = cve.bug_date || cve.published;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date >= dates.value[0] && date <= dates.value[1];
  });
});

const buildTree = (cves: any[]) => {
  console.log("Building tree with", cves.length, "CVEs");
  const root = { name: 'root', children: new Map(), value: 0, cveIds: new Set() };

  let cvesWithReward = 0;

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
        return 'third_party/blink/renderer/' + p.substring(25);
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

  for (const cve of cves) {
    const reward = parseInt(cve.vrp_reward) || 0;
    if (reward <= 0) continue;

    const files = new Map<string, {repo: string, authors: Set<string>}>(); // path -> {repo, authors}

    // Prioritize commits in 'fixed_by'. Fallback to all 'commits' if empty.
    const fixedBy = Array.isArray(cve.fixed_by) ? cve.fixed_by : [];
    const shas = (fixedBy.length > 0)
      ? fixedBy
      : (cve.commits ? Object.keys(cve.commits) : []);

    for (const sha of shas) {
      const commit = cve.commits?.[sha];
      if (commit && commit.files && Array.isArray(commit.files)) {
        for (const file of commit.files) {
          if (isIgnoredFile(file)) continue;
          const repo = identifyRepo(file, commit.repo, cve);
          const normalizedPath = normalizePath(file, repo);
          if (!files.has(normalizedPath)) {
            files.set(normalizedPath, { repo, authors: new Set<string>() });
          }
          if (commit.author) {
            files.get(normalizedPath)!.authors.add(commit.author);
          }
        }
      }
    }

    if (files.size === 0) continue;

    cvesWithReward++;
    const rewardPerFile = reward / files.size;

    for (const [filePath, fileData] of files.entries()) {
      const repoName = fileData.repo;
      const authors = fileData.authors;

      if (repoName === 'unknown' || isIgnoredRepo(repoName)) continue;

      let partsList: string[][] = [];

      if (groupBy.value === 'component') {
        const component = (cve.components && cve.components.length > 0) ? cve.components[0] : "Unknown Component";
        partsList = [[...component.split('>'), repoName, ...filePath.split('/')]];
      } else if (groupBy.value === 'cwe') {
        const cwe = cve.cweId ? `CWE-${cve.cweId} ${cweTitle.get(parseInt(cve.cweId)) || ''}`.trim() : "Unknown CWE";
        partsList = [[cwe, repoName, ...filePath.split('/')]];
      } else if (groupBy.value === 'fixed-by') {
        if (authors.size > 0) {
          partsList = Array.from(authors).map(author => [author, repoName, ...filePath.split('/')]);
        } else {
          partsList = [["Unknown Author", repoName, ...filePath.split('/')]];
        }
      } else {
        partsList = [[repoName, ...filePath.split('/')]];
      }

      const rewardPerBranch = rewardPerFile / partsList.length;

      for (const parts of partsList) {
        let current = root;
        current.value += rewardPerBranch;
        current.cveIds.add(cve.id);

        for (const part of parts) {
          if (!current.children.has(part)) {
            current.children.set(part, { name: part, children: new Map(), value: 0, cveIds: new Set() });
          }
          current = current.children.get(part);
          current.value += rewardPerBranch;
          current.cveIds.add(cve.id);
        }
      }
    }
  }

  cvesCount.value = cvesWithReward;

  const convertToHierarchy = (node: any) => {
    const obj: any = {
      name: node.name,
      value: node.value,
      count: node.cveIds ? node.cveIds.size : 0,
      cveIds: node.cveIds ? Array.from(node.cveIds) : [],
      cves: node.cveIds ? Array.from(node.cveIds).map(id => rawData.value.find(c => c.id === id)).filter(Boolean).sort((a: any, b: any) => {
        const dateA = new Date(a.bug_date || a.published || 0);
        const dateB = new Date(b.bug_date || b.published || 0);
        return dateB.getTime() - dateA.getTime();
      }) : []
    };
    if (node.children && node.children.size > 0) {
      obj.children = Array.from(node.children.values())
        .map(convertToHierarchy)
        .sort((a: any, b: any) => b.value - a.value); // Sort highest reward first
    }
    return obj;
  };

  return convertToHierarchy(root);
};

watch(dates, () => {
  updateUrl();
});

watch(groupBy, () => {
  updateUrl();
  treeData.value = buildTree(filteredData.value);
});

watch(filteredData, () => {
  treeData.value = buildTree(filteredData.value);
});

onMounted(async () => {
  try {
    const response = await fetch('/cve/data.json');
    rawData.value = await response.json();

    if (!route.query.start && rawData.value.length > 0) {
      let minDate = new Date();
      for (const cve of rawData.value) {
        const d = new Date(cve.bug_date || cve.published);
        if (!isNaN(d.getTime()) && d < minDate && d > new Date('2008-01-01')) {
          minDate = d;
        }
      }
      dates.value[0] = minDate;
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
  border: 1px solid #ddd;
  padding: 10px;
  border-radius: 4px;
}

.tree-header {
  display: flex;
  font-weight: bold;
  padding: 8px;
  background-color: #f8f9fa;
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

.timeline {
  z-index: 10;
  background-color: white;
  width: 100%;
  padding: 1rem 0;
  border-top: 1px solid #eaeaea;
  position: sticky;
  bottom: 0;
}
</style>
