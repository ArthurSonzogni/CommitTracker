<template>
  <div>
    <Navbar/>

    <b-loading
      v-if="loading"
      v-model="loading"
      :is-full-page="true" ></b-loading>

    <section class="section">
      <div class="container content">
        <h1 class="title">
            Chromium CVEs
            <b-button
              class="ml-4"
              @click="readme = !readme"
              :type="readme ? '' : 'is-info'"
            >
              Readme
            </b-button>
        </h1>

        <div v-if="readme">
          <p>
            The list of publicly known vulnerabilities in the Chromium project.
            This only includes the vulnerabilities that have been assigned a CVE
            number. Internally found vulnerabilities are not listed here.
            Bug are usually made public 90 days after they have been fixed.
          </p>

          <ul>
            <li><strong>{{ data_size }} CVEs</strong> in the database.</li>
            <li>Latest published <strong>{{ latest_cve_duration }} ago.</strong></li>

            <li>Bugs are usually made public 90 days after they have been fixed.
              Currently the latest public bug was published <strong>{{ latest_public_cve_duration }} ago.</strong>
            </li>
          </ul>

          <div style="border-bottom: 1px solid #ccc; margin-bottom: 1em;"></div>

        </div>

        <b-field>

          <b-field label="Year">
            <b-select
              v-model="filter_date"
              placeholder="Year"
              @change="updateUrl"
              >
              <option value="All">All</option>
              <option v-for="year in all_years" :key="year" :value="year">
              {{ year }}
              </option>
            </b-select>
          </b-field>

          <b-field label="Component" class="ml-2" v-if="!filter_component">
            <b-select
              v-model="filter_component"
              placeholder="Component"
              @change="updateUrl"
              >
              <option v-for="component in all_components" :key="component" :value="component">
              {{ component }}
              </option>
            </b-select>
          </b-field>

          <b-field label="Component" class="ml-2" v-else>
            <b-tag
              closable
              size="is-large"
              @close="filter_component = null"
              >
              {{ filter_component }}
            </b-tag>
          </b-field>

          <b-field label="Private bugs" class="ml-2">
            <b-switch v-model="hide_private" @change="updateUrl">Hide</b-switch>
          </b-field>
        </b-field>

        <b-field label="Group by">
          <b-radio-button v-model="group_by" native-value="version">Version</b-radio-button>
          <b-radio-button v-model="group_by" native-value="version_major">Version major</b-radio-button>
          <b-radio-button v-model="group_by" native-value="year">Year</b-radio-button>
          <b-radio-button v-model="group_by" native-value="month">Month</b-radio-button>
          <b-radio-button v-model="group_by" native-value="vrp_reward">Reward</b-radio-button>
          <b-radio-button v-model="group_by" native-value="severity">Severity</b-radio-button>
          <b-radio-button v-model="group_by" native-value="component">Component</b-radio-button>
          <b-radio-button v-model="group_by" native-value="cwe">CWE</b-radio-button>
          <b-radio-button v-model="group_by" native-value="authors">Authors</b-radio-button>
          <b-radio-button v-model="group_by" native-value="reviewers">Reviewers</b-radio-button>
        </b-field>

      </div>
    </section>


    <section class="section" v-for="group in grouped" :key="group.key">
      <div class="container content">
        <h3 class="title">
          {{ group.key}}
          <b-taglist attached style="display: inline-block;" class="mr-2
          is-pulled-right">
            <b-tag type="is-danger is-medium" style="background-color: black;">
              {{ formatter(group.cves.total_reward) }}$
            </b-tag>
            <b-tag type="is-info is-medium">
              {{ group.cves.length }} CVEs
            </b-tag>
          </b-taglist>
        </h3>

        <div class="grid">
          <template v-for="cve in group.cves">
            <NuxtLink :to="'/cve?id='+cve.id" class="cve-link">
            {{ cve.id }}
            </NuxtLink>
            <div class="cve-description">
              <b-tag type="is-danger is-small" class="ml-2"
                                               v-if="!cve.bug_date">
                Private bug
              </b-tag>
              <b-tag type="is-info is-small" class="ml-2"
                                             v-if="cve.vrp_reward">
                {{ cve.vrp_reward }}$
              </b-tag>
              <b-tag v-for="repo in cve.repos" class="ml-2"
                                               :style="
                                               {
                                               backgroundColor: repo_color.get(repo) || 'black',
                                               color: 'white',
                                               }
                                               "
                                               >
                                               {{ repo }}
              </b-tag>
              <span class="cve-description-text">
                {{ cve.description }}
              </span>
            </div>
          </template>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">

import humanizeDuration from "humanize-duration";
import { format } from "d3-format";

