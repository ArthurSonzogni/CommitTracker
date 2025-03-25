<template>
  <div>
    <Navbar/>
    <section class="section content">
      <h1 class="title">
        Chromium CVEs
      </h1>

      <b-field label="Severity">
        <b-checkbox-button v-model="severities" native-value="Low">Low</b-checkbox-button>
        <b-checkbox-button v-model="severities" native-value="Medium">Medium</b-checkbox-button>
        <b-checkbox-button v-model="severities" native-value="High">High</b-checkbox-button>
        <b-checkbox-button v-model="severities" native-value="Critical">Critical</b-checkbox-button>
      </b-field>

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

    </section>

    <!--<section>-->
      <!--<BarChart-->
        <!--v-for="(data, i) in cve_list_ref"-->
        <!--:key="i"-->
        <!--:timeLabel="data.year"-->
        <!--:data="data.cves"-->
        <!--:formatter="cve_count_format"-->
        <!--/>-->
    <!--</section>-->

    <section
      class="section container"
      v-for="(data,i) in cve_list_ref">

      <h2 class="title"> {{ data.year }} </h2>

      <div class="grid">
        <strong>Total : </strong>
        <p>{{ data.total }} CVEs</p>

        <template v-if="i > 0">
          <strong>Y/Y :</strong>
          <p>
            {{
            cve_percent_format((data.total - data.total_previous) / data.total * 100)
            }} %
          </p>
        </template>
        <template v-if="i === 0">
          <strong>Projected :</strong>
          [
          {{ projected_low }}
          CVEs
          ,
          {{ projected_high }}
          CVEs
          ]
        </template>
        <template v-if="i === 0">
          <strong>Y/Y projected :</strong>
          [
          {{
          cve_percent_format((projected_low- data.total_previous) /
          data.total_previous * 100)
          }} %
          ,
          {{
          cve_percent_format((projected_high - data.total_previous) /
          data.total_previous * 100)
          }} %
          ]
        </template>
      </div>

      <hr>

      <table class="table is-bordered is-striped is-narrow is-hoverable">
        <thead>
          <th scope="col" ></th>
          <th scope="col" v-for="project in project_list">
            {{ project }}
          </th>
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

const cve_count_format = format("+,d");
const cve_percent_format = format("+.1f");

const router = useRouter();
const route = useRoute();

const severities = ref(["Low", "Medium", "High", "Critical"]);

if (route.query.severities) {
  severities.value = route.query.severities.split(",");
}

watch(severities, () => {
  router.push({
    query: {
      severities: severities.value.length !== 4 ? severities.value.join(",") : null,
    }
  });
  render();
});

const cve_list_ref = ref([]);

const projected_low = ref(0);
const projected_high = ref(0);

const project_list = [
  "angle",
  "chromium",
  "dawn",
  "skia",
  "swiftshader",
  "v8",
  "webrtc"
];

const render = async () => {

  const response = await fetch("/cve/data.json");
  let data = await response.json();

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

  data = data.map((cve) => {
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
    let out = data;
    // Filter by year.
      out = out.filter((cve) => {
        return cve.id && cve.id.startsWith(year_string);
      });
    out = out.reverse();

    // Filter by severity.
      out = out.filter((cve) => {
        return cve.severity && severities.value.includes(cve.severity);
      });

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
    .from(new Set(data.map((cve) => cve.id?.slice(0, 4))))
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
  });

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
  {
    const now = new Date();
    const year_percent =
      (now - new Date(`${now.getFullYear()}-01-01`)) /
      (new Date(`${now.getFullYear() + 1}-01-01`) - new Date(`${now.getFullYear()}-01-01`));

    const mean = cve_list[0].total / year_percent;
    const std = Math.sqrt(mean * (1 - year_percent));
    projected_low.value =
      Math.round(
        cve_list[0].total + (mean - 1.96 * std) * (1 -
          year_percent)
      );
    projected_high.value =
      Math.round(
        cve_list[0].total + (mean + 1.96 * std) * (1 -
          year_percent)
      );
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

</style>
