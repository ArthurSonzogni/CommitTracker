<template>
  <div>
    <section class="section content">
      <div class="container">
        <h2 class="title">
          {{ id }}
          <span class="tag is-danger is-small ml-2" v-if="cve.id && !cve.bug_date">
            <UiTooltip text="Bug are opened 14 weeks after being fixed" position="top">
            Private bug
            </UiTooltip>
          </span>
          <span class="tag is-info is-small ml-2" v-else-if="cve.id">
            public
          </span>
        </h2>
        <p v-if="not_found">
          No CVE found with id "{{ id }}". See the
          <NuxtLink to="/cve/list">list of CVEs</NuxtLink>.
        </p>
        <div class="grid" v-if="cve.bug">
          <template v-if="cve.title">
            <strong>Title</strong>
            <p> {{ cve.title }} </p>
          </template>

          <strong>Description</strong>
          <p> {{ cve.description }} </p>

          <template v-if="cve.vrp_reward">
            <strong>VRP reward</strong>
            <div> {{ reward_formatter(Number(cve.vrp_reward)) }} </div>
          </template>

          <strong>Bug </strong>
          <a :href="cve.bug"> {{ cve.bug }} </a>

          <template v-if="cve.components">
            <strong>Components</strong>
            <div>
              <div v-for="component in cve.components" :key="component">
                {{ component }}
              </div>
            </div>
          </template>

          <strong>Severity</strong>
          <div> {{ cve.severity }} </div>

          <template v-if="cve.found_in">
            <strong>Found in</strong>
            <div> {{ cve.found_in}} </div>
          </template>

          <strong>Version fixed</strong>
          <div> {{ cve.version_fixed }} </div>

          <strong>Events</strong>
          <div class="events">
            <div
              class="event"
              v-for="(event, idx) in events"
              :key="idx"
              :class="{ blur: event.blur }"
            >
              <div class="duration">
                <p v-if="event.absolute_delta != event.delta" class="delta">
                (+{{
                  humanizeDuration(event.delta, {
                    largest: 2,
                    units: ["y", "mo", "w", "d", "h"],
                    round: true,
                  })
                }})
                </p>
                {{
                  humanizeDuration(event.absolute_delta, {
                    largest: 2,
                    units: ["y", "mo", "w", "d", "h"],
                    round: true,
                  })
                }}
              </div>

              <div class="content">
                <div class="header">
                  <UiIcon :name="event.icon" size="small"></UiIcon>
                  {{ event.title }}
                </div>

                <div
                  v-for="resource in event.resources"
                  :key="resource.url"
                  class="resources"
                >
                  <a :href="resource.url">{{ resource.title }}</a>
                </div>

                <div class="date">
                  {{ hdate.prettyPrint(event.date) }}
                </div>
              </div>
            </div>
          </div>

          <strong>Problem</strong>
          <div> {{ cve.problem }} </div>

          <strong>CWE</strong>
          <a :href="'https://cwe.mitre.org/data/definitions/' + cve.cweId + '.html'"> {{ cve.cweId }} </a>

          <strong>Links</strong>
          <div>
            <div>
              <a :href="'https://cve.mitre.org/cgi-bin/cvename.cgi?name=' + id ">MITRE</a>
            </div>
            <div>
              <a :href="'https://nvd.nist.gov/vuln/detail/CVE-' + id">NVD</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import hdate from "human-date";
import humanizeDuration from "humanize-duration";
import { format } from "d3-format";
import { fetchCveData, type CveRecord } from "~/utils/cve";
import { SITE_NAME } from "~/utils/pageMeta";

interface CveEvent {
  icon: string;
  title: string;
  date: Date;
  resources?: { title: string; url: string }[];
  blur?: boolean;
  delta?: number;
  absolute_delta?: number;
}

const reward_formatter = format("$,.0f");
const route = useRoute();
const id = ref("");

const cve = ref<Partial<CveRecord>>({});
const not_found = ref(false);
const events = ref<CveEvent[]>([]);

