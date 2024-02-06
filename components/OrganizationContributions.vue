<template>
  <div>
    <div class="line">
      <div class="left"><strong>{{timeLabel}}</strong></div>
      <div class="right"><strong># commit</strong></div>
    </div>
    <div ref="tooltip" class="tooltip">
      <div class="tooltip-inner">Test</div>
      <div class="tooltip-arrow"></div>
    </div>
    <div ref="histogram">
    </div>

  </div>
</template>

<script>

import {easeBackOut} from "d3-ease";
import {easeCircleOut} from "d3-ease";
import {format} from "d3-format";
import {interpolate} from "d3-interpolate";
import {select} from "d3-selection";
import {transition} from "d3-transition";
import {mouse} from "d3-selection";
import repositories from 'static/data/repositories.json'
import organizations from 'static/data/organizations.json'

export default {
  props: {
    repositories: { type:Array[String], default: () => ["chromium"],},
    organizations: { type:Array[String], default: () => ["Google"],},
    colors: { type:String, default: "repositories"},
    grouping: { type:String, default: "yearly"},
    kind: {},
  },

  data() {
    this.init();

    this.colorMap = new Map();
    for(const repo of repositories) {
      this.colorMap.set(repo.dirname, repo.color);
    }

    // Use google as a pivot point for the colors, so that the colors are
    // mostly consistent when adding/removing organizations.
    let google_index = 0;
    for(const i in organizations) {
      if (organizations[i] == "Google") {
        google_index = i;
      }
    }

    for (const i in organizations) {
      const i_hue = (i - google_index) + organizations.length;
      const hue = (i / organizations.length + 0.5 * i%2) * 360 + 300;
      this.colorMap.set(organizations[i], `hsl(${hue}, 100%, 50%)`);
    }

    return {};
  },

  methods: {
    sortRepositories: function(a,b) {
      const items = repositories.map(item => item.dirname);
      return items.indexOf(a.label) - items.indexOf(b.label);
    },

    merge: function(a,b) {
      for(const key in b) {
        a[key] = (a[key] || 0) + b[key];
      }
    },

    groupingFunction: function() {
      switch(this.grouping) {
        case "yearly":
          return x => x.substr(0,4);

        case "quarterly":
          return x => {
            const year = x.substr(0,4)
            const month = x.substr(5,2);
            const quarter = Math.floor((month - 1) / 3) + 1;
            return `${year}Q${quarter}`;
          }

        case "monthly":
          return x => x.substr(0,7);
      }

      return x => x;
    },

    traitsPerContributor() {
      const contributionPerYear = (data, map) => {
        const contributions = {}
        for(const organization in data) {
          const by_date = data[organization] || {};
          for(const year in by_date) {
            contributions[year] ||= [];
            contributions[year].push(by_date[year]);
          }
        }
        for (const year in contributions) {
          contributions[year] = map(contributions[year]);
        }
        return contributions;
      }

      console.log("reached unreacheable code");
    },

    async dataForRepository(repository) {
      const response = await fetch(`/data/${repository}/organizations_summary.json`);
      const data_all = await response.json();

      const data = {};
      for(const organization in data_all) {
        if (this.organizations.includes(organization)) {
          data[organization] = data_all[organization];
        }
      }

      switch(this.kind) {
        case "author":
          for(const organization in data) {
            data[organization] = data[organization].author;
          }
          break;

        case "review":
          for(const organization in data) {
            data[organization] = data[organization].review;
          }
          break;

        case "both":
          for(const organization in data) {
            let merged = {};
            this.merge(merged, data[organization].author);
            this.merge(merged, data[organization].review);
            data[organization] = merged
          }
          break;
      }

      // Group dates togethers.
      const group = this.groupingFunction();
      for(const organization in data) {
        const old_data = data[organization];
        const new_data = {}
        for(const key in old_data) {
          const new_key = group(key);
          new_data[new_key] |= 0;
          new_data[new_key] += old_data[key]
        }
        data[organization] = new_data;
      }

      return data;
    },

    init() {
      const histogram = select(this.$refs.histogram);
      const tooltip = select(this.$refs.tooltip);
      histogram.on("mouseout", () => {
        tooltip
          .transition()
          .duration(600)
          .delay(1000)
          .style("opacity", 0)
      })
    },

    async refresh() {
      const data = {};

      if (this.colors == "repositories") {
        for(const repo of this.repositories) {
          const repo_data = await this.dataForRepository(repo);
          const organization_data = {};
          for(const organization in repo_data) {
            this.merge(organization_data, repo_data[organization]);
          }
          for (const year in organization_data) {
            data[year] ||= [];
            data[year].push({
              label: repo,
              value: organization_data[year],
            })
          }
        }
      } else {
        const repo_data = {}
        for(const repo of this.repositories) {
          repo_data[repo] = await this.dataForRepository(repo);
        }

        for(const organization of this.organizations) {
          const organization_data = {};
          for(const repo in repo_data) {
            this.merge(organization_data, repo_data[repo][organization]);
          }
          for (const year in organization_data) {
            data[year] ||= [];
            data[year].push({
              label: organization,
              value: organization_data[year],
            })
          }
        }
      }

      const per_year = {}
      for(const year in data) {
        per_year[year] = 0;
        for(const d in data[year]) {
          per_year[year] += data[year][d].value;
        }
      }


      let max = 20;
      for(const year in per_year) {
        max = Math.max(max, per_year[year]);
      }

      const updateCenter = center => {
        center
          .transition()
          .duration(d => 450)
          .ease(easeBackOut)
          .style("width", year => (70 * per_year[year] / max) + "%")
      };

      const updateBox = repository => {
        repository
          .transition()
          .duration(450)
          .ease(easeCircleOut)
          .style("flex-grow", d => d.value)
          .style("background-color", (d,i) => {
            return this.colorMap.get(d.label);
          });
      };

      const updateRight = async right => {
        right
          .transition()
          .duration(d => 350)
          .textTween(function(year) {
            const previous = parseFloat(
              select(this)
              .text()
              .replace(',', '')
            );
            const interpolator = interpolate(
              previous,
              per_year[year]
            );
            return t => format(",d")(interpolator(t));
          })
      };

      const tooltip = select(this.$refs.tooltip);

      select(this.$refs.histogram)
        .selectAll(".line")
        .data(Object.keys(per_year).sort(), d => d)
        .join(
          enter => {
            const div = enter.append("div");
            div.classed("line", true);
            div
              .style("filter", "blur(4px)")
              .style("height", "0px")
              .style("opacity", 0.3)
              .style("transform", "translate(-32px, 0)")
              .transition()
              .duration((d,i) => 450 + 30*Math.sqrt(i))
              .ease(easeBackOut)
              .style("height", "24px")
              .style("transform", "translate(0px, 0)")
              .style("filter", "blur(0px)")
              .transition()
              .duration(d => 450)
              .ease(easeBackOut)
              .style("filter", "none")
              .style("opacity", 1.0)
              .style("filter", "none")

            const left = div.append("div")
            left.classed("left", true)
            left.text(year => year);

            const center = div.append("div")
            center.classed("center", true);
            updateCenter(center);

            const right = div.append("div")
            right.classed("right", true)
            right.text(0)
            updateRight(right);

            const right_right = div.append("div")
            right_right.classed("right_right", true)
            right_right.text(' ⚙️')

            return div;
          },
          update => {
            const center = update.select(".center")
            updateCenter(center);
            const right = update.select(".right")
            updateRight(right);
            const right_right = update.select(".right_right")
            right_right.text(' ⚙️')
            return update;
          },
          exit => {
            exit
              .transition()
              .duration((d,i) => 350)
              .delay((d,i) => 500-30*Math.sqrt(i))
              .ease(easeCircleOut)
              .style("opacity", "0.2")
              .style("filter", "blur(1px)")
              .duration((d,i) => 200)
              .delay((d,i) => 500-30*Math.sqrt(i))
              .ease(easeCircleOut)
              .style("filter", "blur(2px)")
              .transition()
              .duration((d,i) => 150)
              .ease(easeCircleOut)
              .style("transform", "translate(64px, 0)")
              .style("height", "0px")
              .style("opacity", "0")
              .remove()
          }
        )
        .select(".center")
        .selectAll(".repository")
        .data(year => data[year].sort(this.sortRepositories), d => d.label)
        .join(
          enter => {
            const repository = enter.append("div")
            repository.classed("repository", true);
            repository.style("flex-grow", 0);
            updateBox(repository);
            repository.on("mouseover", function(event, d) {
              const that = select(this);
              const box = that.node().getBoundingClientRect();
              const tooltip_inner = tooltip.select(".tooltip-inner");
              tooltip
                .transition()
                .duration(200)
                .ease(easeCircleOut)
                .style("opacity", 1.0)
                .style("left", (box.left + box.width / 2) + "px")
                .style("top", (box.top) + "px")

              tooltip_inner
                .text(d.label+ ": " + format(",d")(d.value))
            })
            return repository;
          },
          update => {
            updateBox(update);
            return update;
          },
          exit => {
            return exit
              .transition()
              .duration(450)
              .ease(easeCircleOut)
              .style("flex-grow", 0)
              .remove();
          },
        )
    },
  },

  computed: {
    timeLabel() {
      switch(this.grouping) {
        case "yearly": return "Year";
        case "quarterly": return "Quarter";
        case "monthly": return "Month";
      }
    }
  },

  watch: {
    repositories: "refresh",
    grouping: "refresh",
    colors: "refresh",
    kind: "refresh",
    organizations: "refresh",
  },

  mounted() {
    this.init();
    this.refresh();
  }
}

</script>

<style>
.line {
  display:flex;
  justify-content: flex-start;
  align-items:stretch;
  gap:5px;
  padding:1px;
  overflow: hidden;
}

.left {
  text-align:right;
  width:72px;
}

.center {
  display:flex;
  justify-content: flex-start;
  align-items:stretch;

  border-radius: 5px;
  background: rgba(0,128,255);
  overflow:hidden;
  opacity:0.3;
}

.tooltip {
  position: fixed;
  color: white;
  text-align: center;
  border-radius: 6px;
  font-size: 12px;
  z-index: 10;
  transform: translate(-50%, -125%);
  opacity: 0;
}

.tooltip-inner {
  margin: 0;
  padding: 5px;
  font-size: 1rem;
  background-color: #333;
  border-radius: 8px;
}

.tooltip-arrow {
  width: 0;
  height: 0;
  border-style: solid;
  margin: 0;
  padding: 0;
  border-width: 10px;
  border-color: #333 transparent transparent transparent;
  transform: translateX(-50%);
  position: absolute;
  top: 98%;
  left: 50%;
  z-index: 9;
}

</style>

