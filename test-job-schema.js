// test-job-schema.js — unit tests for JobPosting / Breadcrumb / site JSON-LD.
// Run: node test-job-schema.js     (no database, no network)
//
// Google validates JobPosting strictly and a malformed entity can void the
// whole page's eligibility, so the tests lean on the failure shapes: closed
// jobs, unknown fields, multi-location strings, unconfirmed remote.

const {
  buildJobPosting, buildBreadcrumbs, buildSiteIdentity,
  sourceJobId, parsePlaces, employmentType,
} = require("./lib/job-schema");

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const eq = (a, b, what) => {
  const aa = JSON.stringify(a), bb = JSON.stringify(b);
  if (aa !== bb) throw new Error(`${what}: expected ${bb}, got ${aa}`);
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const OPTS = {
  companyLabels: { openai: "OpenAI", anthropic: "Anthropic", databricks: "Databricks" },
  companyWebsites: { anthropic: "https://www.anthropic.com" },
  companyLogos: { anthropic: "/companies/anthropic.png" },
  categoryLabels: { engineering: "Engineering" },
  baseUrl: "https://www.earlyaijobs.com",
};

const baseJob = {
  id: 42, title: "Software Engineer", company_name: "anthropic",
  description: "Build things.", location: "San Francisco, CA",
  location_countries: ["US"], is_remote: null, is_open: true,
  employment_type: "fulltime", first_published: "2026-08-20T00:00:00Z",
  url: "https://job-boards.greenhouse.io/anthropic/jobs/4567890004",
};

// ---------------- core entity ----------------
check("complete entity for a normal job", () => {
  const j = buildJobPosting(baseJob, OPTS);
  eq(j["@type"], "JobPosting", "type");
  eq(j.title, "Software Engineer", "title");
  eq(j.employmentType, "FULL_TIME", "employment");
  eq(j.hiringOrganization.sameAs, "https://www.anthropic.com", "sameAs");
  eq(j.hiringOrganization.logo, "https://www.earlyaijobs.com/companies/anthropic.png", "logo");
  eq(j.url, "https://www.earlyaijobs.com/job/42", "url");
  eq(j.identifier, { "@type": "PropertyValue", name: "Anthropic", value: "4567890004" }, "identifier");
});

check("closed job → null (no JobPosting at all)", () => {
  eq(buildJobPosting({ ...baseJob, is_open: false }, OPTS), null, "closed");
  eq(buildJobPosting(null, OPTS), null, "missing");
});

check("validThrough is never present (we do not know the employer's expiry)", () => {
  const j = buildJobPosting(baseJob, OPTS);
  assert(!("validThrough" in j), "validThrough must be absent");
});

// ---------------- locations ----------------
check("single location with US state split into locality/region/country", () => {
  const j = buildJobPosting(baseJob, OPTS);
  eq(j.jobLocation, {
    "@type": "Place",
    address: { "@type": "PostalAddress", addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" },
  }, "place");
});

check("multi-location string becomes an ARRAY of Places (the Google requirement)", () => {
  const j = buildJobPosting({ ...baseJob, location: "San Francisco, CA; New York, NY" }, OPTS);
  assert(Array.isArray(j.jobLocation), "array");
  eq(j.jobLocation.length, 2, "two places");
  eq(j.jobLocation[1].address.addressLocality, "New York", "second locality");
  eq(j.jobLocation[1].address.addressRegion, "NY", "second region");
  eq(j.jobLocation[0].address.addressCountry, "US", "country applied to all");
});

check("non-US locations keep full text as locality, no invented region", () => {
  const j = buildJobPosting({ ...baseJob, location: "London, UK", location_countries: ["GB"] }, OPTS);
  eq(j.jobLocation.address.addressLocality, "London, UK", "locality untouched — UK is not a US state code");
  eq(j.jobLocation.address.addressCountry, "GB", "country from parsed codes, not from text");
});

check("multi-country job never guesses which city is in which country", () => {
  const j = buildJobPosting({
    ...baseJob, location: "Dublin; Sydney", location_countries: ["IE", "AU"],
  }, OPTS);
  for (const p of j.jobLocation) assert(!p.address.addressCountry, "no addressCountry with 2 countries");
});

check("'Remote' in the location string is not a Place", () => {
  eq(parsePlaces("Remote"), [], "remote alone");
  eq(parsePlaces("Remote; San Francisco, CA").length, 1, "remote + city keeps only the city");
});

check("duplicate locations collapse", () => {
  eq(parsePlaces("Dublin; Dublin;  dublin").length, 1, "deduped");
});

// ---------------- remote rules ----------------
check("confirmed remote with countries → TELECOMMUTE + applicantLocationRequirements", () => {
  const j = buildJobPosting({
    ...baseJob, is_remote: true, location: "Remote", location_countries: ["US"],
  }, OPTS);
  eq(j.jobLocationType, "TELECOMMUTE", "type");
  eq(j.applicantLocationRequirements, { "@type": "Country", name: "US" }, "single country");
});

check("confirmed remote, several countries → array of Country", () => {
  const j = buildJobPosting({
    ...baseJob, is_remote: true, location: "Remote", location_countries: ["US", "CA"],
  }, OPTS);
  eq(j.applicantLocationRequirements.length, 2, "two countries");
});

check("remote with NO countries and NO office → no TELECOMMUTE, and entity dropped", () => {
  // We refuse to assert worldwide eligibility we cannot back up; with no
  // location signal at all the entity is not emitted.
  const j = buildJobPosting({
    ...baseJob, is_remote: true, location: "Remote", location_countries: [],
  }, OPTS);
  eq(j, null, "dropped entirely");
});

check("remote with an office but unknown eligibility → TELECOMMUTE + the office", () => {
  const j = buildJobPosting({
    ...baseJob, is_remote: true, location: "San Francisco, CA", location_countries: [],
  }, OPTS);
  eq(j.jobLocationType, "TELECOMMUTE", "type");
  assert(j.jobLocation, "office kept");
  assert(!j.applicantLocationRequirements, "no invented eligibility");
});

check("is_remote null or false NEVER produces TELECOMMUTE (tri-state respected)", () => {
  for (const v of [null, false, undefined]) {
    const j = buildJobPosting({ ...baseJob, is_remote: v }, OPTS);
    assert(j && !j.jobLocationType, `no TELECOMMUTE for is_remote=${v}`);
  }
});

check("no location AND not remote → entity dropped, not emitted empty", () => {
  eq(buildJobPosting({ ...baseJob, location: "", location_countries: [] }, OPTS), null, "dropped");
});

// ---------------- identifier ----------------
check("source IDs recovered from each ATS URL shape, junk rejected", () => {
  eq(sourceJobId("https://job-boards.greenhouse.io/anthropic/jobs/4567890004"), "4567890004", "greenhouse");
  eq(sourceJobId("https://boards.greenhouse.io/x/jobs/4567890"), "4567890", "greenhouse short");
  eq(sourceJobId("https://jobs.ashbyhq.com/openai/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "ashby uuid");
  eq(sourceJobId("https://jobs.lever.co/x/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "lever uuid");
  eq(sourceJobId("https://example.com/jobs/123456"), null, "unknown host");
  eq(sourceJobId("https://jobs.ashbyhq.com/openai/apply"), null, "not a uuid");
  eq(sourceJobId("not a url"), null, "garbage");
  eq(sourceJobId(null), null, "null");
});

check("no recoverable source ID → identifier omitted (our serial is not theirs)", () => {
  const j = buildJobPosting({ ...baseJob, url: "https://www.databricks.com/company/careers/x" }, OPTS);
  assert(!("identifier" in j), "identifier absent");
});

// ---------------- employment type ----------------
check("employment types map to schema enums; unknown omitted", () => {
  eq(employmentType("fulltime"), "FULL_TIME", "fulltime");
  eq(employmentType("part-time"), "PART_TIME", "part-time");
  eq(employmentType("contract"), "CONTRACTOR", "contract — NOT the invalid 'CONTRACT'");
  eq(employmentType("intern"), "INTERN", "intern");
  eq(employmentType("unknown"), undefined, "unknown");
  eq(employmentType(null), undefined, "null");
  const j = buildJobPosting({ ...baseJob, employment_type: "unknown" }, OPTS);
  assert(!("employmentType" in j), "field absent when unknown");
});

// ---------------- breadcrumbs ----------------
check("breadcrumbs mirror the visible trail", () => {
  const b = buildBreadcrumbs({ ...baseJob, category: "engineering" }, OPTS);
  eq(b["@type"], "BreadcrumbList", "type");
  eq(b.itemListElement.map((i) => i.name), ["All jobs", "Engineering", "Anthropic"], "names");
  eq(b.itemListElement.map((i) => i.position), [1, 2, 3], "positions");
});

check("breadcrumbs skip a missing category, keep order", () => {
  const b = buildBreadcrumbs({ ...baseJob, category: null }, OPTS);
  eq(b.itemListElement.map((i) => i.name), ["All jobs", "Anthropic"], "names");
});

// ---------------- site identity ----------------
check("site identity: exactly one WebSite and one Organization node", () => {
  const nodes = buildSiteIdentity("https://www.earlyaijobs.com");
  eq(nodes.length, 2, "two nodes");
  eq(nodes[0]["@type"], "WebSite", "website");
  eq(nodes[0].name, "EarlyAIJobs", "site name");
  eq(nodes[1]["@type"], "Organization", "org");
  assert(!nodes[1].sameAs, "no fake social profiles");
});

// ---------------- output hygiene ----------------
check("entity JSON-serialises without undefined leaking as null", () => {
  const j = buildJobPosting(baseJob, OPTS);
  const round = JSON.parse(JSON.stringify(j));
  assert(!Object.values(round).includes(null), "no null fields");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
