<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">
          <b-icon icon="strike" />
          {{data.length}}
        fuzzers in chromium</h1>

        <LineChart :data="graph" />
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Fuzzers</h2>
        <b-table
          :data="data"
          hoverable
          scrollable
          height="500"
          sticky-header
          striped
          >
          <b-table-column field="date" label="Date" v-slot="props" sortable >
            {{ props.row.date }}
          </b-table-column>

          <b-table-column field="author" label="Author" v-slot="props" sortable>
            <router-link :to="{
            name: 'individuals',
            query: {
            developers: props.row.author,
            repositories: 'chromium',
            }
            }">
              {{ props.row.author }}
            </router-link>
          </b-table-column>

          <b-table-column field="suite_name" label="Name" v-slot="props" sortable>
            <a :href="'https://cs.chromium.org/chromium/src/' + props.row.file
            + '?l=' + props.row.line
            + ';q=' + props.row.function
            "
              >
              {{ props.row.suite_name }}
            </a>
          </b-table-column>

          <b-table-column field="sha" label="Patch" v-slot="props">
            <a :href="'https://chromium-review.googlesource.com/q/' + props.row.sha">
              Open
            </a>
          </b-table-column>

          <b-table-column field="type" label="Type" v-slot="props" sortable>
            <b-tag type="is-info" v-if="props.row.type == 'fuzzer_test'">
              fuzz target
            </b-tag>
            <b-tag type="is-danger" v-else-if="props.row.type == 'FUZZ_TEST'">
              FUZZ_TEST
            </b-tag>
            <b-tag type="is-danger" v-else>{{ props.row.type }}</b-tag>
          </b-table-column>

        </b-table>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Leaderboard</h2>
        <b-table
          :data="leaderboard"
          hoverable
          striped
          >

          <b-table-column field="count" label="Fuzzers" v-slot="props">
            {{ props.row.count }}
          </b-table-column>

          <b-table-column
            field="author"
            label="Authors"
            v-slot="props"
          >
            <div class="leaderboard-authors">
              <router-link
                v-for="author in props.row.authors"
                class="leaderboard-author"
                :to="{
                  name: 'individuals',
                  query: {
                    developers: author,
                    repositories: 'chromium',
                  }
                }">
                <span v-if="props.row.icon">{{ props.row.icon }}</span>
                {{ author }}
              </router-link>
              <div class="flex-end"></div>
            </div>
          </b-table-column>

        </b-table>
      </div>
    </section>

    <section class="section sticky bottom">
      <b-field expanded>
        <Timeline v-model="dates" />
      </b-field>
    </section>
  </div>
</template>

<script setup lang="ts">

const route = useRoute();
const router = useRouter();

const dates = ref<Date[]>([
  new Date("2000-01-01"),
  new Date(),
]);
if (route.query.dates) {
  dates.value = route.query.dates.split(',').map(d => new Date(d));
}

const data = shallowRef([]);
const leaderboard = shallowRef([]);
const graph = shallowRef([]);

const updateUrl = () => {
  const query = {
    dates: dates.value.map(d => d.toISOString().split('T')[0]).join(','),
  };
  router.push({ query });
}

const getData = async function() {
  const response = await fetch(`/fuzz-test/data.json`);
  let response_json = await response.json();

  // Filter by date:
  response_json = response_json.filter(d => {
    const date = new Date(d.date);
    return date >= dates.value[0] && date <= dates.value[1];
  });

  // Sort by date
  response_json.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Format date to YYYY-MM-DD
  response_json.forEach(d => {
    d.date = new Date(d.date).toISOString().split('T')[0];
  });

  // Format the author to @author
  response_json.forEach(d => {
    d.author = d.author.split('@')[0];
  });

  await new Promise(r => setTimeout(r, 1));
  data.value = response_json;
  await new Promise(r => setTimeout(r, 1));

  // Compute the "graph" value. Format should be:
  // [
  //   {
  //     label = "FUZZ_TEST",
  //     values = [
  //       {
  //         x = "2021-01-01",
  //         y = 10
  //       },
  //       ...
  //     ]
  const new_values = [];
  let accu = 0;
  response_json.forEach(d => {
    accu++;
    new_values.push({
      x: new Date(d.date),
      y: accu,
    });
  });
  graph.value = [
    {
      label: "FUZZ_TEST",
      values: structuredClone(new_values),
    },
  ];
  response_json.reverse();

  // Compute the leaderboard
  const author_count = {}
  for(const d of response_json) {
    author_count[d.author] ||= 0;
    author_count[d.author]++;
  }

  // Invert the map:
  const count_author = {}
  for(const [author, count] of Object.entries(author_count)) {
    count_author[count] ||= [];
    count_author[count].push(author);
  }

  const count_author_array = Object
    .entries(count_author)
    .map(([count, authors]) => {
      return {count, authors}
    })
    .sort((a, b) => b.count - a.count);


  // Add icon to each groups.
  const add_icon = (i, icon) => {
    if (count_author_array[i]) {
      count_author_array[i].icon = icon;
    }
  }

  add_icon(0, '🥇');
  add_icon(1, '🥈');
  add_icon(2, '🥉');


  await new Promise(r => setTimeout(r, 1));
  leaderboard.value = count_author_array;
  await new Promise(r => setTimeout(r, 1));
};

onMounted(() => {
  updateUrl();
  getData();
});

watch(dates, () => {
  updateUrl();
  getData();
});

</script>

<style scoped>
.sticky {
  position: sticky;
  width: 100%;
  z-index: 2;
}

.sticky::before {
  display: block;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  z-index: 1;

  backdrop-filter: blur(4px);
  background-color: rgba(255, 255, 255, 0.5);
  content: '';
  position:absolute;
  transition: all 0.1s ease-in-out;
  transition: background-color 0.2s ease-in-out;
}

.sticky > * {
  z-index: 2;
  position: relative;
}


.sticky.bottom {
  bottom: 0;
  margin-bottom:0px;
  padding-bottom:15px;
}

.leaderboard-authors {
  display:flex;
  flex-direction:row;
  flex-wrap:wrap;
}

.leaderboard-author {
  margin:2px;
  padding:10px;
  flex-grow:1;
  background-color: rgba(0,0,0,0.1);
  color:black;
  border-radius: 15px;

  a {
    color:black;
    padding:auto;
  }
}

.leaderboard-author:hover {
  background-color: rgba(0,0,0,0.2);
}

.leaderboard-author:active{
  background-color: rgba(0,0,0,0.3);
}

.flex-end {
  flex-grow:1000;
}

</style>
