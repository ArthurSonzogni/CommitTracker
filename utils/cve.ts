// The CVE database. Component names used to be stored HTML-escaped by the
// importer, e.g. "Blink&gt;JavaScript". Decode them for the data that hasn't
// been re-imported yet.
const decodeHtmlEntities = (text: string) => text
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&");

export const fetchCveData = async () => {
  const response = await fetch("/cve/data.json");
  const data = await response.json();
  for (const cve of data) {
    cve.components = cve.components?.map(decodeHtmlEntities);
  }
  return data;
};
