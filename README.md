# ChromeCommitTracker

An [web application](https://chrome-commit-tracker.arthursonzogni.com) to
show statistics about the Chrome repository.

### Running the server locally.

Install [yarn](https://yarnpkg.com/) and run:

```bash
yarn
yarn pull-data
yarn generate-derived-data
yarn dev
```

### Refresh data locally:

The data is refreshed every day automatically. You can pull new data using:
```bash
yarn pull-data
yarn generate-derived-data
```

Internally, you can **produce** new data using:
```bash
cd importer
npm install
npm run main
npm run users_info
npm run graph
```
