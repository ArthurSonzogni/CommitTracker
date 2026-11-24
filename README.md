# CommitTracker

[CommitTracker](https://chrome-commit-tracker.arthursonzogni.com/) is a static Nuxt 4 / Vue 3 web application visualizing commit, review, organization, treemap, code accretion, fuzz-test, CVE, and community-graph statistics for Chromium and related web-platform repositories.

## Quick Start

Requires Node.js 22+.

```bash
git clone https://github.com/ArthurSonzogni/CommitTracker.git
cd CommitTracker
npm install
npm run pull-data              # Shallow-clone the data branches into public/
npm run generate-derived-data  # Precompute summaries, badges, security & CVE rollups
npm run dev                    # Start dev server at http://localhost:3000
```

## Checks & Build

```bash
npm run lint                   # Fast static lint (oxlint)
npm run typecheck              # Vue + TypeScript check (nuxt typecheck)
npm run test:unit              # Unit tests for parsers and data helpers
npm run generate               # Production static build -> .output/public
npm run test:interactions      # Headless Chrome E2E tests against .output/public
```

`lint`, `typecheck`, and `test:unit` run on every CI build; `test:interactions` runs on pull requests.

## Updating Raw Data (`importer/`)

Data branches are refreshed automatically by GitHub Actions ([importer.yaml](.github/workflows/importer.yaml)). To run importers locally:

```bash
cd importer
npm install

npm run fetch_data       # Fetch new commits
npm run treemap          # Count source metrics for the treemap
npm run graph            # Generate developer community maps
npm run fuzztest         # Retrieve fuzz tests from sources
npm run cve              # Fetch Chromium CVE data
npm run commit_rates     # Compute commit rates per directory
npm run accretion        # Replay commits for code accretion

cd ..
npm run generate-derived-data
```

## Architecture

See [AGENTS.md](AGENTS.md) for the full architecture overview (code vs. data branches, dev/build quirks, importer pipeline, and CI workflows).

## Contributing

Pull requests and issues are welcome at [ArthurSonzogni/CommitTracker](https://github.com/ArthurSonzogni/CommitTracker).
