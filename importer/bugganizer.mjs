// Fetch issues from chromium bugganizer.
// We use puppeter to fetch the page.
import fs from 'fs'
import puppeteer from 'puppeteer'

const main = async () => {
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
