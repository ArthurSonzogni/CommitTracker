<template>
  <div>
    <Navbar/>

    <section class="section">
      <div class="container content">
        <h1 class="title">The API</h1>
        <p>
          This is a static server. All the responses are static JSON files. They
          are refreshed every week by a bot running on Github actions.
        </p>

        <p>
          Those responses are giving informations about the emails, usernames
          and organizations of the contributors.
        </p>

        <h2>
          The endpoints are:
        </h2>

        <ul>
          <li> <a href="/data/repositories.json">
              <code>/data/repositories.json</code>
            </a>
          </li>

          <li>
            <ul>
              <li> <a href="/data/chromium/emails.json">
                  <code>/data/${repository}/emails.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/emails_summary.json">
                  <code>/data/${repository}/emails_summary.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/emails/arthursonzogni@chromium.org.json">
                  <code>/data/${repository}/emails/${email}.json</code>
                </a>
              </li>
            </ul>
          </li>

          <li>
            <ul>
              <li> <a href="/data/chromium/usernames.json">
                  <code>/data/${repository}/usernames.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/usernames_summary.json">
                  <code>/data/${repository}/usernames_summary.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/usernames/arthursonzogni.json">
                  <code>/data/${repository}/usernames/${username}.json</code>
                </a>
              </li>
            </ul>
          </li>

          <li>
            <ul>

              <li> <a href="/data/chromium/organizations.json">
                  <code>/data/${repository}/organizations.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/organizations_summary.json">
                  <code>/data/${repository}/organizations_summary.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/organizations/Intel.json">
                  <code>/data/${repository}/organizations/${organization}.json</code>
                </a>
              </li>
            </ul>
          </li>
          </a>
        </ul>

      </div>
    </section>
  </div>
</template>
