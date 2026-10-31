<template>
  <div>
    <section class="section">
      <div class="container">
        <h1 class="title">Usernames distribution</h1>

        <FilterPanel :summary="listSummary(repositoryNames(repositories), 'repositories')">
          <RepositorySelector
            v-model="repositories"
            size="medium"
            :allowMultiple="true"
            :allowAll="true"
          />
        </FilterPanel>

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
import { select } from "d3-selection";
import { interpolate } from "d3-interpolate";
import { easeBackOut } from "d3-ease";
import "d3-transition";
import { useUrlState, urlCodecs } from "~/composables/useUrlState";
import { listSummary, repositoryNames } from "~/utils/filter-summary";

const router = useRouter();
const { repositories } = useUrlState({
  repositories: urlCodecs.csv(["chromium"]),
});

const sum = ref(0);
const distribution = ref<number[]>([]);
const histogram = ref<HTMLElement | null>(null);

let requestId = 0;

const refresh = async () => {
  const id = ++requestId;
  const repos = [...repositories.value];
  if (repos.length === 0) {
    sum.value = 0;
    distribution.value = [];
    if (histogram.value) {
      select(histogram.value).selectAll(".group").remove();
    }
    return;
  }

  const responses = await Promise.all(
    repos.map(repo => fetch(`/data/${repo}/usernames.json`)),
  );
  const arrays: string[][] = await Promise.all(responses.map(r => r.json()));
  if (id !== requestId || !histogram.value) return;

  const data = [...new Set(arrays.flat())];

  sum.value = data.length;
  const dist: number[] = [];
  for (const developer of data) {
    const size = developer.length;
    dist[size] = (dist[size] || 0) + 1;
  }
  for (let i = 0; i < dist.length; ++i) {
    dist[i] ||= 0;
  }
  distribution.value = dist;

  const max = Math.max(1, ...dist);

  const updateCenter = (center: any) => {
    center
      .transition()
      .duration(() => 450)
      .ease(easeBackOut)
      .style("width", (d: number) => (2 * Number(d !== 0) + (79 * d) / max) + "%");
  };

  const updateRight = (right: any) => {
    right
      .transition()
      .duration(() => 450)
      .textTween((d: number, i: number, nodes: Element[]) => {
        const previous = Number(select(nodes[i]).text()) || 0;
        const interpolator = interpolate(previous, d);
        return (t: number) => String(Math.round(interpolator(t)));
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

        const left = div.append("div");
        left.classed("left", true);
        left.text((_d, i) => i);

        const center = div.append("div");
        center.classed("center", true);
        center.style("width", 0);
        updateCenter(center);

        const right = div.append("div");
        right.classed("right", true);
        right.text(0);
        updateRight(right);

        center.on("click", function (this: HTMLElement) {
          const list = this.parentElement?.parentElement?.lastElementChild;
          list?.classList.toggle("hidden");
        });

        const ul = group.append("ul");
        ul.classed("usernameList", true);
        ul.classed("hidden", true);

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
    .data((_d, i) => data.filter(e => e.length === i), (d: any) => d)
    .join(
      enter => {
        const li = enter.append("li");
        const a = li.append("a");
        a.text((d: string) => d);
        a.attr("href", (d: string) => `/individuals?developers=${encodeURIComponent(d)}`);
        a.on("click", (event: MouseEvent, d: string) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          router.push({ path: "/individuals", query: { developers: d } });
        });
        return li;
      },
      update => update,
      exit => exit.remove(),
    );
};

watch(repositories, refresh);
onMounted(refresh);
</script>

<style scoped>
.line,
:deep(.line) {
  display: flex;
  margin: 1px;
}

.left,
:deep(.left) {
  text-align: right;
  margin-right: 10px;
  width: 48px;
}

:deep(.center) {
  color: var(--ink);
  background: rgb(0, 128, 255);
  opacity: 0.2;
  margin: 0 10px 0 0;
  border-radius: 5px;
  cursor: pointer;
}

:deep(.center:hover) {
  opacity: 0.4;
}

:deep(.usernameList) {
  color: var(--ink);
  list-style-type: square;
  list-style-position: inside;
  display: flex;
  flex-wrap: wrap;
  padding-left: 100px;
}

:deep(.usernameList.hidden) {
  display: none;
}

:deep(.usernameList > *) {
  flex: 1 1 160px;
}
</style>
