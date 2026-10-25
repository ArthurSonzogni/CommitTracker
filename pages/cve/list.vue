<template>
  <div>
    <Navbar/>

    <UiLoading v-if="loading" v-model="loading" :is-full-page="true"></UiLoading>

    <section class="section pb-2">
      <div class="container content">
        <h1 class="title">CVE list</h1>

        <AboutData>
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
        </AboutData>

        <FilterPanel :summary="summary">
          <div class="form-row">
            <UiField label="Year">
              <UiSelect v-model="filter_date" placeholder="All" @change="updateUrl">
                <option value="All">All</option>
                <option v-for="year in all_years" :key="year" :value="year">
                {{ year }}
                </option>
              </UiSelect>
            </UiField>

            <UiField label="Component" v-if="!filter_component">
              <UiSelect v-model="filter_component" placeholder="All" @change="updateUrl">
                <option v-for="component in all_components" :key="component" :value="component">
                {{ component }}
                </option>
              </UiSelect>
            </UiField>

            <UiField label="Component" v-else>
              <span class="tag is-medium">
                {{ filter_component }}
                <button
                  type="button"
                  class="delete is-small"
                  aria-label="Clear the component"
                  @click="filter_component = null"></button>
              </span>
            </UiField>

            <UiField label="Private bugs">
              <UiSwitch v-model="hide_private" @change="updateUrl">Hide</UiSwitch>
            </UiField>
            <UiField label="Description">
              <UiSwitch v-model="show_description" @change="updateUrl">Show</UiSwitch>
            </UiField>
          </div>

          <UiField label="Group by">
            <UiSegmented v-model="group_by" :options="group_by_options" />
          </UiField>
        </FilterPanel>
      </div>
    </section>


    <section class="section cve-group" v-for="group in visible_groups" :key="group.key">
      <div class="container content">
        <h3 class="title">
          {{ group.key}}
          <div style="display: inline-block;" class="tags has-addons mr-2
          is-pulled-right">
            <span class="tag is-dark is-medium">
              {{ formatter(group.cves.total_reward) }}
            </span>
            <span class="tag is-info is-medium">
              {{ group.cves.length }} CVEs
            </span>
          </div>
        </h3>

        <div class="grid">
          <template v-for="cve in group.shown">
            <NuxtLink :to="'/cve?id='+cve.id" class="cve-link">
            {{ cve.id }}
            </NuxtLink>
            <div class="cve-description">
              <div class="taglist">
                <span class="tag is-danger is-small" v-if="!cve.bug_date">
                  Private bug
                </span>
              </div>
              <div class="taglist">
                <span class="tag is-info is-small" v-if="cve.vrp_reward">
                  {{ formatter(cve.vrp_reward) }}
                </span>
              </div>
              <div class="taglist">
                <span v-for="repo in cve.repos" class="tag ml-2" :style="
                                                 {
                                                 backgroundColor: repo_color.get(repo) || 'black',
                                                 color: 'white',
                                                 }
                                                 ">
                                                 {{ repo }}
                </span>
              </div>
              <div class="taglist">
                <span v-if="cve.cweId" class="tag ml-2">
                  {{ cve.cweId }} - {{ (cweTitle as Record<string, string>)[cve.cweId] }}
                </span>
              </div>
              <div class="taglist">
                <span v-if="cve.severity" class="tag is-danger ml-2">
                  {{ cve.severity }}
                </span>
              </div>
              <div class="taglist">
                <span v-for="component in cve.components" class="tag is-warning ml-2">
                  {{ component }}
                </span>
              </div>
              <br>
              <span class="cve-description-text" v-if="show_description">
                {{ cve.title || cve.description }}
              </span>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- Render more CVEs when this comes into view. -->
    <div v-if="limit < total_cves" ref="more" :key="limit" class="container has-text-centered pb-6">
      <button type="button" class="button" @click="limit += PAGE">
        Show more ({{ limit }} / {{ total_cves }})
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { fetchCveData } from '~/utils/cve'

import humanizeDuration from "humanize-duration";
import { format } from "d3-format";
import cweTitle from "~/utils/cwe.json";

const formatter = format("$,.0f");
// Dark enough for white text (contrast >= 4.5).
const repo_color = new Map([
  ["angle", "#b45309"],
  ["chromium", "#121212"],
  ["chromiumos-platform2", "#1d4ed8"],
  ["dawn", "#c2410c"],
  ["pdfium", "#9C27B0"],
  ["skia", "#a16207"],
  ["v8", "#c62828"],
  ["webrtc", "#0369a1"],
  ["swiftshader", "#15803d"],
]);

const router = useRouter();
const route = useRoute();


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
const group_by_options = [
  { value: 'version', label: 'Version' },
  { value: 'version_major', label: 'Version major' },
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'vrp_reward', label: 'Reward' },
  { value: 'severity', label: 'Severity' },
  { value: 'component', label: 'Component' },
  { value: 'cwe', label: 'CWE' },
  { value: 'authors', label: 'Authors' },
  { value: 'reviewers', label: 'Reviewers' },
];
const grouped = ref([]);

// Render the CVEs progressively, as building the whole list at once is slow.
const PAGE = 150;
const limit = ref(PAGE);
watch(grouped, () => {
  limit.value = PAGE;
});

const total_cves = computed(() =>
  grouped.value.reduce((sum, group) => sum + group.cves.length, 0));

const visible_groups = computed(() => {
  const out = [];
  let budget = limit.value;
  for (const group of grouped.value) {
    if (budget <= 0) {
      break;
    }
    out.push({ ...group, shown: group.cves.slice(0, budget) });
    budget -= group.cves.length;
  }
  return out;
});

const more = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      limit.value += PAGE;
    }
  }, { rootMargin: "1000px" });
});
// The element is recreated at each step, so that it is observed again even
// when it stays in view.
watch(more, (element, previous) => {
  if (previous) {
    observer?.unobserve(previous);
  }
  if (element) {
    observer?.observe(element);
  }
});
onUnmounted(() => observer?.disconnect());

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

const summary = computed(() => [
  filter_date.value && filter_date.value != "All" ? filter_date.value : "All years",
  filter_component.value ?? "All components",
  "By " + group_by_options.find(o => o.value == group_by.value)?.label,
].join(" · "));

const filter_repo = ref(null);
if (route.query.repo) {
  filter_repo.value = route.query.repo;
}

const hide_private = ref(false);
if (route.query.hide_private) {
  hide_private.value = route.query.hide_private == "true";
}

const show_description = ref(true);
if (route.query.show_description) {
  show_description.value = route.query.show_description == "true";
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
  if (!show_description.value) {
    query.show_description = "false";
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
    show_description,
  ],
  updateUrl,
);


onMounted(async () => {
  data.value = await fetchCveData();

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
        const cwe = cve.cweId ? `${cve.cweId} - ${(cweTitle as Record<string, string>)[cve.cweId]}` : "n/a";
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
  show_description,
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
  background-color: var(--surface);
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

.taglist {
  display: inline-block;
}

.cve-group {
  padding-bottom: 1rem;
  padding-top: 1rem;
}

/* On narrow screens, put the CVE id above its description. */
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
    grid-gap: 0.25em;
  }

  .cve-description {
    margin-bottom: 1em;
  }

  .cve-description .tag {
    height: auto;
    margin-left: 0 !important;
    margin-right: 0.5rem;
    white-space: normal;
  }
}

</style>
