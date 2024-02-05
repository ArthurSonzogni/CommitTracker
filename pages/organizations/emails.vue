<template>
  <div>
    <Navbar/>
    <section class="section">
      <div class="container">
        <h1 class="title">Organization's Developers emails</h1>

        <p>
          <strong>Repositories?</strong>
        </p>
        <RepositorySelector
          v-model="repositories"
          size="medium"
          :allowMultiple="true"
          :allowAll="true"
          />
      </div>
    </section>

    <section class="container">
      <div class="card box" v-for="(o, i) in data" :key="o.organization">

        <div class="card-header"
             style="background-color: #f5f5f5;">

          <div class="card-header-title">
            {{ o.org }}
          </div>
          <div class="card-header-title">
            <b-tooltip
              :label="o.username_size + ' unique usernames'"
              position="is-bottom"
              type="is-light"
              >
              <div>{{ o.emails.length }} emails</div>
            </b-tooltip>
          </div>
        </div>


        <div class="">
          <div class="content" v-if="o.collapsed">
            <ul>
              <li v-for="email in o.emails_short" :key="email">
                {{ email }}
              </li>
              <li>... <a @click="o.collapsed = false">Show all</a></li>
            </ul>
          </div>

          <div class="content" v-if="!o.collapsed">
            <ul v-if="!o.collapsed">
              <li v-for="email in o.emails" :key="email">
                {{ email }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>

export default {
  data() {
    let repositories = ["chrome"];
    if(this.$route.query.repositories) {
      repositories = this.$route.query.repositories.split(",");
    }

    return {
      repositories,
      data: {}
    }
  },

  methods: {
    async refresh() {
      this.$router.push({
        query: {
          repositories: this.repositories.join(",")
        }
      });

      const responses = await Promise.all(this.repositories.map(repo =>
        fetch(`/data/${repo}/organizations_summary.json`)
      ))

      const data = await Promise.all(responses.map(r => r.json()))
      console.log(data);

      const emails = {}
      for(const d of data) {
        for(const org in d) {
          if(!emails[org]) {
            emails[org] = new Set();
          }
          for(const email of d[org].emails) {
            emails[org].add(email);
          }
        }
      }

      this.data = []
      for(const [org, emails_data] of Object.entries(emails)) {
        const emails= Array.from(emails_data).sort();
        this.data.push({
          org,
          emails,
          emails_short: Array.from(emails).slice(0, 5),
          emails_size: emails.length,
          username_size: new Set(emails.map(e => e.split("@")[0])).size,
          collapsed: emails.length > 6,
        })
      }
      this.data.sort((a, b) => b.emails.length - a.emails.length);
      console.log(this.data);

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

</style>

