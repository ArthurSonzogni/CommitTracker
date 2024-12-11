<template>
  <div>
    <Navbar/>
    <section class="section content">
      <div class="container">
        <h2 class="title">
          {{ id }}
          <b-tag type="is-danger is-small" class="ml-2"
              v-if="!cve.bug_date">
            <b-tooltip label="Bug are opened 14 weeks after being fixed" position="is-top">
            Private bug
            </b-tooltip>
          </b-tag>
          <b-tag type="is-info is-small" class="ml-2" v-else>
            public
          </b-tag>
        </h2>
        <div class="grid" v-if="cve.bug">
          <strong>Description</strong>
          <p> {{ cve.description }} </p>

          <template v-if="cve.vrp_reward">
            <strong>VRP reward</strong>
            <div> {{ reward_formatter(cve.vrp_reward) }} </div>
          </template>

          <strong>Bug </strong>
          <a :href="cve.bug"> {{ cve.bug }} </a>

          <template v-if="cve.components">
            <strong>Components</strong>
            <div>
              <div v-for="component in cve.components">
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
            <div class="event" v-for="event in events">
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

              <div class="header">
                {{ event.title }}
              </div>

              <div class="date">
                {{ hdate.prettyPrint(event.date) }}
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

const reward_formatter = format("$,.0f");
const route = useRoute();
const router = useRouter();
const id = ref(route.query.id);

const cve = ref({});

const events = ref([]);

const getEvents = (cve) => {
  const events = [];

  events.push({
    title: `CVE published`,
    date: new Date(cve.published),
  })

  if (cve.bug_date) {
    events.push({
      title: `Bug reported`,
      date: new Date(cve.bug_date),
    })
  }

  for (const [channel, date] of Object.entries(cve.version_dates)) {
    events.push({
      title: `${channel} version deployed.`,
      date: new Date(date),
    })
  }

  events.sort((a, b)=> a.date - b.date);

  // Compute delta in between events
  for (let i=1; i < events.length; i++) {
    events[i].delta=events[i].date - events[i-1].date;
  }

  // Compute absolute_delta in between events
  for (let i=1; i < events.length; i++) {
    events[i].absolute_delta=events[i].date - events[0].date;
  }

  return events;
}

onMounted(async ()=> {
  const response=await fetch("/cve/data.json");
  const data=await response.json();

  let out=null;
  for (const cve_ of data) {
    if (cve_.id==id.value) {
      out=cve_;
      break;
    }
  }

  cve.value=out;
  events.value=getEvents(out);
});

</script>
<style scoped>
.grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 1em;
}

.events {
  border-left: 1px solid black;
  padding-left: 1em;
  margin-left: 150px;
  padding-top: 10px;
}

.event {
  .header {
    background-color: #f0f0f0;
    margin-left: 8px;
    padding: 0.5em;
    border-radius: 0.5em 0.5em 0 0;
    font-weight: bold;
  }

  .date{
    background-color: #f0f0f0;
    margin-left: 8px;
    padding: 0.5em;
    border-radius: 0 0 0.5em 0.5em;
  }

  .duration{
    display:relative;
    width: 200px;
    transform: translateX(-200px);
    text-align: right;
    padding-right: 30px;
  }

  /*Display a bullet after the date*/
  .duration::after {
    content: "";
    position: absolute;
    width: 20px;
    height: 20px;
    background-color: black;
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



</style>