const formatter = format("$,.0f");
const repo_color = new Map([
  ["angle", "orange"],
  ["chromium", "#121212"],
  ["chromiumos-platform2", "blue"],
  ["dawn", "#FF5722"],
  ["pdfium", "#9C27B0"],
  ["skia", "#FFC107"],
  ["v8", "red"],
  ["webrtc", "#03A9F4"],
  ["swiftshader", "#4CAF50"],
]);

const router = useRouter();
const route = useRoute();

const readme = ref(false);

const data = ref([]);

const all_components = computed(() => {
  const all_components = new Set();
  for(const cve of data.value) {
    if (cve.components) {
      for(const component of cve.components) {
        all_components.add(component);
      }
    }
  }
  return Array.from(all_components).sort();
});

const all_years = computed(() => {
  const all_years = new Set();
  for(const cve of data.value) {
    const year = cve.published.split("-")[0];
    all_years.add(year);
  }
  return Array.from(all_years).sort().reverse();
});

const years = ref([]);

const group_by = ref("version");
const grouped = ref({});

const data_size = ref(0);
const latest_cve_duration = ref("n/a");
const latest_public_cve_duration = ref("n/a");

const loading = ref(false);

if (route.query.group_by) {
  group_by.value = route.query.group_by;
}

const filter_component = ref(null);
if (route.query.component) {
  filter_component.value = route.query.component;
}
if (filter_component.value == "All") {
  filter_component.value = null;
}

const filter_date = ref(null);
if (route.query.date) {
  filter_date.value = route.query.date;
}

const filter_repo = ref(null);
if (route.query.repo) {
  filter_repo.value = route.query.repo;
}

const hide_private = ref(false);
if (route.query.hide_private) {
  hide_private.value = route.query.hide_private == "true";
}

const updateUrl = () => {
  const query = {
    group_by: group_by.value,
  };
  if (filter_component.value) {
    query.component = filter_component.value;
  }
  if (filter_date.value && filter_date.value != "All") {
    query.date = filter_date.value;
  }
  if (filter_repo.value) {
    query.repo = filter_repo.value;
  }
  if (hide_private.value) {
    query.hide_private = "true";
  }

  router.push({query})
};
watch(
  [
    group_by,
    filter_component,
    filter_repo,
    filter_date,
    hide_private,
  ],
  updateUrl,
);

const cweTitle = new Map([
  [119, "Improper Restriction of Operations within the Bounds of a Memory Buffer"],
  [120, "Buffer Copy without Checking Size of Input (‘Classic Buffer Overflow’)"],
  [122, "Heap-based Buffer Overflow"],
  [125, "Out-of-bounds Read"],
  [1284, "Improper Validation of Specified Quantity in Input"],
  [1287, "Improper Validation of Specified Type of Input"],
  [190, "Integer Overflow or Wraparound"],
  [20, "Improper Input Validation"],
  [285, "Improper Authorization"],
  [290, "Authentication Bypass by Spoofing"],
  [303, "Incorrect Implementation of Authentication Algorithm"],
  [345, "Insufficient Verification of Data Authenticity"],
  [346, "Origin Validation Error"],
  [358, "Improperly Implemented Security Check for Standard"],
  [362, "Concurrent Execution using Shared Resource with Improper Synchronization (‘Race Condition’)"],
  [366, "Race Condition within a Thread"],
  [374, "Passing Mutable Objects to an Untrusted Method"],
  [416, "Use After Free"],
  [451, "User Interface (UI) Misrepresentation of Critical Information"],
  [457, "Use of Uninitialized Variable"],
  [472, "External Control of Assumed-Immutable Web Parameter"],
  [474, "Use of Function with Inconsistent Implementations"],
  [691, "Insufficient Control Flow Management"],
  [787, "Out-of-bounds Write"],
  [79, "Improper Neutralization of Input During Web Page Generation (‘Cross-site Scripting’)"],
  [807, "Reliance on Untrusted Inputs in a Security Decision"],
  [843, "Access of Resource Using Incompatible Type (‘Type Confusion’)"],
  [863, "Incorrect Authorization"],
  [94, "Improper Control of Generation of Code (‘Code Injection’)"],
])

onMounted(async () => {
  const response = await fetch("/cve/data.json");
  data.value = await response.json();

  data_size.value = Object.keys(data.value).length;

  const max_date = data.value.reduce((max, cve) => {
    return Math.max(max, new Date(cve.published).getTime());
  }, 0);
  latest_cve_duration.value = humanizeDuration(Date.now() - max_date, {
    largest: 2,
    round: true,
    units: ["d"],
  });
  const max_public_date = data.value
    .filter(cve => cve.bug_date)
    .reduce((max, cve) => {
      return Math.max(max, new Date(cve.bug_date).getTime());
    }, 0);
  latest_public_cve_duration.value = humanizeDuration(Date.now() - max_public_date, {
    largest: 2,
    round: true,
    units: ["d"],
  });
});

