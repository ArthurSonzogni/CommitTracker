<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">{{data.length}} FUZZ_TEST() in chromium</h1>

        <LineChart :data="graph" />

        <div align="center">
          <b-table
            :data="data"
            scrollable
            striped
            hoverable
            >
            <b-table-column field="date" label="Date" v-slot="props" sortable >
              {{ props.row.date }}
            </b-table-column>

            <b-table-column field="author" label="Author" v-slot="props">
              {{ props.row.author }}
            </b-table-column>

            <b-table-column field="suite_name" label="Suite Name" v-slot="props">
              {{ props.row.suite_name }}
            </b-table-column>

            <b-table-column field="function" label="Function" v-slot="props">
              {{ props.row.function }}
            </b-table-column>

            <b-table-column field="link" label="Code" v-slot="props">
              <a :href="'https://cs.chromium.org/chromium/src/' + props.row.file
                + '?l=' + props.row.line
                + ';q=' + props.row.function
                "
               >
                Open
              </a>
            </b-table-column>

            <b-table-column field="patch" label="Patch" v-slot="props">
              <a :href="'https://chromium-review.googlesource.com/q/' + props.row.sha">
                Open
              </a>
            </b-table-column>
          </b-table>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Leaderboard</h2>
        <b-table
          :data="leaderboard"
          scrollable
          striped
          hoverable
          >
          <b-table-column field="author" label="Author" v-slot="props">
            {{ props.row.icon }}
            {{ props.row.author }}
          </b-table-column>

          <b-table-column field="count" label="Fuzz tests" v-slot="props">
            {{ props.row.count }}
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

  data.value = response_json;

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
      values: new_values,
    },
  ];

  // Compute the leaderboard
  const author_count = {}
  for(const d of response_json) {
    author_count[d.author] ||= 0;
    author_count[d.author]++;
  }

  const leaderboard_value =
    Object.entries(author_count)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)

  // Define an icon for the best author
  for(let i=0; i<leaderboard_value.length; i++) {
    switch(i) {
      case 0:
        leaderboard_value[i].icon = '🥇';
        break;
      case 1:
        leaderboard_value[i].icon = '🥈';
        break;
      case 2:
        leaderboard_value[i].icon = '🥉';
        break;
      default:
        leaderboard_value[i].icon = ' ';

    }
  }
  leaderboard.value = leaderboard_value;
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

</style>
