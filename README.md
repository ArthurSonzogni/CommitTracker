# CommitTracker

CommitTracker is a [web
application](https://chrome-commit-tracker.arthursonzogni.com/) that displays
statistics about commits for web browsers and related libraries. It provides
insights into the development activity of various open-source projects, helping
users visualize and analyze commit data through various charts and graphs.

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Running the Development Server](#running-the-development-server)
  - [Fetching and Processing Data](#fetching-and-processing-data)
- [Contact](#contact)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/ArthurSonzogni/CommitTracker.git
   ```
2. Install NPM packages
   ```sh
   yarn
   ```

## Usage

### Running the Development Server

To run the development server, execute the following commands:

```bash
yarn pull-data
yarn generate-derived-data
yarn dev
```

### Pull new data

The data is refreshed automatically every day. You can pull it using:

**Pull updated data:**

```bash
yarn pull-data
yarn generate-derived-data
```

**Fetch new data:**

The following scripts are located in the `importer` directory and can be used to produce new data.

```bash
cd importer
npm install

# Import new commits.
npm run fetch_data

# Count source code specific lines.
npm run treemap

# Generate developers interactions graph.
npm run graph

# Retrieve new fuzz tests from sources.
npm run fuzztest

# Fetch new CVE data.
npm run cve

# Pre-compute derived data.
npm run derive_data
```

## Contact

For any questions or suggestions, please open a pull request.

Project Link: [https://github.com/ArthurSonzogni/CommitTracker](https://github.com/ArthurSonzogni/CommitTracker)
