<template>
  <div>
    <Navbar/>
    <section class="section container">
      <h1 class="title">Chromium CVE</h1>
      <p>
        Note: vulnerabilities aren't always associated with a CVE. Bugs are
        often fixed before affecting stable releases. Some are immediately found
        using fuzzers, or internal audits. This page only display CVEs. For a
        more complete view of Chromium security issues, please refer to <NuxtLink
        to="https://crbug.com/issues?q=((componentid:1363614%2B%20type:vulnerability)%20%7C%20collaborator:security@chromium.org)%20-status:(new%20%7C%20duplicate%20%7C%20infeasible%20%7C%20intended_behavior%20%7C%20not_reproducible%20%7C%20obsolete)%20hotlistid:(5432902%20%7C%205432548)">the bug tracker</NuxtLink>.
      </p>
    </section>

    <section class="section container sticky">
      <div class="columns">
        <div class="column">
          <b-field label="Severity">
            <b-checkbox-button v-model="severities" native-value="Low">Low</b-checkbox-button>
            <b-checkbox-button v-model="severities" native-value="Medium">Medium</b-checkbox-button>
            <b-checkbox-button v-model="severities" native-value="High">High</b-checkbox-button>
            <b-checkbox-button v-model="severities" native-value="Critical">Critical</b-checkbox-button>
          </b-field>
        </div>

        <div class="column">
          <template v-if="severities.includes('Low')">
            <b-icon type="is-info" icon="circle"></b-icon> Low
          </template>
          <template v-if="severities.includes('Medium')">
            <b-icon type="is-warning" icon="circle"></b-icon> Medium
          </template>
          <template v-if="severities.includes('High')">
            <b-icon type="is-danger" icon="circle"></b-icon> High
          </template>
          <template v-if="severities.includes('Critical')">
            <b-icon icon="circle"></b-icon> Critical
          </template>

        </div>
      </div>
    </section>

    <section
      class="section container"
      v-for="(data,i) in cve_by_year">

      <h2 class="title"> {{ data.year }} </h2>

      <ClientOnly>
        <CveProgressionGraph
          v-if="filtered_cves.length > 0"
          :year="data.year"
          :data="filtered_cves"
          :totalPrevious="data.total_previous || 0"
          :projection="i === 0 ? { low: projection.low, high: projection.high } : undefined"
        />
      </ClientOnly>

      <div class="grid">
        <strong>Total : </strong>
        <p>{{ data.total }} CVEs</p>

        <template v-if="i === 0">
          <strong>Projection :</strong>
          [
          {{ projection.low }}
          CVEs
          ,
          {{ projection.high }}
          CVEs
          ]
          <strong>Y/Y projection :</strong>
          [
          {{
          cve_percent_format((projection.low- data.total_previous) /
          data.total_previous * 100)
          }} %
          ,
          {{
          cve_percent_format((projection.high - data.total_previous) /
          data.total_previous * 100)
          }} %
          ]
        </template>
        <template v-else>
          <strong>Y/Y :</strong>
          <p>
            {{
            cve_percent_format((data.total - data.total_previous) /
            data.total_previous * 100)
            }} %
          </p>
        </template>
      </div>

      <hr>

        <table class="table is-bordered is-striped is-narrow is-hoverable">
          <thead>
            <tr>
              <th scope="col" ></th>
              <th scope="col" v-for="project in project_list">
                {{ project }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(cves, cweId) in data.cves">
              <th scope="row"> {{ cweId}} </th>
              <td v-for="project in project_list">
                <span v-if="cves[project]">
                  <NuxtLink
                    v-for="cve in cves[project]"
                    :to="`/cve?id=${cve.id}`"
                    >
                    <b-tooltip
                      type="is-light"
                      >
                      <template v-slot:content
                                style="width: 500px">
                        <p style="white-space: pre-line; width: 500px; ">
                          <strong>
                            {{ cve.id }}
                          </strong>
                          -
                          {{ cve.description }}
                        </p>
                        <p v-if="cve.vrp_reward">
                          <strong> Reward </strong>
                          {{ cve.vrp_reward }}$
                        </p>

                        <p v-for="component in cve.components">
                          <strong> Component </strong>
                          {{ component }}
                        </p>

                      </template>

                      <b-icon v-if="cve.severity === 'Low'" type="is-info" icon="circle"></b-icon>
                      <b-icon v-if="cve.severity === 'Medium'" type="is-warning" icon="circle"></b-icon>
                      <b-icon v-if="cve.severity === 'High'" type="is-danger" icon="circle"></b-icon>
                      <b-icon v-if="cve.severity === 'Critical'" icon="circle"></b-icon>
                    </b-tooltip>
                  </NuxtLink>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
    </section>
  </div>
</template>

<script lang="ts" setup>

import { format } from "d3-format";
import { jStat } from "jstat";

interface Cve { id: string; published: string; year: number; project: string; [key: string]: any; }

const getCveYear = (cve: Cve): number => {
  return new Date(cve.published).getFullYear();
};

const cve_count_format = format("+,d");
const cve_percent_format = format("+.1f");

const router = useRouter();
const route = useRoute();

const severities = ref(["High", "Critical"]);

if (route.query.severities) {
  severities.value = (route.query.severities as string).split(",");
}

watch(severities, () => {
  const has_default_severities =
    severities.value.length === 2 &&
    severities.value.includes("High") &&
    severities.value.includes("Critical");

  router.push({
    query: {
      severities: has_default_severities ? undefined :
      severities.value.join(","),
    }
  });
});

const all_cve_data = shallowRef<Cve[]>([]);

const project_list = [
  "angle",
  "chromium",
  "dawn",
  "skia",
  "swiftshader",
  "v8",
  "webrtc"
];

const cve_project = (cve: any) => {
  if (!cve.description) {
    return "???";
  }
  for (const project of project_list) {
    if (project == "chromium") {
      continue;
    }
    if (cve.description.toLowerCase().includes(project)) {
      return project;
    }
  }
  return "chromium";
}

/**
 * Calculates the projected interval, ensuring the Lower Bound
 * never drops below the already observed count.
 */
function calculateProjectedInterval(count, timeFraction, confidence = 0.9) {
    const alpha = 1 - confidence;

    // 1. Calculate Exact Poisson limits for the current count
    // Lower Bound (L):
    const lowerLambda = count === 0
        ? 0
        : jStat.chisquare.inv(alpha / 2, 2 * count) / 2;

    // Upper Bound (U):
    const upperLambda = jStat.chisquare.inv(1 - alpha / 2, 2 * (count + 1)) / 2;

    // 2. Extrapolate to full year
    const projectedLowerRate = lowerLambda / timeFraction;
    const projectedUpperRate = upperLambda / timeFraction;
    const projectedMean = count / timeFraction;

    // 3. Apply Constraints
    // The year's total cannot be less than what has already happened.
    const finalLower = Math.max(count, projectedLowerRate);
    const finalUpper = Math.max(count, projectedUpperRate);

    return {
        observedCount: count,
        timeFraction: timeFraction,
        projectedMean: parseFloat(projectedMean.toFixed(2)),
        confidenceInterval: {
            lower: parseFloat(finalLower.toFixed(2)),
            upper: parseFloat(finalUpper.toFixed(2)),
            constraintApplied: finalLower === count ? "Yes (Floor)" : "No"
        }
    };
}

onMounted(async () => {
  const response = await fetch("/cve/data.json");
  const data = await response.json();
  all_cve_data.value = data.map((cve: any) => ({
    ...cve,
    year: getCveYear(cve),
    project: cve_project(cve),
  }));
});

const filtered_cves = computed(() => {
  return all_cve_data.value.filter(cve => {
    return cve.severity && severities.value.includes(cve.severity)
      && cve.year > 2020;
  });
});

const severity_map = new Map([
  ["Low", 0],
  ["Medium", 1],
  ["High", 2],
  ["Critical", 3],
]);

const cve_by_year = computed(() => {
  const repo_data = filtered_cves.value;
  
  const year_list = Array
    .from(new Set(repo_data.map((cve: Cve) => cve.year)))
    .filter(x => x)
    .sort((a,b) => b - a)
  ;

  const current_year = new Date().getFullYear();
  if (!year_list.includes(current_year)) {
    year_list.unshift(current_year);
  }

  const list = year_list.map((year) => {
    // Filter by year.
    let out = repo_data.filter((cve: Cve) => cve.year === year);
    
    // Sort by severity
    out = out.sort((a, b) => {
      return severity_map.get(a.severity) - severity_map.get(b.severity);
    });

    // GroupBy cweId
    const cves_by_problem = Object.groupBy(out, cve => cve.problem);

    // GroupBy project
    for (const cweId in cves_by_problem) {
      cves_by_problem[cweId] = Object.groupBy(cves_by_problem[cweId], cve => cve.project);
    }

    return {
      year: year,
      cves: cves_by_problem,
      total: out.length,
      total_previous: 0 // Will be filled below
    };
  });

  // Compute previous totals
  for (let i = 0; i < list.length - 1; i++) {
    // list[i] is current year in loop (descending), list[i+1] is previous year
    // Wait, the original logic was:
    // if (i > 0) cve_list[i-1].total_previous = total;
    // list is descending: [2025, 2024, 2023...]
    // So list[1] (2024) is "previous" to list[0] (2025).
    // So list[0].total_previous should be list[1].total.
    if (list[i+1]) {
        list[i].total_previous = list[i+1].total;
    }
  }
  
  return list;
});

const projection = computed(() => {
  if (cve_by_year.value.length === 0) return { low: 0, high: 0 };
  
  const now = new Date();
  const year_percent =
    (now.getTime() - new Date(`${now.getFullYear()}-01-01`).getTime()) /
    (new Date(`${now.getFullYear() + 1}-01-01`).getTime() - new Date(`${now.getFullYear()}-01-01`).getTime());

  const proj = calculateProjectedInterval(
    cve_by_year.value[0].total,
    year_percent,
    0.95
  );
  
  return {
      low: Math.round(proj.confidenceInterval.lower),
      high: Math.round(proj.confidenceInterval.upper)
  };
});

</script>

<style scoped>

.grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 0.5em;
}

.grid > strong {
  text-align: right;
}

td {
  max-width: 400px;
}

.sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
  margin-bottom: 0;
  margin-top: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 1);
}

.columns {
  align-items: flex-end;
}

</style>
