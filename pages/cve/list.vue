<template>
  <div>
    <Navbar/>

    <b-loading
      v-if="loading"
      v-model="loading"
      :is-full-page="true" ></b-loading>

    <section class="section">
      <div class="container content">
        <h1 class="title">Chromium CVEs</h1>

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

        <div class="columns">
          <div class="column" v-if="filter_component">
          <b-notification type="is-warning" @close="filter_component = null">
            Filtering by component: {{ filter_component }}
          </b-notification>
          </div>
          <div class="column" v-if="filter_date">
          <b-notification type="is-warning" @close="filter_date = null">
            Filtering by date: {{ filter_date }}
          </b-notification>
          </div>
        </div>

        <b-field label="Group by">
          <b-radio-button v-model="group_by" native-value="version">Version</b-radio-button>
          <b-radio-button v-model="group_by" native-value="version_major">Version major</b-radio-button>
          <b-radio-button v-model="group_by" native-value="year">Year</b-radio-button>
          <b-radio-button v-model="group_by" native-value="month">Month</b-radio-button>
          <b-radio-button v-model="group_by" native-value="vrp_reward">Reward</b-radio-button>
          <b-radio-button v-model="group_by" native-value="severity">Severity</b-radio-button>
          <b-radio-button v-model="group_by" native-value="component">Component</b-radio-button>
          <b-radio-button v-model="group_by" native-value="cwe">CWE</b-radio-button>
        </b-field>
      </div>
    </section>


    <section class="section" v-for="group in grouped" :key="group.key">
      <div class="container content">
      <h3 class="title">
        {{ group.key}}
        <div class="is-pulled-right">
          <b-tag type="is-info is-medium">
          {{ group.cves.length }} CVEs
          </b-tag>
        </div>
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

const router = useRouter();
const route = useRoute();

const repositories = ref([]);
const data = ref([]);
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

const updateUrl = () => {
  router.push({
    query: {
      group_by: group_by.value,
      component: filter_component.value,
      date: filter_date.value,
    }
  });
};
watch(
  [
    group_by,
    filter_component,
    filter_date,
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

  if (filter_date.value) {
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
      const formatter = format("$,.0f");
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
  }

  loading.value = false;
  grouped.value = keys.map(key => ({
    key,
    cves: out[key]?.reverse() || [],
  }));
};

watch(() => [
  data.value,
  group_by.value,
  filter_component.value,
  filter_date.value,
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
