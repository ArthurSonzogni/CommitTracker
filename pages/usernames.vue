<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Usernames length distribution</h1>

        <p>
          <strong>Repositories?</strong>
        </p>
        <RepositorySelector
          v-model="repositories"
          size="medium"
          :allowMultiple="false"
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

<script>

import {select} from "d3-selection";
import {interpolate} from "d3-interpolate";
import {linear} from "d3-ease";
import {easeBackOut} from "d3-ease";
import {transition} from "d3-transition";

export default {
  data() {
    return {
      repositories: ["chrome"],
      sum: 0,
      distribution: [],
    }
  },

  methods: {
    async refresh() {

      const response = await fetch(`/data/${this.repositories[0]}/users.json`);
      const data = await response.json();
      this.sum = data.length;
      this.distribution = [];
      for(const developer of data) {
        const size = developer.length;
        this.distribution[size] ||= 0;
        this.distribution[size]++;
      }

      for(let i = 0; i<this.distribution.length; ++i) {
        this.distribution[i] ||= 0;
      }

      const max = Math.max(...this.distribution);

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
          .textTween(d => t => interpolate(0,d)(t).toFixed(0));
      };

      select(this.$refs.histogram)
        .selectAll(".group")
        .data(this.distribution)
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
    },
  },

  mounted() {
    this.refresh();
  },

  watch: {
    repositories: "refresh",
  }
}

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

