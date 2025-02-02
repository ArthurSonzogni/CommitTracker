# CommitTracker

An [web application](https://chrome-commit-tracker.arthursonzogni.com) to show
statistics about web browsers commits, and related libraries.

## Contributing

Feel free to contribute to this project. You can open an issue for suggesting
new visualizations, new data sources, or any other idea. You can also open a
pull request to fix a bug, or to add a new feature.

### Run the server

Install [yarn](https://yarnpkg.com/) and run:

```bash
yarn
yarn pull-data
yarn generate-derived-data
yarn dev
```

### Pull updated data

The data is refreshed every day automatically. You can pull new data using:
```bash
yarn pull-data
yarn generate-derived-data
```

### Fetch new data

You can **produce** new data using:
```bash
cd importer
npm install

# Fetch new data.
npm run fetch_data  # Import new commits.
npm run treemap     # Count source code specific lines.
npm run graph       # Generate developers interactions graph.
npm run fuzztest    # Retrieve new fuzz tests from sources.
npm run cve         # Fetch new CVE data.

# Pre-compute derived data.
npm run derive_data
```
