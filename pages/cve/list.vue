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
          The list of publicly known vulnerabilities in the Chromium project. This
          only includes the vulnerabilities that have been assigned a CVE number.
          Internally found vulnerabilities are not listed here.
        </p>

        <ul>
          <li><strong>{{ data_size }} CVEs.</strong></li>
          <li>Last CVE published <strong>{{ latest_cve_duration }} ago</strong></li>
          <li>Updates <strong>weekly</strong>.</li>
        </ul>

        <div style="border-bottom: 1px solid #ccc; margin-bottom: 1em;"></div>

        <!--
        <b-field>
          <Timeline
            :minDate="new Date('2017-01-01')"
            v-model="dates"
          ></Timeline>
        </b-field>
        -->

        <b-field label="Group by">
          <b-radio-button v-model="group_by" native-value="version">Version</b-radio-button>
          <b-radio-button v-model="group_by" native-value="version_major">Version major</b-radio-button>
          <b-radio-button v-model="group_by" native-value="year">Year</b-radio-button>
          <b-radio-button v-model="group_by" native-value="month">Month</b-radio-button>
          <b-radio-button v-model="group_by" native-value="vrp_reward">Reward</b-radio-button>
          <b-radio-button v-model="group_by" native-value="severity">Severity</b-radio-button>
          <b-radio-button v-model="group_by" native-value="component">Component</b-radio-button>
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
              Undisclosed
            </b-tag>
            <b-tag type="is-info is-small" class="ml-2"
                                            v-if="cve.vrp_reward">
              {{ cve.vrp_reward }}$
            </b-tag>
            {{ cve.description }}
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

const dates = ref([new Date("2000-01-01"), new Date()]);
const data = ref([]);
const group_by = ref("version");
const grouped = ref({});

const data_size = ref(0);
const latest_cve_duration = ref("n/a");

const loading = ref(false);

if (route.query.group_by) {
  group_by.value = route.query.group_by;
}

const updateUrl = () => {
  router.push({
    query: {
      group_by: group_by.value
    }
  });
};
watch(group_by, updateUrl);

onMounted(async () => {
  const response = await fetch("/cve/data.json");
  data.value = await response.json();

  data_size.value = Object.keys(data.value).length;

  const max_date = Object.values(data.value).reduce((max, cve) => {
    return Math.max(max, new Date(cve.published).getTime());
  }, 0);
  latest_cve_duration.value = humanizeDuration(Date.now() - max_date, {
    largest: 3,
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
  console.log("refresh");
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

  const filtered_data = Object.values(data.value).filter(cve => {
    const date = new Date(cve.published);
    return date >= dates.value[0] && date <= dates.value[1];
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
        const key = cve.version_dates?.stable?.split("-")[0] || "unknown";
        out[key] ||= [];
        out[key].push(cve);
      }
      break;

    case "month":
      for(const cve of filtered_data) {
        const year = cve.version_dates?.stable?.split("-")[0] || "unknown";
        const month = cve.version_dates?.stable?.split("-")[1] || "01"
        const key = `${year}-${month}`;
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
          out["<Undisclosed>"] ||= [];
          out["<Undisclosed>"].push(cve);
          continue;
        }

        for(const component of cve.components) {
          out[component] ||= [];
          out[component].push(cve);
        }
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

      keys = moveToEnd(keys, key => key != "<Undisclosed>");

      break;
  }

  loading.value = false;
  grouped.value = keys.map(key => ({
    key,
    cves: out[key].reverse(),
  }));
};

watch(() => [
  data.value,
  dates.value,
  group_by.value
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

</style>
