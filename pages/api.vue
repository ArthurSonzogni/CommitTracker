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
          Endpoints
        </h2>

        <ul>
          <li> <a href="/data/repositories.json">
              <code>/data/repositories.json</code>
            </a>
          </li>

          <li>
            <ul>
              <li>
                <a href="/data/chromium/emails.json">
                  <code>/data/${repo}/emails.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/emails/arthursonzogni@chromium.org.json">
                  <code>/data/${repo}/emails/${email}.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/emails_summary_commit_yearly_author.json">
                  <code>/data/${repo}/emails_summary_commit_${group_by}_{side}.json</code>
                </a>
              </li>
            </ul>
          </li>

          <li>
            <ul>
              <li> <a href="/data/chromium/usernames.json">
                  <code>/data/${repo}/usernames.json</code>
                </a>
              </li>

              <li> <a href="/data/chromium/usernames/arthursonzogni.json">
                  <code>/data/${repo}/usernames/${username}.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/usernames_summary_commit_yearly_author.json">
                  <code>/data/${repo}/usernames_summary_commit_${group_by}_{side}.json</code>
                </a>
              </li>
            </ul>
          </li>

          <li>
            <ul>

              <li>
                <a href="/data/chromium/organizations.json">
                  <code>/data/${repo}/organizations.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/organizations_summary_commit_yearly_author.json">
                  <code>/data/${repo}/organizations_summary_commit_${group_by}_{side}.json</code>
                </a>
              </li>

              <li>
                <a href="/data/chromium/organizations_summary_contributor_yearly_author.json">
                  <code>/data/${repo}/organizations_summary_contributor_${group_by}_{side}.json</code>
                </a>
              </li>

            </ul>
          </li>
        </ul>

        <h2>Params</h2>
        <ul>
          <li>
            <code>repo</code> is one of:
            <b-tag>angle</b-tag> <b-tag>chromeos</b-tag> <b-tag>chromium</b-tag>
            <b-tag>dawn</b-tag> <b-tag>devtool-frontend</b-tag>
            <b-tag>gn</b-tag> <b-tag>pdfium</b-tag> <b-tag>perfetto</b-tag>
            <b-tag>swiftshader</b-tag> <b-tag>v8</b-tag> <b-tag>webrtc</b-tag>
            ...
          </li>
          <li>
            <code>email</code> is an email address.
          </li>
          <li>
            <code>group_by</code> is one of:
            <b-tag>forever</b-tag> <b-tag>decennial</b-tag> <b-tag>yearly</b-tag> <b-tag>quarterly</b-tag> <b-tag>monthly</b-tag>
          </li>
          <li>
            <code>side</code> is one of:
            <b-tag>author</b-tag> <b-tag>review</b-tag> <b-tag>both</b-tag>
          </li>
        </ul>

        <h2>Guarantees</h2>
        <p>
          There are no guarantees about how long the API will stay in the
          current shape. Please let me know when you start relying on it, so
          that I can consider not to change it anymore, or to provide a better
          service.
        </p>
      </div>
    </section>
  </div>
</template>
