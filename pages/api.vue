<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container">
        <h1 class="title">User list</h1>
        <p>
          The API is made of static files stored on github. They are refreshed
          every day.
        </p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="title">User list</h2>
        <code>/data/users.json</code>
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
        <h2 class="title">User info</h2>
        <p>
          <code>/data/users/${user}.json</code>
        </p>
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
