<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Usernames length distribution</h1>
        <p>
          Approximatively <strong>{{sum}}</strong> developers contributed to chromium.
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
      sum: 0,
      distribution: [],
    }
  },

  mounted: async function() {
    const response = await fetch("./data/users.json");
    const data = await response.json();
    this.sum = data.length;
    for(const developer of data) {
      const size = developer.length;
      this.distribution[size] ||= 0;
      this.distribution[size]++;
    }

    for(let i = 0; i<this.distribution.length; ++i) {
      this.distribution[i] ||= 0;
    }

    const max = Math.max(...this.distribution);

    select(this.$refs.histogram)
      .selectAll("div")
      .data(this.distribution)
      .join(enter => {
        const group = enter.append("div");
        const div = group.append("div");
        div.classed("line", true);

        const left = div.append("div")
        left.classed("left", true)
        left.text((d,i) => i);

        const center = div.append("div")
        center.classed("center", true)
        center
          .style("width", 0)
          .transition()
          .duration(d => 450)
          .ease(easeBackOut)
          .delay((d,i) => 100*(i-3))
          .style("width", d => (2 * (d != 0) + 79 * d / max) + "%")

        const right = div.append("div")
        right.classed("right", true)
        right
          .text(0)
          .transition()
          .duration(d => 450)
          .delay((d,i) => 120*(i-3))
          .textTween(d => t => interpolate(0,d)(t).toFixed(0));

        center.on("click", function() {
          this.parentNode.parentNode.lastChild.classList.toggle("hidden")
        });
        
        const ul = group.append("ul");
        ul.classed("usernameList", true);
        ul.classed("hidden", true) 

        return ul;
      })
      .selectAll("li")
      .data((d,i) => data.filter(e => e.length === i))
      .join(
        enter => {
          const li = enter.append("li");
          const a = li.append("a");
          a.text(d => d);
          a.attr("href", d => `commits?developers=${d}`);
          return li;
        }
      )
  },
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

