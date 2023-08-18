<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">The API</h1>
        <p>
          This is a static server. All the responses are static JSON files. They
          are refreshed every week by a bot running on Github actions.
        </p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">User list</h2>
        <a href="./data/chrome/users.json">
          <code>/data/${repository}/users.json</code>
        </a>
        <pre>
          <code>
[
  "user1",
  "user2",
  "user3",
  ...
]
          </code>
        </pre>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">Users summary</h2>
        <a href="./data/chrome/users_info.json">
          <code>/data/${repository}/users_info.json</code>
        </a>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">User commits</h2>
        <a href="./data/chrome/users/arthursonzogni.json">
          <code>/data/${chrome}/users/${user}.json</code>
        </a>
        <pre>
          <code>
{
  author: {
    "2018-01-01": [reviewer1, reviewer2, ...],
    "2018-01-02": [reviewer3],
    ...
  },
  review: {
    "2018-01-01": author1,
    "2018-01-02": author2,
    ...
  }
}
          </code>
        </pre>
      </div>
    </section>
  </div>
</template>