// Move filtered elements to the end of the array.
const moveToEnd = (array, filter) => {
  const out = [];
  for (const element of array) {
    if (filter(element)) {
      out.push(element);
    }
  }
  for (const element of array) {
    if (!filter(element)) {
      out.push(element);
    }
  }
  return out;
};

const refresh = async () => {
  loading.value = true;

  // Wait for 5 frames to allow the UI to update.
  for(let index = 0; index < 5; index++) {
    await new Promise(resolve => {
      const id = requestAnimationFrame(() => {
        cancelAnimationFrame(id);
        resolve();
      });
    });
  }

  let date_filter_start = new Date("2000-01-01");
  let date_filter_end = new Date("2030-01-01");

  const date_filter_regex_year = /^\d{4}$/;
  const date_filter_regex_quarter = /^\d{4}Q\d$/;
  const date_filter_regex_month = /^\d{4}M\d{2}$/;

  if (filter_date.value && filter_date.value != "All") {
    if (date_filter_regex_year.test(filter_date.value)) {
      date_filter_start = new Date(`${filter_date.value}-01-01`);
      date_filter_end = new Date(`${filter_date.value}-12-31`);
    } else if (date_filter_regex_quarter.test(filter_date.value)) {
      const year = filter_date.value.substring(0, 4);
      const quarter = filter_date.value.substring(5, 6);
      const month = (quarter - 1) * 3 + 1;
      date_filter_start = new Date(`${year}-${month}-01`);
      date_filter_end = new Date(`${year}-${month + 2}-31`);
    } else if (date_filter_regex_month.test(filter_date.value)) {
      const year = filter_date.value.substring(0, 4);
      const month = filter_date.value.substring(5, 7);
      date_filter_start = new Date(`${year}-${month}-01`);
      date_filter_end = new Date(`${year}-${month}-31`);
    }
  }

  const filtered_data = data.value.filter(cve => {
    const date = new Date(cve.published);

    if (filter_component.value) {
      let found = false;
      for(const component of cve.components || []) {
        if (component.startsWith(filter_component.value)) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }

    if (filter_repo.value) {
      let found = false;
      for(const sha in cve.commits) {
        const commit = cve.commits[sha];
        if (commit.repo == filter_repo.value) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }

    if (hide_private.value && !cve.bug_date) {
      return false;
    }

    if (date < date_filter_start || date > date_filter_end) {
      return false;
    }

    return true;
  });

  let out = {};
  let keys = [];
  switch(group_by.value) {
    case "version":
      for(const cve of filtered_data) {
        const key = cve.version_fixed || "unknown";
        out[key] ||= [];
        out[key].push(cve);
      }
      break;

    case "version_major":
      for(const cve of filtered_data) {
        const key = cve.version_fixed?.split(".")[0] || "unknown";
        out[key] ||= [];
        out[key].push(cve);
      }
      break;

    case "year":
      for(const cve of filtered_data) {
        const key = cve.published.split("-")[0]
        out[key] ||= [];
        out[key].push(cve);
      }
      break;

    case "month":
      for(const cve of filtered_data) {
        const key = cve.published.split("-").slice(0, 2).join("-");
        out[key] ||= [];
        out[key].push(cve);
      }
      break;

    case "vrp_reward":
      for(const cve of filtered_data) {
        const reward = cve.vrp_reward ?
          `${formatter(cve.vrp_reward)}` : "unknown";
        out[reward] ||= [];
        out[reward].push(cve);
      }
      break;

    case "severity":
      for(const cve of filtered_data) {
        const severity = cve.severity || "unknown";
        out[severity] ||= [];
        out[severity].push(cve);
      }
      break;

    case "component":
      for(const cve of filtered_data) {
        if (!cve.components) {
          out["<Private bug>"] ||= [];
          out["<Private bug>"].push(cve);
          continue;
        }

        for(const component of cve.components) {
          if (filter_component.value && !component.startsWith(filter_component.value)) {
            continue;
          }

          out[component] ||= [];
          out[component].push(cve);
        }
      }
      break;

    case "cwe":
      for(const cve of filtered_data) {
        const cwe = cve.cweId ? `${cve.cweId} - ${cweTitle.get(parseInt(cve.cweId))}` : "n/a";
        out[cwe] ||= [];
        out[cwe].push(cve);
      }
      break;
    case "authors":
      for(const cve of filtered_data) {
        if (!cve.commits) {
          continue;
        }
        const authors = new Set();
        for(const sha in cve.commits) {
          const commit = cve.commits[sha];
          if (commit.type != "commit") {
            continue;
          }
          const author = commit.author.split("@")[0] + "@";
          authors.add(author);
        }
        for(const author of authors) {
          out[author] ||= [];
          out[author].push(cve);
        }
      }
      break;

    case "reviewers":
      for(const cve of filtered_data) {
        if (!cve.commits) {
          continue;
        }
        const reviewers = new Set();
        for(const sha in cve.commits) {
          const commit = cve.commits[sha];
          if (commit.type != "commit") {
            continue;
          }
          for (const reviewer of commit.reviewers) {
            reviewers.add(reviewer.split("@")[0] + "@");
          }
        }
        for(const reviewer of reviewers) {
          out[reviewer] ||= [];
          out[reviewer].push(cve);
        }
      }
      break;
  }

  // Add the Set(...cve.commit.repo) to the out[key]
  for (const key in out) {
    const cves = out[key];
    for (const cve of cves) {
      const repos = new Set();
      for (const sha in cve.commits) {
        const commit = cve.commits[sha];
        if (commit.type != "commit") {
          continue;
        }
        repos.add(commit.repo);
      }
      cve.repos = Array.from(repos);
    }
  }

  // Add the total reward to the out[key]
  for (const key in out) {
    const cves = out[key];
    let total_reward = 0;
    const repos = new Set();
    for (const cve of cves) {
      total_reward += parseInt(cve.vrp_reward) || 0;
      for (const repo of cve.repos) {
        repos.add(repo);
      }
    }
    out[key].total_reward = total_reward;
    out[key].repos = Array.from(repos).sort();
  }

  switch(group_by.value) {
    case "version":
      // Sort numerically:
      keys = Object.keys(out).sort((a, b) => {
        const aParts = a.split(".");
        const bParts = b.split(".");

        const aValid = aParts.every(part => !isNaN(part));
        const bValid = bParts.every(part => !isNaN(part));

        if (aValid && !bValid) {
          return -1;
        }
        if (!aValid && bValid) {
          return 1;
        }

        if (!aValid && !bValid) {
          return a.localeCompare(b);
        }

        for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
          const aPart = parseInt(aParts[i]);
          const bPart = parseInt(bParts[i]);
          if (aPart == bPart) {
            continue;
          }
          return bPart - aPart;
        }

        return b-a;
      });

      break;
    case "version_major":
    case "year":
      keys = Object.keys(out).sort((a, b) => {
        return parseInt(b) - parseInt(a);
      });
      keys = moveToEnd(keys, key => {
        return !isNaN(key);
      });

      break;

    case "month":
      keys = Object.keys(out).sort().reverse();
      keys = moveToEnd(keys, key => !key.startsWith("unknown"));
      break;

    case "vrp_reward":
      keys = Object.keys(out)
        .sort((a, b) => {
          const a_value = a.substring(1).replace(",", "");
          const b_value = b.substring(1).replace(",", "");
          return parseInt(b_value) - parseInt(a_value);
        })

      keys = moveToEnd(keys, key => {
        return key != '$NaN' && key != 'unknown';
      });

      break;

    case "severity":
      keys = Object.keys(out).sort((a, b) => {
        return a.localeCompare(b);
      });

      keys = [
        "Critical",
        "High",
        "Medium",
        "Low",
        "unknown"
      ];

      break;

    case "component":

      keys = Object.keys(out).sort((a, b) => {
        return a.localeCompare(b);
      });

      keys = moveToEnd(keys, key => key != "<Private bug>");

      break;

    case "cwe":
      keys = Object.keys(out).sort((a, b) => {
        return a.localeCompare(b);
      });

      keys = moveToEnd(keys, key => key != "unknown");

      break;

    case "authors":
    case "reviewers":
      keys = Object.keys(out).sort((a, b) => {
        return a.localeCompare(b);
      });
      keys = moveToEnd(keys, key => key != "unknown")

      break;
  }

  loading.value = false;
  grouped.value = keys.map(key => ({
    key,
    cves: out[key]?.reverse() || [],
  }));
};

watch([
  data,
  group_by,
  filter_component,
  filter_date,
  hide_private,
], refresh);


</script>

<style scoped>

.grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  grid-gap: 1em;
}

h3 {
  position: sticky;
  top: 0;
  background-color: white;
  z-index: 100;
  padding-bottom:0.5em;
  padding-top:0.5em;
}

.cve-link {
  font-weight: bold;
  display: inline-block;
}

.cve-description {
  display: inline-block;
  overflow: hidden;
}

.cve-description-text {
  margin-left: 1em;
}

</style>
