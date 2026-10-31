<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">Organizations commits</h1>

        <FilterPanel :summary="summary">
          <UiField>
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
import all_organizations from "../../public/data/organizations.json";
import { useUrlState, urlCodecs, type UrlCodec } from "~/composables/useUrlState";
import { capitalize, listSummary, repositoryNames } from "~/utils/filter-summary";

const DEFAULT_ORGANIZATIONS = [
  "ARM", "Adobe", "Apple", "ByteDance", "Google", "Igalia", "Individuals", "Intel",
  "LGE", "Microsoft", "Nokia", "Opera", "Samsung", "Unknown", "WebKit", "Yandex",
] as const;

const baseOrganizationsCodec = urlCodecs.csv(DEFAULT_ORGANIZATIONS);
const organizationsCodec: UrlCodec<string[]> = {
  parse: (raw) => {
    if (raw === "all") return [...all_organizations];
    return baseOrganizationsCodec.parse(raw);
  },
  serialize: (val) => {
    if (val.length === all_organizations.length) return "all";
    return baseOrganizationsCodec.serialize(val);
  },
  equals: baseOrganizationsCodec.equals,
};

const {
  repositories,
  organizations,
  grouping,
  colors,
  kind,
  metric,
  chart,
  dates,
  others,
  percent,
  accu,
} = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
  organizations: organizationsCodec,
  grouping: urlCodecs.enum(
    ["forever", "decennial", "yearly", "quarterly", "monthly"] as const,
    "yearly",
  ),
  colors: urlCodecs.enum(["repositories", "organizations"] as const, "organizations"),
  kind: urlCodecs.enum(["author", "review", "both"] as const, "author"),
  metric: urlCodecs.enum(["commit", "contributor"] as const, "commit"),
  chart: urlCodecs.enum(["line", "bar"] as const, "bar"),
  dates: urlCodecs.dateRange("2000-01-01"),
  others: urlCodecs.flag(),
  percent: urlCodecs.flag(),
  accu: urlCodecs.flag(),
});

const display = computed<"percent" | "accumulative" | "absolute">({
  get: () => (percent.value ? "percent" : accu.value ? "accumulative" : "absolute"),
  set: (val) => {
    percent.value = val === "percent";
    accu.value = val === "accumulative";
  },
});

const summary = computed(() => [
  listSummary(repositoryNames(repositories.value), "repositories"),
  organizations.value.length === all_organizations.length
    ? "All organizations"
    : listSummary(organizations.value, "organizations"),
  capitalize(grouping.value),
].join(" · "));

// Avoid unsupported combinations:
watch(metric, () => {
  if (metric.value === "contributor" && display.value === "accumulative") {
    display.value = "absolute";
  }
});
</script>

