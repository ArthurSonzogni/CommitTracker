<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Organizations contributions</h1>

        <FilterPanel :summary="summary">
          <UiField label="Repositories">
            <RepositorySelector
              v-model="repositories"
              size="small"
              :allowMultiple="true"
              :allowAll="true"
              />
          </UiField>

          <UiField label="Organizations">
            <OrganizationsSelector
              v-model="organizations"
              size="small"
              :allowMultiple="true"
              :allowAll="true"
              :repositories="repositories"
              >
              <div>
                <UiTooltip multiline text="Include all the organizations that are not in the
                  list as 'Others'" position="bottom">
                  <UiCheckbox name="others" v-model="others">
                    Others
                  </UiCheckbox>
                </UiTooltip>
              </div>
            </OrganizationsSelector>
          </UiField>

          <div class="form-row">
            <UiField label="Count as">
              <UiSegmented
                v-model="kind"
                :options="[
                { value: 'author', label: 'Author' },
                { value: 'review', label: 'Reviewer' },
                { value: 'both', label: 'Both' },
              ]" />
            </UiField>

            <UiField label="Grouping">
              <UiSegmented
                v-model="grouping"
                :options="[
                { value: 'forever', label: 'Forever' },
                { value: 'decennial', label: 'Decennial' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'monthly', label: 'Monthly' },
              ]" />
            </UiField>

            <UiField label="Colors">
              <UiSegmented
                v-model="colors"
                :options="[
                { value: 'repositories', label: 'Repositories' },
                { value: 'organizations', label: 'Organizations' },
              ]" />
            </UiField>

            <UiField label="Chart">
              <UiSegmented
                v-model="chart"
                :options="[
                { value: 'line', label: 'Line' },
                { value: 'bar', label: 'Bar' },
              ]" />
            </UiField>

          </div>

        </FilterPanel>

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

          <UiField class="has-addons">
            <UiSegmented
              v-model="metric"
              :options="[
              { value: 'commit', label: 'Commits', title: 'Number of commits' },
              { value: 'contributor', label: 'Contributors', title: 'Number of contributors' },
            ]" />
          </UiField>

          <div class="mr-2"></div>

          <UiField class="has-addons">
            <UiSegmented
              v-model="display"
              :options="[
              { value: 'accumulative', label: 'Accumulative', disabled: metric == 'contributor' },
              { value: 'absolute', label: 'Absolute' },
              { value: 'percent', label: 'Percent' },
            ]" />
          </UiField>

        </Organizations>

        <!-- Warn users for invalid combinaisons -->
        <div v-if="metric == 'contributor'" class="mt-2">
          <div class="notification is-warning" v-if="repositories.length > 1">
            <p>
              <strong>Note:</strong> Contributors who have contributed to
              multiple repositories will be counted once per repository.
            </p>
          </div>
        </div>

      </div>
    </section>

    <section class="section">
      <UiField expanded>
        <Timeline v-model="dates" ></Timeline>
      </UiField>
    </section>
  </div>
</template>

<script setup lang="ts">

import all_organizations from '../../public/data/organizations.json'

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

const summary = computed(() => [
  listSummary(repositoryNames(repositories.value), "repositories"),
  organizations.value.length === all_organizations.length
    ? "All organizations"
    : listSummary(organizations.value, "organizations"),
  grouping.value[0].toUpperCase() + grouping.value.slice(1),
].join(" · "));

// Avoid unsupported combinations:
watch(metric, () => {
  if (metric.value === "contributor" && display.value === "accumulative") {
    display.value = "absolute";
  }
});

</script>

