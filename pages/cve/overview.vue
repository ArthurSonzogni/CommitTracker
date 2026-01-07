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
      v-for="(data,i) in cve_list_ref">

      <h2 class="title"> {{ data.year }} </h2>

      <ClientOnly>
        <CveProgressionGraph
          v-if="raw_cve_data.length > 0"
          :year="data.year"
          :data="raw_cve_data"
          :totalPrevious="data.total_previous || 0"
          :projection="i === 0 ? { low: projection_low, high: projection_high } : undefined"
        />
      </ClientOnly>

      <div class="grid">
        <strong>Total : </strong>
        <p>{{ data.total }} CVEs</p>

        <template v-if="i === 0">
          <strong>Projection :</strong>
          [
          {{ projection_low }}
          CVEs
          ,
          {{ projection_high }}
          CVEs
          ]
          <strong>Y/Y projection :</strong>
          [
          {{
          cve_percent_format((projection_low- data.total_previous) /
          data.total_previous * 100)
          }} %
          ,
          {{
          cve_percent_format((projection_high - data.total_previous) /
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

      <Lazy>
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
      </Lazy>
    </section>
  </div>
</template>

<script lang="ts" setup>

import { format } from "d3-format";
import { jStat } from "jstat";

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
  render();
});

const cve_list_ref = ref([]);
const raw_cve_data = ref<any[]>([]);

const projection_low = ref(0);
const projection_high = ref(0);

const project_list = [
  "angle",
  "chromium",
  "dawn",
  "skia",
  "swiftshader",
  "v8",
  "webrtc"
];

/**
 * Calculates the projected interval, ensuring the Lower Bound
 * never drops below the already observed count.
 */
function calculateProjectedInterval(count, timeFraction, confidence = 0.95) {
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

const filter_cve = (cve) => {
  return cve.severity && severities.value.includes(cve.severity)
    && cve.id > "2020";
}

const render = async () => {

  const response = await fetch("/cve/data.json");
  const data = (await response.json()).filter(filter_cve);
  raw_cve_data.value = data;

  const cve_project = cve => {
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

  const repo_data = data.map((cve) => {
    return {
      ...cve,
      project: cve_project(cve),
    };
  });

  const severity_map = new Map([
    ["Low", 0],
    ["Medium", 1],
    ["High", 2],
    ["Critical", 3],
  ]);

  const filter_by_year = (year) => {
    const year_string = year.toString();
    let out = repo_data;
    // Filter by year.
    out = out.filter((cve) => {
      return cve.id && cve.id.startsWith(year_string);
    });
    out = out.reverse();

    // Sort by severity
    out = out.sort((a, b) => {
      return severity_map.get(a.severity) - severity_map.get(b.severity);
    });

    // GroupBy cweId
    out = Object.groupBy(out, cve => cve.problem)

    // GroupBy project
    for (const cweId in out) {
      out[cweId] = Object.groupBy(out[cweId], cve => cve.project);
    }

    return out;
  }

  const year_list = Array
    .from(new Set(repo_data.map((cve) => cve.id?.slice(0, 4))))
    .filter(x => x)
    .sort()
    .reverse()
    .map(x => parseInt(x))
  ;

  const cve_list = year_list.map((year) => {
    return {
      year: year,
      cves: filter_by_year(year),
    };
  })

  // Make sure the current year is included even if no CVEs yet.
  const current_year = new Date().getFullYear();
  if (!cve_list.find((entry) => entry.year === current_year)) {
    cve_list.unshift({
      year: current_year,
      cves: {},
    });
  }

  cve_list_ref.value = cve_list;

  // Compute total for each year.
  for (let i = 0; i < cve_list.length; i++) {
    let total = 0
    Object.values(cve_list[i].cves).forEach((cves) => {
      Object.values(cves).forEach((cve) => {
        total += Object.values(cve).length;
      });
    });
    cve_list[i].total = total;
    if (i > 0) {
      cve_list[i-1].total_previous = total;
    }
  }

  // Compute the estimated number of vulnerabilities for the current year by
  // interpolation based on the date.
  const now = new Date();
  const year_percent =
    (now.getTime() - new Date(`${now.getFullYear()}-01-01`).getTime()) /
    (new Date(`${now.getFullYear() + 1}-01-01`).getTime() - new Date(`${now.getFullYear()}-01-01`).getTime());

  if (cve_list.length > 0) {
      const projection = calculateProjectedInterval(
        cve_list[0].total,
        year_percent,
        0.95
      );
      projection_low.value = Math.round(projection.confidenceInterval.lower);
      projection_high.value = Math.round(projection.confidenceInterval.upper);
  }
}

render();

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