const getEvents = (record: CveRecord): CveEvent[] => {
  const list: CveEvent[] = [];

  list.push({
    icon: "bullhorn",
    title: "CVE published",
    date: new Date(record.published),
  });

  if (record.bug_date) {
    list.push({
      icon: "bug-outline",
      title: "Bug reported",
      date: new Date(record.bug_date),
      resources: record.bug
        ? [
            {
              title: `${record.bug}`,
              url: record.bug,
            },
          ]
        : undefined,
    });
  }

  for (const [channel, date] of Object.entries(record.version_dates ?? {})) {
    list.push({
      icon: "cloud-upload",
      title: `${channel} version deployed.`,
      date: new Date(date as string),
    });
  }

  for (const sha in record.commits ?? {}) {
    const commit = record.commits![sha];
    if (commit?.type === "commit") {
      const authorPrefix = commit.author ? `${commit.author.split("@")[0]}@` : "unknown";
      list.push({
        icon: "auto-fix",
        title: `${authorPrefix} pushed a fix to ${commit.repo}.`,
        resources: [
          {
            title: commit.title,
            url: `https://cr-rev.appspot.com/${sha}`,
          },
        ],
        date: new Date(commit.date),
      });
    }
  }

  list.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Add indication of private bug if needed.
  if (!record.bug_date) {
    const firstMs = list[0]?.date.getTime() ?? Date.now();
    list.unshift({
      icon: "lock",
      title: "Private bug - details will be available 14 weeks after the fix is deployed.",
      date: new Date(firstMs - 1),
      blur: true,
    });
  }

  // Compute delta and absolute_delta in between events.
  for (let i = 1; i < list.length; i++) {
    list[i].delta = list[i].date.getTime() - list[i - 1].date.getTime();
    list[i].absolute_delta = list[i].date.getTime() - list[0].date.getTime();
  }

  return list;
};

let requestId = 0;

watch(
  () => route.query.id,
  async (rawQueryId) => {
    const rawId = Array.isArray(rawQueryId) ? rawQueryId[0] : rawQueryId;
    const nextId = typeof rawId === "string" ? rawId.trim() : "";

    if (!nextId) {
      if (route.path.replace(/\/$/, "") === "/cve") {
        navigateTo("/cve/overview", { replace: true });
      }
      return;
    }

    const reqId = ++requestId;
    id.value = nextId;
    cve.value = {};
    events.value = [];
    not_found.value = false;

    const data = await fetchCveData();
    if (reqId !== requestId) return;

    const found = data.find(item => item.id === nextId);
    if (!found) {
      not_found.value = true;
      return;
    }

    cve.value = found;
    events.value = getEvents(found);
  },
  { immediate: true },
);

const pageTitle = () => {
  if (!id.value) return `CVE · ${SITE_NAME}`;
  const label = id.value.startsWith("CVE-") ? id.value : `CVE-${id.value}`;
  return `${label} · ${SITE_NAME}`;
};

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
});
</script>
<style scoped>
.grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.5em;
  overflow-wrap: anywhere;
}

/* On narrow screens, display the labels above their values. */
@media (max-width: 768px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.events {
  border-left: 1px solid black;
  padding-left: 1em;
  margin-left: 150px;
}

.event {
  margin-top: 1em;
  margin-bottom: 1em;

  .content {
    border-radius: 0.5em;
    padding: 0.5em;
    background: linear-gradient(90deg, #f0f0f0 0%, #f0f0f0 80%, #f0f0f000 95%);

    .header {
      margin: 0.5em;
      font-weight: bold;
    }

    .resources {
      margin-left: 1em;
    }

    .date {
      margin: 0.5em;
      font-size: 0.8em;
      margin-left: 1em;
    }
  }


  .duration{
    height: 0;
    display:relative;
    width: 200px;
    transform: translate(-200px, -5px);
    text-align: right;
    padding-right: 30px;
  }

  /*Display a bullet after the date*/
  .duration::after {
    content: "";
    position: absolute;
    width: 20px;
    height: 20px;
    background-color: var(--ink);
    border-radius: 50%;
    top: 50%;
    transform: translateY(-50%);
    left: 174px;
    border: 5px solid white;
  }
}

.delta {
  color: #888;
  font-size: 0.8em;
}

.event.blur {
  filter: blur(4px);
  user-select: none;
  transition: filter 0.2s;
}

.event.blur:hover {
  filter: none;
}
</style>
