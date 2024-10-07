// Fetch issues from chromium bugganizer.
// We use puppeter to fetch the page.
import fs from 'fs'
import puppeteer from 'puppeteer'
import spawn from 'child_process'

// Execute a command, and log its output.
const exec = async (command, args, options) => {
  console.log(`Running: ${command} ${args.join(' ')}`)
  const child = spawn.spawn(command, args, options)
  child.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`)
  });
  child.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`)
  });
  await new Promise((resolve, error) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        error(new Error(`git process exited with code ${code}`))
      }
    })
  })
  console.log(`Finished: ${command} ${args.join(' ')}`)
}

// Fetch the CVE github repository.
const fetchCveRepository= async () => {
  // If the repository already exists, fetch the latest changes.
  if (fs.existsSync('cvelist')) {
    await exec('git', ['pull'], { cwd: 'cvelist' })

    return
  }

  // Otherwise, clone the repository.
  await exec('git', [
    'clone',
    '--depth=1',
    'https://github.com/CVEProject/cvelistV5',
    'cvelist'
  ])
}

// Iterate over the CVEs in the repository.
const iterateCVE = function* () {
  for (const year of fs.readdirSync('cvelist/cves')) {
    if (!fs.statSync(`cvelist/cves/${year}`).isDirectory()) {
      continue;
    }

    for (const subsection of fs.readdirSync(`cvelist/cves/${year}`)) {
      if (!fs.statSync(`cvelist/cves/${year}/${subsection}`).isDirectory()) {
        continue;
      }

      for (const file of fs.readdirSync(`cvelist/cves/${year}/${subsection}`)) {
        const cve = JSON.parse(fs.readFileSync(`cvelist/cves/${year}/${subsection}/${file}`, 'utf8'))
        yield cve;
      }
    }
  }
}

// Check if the CVE is related to Chromium.
const cveIsChromium = (cve) => {
  if (cve.cveMetadata.assignerShortName != "Chrome") {
    return false;
  }

  if (!cve.containers?.cna?.affected) {
    return false;
  }

  for (const affected of cve.containers.cna.affected) {
    const product = affected.product?.toLowerCase() || ''
    const vendor = affected.vendor?.toLowerCase() || ''
    if ((product.includes('chrome') || product.includes('chromium')) &&
      (vendor.includes('google'))) {
      return true;
    }
  }

  return false;
}

const cveIsPublished = (cve) => {
  return cve.cveMetadata.state === "PUBLISHED";
}

const urlIsChromiumBugTracker = (url) => {
  return url.includes("issues.chromium.org") ||
    url.includes('crbug.com') ||
    url.includes('bugs.chromium.org') ||
    ( url.includes("code.google.com") && url.includes("chromium") && url.includes("issues") );
}

const urlIsChromiumCodeReview = (url) => {
  return url.includes("chromium.googlesource.com") ||
    url.includes("codereview.chromium.org") ||
    url.includes("src.chromium.org");
}

const normalizeCve = (cve) => {
  // Fill in the fields if they are missing.
  cve.containers.cna ||= {};
  cve.containers.cna.problemTypes ||= [];
  cve.containers.cna.problemTypes[0] ||= {};
  cve.containers.cna.problemTypes[0].descriptions ||= [];
  cve.containers.cna.problemTypes[0].descriptions[0] ||= {};
  cve.containers.cna.problemTypes[0].descriptions[0].description ||= '';
  cve.containers.cna.problemTypes[0].descriptions[0].cweId ||= '';
  cve.containers.cna.references ||= [];
  cve.containers.cna.affected ||= [];
  cve.containers.cna.descriptions ||= [];
  cve.containers.adp ||= [];
  cve.containers.adp[0] ||= {};
  cve.containers.adp[0].problemTypes ||= [];
  cve.containers.adp[0].problemTypes[0] ||= {};
  cve.containers.adp[0].problemTypes[0].descriptions ||= [];
  cve.containers.adp[0].problemTypes[0].descriptions[0] ||= {};
  cve.containers.adp[0].problemTypes[0].descriptions[0].cweId ||= '';
  cve.containers.adp[0].problemTypes[0].descriptions[0].description ||= '';
}

let version_history = null;
const fetchVersionHistory = async () => {
  console.log("Fetching version history")

  // For local dev, load the file from disk, if any.
  if (fs.existsSync('version_history.json')) {
    version_history = JSON.parse(fs.readFileSync('version_history.json', 'utf8'))
    return;
  }

  version_history = {}
  for(const channel of ['extended', 'stable', 'beta', 'dev', 'canary']) {
    console.log(`Fetching version history for ${channel}`)
    const url = `https://versionhistory.googleapis.com/v1/chrome/platforms/all/channels/${channel}/versions/all/releases`;
    const response = await fetch(url);
    const json = await response.json();
    version_history[channel] = json;
  }

  // Write json to file.
  fs.writeFileSync('version_history.json', JSON.stringify(version_history, null, 1))
}

const getChromiumReleaseDate = (version) => {
  const out = {};
  for (const channel in version_history) {
    for (const release of version_history[channel].releases) {
      if (release.version == version) {
        out[channel] = release.serving.startTime;
        break;
      }
    }
  }
  return out;
}

