<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Organizations contributions</h1>

        <p>
          <strong>Repositories?</strong>
        </p>
        <RepositorySelector
          v-model="repositories"
          size="small"
          :allowMultiple="true"
          :allowAll="true"
          />

        <p>
          <strong>Organizations:</strong>
        </p>
        <OrganizationsSelector
          v-model="organizations"
          size="small"
          :allowMultiple="true"
          :allowAll="true"
          :repositories="repositories"
          >
          <div>
            <b-tooltip
              multilined
              label="Include all the organizations that are not in the
              list as 'Others'" position="is-bottom">
              <b-checkbox
                size="small"
                name="others"
                v-model="others"
                >
                Others
              </b-checkbox>
            </b-tooltip>
          </div>
        </OrganizationsSelector>

        <b-field grouped group-multiline>
          <b-field label="As:">
            <b-radio-button name="kind" v-model="kind" native-value="author">
              author
            </b-radio-button>
            <b-radio-button name="kind" v-model="kind" native-value="review">
              reviewer
            </b-radio-button>
            <b-radio-button name="kind" v-model="kind" native-value="both">
              both
            </b-radio-button>
          </b-field>

          <b-field label="Grouping:">
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="forever">
              Forever
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="decennial">
              Decennial
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="yearly">
              Yearly
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="quarterly">
              Quarterly
            </b-radio-button>
            <b-radio-button
              name="grouping"
              v-model="grouping"
              native-value="monthly">
              Monthly
            </b-radio-button>
          </b-field>

          <b-field label="Colors:">
            <b-radio-button
              name="colors"
              v-model="colors"
              native-value="repositories">
              Repositories
            </b-radio-button>
            <b-radio-button
              name="colors"
              v-model="colors"
              native-value="organizations">
              Organizations
            </b-radio-button>
          </b-field>

          <b-field label="Chart:">
            <b-radio-button
              name="chart"
              v-model="chart"
              native-value="line">
              Line
            </b-radio-button>
            <b-radio-button
              name="chart"
              v-model="chart"
              native-value="bar">
              Bar
            </b-radio-button>
          </b-field>

        </b-field>

        <Organizations
          :repositories="repositories"
          :grouping="grouping"
          :colors="colors"
          :kind="kind"
          :metric="metric"
          :organizations="organizations"
          :chart="chart"
          :dates="dates"
          :others="others"
          :display="display"
        >

          <b-field class="has-addons">
            <b-radio-button size="small" name="metric"
              v-model="metric" native-value="commit">
              <b-tooltip label="Number of commits">
              ⚙️
              </b-tooltip>
            </b-radio-button>
            <b-radio-button size="small" name="metric"
              v-model="metric" native-value="contributor" >
              <b-tooltip label="Number of contributors">
              🧍
              </b-tooltip>
            </b-radio-button>
          </b-field>

          <div class="mr-2"></div>

          <b-field class="has-addons">
            <b-radio-button size="small" name="display"
              v-model="display" native-value="accumulative"
              :disabled="metric == 'contributor'"
            >
              Accumulative
            </b-radio-button>
            <b-radio-button size="small" name="display"
              v-model="display" native-value="absolute" >
              Absolute
            </b-radio-button>
            <b-radio-button size="small" name="display"
              v-model="display" native-value="percent" >
              percent
            </b-radio-button>
          </b-field>

        </Organizations>

        <!-- Warn users for invalid combinaisons -->
        <div v-if="metric == 'contributor'" class="mt-2">
          <b-notification type="is-warning" v-if="repositories.length > 1">
            <p>
              <strong>Note:</strong> Contributors who have contributed to
              multiple repositories will be counted once per repository.
            </p>
          </b-notification>
        </div>

      </div>
    </section>

    <section class="section">
      <b-field expanded>
        <Timeline v-model="dates" ></Timeline>
      </b-field>
    </section>
  </div>
</template>

<script setup lang="ts">

import all_organizations from 'public/data/organizations.json'

const route = useRoute();
const router = useRouter();

const repositories = ref<string[]>(["chromium"]);
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}

const organizations = ref<string[]>([
  "ARM","Adobe","Apple","ByteDance","Google","Igalia","Individuals","Intel",
  "LGE","Microsoft","Nokia","Opera","Samsung","Unknown","WebKit","Yandex"
])
if (route.query.organizations) {
  if (route.query.organizations === "all") {
    organizations.value = all_organizations;
  } else {
    organizations.value = route.query.organizations.split(",");
  }
}

const grouping = ref<string>("yearly");
if (route.query.grouping) {
  grouping.value = route.query.grouping as string;
}

const colors = ref<string>("organizations");
if (route.query.colors) {
  colors.value = route.query.colors as string;
}

const kind = ref<string>("author");
if (route.query.kind) {
  kind.value = route.query.kind as string;
}

const metric = ref<string>("commit");
if (route.query.metric) {
  metric.value = route.query.metric as string;
}

const chart = ref<string>("bar");
if (route.query.chart) {
  chart.value = route.query.chart as string;
}

const dates = ref<Date[]>([new Date("2000-01-01"), new Date()]);
if (route.query.dates) {
  dates.value = route.query.dates.split(',').map(d => new Date(d));
}

const others = ref(route.query.others === null);
const display = ref(
  route.query.percent === null ? 'percent' :
  route.query.accu === null ? 'accumulative' :
  'absolute'
);


const updateUrl = () => {
  router.push({
    query: {
      repositories: repositories.value.join(","),
      organizations: organizations.value.length === all_organizations.length
        ? "all"
        : organizations.value.join(","),
      grouping: grouping.value,
      colors: colors.value,
      kind: kind.value,
      metric: metric.value,
      chart: chart.value,
      dates: dates.value.map(d => d.toISOString().split("T")[0]).join(','),
      others: others.value ? null : undefined,
      percent: display.value === "percent" ? null : undefined,
      accu: display.value === "accumulative" ? null : undefined,
    },
  });
}

watch([
  repositories,
  organizations,
  grouping,
  colors,
  kind,
  metric,
  chart,
  dates,
  others,
  display,
], updateUrl);

// Avoid unsupported combinations:
watch(metric, () => {
  if (metric.value === "contributor" && display.value === "accumulative") {
    display.value = "absolute";
  }
});

</script>

