<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Usernames length distribution</h1>

        <strong>Repositories:</strong>

        <RepositorySelector
          v-model="repositories"
          size="medium"
          :allowMultiple="true"
          :allowAll="true"
        />

        <p>
          Approximatively <strong>{{sum}}</strong> developers contributed to
          {{repositories.join(", ")}} repository.
        </p>

        <div class="line">
          <div class="left"><strong>Length</strong></div>
          <div class="right"><strong>#</strong></div>
        </div>
        <div ref="histogram">
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

import {select} from "d3-selection";
import {interpolate} from "d3-interpolate";
import {easeBackOut} from "d3-ease";
import "d3-transition";

const route = useRoute()
const router = useRouter()

const repositories = ref(["chromium"]);
if (route.query.repositories) {
  repositories.value = route.query.repositories.split(",");
}
const sum = ref(0);
const distribution = ref([]);

const histogram = ref(null);

const refresh = async () => {
  router.push({
    query: {
      repositories: repositories.value.join(",")
    }
  });

  const responses = await Promise.all(repositories.value.map(repo =>
    fetch(`/data/${repo}/usernames.json`)
  ))
  const arrays = await Promise.all(responses.map(r => r.json()))
  const data= [... new Set(arrays.flat())];

  sum.value = data.length;
  distribution.value = [];
  for(const developer of data) {
    const size = developer.length;
    distribution.value[size] ||= 0;
    distribution.value[size]++;
  }

  for(let i = 0; i<distribution.value.length; ++i) {
    distribution.value[i] ||= 0;
  }

  const max = Math.max(...distribution.value);

  const updateCenter = center => {
    center
      .transition()
      .duration(d => 450)
      .ease(easeBackOut)
      .style("width", d => (2 * (d != 0) + 79 * d / max) + "%")
  };

  const updateRight = right => {
    right
      .transition()
      .duration(d => 450)
      .textTween((d, i, nodes) => {
        const previous = select(nodes[i]).text();
        const interpolator = interpolate(previous, d);
        return t => {
          return Math.round(interpolator(t));
        }
      });
  };

  select(histogram.value)
    .selectAll(".group")
    .data(distribution.value)
    .join(
      enter => {
        const group = enter.append("div");
        group.classed("group", true);

        const div = group.append("div");
        div.classed("line", true);

        const left = div.append("div")
        left.classed("left", true)
        left.text((d,i) => i);

        const center = div.append("div")
        center.classed("center", true)
        center.style("width", 0)
        updateCenter(center);

        const right = div.append("div")
        right.classed("right", true)
        right.text(0)
        updateRight(right);

        center.on("click", function() {
          this.parentNode.parentNode.lastChild.classList.toggle("hidden")
        });

        const ul = group.append("ul");
        ul.classed("usernameList", true);
        ul.classed("hidden", true)

        return group;
      },
      update => {
        update
          .select("ul")
          .classed("hidden", true);
        updateCenter(update.select(".center"));
        updateRight(update.select(".right"));
        return update;
      },
      exit => exit.remove(),
    )
    .select("ul")
    .selectAll("li")
    .data((d,i) => data.filter(e => e.length === i), d => d)
    .join(
      enter => {
        const li = enter.append("li");
        const a = li.append("a");
        a.text(d => d);
        a.attr("href", d => `/individuals?developers=${d}`);
        return li;
      },
      update => update,
      exit => exit.remove(),
    )
};

watch(repositories, refresh);
onMounted(refresh);

</script>

<style>

  .line {
    display:flex;
    margin:1px;
  }

  .left {
    text-align:right;
    margin-right:10px;
    width:48px;
  }

  .center {
    color: black;
    background: rgba(0,128,255);
    opacity: 0.2;
    margin: 0px 10px 0px 0px;
    border-radius: 5px;
  }

  .center:hover {
    opacity: 0.4;
  }

  .usernameList {
    color:black;
    list-style-type: square;
    list-style-position: inside;
    display:flex;
    flex-wrap: wrap;
    padding-left:100px;
  }

  .usernameList.hidden {
    display:none;
  }

  .usernameList>* {
    flex: 1 1 160px;
  }

</style>
