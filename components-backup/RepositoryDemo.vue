<template>
  <section class="section">
    <div class="container">
      <h1 class="title">
        <NuxtLink to="/repositories">
        3. Repositories statistics
        </NuxtLink>
      </h1>

      <div class="columns">
        <div class="column content">
          <Contributions
            :repositories="repositories"
            percentile="0.5"
            :individual="individual"
            :grouping="grouping"
            :what="what"
            :display="display"
            :kind="kind"
            :developers="developers"
            />
        </div>
        <div class="column is-5 content">
          <p>
            Get statistics about every repositories:
            <ul>
              <li>Number of commits</li>
              <li>Number of contributors</li>
              <li>Number of newcomers</li>
              <li>Individual statistics</li>
            </ul>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script>

export default {
  data() {
    let repositories = ["chromium"];
    let what = "contributors";
    let grouping = "yearly";
    let display = "average";
    let kind = "author";
    let percentile = 0.7071;
    let individual = 300;
    let developers = [];

    return {
      repositories,
      what,
      grouping,
      display,
      kind,
      percentile,
      individual,
      developers,
    };
  },
}
</script>