// Extract the relevant fields from the CVE.
const transformCve = (cve) => {
  normalizeCve(cve)

  // Extract the Chromium bug URLs.
  let bug = "n/a"
  for(const reference of cve.containers.cna.references) {
    if (urlIsChromiumBugTracker(reference.url)) {
      bug = reference.url;
    }
  }

  let description = "n/a";
  for(const d of cve.containers.cna.descriptions) {
    description = d.value;
  }

  let version_fixed = "n/a";
  for (const affected of cve.containers.cna.affected) {
    if (affected.product?.toLowerCase().includes('chrome')) {
      for (const version of affected.versions) {
        version_fixed = version.version;
      }
    }
  }

  // If the version is not specified, it might be part of the description.
  if (version_fixed == 'unspecified') {
    const match = description.match(/\b\d+\.\d+\.\d+\.\d+/);
    if (match) {
      version_fixed = match[0];
    }
  }

  if (version_fixed.startsWith('prior to ')) {
    version_fixed = version_fixed.replace('prior to ', '');
  }

  //const proposedCweId = cve.containers.adp[0].prolemTypes[0].descriptions[0].cweId;
  const cweId =
    cve.containers.adp[0].problemTypes[0].descriptions[0].cweId ||
    cve.containers.cna.problemTypes[0].descriptions[0].cweId;

  const problem =
    cve.containers.adp[0].problemTypes[0].descriptions[0].description ||
    cve.containers.cna.problemTypes[0].descriptions[0].description;

  const version_dates = getChromiumReleaseDate(version_fixed);

  return {
    id: cve.cveMetadata.cveId,
    cweId,
    problem: cve.containers.cna.problemTypes[0].descriptions[0].description,
    bug,
    description,
    published: cve.cveMetadata.datePublished,
    version_fixed,
    version_dates,
  };
}

const retrieveCveList = async () => {
  //await fetchCveRepository()

  const cves = {}
  for (const cve of iterateCVE()) {
    if (!cveIsPublished(cve)) {
      continue;
    }

    if (!cveIsChromium(cve)) {
      continue;
    }

    const transformed = transformCve(cve)
    cves[transformed.id] = transformed;
  }

  // Create directories.
  fs.mkdirSync('../data/cve', { recursive: true });

  // Write json to file.
  fs.writeFileSync('../data/cve/data.json', JSON.stringify(cves, null, 1))
}

const main = async () => {
  await fetchVersionHistory()
  await retrieveCveList();
  return;

  // const url = "https://issues.chromium.org/issues/41485789"
  // The URL is the first argument passed to the script.
  const url = process.argv[2]

  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.goto(url)

  // Wait for the page to load.
  await page.waitForSelector('.child')

  // Iterate over the content of every ".child" element.
  const issues = await page.evaluate(() => {
    const issues = []
    for (const el of document.querySelectorAll('.child')) {
      issues.push(el.textContent)
    }
    return issues
  })

  // Iterate over the issues, extract links to code review:
  // Example:
  // Reviewed-on: https://chromium-review.googlesource.com/c/chromium/src/+/5149755
  const codeReviews = issues.map(issue => {
    const match = issue.match(/Reviewed-on: (https:\/\/chromium-review.googlesource.com\/c\/chromium\/src\/\+\/\d+)/)
    return match ? match[1] : null
  }).filter(Boolean)

  console.log("Patches URLs:")
  console.log(codeReviews)

  // Iterate over the issues, extract the commit hash.
  // Example:
  // commit 62d76556fcf250ecb0f63874be8cdd3db51f2a64
  const commits = issues.map(issue => {
    const match = issue.match(/commit ([0-9a-f]{40})/)
    return match ? match[1] : null
  }).filter(Boolean)

  console.log("Commits:")
  console.log(commits)


  // Search for a `vrp-reward` span, and return the associated dollar amount.
  // ...
  // <div>
  //   <label> vrp-reward </label>
  // </div>
  // <div>
  //   <div>
  //     <div>
  //      <b-truncated-span>
  //        <span> $500 </span>
  //      </b-truncated-span>
  //    </div>
  //   </div>
  // </div>
  //
  await page.waitForSelector('label')
  const reward = await page.evaluate(() => {
    const out = []
    for(const el of document.querySelectorAll('label')) {
      out.push(el.textContent)
      if (el.textContent == ' vrp-reward ') {
        return el.parentElement.parentElement.querySelector('span').textContent;
      }
    }

    return out;
  })
  console.log("vrp-reward = ", reward)


  // Same, but for ' Component Tags '
  await page.waitForSelector('label')
  const componentTags = await page.evaluate(() => {
    const out = []
    for(const el of document.querySelectorAll('label')) {
      out.push(el.textContent)
      if (el.textContent == ' Component Tags ') {
        return el.parentElement.parentElement.querySelector('a').textContent.trim();
      }
    }

    return out;
  })
  console.log("Component Tags = ", componentTags)

  // Same, but for 'CVE'
  await page.waitForSelector('label')
  const cve = await page.evaluate(() => {
    const out = []
    for(const el of document.querySelectorAll('label')) {
      out.push(el.textContent)
      if (el.textContent == ' CVE ') {
        return el.parentElement.parentElement.querySelector('span').textContent.trim();
      }
    }

    return out;
  })
  console.log("CVE = ", cve)


  // Search for the <label> Security


  //const response = await fetch(url)
  //const text = await response.text()
  //console.log(text);

  //const root = parse(text)

  //// Iterate over scripts, search one defining the `defrostedREsourcesJspb`
  //// variable, capture its value.
  //let defrostedResourcesJspb = null
  //for (const script of root.querySelectorAll('script')) {
  //console.log("found script")
  //const text = script.text
  //if (text.includes('defrostedResourcesJspb')) {
  //const match = text.match(/defrostedResourcesJspb = (.*);/)
  //if (match) {
  //defrostedResourcesJspb = JSON.parse(match[1])
  //break
  //}
  //}
  //}
  //console.log(defrostedResourcesJspb)
  //console.log(JSON.stringify(defrostedResourcesJspb, null, 1))

  //// Write json to file.
  //fs.writeFileSync('defrostedResourcesJspb.json', JSON.stringify(defrostedResourcesJspb, null, 1))
}
main()
